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
- **Autenticación opcional (`@OptionalAuth()`):** para rutas que responden con o sin sesión.
  `JwtAuthGuard.handleRequest` deja pasar como anónimo (`request.user` = `undefined`) **solo** si
  la petición no trae cabecera `Authorization`; si la trae y el token es inválido o expiró, se
  deja fallar con `401` para que el cliente dispare su refresco en vez de recibir en silencio la
  vista de anónimo. `RolesGuard` acepta al anónimo en esas rutas (la visibilidad la aplica el
  servicio) pero sigue exigiendo el rol cuando **sí** hay sesión, y sigue exigiendo que la ruta
  declare `@Roles(...)`. Hoy la usa solo `GET /api/users/:username`. Distinto de `@Public()`,
  que ignora el token aunque venga.
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
- **Notas:** desde la Fase 2 hay **un productor**: `posts` emite `post.created` al publicar.
  Consumidores sigue sin haber (`ranking` en la Fase 5, `notifications` en la Fase 7), y el
  resto de los eventos siguen siendo scaffold — sus productores llegan con `social`/`chat`
  (Fases 3, 4 y 6).

### Perfil de usuario (Fase 0; avatar rehecho a subida directa en Fase 0.5)
- **Módulos:** `src/users`, `src/storage`
- **Disparadores:** `GET /api/users/me`, `PATCH /api/users/me`,
  `POST /api/users/me/avatar/presign`, `PATCH /api/users/me/avatar` (JSON `{ key }`),
  `GET /api/users/:username`
- **Pasos:** `GET/PATCH /me` operan sobre el propio usuario del token; el avatar sube **directo
  a S3** desde el cliente (ver "Subida directa a S3" abajo) — `presign` valida tipo/tamaño
  (`image/jpeg|png|webp`, tope propio `UPLOAD_MAX_AVATAR_MB`, 5 MB por defecto) y devuelve una
  URL firmada de escritura con prefijo `avatars/{userId}/`; `PATCH /me/avatar` confirma con
  `HeadObject`, **revalida el tamaño real que reporta S3** (si se pasó, borra el objeto y
  responde `413`), actualiza `avatarKey` y borra la key anterior si existía;
  `GET /:username` busca por username y aplica visibilidad:
  dueño o perfil público → `UserPublic` completo (con `bio`); en cualquier otro caso,
  `UserPublic` limitado (sin `bio`, sin `feedSettings`).
- **Notas (desviaciones documentadas, ver `STATUS.md`):** `followersCount`, `followingCount`,
  `viewerFollows`, `followsViewer` son siempre `0`/`false` hasta que exista `Follow` (Fase 3,
  no hay follow mutuo todavía); `feedSettings` ya se devuelve desde la Fase 2 (ver "Ajustes de
  presentación del feed"). `GET /api/users/:username` es
  `@OptionalAuth()` desde la decisión #10 de `PRODUCT.md` (perfiles públicos navegables por
  link); el resto de la API sigue exigiendo sesión.

### Login / Refresh / Logout
- **Módulos:** `src/auth`
- **Disparadores:** `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- **Pasos:** login valida credenciales y emite par de tokens; refresh acepta cookie httpOnly
  (web) o refresh token en body (móvil) vía `jwt-refresh.strategy`; logout limpia la cookie.
- **Notas:** access token corto vivido, solo en memoria del cliente. Guard JWT global: todo
  endpoint es privado salvo `@Public()`.

### CRUD de carpetas y navegación del árbol (sub-carpetas desde la Fase 1)
- **Módulos:** `src/folders`
- **Disparadores:** `GET /api/folders[?parentId=]`, `POST /api/folders`,
  `GET/PATCH/DELETE /api/folders/:id`
- **Pasos:** toda operación filtra por `userId` del token (un usuario nunca ve ni mueve carpetas
  ajenas). El listado devuelve **un solo nivel**: sin `parentId`, las carpetas raíz; con él, las
  hijas directas (validando antes que esa madre sea del viewer). `GET /:id` agrega `path`, el
  breadcrumb desde la raíz, construido subiendo por `parentId` (`buildPath`). `POST` y `PATCH`
  validan el nombre entre hermanos antes de escribir (→ `409`), y `PATCH` corre además
  `assertMoveIsLegal`, que sube por los ancestros del nuevo padre para rechazar ciclos
  (→ `400`). Borrar cascadea por FK a las sub-carpetas y a las filas `FileAsset` del subárbol.
- **Notas:** en `PATCH`, `parentId` ausente = no mover; `parentId: null` = mover a la raíz.
  **Hueco conocido:** la cascada borra las filas de archivos pero **no** los objetos en S3, que
  quedan huérfanos en el bucket (ya pasaba antes de la Fase 1; con sub-carpetas afecta a un
  subárbol entero). Arreglarlo cruza dominios y necesita decisión de arquitectura — ver
  `src/folders/AGENTS.md` y `docs/STATUS.md`.

### Subida y gestión de archivos de biblioteca (subida directa a S3 desde Fase 0.5)
- **Módulos:** `src/files`, `src/storage`
- **Disparadores:** `POST /api/folders/:id/files/presign`, `POST /api/folders/:id/files/confirm`,
  `GET /api/folders/:id/files`, `DELETE /api/files/:id`
- **Pasos:** el backend **ya no recibe binarios** (se quitó `FileInterceptor`/Multer de este
  módulo y el registro de `MulterModule` que había quedado suelto). `presign` valida propiedad de
  la carpeta + mimeType y el tamaño declarado contra el tope configurado del tipo
  (`UPLOAD_MAX_*_MB`, leído con `ConfigService`), y devuelve `{ key, uploadUrl, expiresIn }`
  (`PutObjectCommand` firmado); el cliente hace `PUT` directo a S3; `confirm` valida el prefijo
  de la `key` (pertenece a esa carpeta/usuario), comprueba con `HeadObject` que el objeto ya
  llegó a S3, **revalida el tamaño real que reporta S3** (la URL firmada no impone tamaño: si se
  pasó, borra el objeto y responde `413`) y recién ahí registra el `FileAsset` con ese tamaño
  real. Las lecturas devuelven URLs firmadas de descarga con expiración
  (`AWS_S3_SIGNED_URL_EXPIRES_IN`). Desde la Fase 1 se acepta también `AUDIO`
  (`UPLOAD_MAX_AUDIO_MB`), validado solo por peso.
- **Notas:** MinIO en local (docker-compose) o S3 real en producción, sin cambio de código (la
  URL firmada la genera el mismo `S3StorageService`). Estos archivos son la **biblioteca de
  publicaciones**; los adjuntos de chat serán otro flujo. El bucket necesita CORS habilitado
  para `PUT` desde los orígenes de los clientes (infra, fuera de este repo) — ver
  `docs/API-CONTRACTS.md`.

### Publicaciones y feed propio (Fase 2)
- **Módulos:** `src/posts` (+ `src/users` y `src/files` por sus servicios públicos, `src/storage`)
- **Disparadores:** `POST /api/posts`, `GET /api/posts/:id`, `PATCH /api/posts/:id`,
  `DELETE /api/posts/:id`, `GET /api/users/:username/posts`, `PATCH /api/posts/reorder`
- **Pasos (crear):** normaliza las etiquetas (`utils/tags.util.ts`: explícitas + `#hashtags` de
  la descripción, minúsculas, sin `#`, solo `[a-z0-9_áéíóúñü-]`, 30 caracteres por etiqueta, sin
  duplicadas; más de 10 → `400`) → valida que los medios sean archivos de la biblioteca del autor
  y no se repitan (`FilesService.findOwnedByUser`) → en una transacción, empuja las posiciones
  existentes (`position + 1`) y crea la publicación en `position: 0` con sus `post_media` →
  emite `post.created` (`{ postId, authorId, tags }`).
