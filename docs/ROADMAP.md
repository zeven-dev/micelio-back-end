# Micelio — Hoja de ruta (back-end)

Lista de tareas para los agentes, **en orden**. Cada tarea dice **qué** hacer, **dónde**,
**cómo** y **por qué**. Las decisiones de producto ya están tomadas (ver "Decisiones tomadas"
en `PRODUCT.md`) — construir **al pie de la letra**; ante ambigüedad real, anotar la duda en
`STATUS.md` y elegir la opción más simple compatible con estas especificaciones.

**Al terminar cada tarea y cada fase** (regla obligatoria): actualizar `DATA-MODEL.md`,
`PROCESSES.md` y el `AGENTS.md` del módulo tocado, marcar la casilla aquí, y dejar la
**descarga de conocimiento** en `STATUS.md` (qué quedó listo, qué falta, qué se necesita, qué
sigue). Commits cortos de una línea. Respetar `ARCHITECTURE.md` siempre.

**Modelos:** cada fase pendiente dice con qué modelo se trabaja en su línea "**Modelo**", y por
qué. La política completa —cuándo Opus 5, cuándo Sonnet 5 y cómo se agrupa el trabajo en dos
bloques con un solo handoff— está en `ORCHESTRATION.md` ("Qué modelo usa cada cosa"). Regla base:
**Sonnet 5**; una fase sin línea de modelo es Sonnet 5.

**Contratos:** la forma exacta de toda petición/respuesta nueva está en `API-CONTRACTS.md` —
implementar exactamente eso, sin inventar formas; si un contrato cambia, se actualiza allí en
la misma tarea.

## Fase 0 — Identidad, roles y arquitectura — **cerrada 2026-08-31**
- [x] **Ampliar User**: `cedula` (única, formato colombiano — validar solo formato básico de
  dígitos, sin contraste externo), `username` (único), `role` (enum `USER|TEACHER|ADMIN|
  SUPPORT`), `bio`, `avatarKey`, `isPublic` (default `false`). *Dónde:* `prisma/schema.prisma`,
  DTO de registro en `src/auth`, `src/users`. *Por qué:* registro exige cédula, nombre,
  username, contraseña y correo; los roles y la privacidad cuelgan de aquí.
- [x] **Guard de roles**: `@Roles(...)` + `RolesGuard` en `src/common`. Todo endpoint nuevo
  declara roles explícitos desde ahora.
- [x] **Asignación de rol profesor**: `PATCH /api/admin/users/:id/role` solo ADMIN (germen del
  módulo `admin`). *Por qué:* decidido — el admin otorga TEACHER; la automatización con la
  Universidad de Antioquia llega en Fase 12.
- [x] **Eventos de dominio**: instalar `@nestjs/event-emitter`, crear `src/events/` con los
  contratos base (ver `ARCHITECTURE.md`). *Por qué:* columna vertebral de la integración entre
  módulos y de las notificaciones extraíbles.
- [x] **Perfil**: `GET/PATCH /api/users/me` (bio, nombre, avatar vía `StorageService`,
  **toggle `isPublic`**) y `GET /api/users/:username` (perfil público / limitado si privado).

## Fase 0.5 — Subida directa a S3 (rediseño visual, solo clientes) — **cerrada 2026-09-01**
- [x] **Subida directa a S3** para biblioteca y avatar: el back deja de recibir binarios
  (se quita Multer/`FileInterceptor` de `files` y `users`) y en su lugar expone
  presign + confirm (`POST .../files/presign`, `POST .../files/confirm`,
  `POST /api/users/me/avatar/presign`, `PATCH /api/users/me/avatar` ahora con `{ key }`).
  *Dónde:* `src/storage` (`getSignedUploadUrl`, `headObject`), `src/files`, `src/users`. *Por
  qué:* pedido explícito del dueño del producto — "que se carguen directamente las imágenes al
  S3"; además reduce carga del servidor en archivos grandes (video hasta 250 MB). Contrato
  exacto en `docs/API-CONTRACTS.md` ("Subida directa a S3").
- *(El resto de la Fase 0.5 — quitar el sidebar, navegación tipo Instagram, perfil rediseñado,
  Home preparado, Carpetas migradas al perfil — es rediseño visual puro y vive enteramente en
  `micelio-front-end` y `micelio-app`; este repo no tiene tareas de diseño.)*

