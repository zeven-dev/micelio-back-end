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
  cédula nunca se devuelve en ninguna respuesta. Las tres verificaciones previas son solo para
  dar el mensaje exacto por campo: entre consultar y insertar cabe otro registro, así que
  `createUserOrConflict` traduce además el `P2002` de Prisma (violación del índice único) al
  mismo `409` por campo. Sin eso, dos registros simultáneos con el mismo username daban `500`.

### Roles y autorización (Fase 0)
- **Módulos:** `src/common` (decorador `@Roles` y `RolesGuard`), `src/auth` (registra el guard)
- **Disparador:** toda petición que no sea a una ruta `@Public()`
- **Pasos:** `JwtAuthGuard` puebla `request.user` (incluye `role`, viaja en el JWT) →
  `RolesGuard` mira primero si la ruta es `@Public()` (pasa sin más); si no lo es, exige que
  declare `@Roles(...)` y que `user.role` esté en la lista, o responde `403`.
- **Fail-closed:** una ruta que no sea `@Public()` **y** no declare `@Roles(...)` se considera
  un error de programación y responde `500` con el nombre del controlador y del handler. Así la
  regla 8 de `AGENTS.md` ("todo endpoint declara explícitamente qué roles pueden usarlo") se
  hace cumplir sola en vez de depender de la memoria del siguiente agente. Los endpoints
  abiertos a cualquier sesión (`users`, `folders`, `files`, `auth/logout`) declaran
  `@Roles(...ALL_ROLES)`, constante exportada por `src/common/decorators/roles.decorator.ts`.
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

### Perfil de usuario (Fase 0)
- **Módulos:** `src/users`, `src/storage`
- **Disparadores:** `GET /api/users/me`, `PATCH /api/users/me`, `PATCH /api/users/me/avatar`
  (multipart), `GET /api/users/:username`
- **Pasos:** `GET/PATCH /me` operan sobre el propio usuario del token; `PATCH /me/avatar` sube
  el archivo a S3 (prefijo `avatars/{userId}/`, tipos `image/jpeg|png|webp`, máx 5 MB) vía
  `StorageService`, actualiza `avatarKey` y borra la key anterior si existía (ese borrado es
  limpieza *best-effort*: si S3 falla, se registra un warning y la key queda huérfana, en vez de
  responder `500` sobre un cambio de avatar que sí se aplicó); `GET /:username`
  busca por username y aplica visibilidad: dueño o perfil público → `UserPublic` completo (con
  `bio`); en cualquier otro caso, `UserPublic` limitado (sin `bio`, sin `feedSettings`).
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

### Subida y gestión de archivos de biblioteca
- **Módulos:** `src/files`, `src/storage`
- **Disparadores:** `POST /api/folders/:id/files` (multipart), `GET`, `DELETE`
- **Pasos:** Multer en memoria (nunca disco) → valida mimeType/tamaño → `StorageService.upload`
  a S3 con key única → registra `FileAsset` → las lecturas devuelven URLs firmadas con
  expiración (`AWS_S3_SIGNED_URL_EXPIRES_IN`).
- **Notas:** MinIO en local (docker-compose), S3 real en producción sin cambio de código.
  Estos archivos son la **biblioteca de publicaciones**; los adjuntos de chat serán otro flujo.

### Manejo transversal de peticiones
- **Módulos:** `src/common`, `src/main.ts`
- **Qué:** `TransformInterceptor` envuelve las respuestas, `HttpExceptionFilter` normaliza los
  errores, `ValidationPipe` global con whitelist, throttling (`@nestjs/throttler`), CORS con
  credenciales para la web.

---

## Procesos eliminados

### `GET /api/auth/me` — perfil de la sesión (eliminado en la revisión de la Fase 0)
- **Vivía en:** `src/auth/auth.controller.ts` + `AuthService.me()`
- **Qué hacía:** devolvía `{ id, email, name }` del usuario del token.
- **Motivo:** quedó con la forma anterior a la Fase 0 (sin `username` ni `role`) y ningún
  cliente lo consumía. `GET /api/users/me` lo reemplaza con la forma `Me` de
  `API-CONTRACTS.md`. Mantener dos perfiles de sesión con formas distintas contradice la regla
  12 ("consistencia con los clientes"). `auth` queda solo con el ciclo de vida de los tokens.

### `GET /health` — health check suelto (eliminado en la revisión de la Fase 0)
- **Vivía en:** `src/main.ts`, registrado con `app.getHttpAdapter().get()`
- **Motivo:** se registraba **después** de `app.listen()` y nunca llegó a responder (devolvía
  `404`, verificado). El health check real es `GET /api/health` en `AppController`, marcado
  `@Public()`. Se eliminó para no anunciar un endpoint inexistente a un balanceador.
