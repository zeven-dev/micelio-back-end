# Micelio — Registro de procesos (back-end)

Todo proceso/flujo de la API se registra aquí: **qué hace, dónde vive, por qué existe**. Si un
agente crea, modifica, ajusta o elimina un proceso, actualiza este documento en la misma tarea.
La meta: que el siguiente agente sepa dónde buscar, qué buscar y por qué, sin leer todo el
código.

Formato de cada entrada: nombre, módulo(s), disparador, pasos clave, notas. Al eliminar un
proceso, no borres la entrada: muévela a "Procesos eliminados" con el motivo.

---

## Procesos activos

### Registro de usuario
- **Módulos:** `src/auth`, `src/users`
- **Disparador:** `POST /api/auth/register` (público)
- **Pasos:** valida DTO (email, password, name, username, cedula) → verifica email, username y
  cedula libres → hashea contraseña (bcrypt) → crea User (`role` default `USER`, `isPublic`
  default `false`) → emite access + refresh token (misma respuesta que login, forma sin cambios).
- **Notas:** el refresh se entrega como cookie httpOnly (web) y también en el body (móvil). La
  cédula nunca se devuelve en ninguna respuesta.

### Roles y autorización (Fase 0)
- **Módulos:** `src/common` (decorador `@Roles` y `RolesGuard`), `src/auth` (registra el guard)
- **Disparador:** cualquier endpoint decorado con `@Roles(...)`
- **Pasos:** `JwtAuthGuard` puebla `request.user` (incluye `role`, viaja en el JWT) →
  `RolesGuard` lee los roles requeridos con `Reflector`; si no hay `@Roles` en el handler,
  permite el acceso (compatibilidad con endpoints existentes); si los hay, exige que
  `user.role` esté en la lista o responde `403`.
- **Notas:** ambos guards se registran como `APP_GUARD` en `src/auth/auth.module.ts`, en ese
  orden (JWT primero). Un cambio de rol se refleja en el próximo refresh de token, no de forma
  instantánea (el rol no se relee de la base de datos en cada request, por diseño: evita una
  consulta extra por petición).

### Asignación de rol (germen del módulo `admin`)
- **Módulos:** `src/admin`, `src/users`
- **Disparador:** `PATCH /api/admin/users/:id/role` (`@Roles(ADMIN)`)
- **Pasos:** valida que el usuario objetivo exista → actualiza `role` → devuelve
  `{ id, username, role }`.
- **Notas:** único endpoint del módulo `admin` hasta la Fase 11 (administración completa). La
  automatización con la Universidad de Antioquia (Fase 12) reemplazará este flujo manual para
  el rol TEACHER.

### Eventos de dominio (scaffold, Fase 0)
- **Módulos:** `src/events`
- **Qué:** `@nestjs/event-emitter` instalado y registrado globalmente
  (`EventEmitterModule.forRoot()` en `AppModule`). `src/events/domain-events.ts` define los
  nombres (`DOMAIN_EVENTS`) y las formas (interfaces) de los eventos de dominio ya nombrados en
  `ARCHITECTURE.md` (`post.created`, `post.liked`, `post.unliked`, `post.saved`, `post.unsaved`,
  `post.shared`, `comment.created`, `message.sent`, `user.followed`).
- **Notas:** todavía **nadie emite ni escucha** estos eventos — los productores llegan con
  `posts`/`social`/`chat` (Fases 2–6) y los consumidores con `ranking`/`notifications`
  (Fases 5 y 7). Este scaffold solo fija el contrato compartido para que esas fases no
  inventen formas nuevas.

### Perfil de usuario (Fase 0; avatar rehecho a subida directa en Fase 0.5)
- **Módulos:** `src/users`, `src/storage`
- **Disparadores:** `GET /api/users/me`, `PATCH /api/users/me`,
  `POST /api/users/me/avatar/presign`, `PATCH /api/users/me/avatar` (JSON `{ key }`),
  `GET /api/users/:username`