## Fase 1 — Biblioteca completa — **cerrada 2026-09-01**
- [x] **Sub-carpetas**: `parentId` en `Folder`, validación de ciclos, unicidad
  (userId, parentId, name). *Dónde:* `src/folders`. Contrato exacto (listado por nivel,
  breadcrumb `path`, mover con `parentId: null`) en `docs/API-CONTRACTS.md`
  ("Carpetas y sub-carpetas").
- [x] **Audio**: `AUDIO` en `FileType` + mimeTypes, validado **solo por peso**
  (`UPLOAD_MAX_AUDIO_MB`, 50 MB). *Por qué:* chat y obra sonora.
- [x] **Corrección previa**: los límites de subida habían quedado hardcodeados en la Fase 0.5
  (`MAX_FILE_SIZE_BYTES`) ignorando `UPLOAD_MAX_*_MB`; y `confirm` confiaba en el `size` que
  declaraba el cliente. Ver `docs/STATUS.md` (2026-09-01).

## Fase 2 — Publicaciones y feed propio — **cerrada 2026-09-01**
- [x] **Módulo `posts`**: `Post` + `PostMedia` (ver `DATA-MODEL.md`), CRUD con descripción,
  **etiquetas** (normalización y extracción de `#tags` exactas en `API-CONTRACTS.md`) y
  medios de la biblioteca; `position` + `PATCH /api/posts/reorder` con el contrato exacto de
  `API-CONTRACTS.md` (lista completa de ids). Emite `post.created`.
- [x] **Ajustes de feed**: `feedLayout (GRID|MASONRY)`, `feedColumns (1–6)`, `feedGap (0–5)` —
  formas y validaciones exactas en `API-CONTRACTS.md`. *Por qué:* el dueño cura cómo se ve su
  feed y los visitantes lo ven igual.

## Fase 3 — Grafo social y privacidad — **cerrada 2026-09-02**
- [x] **Módulo `social` — follows**: entidad `Follow` con `isFavorite`;
  `POST/DELETE /api/users/:username/follow`, `PATCH .../follow` (favorito on/off),
  `GET /api/me/following`, `GET /api/me/followers`. Emite `user.followed`.
- [x] **Regla de visibilidad**: helper único en `social` que responde "¿puede X ver el
  contenido de Y?" (público, o follow mutuo si privado). **Toda** consulta de posts, perfil y
  búsqueda pasa por ahí. *Por qué:* privado por defecto es requisito central; centralizar evita
  fugas.
- [x] **Home feed v1**: `GET /api/feed` implementando **exactamente** la columna v1 del
  algoritmo en `API-CONTRACTS.md` (streams S y D, boost de 12 h a favoritos, mezcla 4:1,
  cursor doble). Sin afinidad todavía (llega en la Fase 5); nada de aleatoriedad.

## Fase 4 — Interacciones
- [x] **Likes**: `POST/DELETE /api/posts/:id/like` (idempotentes); `GET /api/posts/:id/likes`
  **403 si no es el dueño** — contratos exactos en `API-CONTRACTS.md`. Emite `post.liked` /
  `post.unliked`.
- [x] **Guardados**: `POST/DELETE /api/posts/:id/save`, `GET /api/me/saved`. Emite
  `post.saved` / `post.unsaved`.