- **Pasos (leer):** `GET /api/posts/:id` y el listado por perfil aplican la visibilidad con
  `UsersService.canViewContentOf` (`403` si el perfil es privado para el viewer) y arman la
  respuesta con el autor (`UsersService.getPublicViewsByIds`, una consulta para todos) y los
  archivos (`FilesService.findManyByIds`), firmando cada medio con `StorageService`
  (`url` + `expiresAt`). El listado pagina por cursor sobre `(position, id)`.
- **Pasos (reordenar):** compara el conjunto de `orderedIds` con las publicaciones del autor
  (misma cantidad, sin repetidos, todos suyos; si no, `400`) y persiste `position` = índice del
  arreglo en una transacción → `{ reordered: true }`.
- **Notas:** `posts` **no** consulta `users`, `folders` ni `file_assets` con Prisma (regla 7);
  todo cruce va por el servicio público del otro módulo. Los contadores sociales
  (`likeCount`/`commentCount`/`viewerHasLiked`/`viewerHasSaved`) valen `0`/`false` hasta la
  Fase 4 — y `likeCount` solo se incluye si el viewer es el autor. Borrar una publicación no
  borra archivos: la biblioteca es independiente del feed.

### Ajustes de presentación del feed (Fase 2)
- **Módulos:** `src/users`
- **Disparador:** `PATCH /api/users/me` con `{ feedSettings: { layout?, columns?, gap? } }`
- **Pasos:** valida el DTO anidado (`layout` ∈ {GRID, MASONRY}, `columns` 1–6, `gap` 0–5) y
  escribe solo las claves presentes en `feedLayout`/`feedColumns`/`feedGap` de `User`. Los tres
  valores viajan de vuelta en `feedSettings` de todo `UserPublic` **extendido** (dueño o perfil
  público); en la vista limitada de un perfil privado se omiten, igual que `bio`.
- **Notas:** `gap` es el **índice** de la escala de espaciado del design system (0–5), no
  píxeles: la traducción a píxeles es de cada cliente. Los visitantes ven el feed exactamente
  como lo curó el dueño.

### Borrado de archivos y carpetas con contenido publicado (Fase 2)
- **Módulos:** `src/files`, `src/folders`
- **Disparadores:** `DELETE /api/files/:id`, `DELETE /api/folders/:id`
- **Pasos:** `post_media` referencia `file_assets` con `onDelete: Restrict`. En `files` se borra
  **primero la fila** y después el objeto de S3: si la publicación lo está usando, Postgres
  responde `P2003`, se traduce a `409` y el binario queda intacto. En `folders`, la cascada
  carpeta → sub-carpetas → archivos se detiene por la misma FK y aborta el borrado completo:
  también `409`.
- **Notas:** decisión registrada en `docs/DATA-MODEL.md` (bloquear, no cascadear ni marcar). El
  hueco de los objetos huérfanos en S3 al borrar carpetas sigue abierto y **sin cambios** — ver
  `src/folders/AGENTS.md` y `docs/STATUS.md`.

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
