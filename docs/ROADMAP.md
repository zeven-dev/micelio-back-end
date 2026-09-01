# Micelio — Hoja de ruta (back-end)

Lista de tareas para los agentes, **en orden**. Cada tarea dice **qué** hacer, **dónde**,
**cómo** y **por qué**. Las decisiones de producto ya están tomadas (ver "Decisiones tomadas"
en `PRODUCT.md`) — construir **al pie de la letra**; ante ambigüedad real, anotar la duda en
`STATUS.md` y elegir la opción más simple compatible con estas especificaciones.

**Al terminar cada tarea y cada fase** (regla obligatoria): actualizar `DATA-MODEL.md`,
`PROCESSES.md` y el `AGENTS.md` del módulo tocado, marcar la casilla aquí, y dejar la
**descarga de conocimiento** en `STATUS.md` (qué quedó listo, qué falta, qué se necesita, qué
sigue). Commits cortos de una línea. Respetar `ARCHITECTURE.md` siempre.

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

## Fase 2 — Publicaciones y feed propio
- [ ] **Módulo `posts`**: `Post` + `PostMedia` (ver `DATA-MODEL.md`), CRUD con descripción,
  **etiquetas** (normalización y extracción de `#tags` exactas en `API-CONTRACTS.md`) y
  medios de la biblioteca; `position` + `PATCH /api/posts/reorder` con el contrato exacto de
  `API-CONTRACTS.md` (lista completa de ids). Emite `post.created`.
- [ ] **Ajustes de feed**: `feedLayout (GRID|MASONRY)`, `feedColumns (1–6)`, `feedGap (0–5)` —
  formas y validaciones exactas en `API-CONTRACTS.md`. *Por qué:* el dueño cura cómo se ve su
  feed y los visitantes lo ven igual.

## Fase 3 — Grafo social y privacidad
- [ ] **Módulo `social` — follows**: entidad `Follow` con `isFavorite`;
  `POST/DELETE /api/users/:username/follow`, `PATCH .../follow` (favorito on/off),
  `GET /api/me/following`, `GET /api/me/followers`. Emite `user.followed`.
- [ ] **Regla de visibilidad**: helper único en `social` que responde "¿puede X ver el
  contenido de Y?" (público, o follow mutuo si privado). **Toda** consulta de posts, perfil y
  búsqueda pasa por ahí. *Por qué:* privado por defecto es requisito central; centralizar evita
  fugas.
- [ ] **Home feed v1**: `GET /api/feed` implementando **exactamente** la columna v1 del
  algoritmo en `API-CONTRACTS.md` (streams S y D, boost de 12 h a favoritos, mezcla 4:1,
  cursor doble). Sin afinidad todavía (llega en la Fase 5); nada de aleatoriedad.

## Fase 4 — Interacciones
- [ ] **Likes**: `POST/DELETE /api/posts/:id/like` (idempotentes); `GET /api/posts/:id/likes`
  **403 si no es el dueño** — contratos exactos en `API-CONTRACTS.md`. Emite `post.liked` /
  `post.unliked`.
- [ ] **Guardados**: `POST/DELETE /api/posts/:id/save`, `GET /api/me/saved`. Emite
  `post.saved` / `post.unsaved`.
- [ ] **Comentarios**: CRUD en `POST /api/posts/:id/comments`. Emite `comment.created`.
  **Anidados desde el inicio** (decisión #12 de `PRODUCT.md`): `parentId` en `Comment`, un solo
  nivel de profundidad; formas exactas en `API-CONTRACTS.md`.

## Fase 5 — Afinidad y ranking personalizado
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
- [ ] **Módulo `chat`**: gateway WebSocket (socket.io) autenticado con access token;
  `Conversation`, `ConversationParticipant`, `Message`, `ChatAttachment` (**separado de
  `FileAsset`**: los adjuntos de chat no van a la biblioteca). Texto, imagen, audio, video;
  compartir posts (`sharedPostId`). Emite `message.sent` y, al compartir un post, `post.shared`.
- [ ] **Historial REST**: `GET /api/conversations`, `GET /api/conversations/:id/messages`.

## Fase 7 — Notificaciones (módulo extraíble)
- [ ] **Módulo `notifications`** siguiendo al pie de la letra `ARCHITECTURE.md`: solo consume
  eventos (`post.liked`, `comment.created`, `message.sent`, `post.created`, `user.followed`),
  tablas con prefijo propio y sin FKs, API de lectura + namespace de socket propio, y su
  `AGENTS.md` con el **plan de extracción** a microservicio documentado.

## Fase 8 — Mercado (sin pagos)
- [ ] **Módulo `market`**: `MarketItem` con categoría obligatoria (`SERVICE|ARTWORK|EVENT|
  RESOURCE`), CRUD del vendedor, listado público, compartir al feed propio. Los pagos NO van
  aquí (Fase 12).

## Fase 9 — Búsqueda y explore
- [ ] **Módulo `search`**: `GET /api/search?q=&type=users|posts|market&category=` — usuarios
  por username/nombre, palabras clave en descripciones **y etiquetas** de posts, ítems de
  market con filtro por categoría. Aplica la regla de visibilidad de la Fase 3 y el **orden
  por afinidad** de `API-CONTRACTS.md` ("Orden de resultados de búsqueda"). Postgres
  `ILIKE`/pg_trgm + índice GIN de tags.
- [ ] **Explore**: `GET /api/explore` con el contrato y orden exactos de `API-CONTRACTS.md`
  (públicos, no seguidos, no propios; `rankAt` del stream D v2). *Por qué:* la cuadrícula de
  descubrimiento de la sección de búsqueda se alimenta de la afinidad de cada usuario.

## Fase 10 — Grupos de profesores
- [ ] **Módulo `groups`**: `Group`, `GroupMember`, `GroupFolder`, `Submission`, `Grade` (ver
  `DATA-MODEL.md`). Profesor (rol TEACHER) crea grupos/carpetas de curso; el alumno entrega
  (el archivo queda en SU biblioteca y decide si publicarlo); el profesor lista alumnos y
  trabajos en formato tabular y califica.

## Fase 11 — Administración y soporte
- [ ] **Módulo `admin`** completo: visualización global (usuarios, recursos, chats) solo ADMIN;
  delegación de permisos de visualización a SUPPORT (`SupportGrant`). Alcance fino por
  determinar con el dueño — implementar lo mínimo útil y documentar.

## Fase 12 — Futuro (no empezar sin el dueño del producto)
- [ ] **Pagos del market** (proveedor detrás de interfaz, ver `ARCHITECTURE.md`).
- [ ] **Validación con la Universidad de Antioquia**: contraste de cédulas y otorgamiento
  automático del rol TEACHER (integración detrás de interfaz).

## Transversales (cuando toque)
- [ ] Semillas (`prisma/seed.ts`) con usuarios de cada rol.
- [ ] Rate limiting fino y auditoría de acciones admin/soporte.
- [ ] E2E de flujos críticos (auth, posts, visibilidad, chat).
