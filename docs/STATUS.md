# Micelio — Bitácora de estado (back-end)

**Descarga de conocimiento obligatoria.** Al terminar **cada tarea** y al cerrar **cada fase**
del `ROADMAP.md`, el agente agrega una entrada **al inicio** de la sección "Entradas" con este
formato. El objetivo: que cualquiera (humano o agente) entienda en qué punto va el proyecto sin
leer el historial de git.

```
### AAAA-MM-DD — <tarea o fase> (tarea | cierre de fase)
- **Listo:** qué quedó funcionando y dónde (módulos, endpoints, migraciones).
- **Falta:** qué quedó pendiente de esta tarea/fase y por qué.
- **Necesito:** bloqueos, decisiones pendientes del dueño, dependencias de otros repos.
- **Sigue:** cuál es el siguiente paso concreto y dónde empezar.
```

Reglas: no borrar ni editar entradas anteriores (solo agregar); escribir concreto y con rutas
de archivos; si una fase se cierra, la entrada de cierre resume la fase completa.

---

## Entradas

### 2026-09-01 — Fase 1: biblioteca completa (cierre de fase)
- **Listo:**
  - **Sub-carpetas.** `Folder.parentId` (FK autorreferente `ON DELETE CASCADE`), migración
    `20260901000000_add_subfolders_and_audio`. Contrato en `docs/API-CONTRACTS.md`
    ("Carpetas y sub-carpetas"): `GET /api/folders[?parentId=]` lista **un solo nivel** (sin
    `parentId`, la raíz); `GET /api/folders/:id` agrega `path`, el breadcrumb desde la raíz;
    `POST` acepta `parentId`; `PATCH` renombra y/o mueve (**`parentId` ausente = no mover;
    `parentId: null` = mover a la raíz**). Cada carpeta trae `_count: { files, children }`.
  - **Invariantes del árbol** en `src/folders/folders.service.ts`: nombre único **entre
    hermanos** (→ `409`, validado en el servicio antes de escribir) y **sin ciclos**
    (`assertMoveIsLegal` sube por los ancestros del nuevo padre → `400`). Los recorridos están
    topeados con `MAX_TREE_DEPTH` para que un ciclo dejado por una escritura externa no cuelgue
    el proceso.
  - **Unicidad de las carpetas raíz.** En Postgres dos `NULL` son distintos, así que
    `@@unique([userId, parentId, name])` no cubre la raíz: la migración crea a mano el índice
    parcial `folders_userId_name_root_key` (`UNIQUE (userId, name) WHERE parentId IS NULL`).
    Anotado en el schema y en `docs/DATA-MODEL.md` — es el detalle que más fácil se pierde.
  - **Audio.** `AUDIO` en `FileType` + 8 mimeTypes en `ALLOWED_MIME_TYPES`, con
    `UPLOAD_MAX_AUDIO_MB` (50) en los tres sitios de rigor. Validado **solo por peso, nunca por
    duración** (decisión #11 de `PRODUCT.md`).
  - **Correcciones de procesos rotos que venían de la Fase 0.5** (`main` estaba con `npm run
    lint` y `npm test` en rojo, contra la regla 11 de `AGENTS.md`):
    1. Los límites de subida estaban **hardcodeados** (`MAX_FILE_SIZE_BYTES`: imagen 15, video
       **100**, texto 5 MB) y `UPLOAD_MAX_*_MB` no se leía en ningún lado, pese a que la doc y
       el `.env.example` prometían lo contrario. Efecto real: un video de 150 MB se rechazaba
       aunque `UPLOAD_MAX_VIDEO_MB=250`. Ahora `FilesService.maxBytesFor()` lee la
       configuración vía `MAX_SIZE_CONFIG_KEY`, y la constante hardcodeada desapareció.
    2. El **avatar** usaba el límite de las imágenes de biblioteca (15 MB) con un mensaje que
       decía "5 MB", y `uploads.maxAvatarMb` no se usaba. Era el test que fallaba en `main`.
       Ahora usa su propia variable y el mensaje sale del valor vigente.
    3. `confirm` (biblioteca y avatar) confiaba en el `size` **declarado por el cliente**. La
       URL prefirmada no impone tamaño, así que se podía declarar 1 byte y subir 500 MB. Ahora
       se revalida el `ContentLength` real de `HeadObject`, se persiste **ese** en
       `FileAsset.size` y, si excede, el objeto se borra del bucket y responde `413`.
    4. Restos de Multer: `MulterModule` seguía registrado en `files.module.ts` y
       `users.module.ts` con su `UPLOAD_CEILING_HEADROOM_BYTES`, aunque desde la Fase 0.5 ningún
       binario pasa por la API. Eliminados.
  - **Pruebas.** Nuevo `src/files/files.service.spec.ts` (no existía, y era justo el servicio
    donde estaban los bugs): límites por configuración, audio, y el tamaño real de S3.
    `folders.service.spec.ts` reescrito para el árbol (listado por nivel, breadcrumb, ciclos,
    unicidad entre hermanos). `users.service.spec.ts`: mock de `ConfigService` **por clave** —
    el mock plano que devolvía `300` para todo era lo que escondía el bug del avatar.
  - **Verificación:** `npm run lint`, `npm run build` y `npm test` (5 suites, 58 tests) en
    verde. Además smoke test end-to-end contra Postgres real: árbol de 3 niveles, listado por
    nivel, breadcrumb correcto, `409` por nombre repetido entre hermanos, mismo nombre permitido
    en ramas distintas, `400` en ciclo y en auto-referencia, mover a la raíz con
    `parentId: null`, y borrado en cascada del subárbol.
- **Falta:**
  - **Objetos huérfanos en S3 al borrar una carpeta** (hueco que ya existía antes de esta fase,
    pero que las sub-carpetas agrandan: un borrado se lleva un subárbol entero). La cascada de
    la base borra las filas `FileAsset`; los binarios quedan en el bucket para siempre.
    Arreglarlo cruza dominios —`folders` no puede consultar datos de `files` (regla 7), y
    `files` ya importa a `folders`, así que la dependencia inversa sería circular— y por eso
    **necesita decisión de arquitectura** antes de tocarlo: evento de dominio `folder.deleted`
    con listener en `files`, o un barrido por prefijo en `storage`. No se improvisó.
  - Mover/copiar **archivos** entre carpetas: no está en el `ROADMAP.md` y nadie lo pidió; hoy
    un archivo solo se sube a la carpeta donde se creó.
- **Necesito:** que el dueño elija cómo resolver los huérfanos de S3 (evento vs. barrido). Nada
  más bloquea la Fase 2.
- **Sigue:** Fase 2 del `ROADMAP.md` (módulo `posts`: `Post` + `PostMedia`, etiquetas,
  `PATCH /api/posts/reorder`, y los campos `feedLayout/feedColumns/feedGap` en `User`). Los
  clientes ya tienen las sub-carpetas consumidas, así que no quedan dependencias abiertas de la
  Fase 1.

### 2026-09-01 — Fase 0.5: subida directa a S3 (cierre de fase, solo back-end)
- **Listo:**
  - `StorageService` cambia su interfaz: se quita `upload(buffer)` (ya no tiene llamadores) y se
    agregan `getSignedUploadUrl(key, contentType, expiresInSeconds?)` (URL firmada de escritura,
    `PutObjectCommand`) y `headObject(key)` (`HeadObjectCommand`, `null` si el objeto no existe
    todavía) — `src/storage/storage.service.ts`, `src/storage/s3-storage.service.ts`.
  - `src/files`: `POST /api/folders/:id/files` (multipart) se reemplaza por
    `POST .../files/presign` (valida carpeta + mimeType/tamaño, devuelve
    `{ key, uploadUrl, expiresIn }`) y `POST .../files/confirm` (valida prefijo de `key` +
    `HeadObject`, crea el `FileAsset`). Se quitó `FileInterceptor`/Multer del controlador; el
    backend ya no recibe binarios de biblioteca. DTOs nuevos en `src/files/dto/`
    (`presign-file.dto.ts`, `confirm-file.dto.ts`, `presign-response.dto.ts`).
  - `src/users`: mismo patrón para el avatar. `POST /api/users/me/avatar/presign` (JSON
    `{ mimeType, size }`) + `PATCH /api/users/me/avatar` ahora JSON `{ key }` (antes multipart).
    DTOs nuevos en `src/users/dto/` (`presign-avatar.dto.ts`, `confirm-avatar.dto.ts`,
    `presign-avatar-response.dto.ts`).
  - `docs/API-CONTRACTS.md`, `docs/PROCESSES.md`, `src/storage/AGENTS.md`,
    `src/files/AGENTS.md`, `src/users/AGENTS.md` actualizados con el contrato de dos pasos
    (presign → `PUT` directo del cliente a S3 → confirm) y la nota de infraestructura: el
    bucket necesita su propia política **CORS** que permita `PUT` con `Content-Type` desde los
    orígenes de la web y la app — no es algo configurable desde este repo.
  - `src/users/users.service.spec.ts` reescrito para el nuevo flujo (`presignAvatar`,
    `updateAvatar` con `ForbiddenException`/`NotFoundException`); `npm run lint`, `npm run
    build` y `npm test` (4 suites, 26 tests) en verde.
- **Falta:** nada de la parte de back-end de esta fase. El resto de la Fase 0.5 (quitar sidebar,
  navegación tipo Instagram, perfil rediseñado, Home preparado, Carpetas migradas al perfil) es
  rediseño visual puro y no toca este repo — ver `docs/ROADMAP.md`.
- **Necesito:**
  - **CORS del bucket S3**, fuera de este repo: sin esa política, el `PUT` directo del navegador
    falla aunque el backend esté perfecto. No hay bandera de entorno para esto — se configura en
    AWS directamente.
  - No hay `.env` real en este sandbox (solo `.env.example`, con credenciales de MinIO); el
    dueño confirmó que las variables de AWS reales ya están seteadas en el entorno de destino.
    No se pudo hacer una verificación end-to-end contra S3/MinIO real en esta tarea —
    verificado por lectura de código, tipos, lint, build y tests unitarios únicamente.
- **Sigue:** cuando la web y la app integren el nuevo flujo (presign → PUT directo → confirm),
  probar con un bucket real o MinIO local (`docker compose up -d`) antes de dar por cerrado el
  camino feliz de subida.

### 2026-08-31 — Fase 0: identidad, roles y arquitectura (cierre de fase)
- **Listo:**
  - `User` ampliado en `prisma/schema.prisma` con `cedula`, `username`, `role` (enum `Role`),
    `bio`, `avatarKey`, `isPublic`; migración `20260831000000_extend_user_identity_roles`
    aplicada. `docs/DATA-MODEL.md` actualizado.
  - `POST /api/auth/register` ahora exige `cedula`, `username` además de `name` (antes
    opcional); valida unicidad de los tres campos con `409` específico por campo
    (`src/auth/dto/register.dto.ts`, `src/auth/auth.service.ts`).
  - `@Roles(...)` + `RolesGuard` en `src/common` (`decorators/roles.decorator.ts`,
    `guards/roles.guard.ts`), registrado como `APP_GUARD` global en
    `src/auth/auth.module.ts` justo después de `JwtAuthGuard`. El rol viaja en el JWT
    (`JwtPayload`/`AuthenticatedUser` ganan `role`) para no consultar la base de datos en cada
    request.
  - `PATCH /api/admin/users/:id/role` (`@Roles(ADMIN)`) — módulo nuevo `src/admin` (germen,
    ver su `AGENTS.md`).
  - `@nestjs/event-emitter` instalado y registrado global (`EventEmitterModule.forRoot()` en
    `AppModule`); `src/events/domain-events.ts` con nombres y payloads de los 9 eventos de
    `ARCHITECTURE.md`. Sin productores/consumidores todavía (scaffold puro).
  - `GET/PATCH /api/users/me`, `PATCH /api/users/me/avatar` (multipart, S3 vía
    `StorageService`), `GET /api/users/:username` — módulo `users` (`users.controller.ts`,
    `users.service.ts`).
  - Verificación: `npm run lint` (sin errores), `npm run build` (sin errores),
    `npm test` (4 suites, 24 tests, todos en verde). Además smoke test manual end-to-end con el
    servidor corriendo contra Postgres real: registro de 2 usuarios, colisión de email/username
    (`409`), perfil privado por defecto (oculta `bio` a terceros), `PATCH /users/me`
    (`isPublic:true`) revela `bio` a terceros, `RolesGuard` responde `403` a un no-ADMIN, y un
    ADMIN promueve a otro usuario a `TEACHER` correctamente.
- **Ambigüedades reales resueltas (elegida la opción más simple compatible con las specs):**
  1. **Formato de `username`:** ninguna doc fijaba el patrón exacto. Elegido
     `^[a-z0-9_.]{3,30}$` (minúsculas, dígitos, `_`, `.`). Si el dueño del producto quiere otro
     formato (mayúsculas visibles, guiones, longitud distinta), es un cambio de una sola
     validación en `register.dto.ts`.
  2. **Formato de `cedula`:** la spec solo pide "formato básico de dígitos". Elegido
     `^[0-9]{6,10}$` (rango típico de cédulas colombianas, sin dígito de verificación).
  3. **`UserPublic.followersCount/followingCount/viewerFollows/followsViewer`:** el contrato ya
     los define, pero `Follow` no existe hasta la Fase 3. Se devuelven `0`/`false` — es el valor
     real hoy (no hay follows), no un placeholder inventado. Se actualizará solo cuando exista
     `social`.
  4. **`UserPublic.feedSettings`:** depende de columnas que llegan en la Fase 2
     (`feedLayout/feedColumns/feedGap`). Se **omite** del todo en vez de inventar valores por
     defecto no persistidos, para no mentir sobre datos que el usuario no ha configurado.
  5. **`GET /api/users/:username`, ¿público o autenticado?** Ninguna doc lo especifica. Elegido
     autenticado (no `@Public()`), consistente con la regla "todo endpoint es privado por
     defecto" de `AGENTS.md`. Fácil de revertir si el producto quiere perfiles públicos
     navegables sin sesión.
  6. **`PATCH /api/users/me/avatar` vs. avatar dentro de `PATCH /api/users/me`:** el `ROADMAP.md`
     decía "avatar vía StorageService" dentro de la tarea de perfil, pero `API-CONTRACTS.md` ya
     especifica el endpoint separado (`PATCH /api/users/me/avatar`, multipart) — se implementó
     el contrato exacto, no la redacción suelta del roadmap.
- **Falta:** nada de la Fase 0. Fase 1 (sub-carpetas, `AUDIO`) no ha empezado.
- **Necesito:** que el dueño del producto revise las 6 ambigüedades resueltas arriba,
  especialmente el formato de `username`/`cedula` y si el perfil público debe ser navegable sin
  sesión.
- **Sigue:** Fase 1 del `ROADMAP.md` (`src/folders`: `parentId` para sub-carpetas; `AUDIO` en
  `FileType`). El front-end y la app pueden empezar su propia Fase 0 ya mismo: login/registro
  con los campos nuevos, pantalla de perfil (`GET/PATCH /api/users/me`, avatar, toggle
  público/privado) y perfil público limitado.

### 2026-08-31 — Ranking personalizado y etiquetas especificados (tarea)
- **Listo:** decisión del dueño incorporada: afinidad usuario→usuario y usuario→etiqueta con
  pesos fijos (like +1, comentario +2, guardado +3, compartido +2) y vida media de 90 días,
  feed v2, `GET /api/explore` y orden de búsqueda por afinidad — todo exacto en
  `API-CONTRACTS.md`. Nuevo módulo `ranking` en `ARCHITECTURE.md` y `DATA-MODEL.md`
  (`UserAffinity`, `UserTagAffinity`); `tags` en Post. Nueva Fase 5 en `ROADMAP.md`; fases
  posteriores renumeradas (chat 6, notificaciones 7, market 8, búsqueda/explore 9, grupos 10,
  admin 11, futuro 12).
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada nuevo.
- **Sigue:** Fase 0 del `ROADMAP.md`.

### 2026-08-31 — Cierre de huecos de especificación (tarea)
- **Listo:** `docs/API-CONTRACTS.md` nuevo: convenciones (envelope, cursor, ISO), formas
  exactas de UserPublic/Me/Post/Comment/Notification/MarketItem/Conversation/Message,
  contratos finos (reorder, feedSettings, likes, follows, search) y el **algoritmo determinista
  del home feed** (streams S/D, boost 12 h a favoritos, mezcla 4:1, cursor doble). ROADMAP,
  DATA-MODEL y AGENTS.md enlazados a él.
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada; las preguntas abiertas de `PRODUCT.md` siguen sin bloquear Fases 0–8.
- **Sigue:** Fase 0 del `ROADMAP.md`. Todo endpoint nuevo debe implementar la forma exacta de
  `API-CONTRACTS.md`.

### 2026-08-31 — Documentación y decisiones de producto (cierre de preparación)
- **Listo:** `AGENTS.md` raíz y por módulo; `docs/PRODUCT.md` (canónico, con decisiones del
  dueño), `docs/DATA-MODEL.md` (modelo actual + objetivo por fases), `docs/PROCESSES.md`
  (flujos existentes), `docs/ARCHITECTURE.md` (monolito modular + eventos + notificaciones
  extraíbles), `docs/ROADMAP.md` (Fases 0–11 detalladas).
- **Falta:** todo el desarrollo desde la Fase 0; no hay código nuevo, solo documentación.
- **Necesito:** respuestas a las "Preguntas abiertas" de `PRODUCT.md` (límites de video/audio,
  comentarios anidados, chats grupales, alcance admin/soporte) — no bloquean las Fases 0–2.
- **Sigue:** Fase 0 del `ROADMAP.md`: ampliar `User` (cédula, username, rol, isPublic) en
  `prisma/schema.prisma` + DTO de registro, guard de roles y `src/events/`.