- **Pasos:** `GET/PATCH /me` operan sobre el propio usuario del token; el avatar sube **directo
  a S3** desde el cliente (ver "Subida directa a S3" abajo) — `presign` valida tipo/tamaño
  (`image/jpeg|png|webp`, máx 5 MB) y devuelve una URL firmada de escritura con prefijo
  `avatars/{userId}/`; `PATCH /me/avatar` confirma con `HeadObject`, actualiza `avatarKey` y
  borra la key anterior si existía; `GET /:username` busca por username y aplica visibilidad:
  dueño o perfil público → `UserPublic` completo (con `bio`); en cualquier otro caso,
  `UserPublic` limitado (sin `bio`, sin `feedSettings`).
- **Notas (desviaciones documentadas, ver `STATUS.md`):** `followersCount`, `followingCount`,
  `viewerFollows`, `followsViewer` son siempre `0`/`false` hasta que exista `Follow` (Fase 3,
  no hay follow mutuo todavía); `feedSettings` se omite del todo hasta la Fase 2 (los campos
  `feedLayout/feedColumns/feedGap` no existen aún en el esquema). `GET /api/users/:username`
  requiere autenticación (no se marcó `@Public()`), consistente con la regla "todo endpoint es
  privado por defecto".

### Login / Refresh / Logout
- **Módulos:** `src/auth`
- **Disparadores:** `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- **Pasos:** login valida credenciales y emite par de tokens; refresh acepta cookie httpOnly
  (web) o refresh token en body (móvil) vía `jwt-refresh.strategy`; logout limpia la cookie.
- **Notas:** access token corto vivido, solo en memoria del cliente. Guard JWT global: todo
  endpoint es privado salvo `@Public()`.

### CRUD de carpetas
- **Módulos:** `src/folders`
- **Disparadores:** `GET/POST /api/folders`, `GET/PATCH/DELETE /api/folders/:id`
- **Pasos:** toda operación filtra por `userId` del token (un usuario nunca ve carpetas ajenas);
  nombre único por usuario; borrar cascadea a archivos (y sus objetos S3 vía FilesService).
- **Notas:** pendiente Fase 1: sub-carpetas (`parentId`).

### Subida y gestión de archivos de biblioteca (subida directa a S3 desde Fase 0.5)
- **Módulos:** `src/files`, `src/storage`
- **Disparadores:** `POST /api/folders/:id/files/presign`, `POST /api/folders/:id/files/confirm`,
  `GET /api/folders/:id/files`, `DELETE /api/files/:id`
- **Pasos:** el backend **ya no recibe binarios** (se quitó `FileInterceptor`/Multer de este
  módulo). `presign` valida propiedad de la carpeta + mimeType/tamaño (`MAX_FILE_SIZE_BYTES` por
  tipo) y devuelve `{ key, uploadUrl, expiresIn }` (`PutObjectCommand` firmado); el cliente hace
  `PUT` directo a S3; `confirm` valida el prefijo de la `key` (pertenece a esa carpeta/usuario),
  comprueba con `HeadObject` que el objeto ya llegó a S3 y recién ahí registra el `FileAsset` —
  las lecturas devuelven URLs firmadas de descarga con expiración
  (`AWS_S3_SIGNED_URL_EXPIRES_IN`).
- **Notas:** MinIO en local (docker-compose) o S3 real en producción, sin cambio de código (la
  URL firmada la genera el mismo `S3StorageService`). Estos archivos son la **biblioteca de
  publicaciones**; los adjuntos de chat serán otro flujo. El bucket necesita CORS habilitado
  para `PUT` desde los orígenes de los clientes (infra, fuera de este repo) — ver
  `docs/API-CONTRACTS.md`.

### Manejo transversal de peticiones
- **Módulos:** `src/common`, `src/main.ts`
- **Qué:** `TransformInterceptor` envuelve las respuestas, `HttpExceptionFilter` normaliza los
  errores, `ValidationPipe` global con whitelist, throttling (`@nestjs/throttler`), CORS con
  credenciales para la web.

---

## Procesos eliminados

*(vacío)*