- [x] **Comentarios**: CRUD en `POST /api/posts/:id/comments`. Emite `comment.created`.
  **Anidados desde el inicio** (decisión #12 de `PRODUCT.md`): `parentId` en `Comment`, un solo
  nivel de profundidad; formas exactas en `API-CONTRACTS.md`.

## Fase 4.5 — Banner de perfil y contadores — **cerrada 2026-09-07**
Fase pequeña de back-end que habilita el rediseño de perfil pedido por el dueño el 2026-09-07
(decisión #14 de `PRODUCT.md`). El grueso de la fase es visual y vive en los clientes; aquí solo
están los dos datos que hoy no existen y que la cabecera nueva necesita.
- [x] **Banner de perfil**: `bannerKey` en `User` + `POST /api/users/me/banner/presign`,
  `PATCH /api/users/me/banner` (`{ key }`) y `DELETE /api/users/me/banner`. *Dónde:*
  `prisma/schema.prisma`, `src/users`, `src/storage`. Reutiliza tal cual el patrón presign +
  confirm del avatar (`UPLOAD_MAX_BANNER_MB`, 10 MB por defecto, JPEG/PNG/WEBP) — contrato exacto
  en `API-CONTRACTS.md` ("Subida directa a S3"). *Por qué una columna y no un `FileAsset`:* la
  portada no es obra del usuario ni vive en su biblioteca, mismo razonamiento que el avatar.
- [x] **`postsCount` en `UserPublic`**: contar las publicaciones del usuario, visible también en
  la vista limitada de un perfil privado. Implementado con `PostsService.countByAuthorIds` (el
  conteo es un dato de `posts`, se pide por servicio — regla 7); cuando llegue `kind` en la 4.6,
  ese mismo método filtra por `MEDIA` y suma `notesCount`. *Por qué:*
  el dueño pidió el conteo de publicaciones en la cabecera; hasta hoy el `DESIGN-SYSTEM.md` de
  los clientes prohibía mostrarlo porque el contrato no lo traía (habría sido un dato inventado).
  `notesCount` llega en la 4.6 con las notas.
- [x] **Contrato exportado**: `npm run api:export` con `bannerUrl`/`postsCount` en el schema de
  `UserPublic`, para que los clientes corran `sync:api` antes de empezar su parte.

## Fase 4.6 — Notas (columnas de opinión)
**Modelo: Sonnet 5 toda la fase.** No lleva bloque D: el diseño (una nota es un `Post` con
`kind: NOTE`, la forma completa, los tres endpoints, las reglas por tipo de bloque) **ya se
decidió y quedó escrito** el 2026-09-07 en `API-CONTRACTS.md`, `DATA-MODEL.md` y
`ARCHITECTURE.md`. Lo que queda es transcribirlo, y transcribir bien no necesita Opus 5. Única
excepción: la **revisión final** antes de cerrar, en Opus 5, porque la fase cambia el contrato que
consumen los dos clientes (disparador 6).

Decisión #13 de `PRODUCT.md`. Una nota es un `Post` con `kind: NOTE` — **no** un módulo nuevo:
el porqué y las dos alternativas descartadas están en `ARCHITECTURE.md` (desviación 4) y en
`DATA-MODEL.md`. Todo lo que ya existe para publicaciones (likes, guardados, comentarios, home
feed, visibilidad) debe funcionar sobre notas **sin código nuevo**; si algo lo necesita, es señal
de que se está construyendo una entidad paralela por accidente.
- [ ] **Esquema**: enum `PostKind (MEDIA|NOTE)` + `title`, `coverFileAssetId` en `Post`; tabla
  `PostBlock` (`position`, `type PARAGRAPH|HEADING|QUOTE|IMAGE`, `text`, `fileAssetId`,
  `caption`). La migración rellena `kind: MEDIA` en las filas existentes. *Dónde:*
  `prisma/schema.prisma`, `src/posts`. Campos exactos en `DATA-MODEL.md`.
- [ ] **Endpoints**: `POST /api/posts/notes`, `PATCH /api/posts/notes/:id`,
  `GET /api/users/:username/notes`. `GET /api/posts/:id` y `DELETE /api/posts/:id` sirven ambos
  `kind` sin cambios. Validaciones por tipo de bloque, `excerpt` derivado en el servidor y
  `reorder` rechazando notas: contrato exacto en `API-CONTRACTS.md` ("Notas — Fase 4.6").
- [ ] **Home feed**: `GET /api/feed` incluye notas con el mismo algoritmo y el mismo cursor (una
  nota es un post más para el ranking). Verificar que la consulta de candidatos no filtre por
  `kind` y que la forma de respuesta no cambie.
- [ ] **`notesCount` en `UserPublic`** y `GET /api/users/:username/posts` filtrando
  `kind: MEDIA`, para que el tab Publicaciones no muestre notas.
- [ ] **Specs**: creación/edición de notas (validación por tipo de bloque, límite de 100 bloques,
  derivación del `excerpt`, rechazo en `reorder`) en `src/posts/*.spec.ts`.

## Fase 5 — Afinidad y ranking personalizado
**Modelo: bloque D (Opus 5, corto) → bloque I (Sonnet 5).** Disparador 2: es matemática exacta
—pesos, vida media de 90 días, decay-then-add, topes de boost— y un error de fórmula no lo atrapa
ningún `type-check`, se ve meses después como "el feed se siente raro". El bloque D **no escribe
código**: repasa que la fórmula de `API-CONTRACTS.md` no tenga huecos (qué pasa con `updatedAt`
en el futuro, redondeo, empates) y deja fijados los **casos de prueba con fechas fijas**. Con eso
escrito, las tablas, los listeners, el feed v2 y las specs son Sonnet 5.
- [ ] **Módulo `ranking`**: tablas `UserAffinity` y `UserTagAffinity` (ver `DATA-MODEL.md`),
  listeners de `post.liked/unliked`, `comment.created`, `post.saved/unsaved`, `post.shared`
  con los **pesos y decaimiento exactos** de `API-CONTRACTS.md` ("Afinidad y ranking": vida
  media 90 días, decay-then-add al escribir). Expone `RankingService` de solo lectura
  (`effA`, `effT`). Nadie más escribe esas tablas. *Por qué:* decisión del dueño — quien
  interactúa mucho con un usuario o unas etiquetas debe verlos más.
- [ ] **Feed v2**: actualizar `GET /api/feed` a la columna v2 del algoritmo (boosts por
  afinidad con topes 48 h/24 h/72 h). Misma respuesta y cursor; los clientes no cambian.
- [ ] **Spec de `ranking`**: `src/ranking/AGENTS.md` + specs de los listeners y del decaimiento
  (probar la fórmula con fechas fijas).

## Fase 6 — Chat (sockets)
**Modelo: bloque D (Opus 5) → bloque I (Sonnet 5).** Disparadores 1 y 4: entidades nuevas que los
dos clientes van a consumir, un canal de tiempo real que no existe en el proyecto, y
`ChatAttachment` deliberadamente **separado** de `FileAsset` (los adjuntos de chat no van a la
biblioteca) — una decisión de arquitectura fácil de romper por accidente al implementar. El
bloque D cierra además la **pregunta abierta #1** de `PRODUCT.md` (grupales o solo 1 a 1) con el
dueño. Gateway, REST del historial y toda la UI de los clientes: Sonnet 5.
- [ ] **Módulo `chat`**: gateway WebSocket (socket.io) autenticado con access token;
  `Conversation`, `ConversationParticipant`, `Message`, `ChatAttachment` (**separado de
  `FileAsset`**: los adjuntos de chat no van a la biblioteca). Texto, imagen, audio, video;
  compartir posts (`sharedPostId`). Emite `message.sent` y, al compartir un post, `post.shared`.
- [ ] **Historial REST**: `GET /api/conversations`, `GET /api/conversations/:id/messages`.

## Fase 7 — Notificaciones (módulo extraíble)
**Modelo: bloque D (Opus 5) → bloque I (Sonnet 5).** Disparador 4, y el caso más claro de todo el
roadmap: el módulo tiene que quedar **extraíble a microservicio** (tablas con prefijo propio y sin
FKs, comunicación solo por eventos, su plan de extracción escrito). Esa disciplina se pierde con
un solo atajo —una FK "que no molesta a nadie"— y recuperarla después cuesta la extracción
entera. El bloque D fija esas fronteras; el resto (listeners, API de lectura, namespace de socket,
centro de notificaciones en los clientes) es Sonnet 5.
- [ ] **Módulo `notifications`** siguiendo al pie de la letra `ARCHITECTURE.md`: solo consume
  eventos (`post.liked`, `comment.created`, `message.sent`, `post.created`, `user.followed`),
  tablas con prefijo propio y sin FKs, API de lectura + namespace de socket propio, y su
  `AGENTS.md` con el **plan de extracción** a microservicio documentado.

## Fase 8 — Mercado (sin pagos)
**Modelo: Sonnet 5 toda la fase**, revisión final incluida. `MarketItem` ya tiene su forma exacta
en `API-CONTRACTS.md` y los pagos —lo único genuinamente delicado— están fuera de alcance hasta la
Fase 12. Es CRUD con una categoría obligatoria: no dispara nada.
- [ ] **Módulo `market`**: `MarketItem` con categoría obligatoria (`SERVICE|ARTWORK|EVENT|
  RESOURCE`), CRUD del vendedor, listado público, compartir al feed propio. Los pagos NO van
  aquí (Fase 12).

## Fase 9 — Búsqueda y explore
**Modelo: bloque D (Opus 5, corto) → bloque I (Sonnet 5).** Disparadores 2 y 3 a la vez: el orden
de resultados usa la afinidad (matemática) y **toda** consulta tiene que pasar por la regla de
visibilidad (privacidad). Una búsqueda que filtra mal es la fuga más fácil de todo el producto:
devuelve contenido privado a quien no debería verlo, y el bug se ve como "salió un resultado de
más". El bloque D revisa exactamente ese cruce; `ILIKE`/pg_trgm, el índice GIN, los endpoints y la
UI de explore son Sonnet 5.
- [ ] **Módulo `search`**: `GET /api/search?q=&type=users|posts|notes|market&category=` — usuarios
  por username/nombre, palabras clave en descripciones **y etiquetas** de posts, **título y texto
  de las notas** (`type=notes`, Fase 4.6), ítems de market con filtro por categoría. Aplica la regla de visibilidad de la Fase 3 y el **orden
  por afinidad** de `API-CONTRACTS.md` ("Orden de resultados de búsqueda"). Postgres
  `ILIKE`/pg_trgm + índice GIN de tags.
- [ ] **Explore**: `GET /api/explore` con el contrato y orden exactos de `API-CONTRACTS.md`
  (públicos, no seguidos, no propios; `rankAt` del stream D v2). *Por qué:* la cuadrícula de
  descubrimiento de la sección de búsqueda se alimenta de la afinidad de cada usuario.

## Fase 10 — Grupos de profesores
**Modelo: bloque D (Opus 5) → bloque I (Sonnet 5).** Disparadores 1 y 3: cinco entidades nuevas y,
sobre todo, un eje de permisos que hoy no existe (el profesor ve trabajos de sus alumnos, el
alumno decide si su entrega va a su feed, el archivo queda en **su** biblioteca). Ese "quién ve
qué" es la parte que hay que dejar escrita antes de tocar código; las tablas, los endpoints y las
tablas de calificaciones de la web son Sonnet 5.
- [ ] **Módulo `groups`**: `Group`, `GroupMember`, `GroupFolder`, `Submission`, `Grade` (ver
  `DATA-MODEL.md`). Profesor (rol TEACHER) crea grupos/carpetas de curso; el alumno entrega
  (el archivo queda en SU biblioteca y decide si publicarlo); el profesor lista alumnos y
  trabajos en formato tabular y califica.

## Fase 11 — Administración y soporte
**Modelo: bloque D (Opus 5) → bloque I (Sonnet 5).** Disparador 3 en su forma más pura: permisos
elevados sobre todo el producto y **delegación** de esos permisos a soporte (`SupportGrant`).
Además el alcance sigue sin definirse con el dueño (pregunta abierta #2), así que el bloque D es
también donde se acota. Las vistas y los endpoints, una vez acotados: Sonnet 5.
- [ ] **Módulo `admin`** completo: visualización global (usuarios, recursos, chats) solo ADMIN;
  delegación de permisos de visualización a SUPPORT (`SupportGrant`). Alcance fino por
  determinar con el dueño — implementar lo mínimo útil y documentar.

## Fase 12 — Futuro (no empezar sin el dueño del producto)
**Modelo: Opus 5, con el dueño del producto presente.** Pagos reales y datos de identidad
contrastados contra una universidad: dinero e identidad, las dos cosas donde un error no se
arregla con un despliegue. No se empieza sin él, así que tampoco se elige modelo por costo.
- [ ] **Pagos del market** (proveedor detrás de interfaz, ver `ARCHITECTURE.md`).
- [ ] **Validación con la Universidad de Antioquia**: contraste de cédulas y otorgamiento
  automático del rol TEACHER (integración detrás de interfaz).

## Transversales (cuando toque)
**Modelo: Sonnet 5**, salvo el rate limiting y la auditoría de acciones admin/soporte, que son
disparador 3 y llevan un bloque D corto en Opus 5 antes de implementarse.
- [ ] Semillas (`prisma/seed.ts`) con usuarios de cada rol.
- [ ] Rate limiting fino y auditoría de acciones admin/soporte.
- [ ] E2E de flujos críticos (auth, posts, visibilidad, chat).
