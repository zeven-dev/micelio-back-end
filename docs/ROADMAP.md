# Micelio — Hoja de ruta (back-end)

Lista de tareas para los agentes, **en orden**. Cada tarea dice **qué** hacer, **dónde**,
**cómo** y **por qué**. Las decisiones de producto ya están tomadas (ver "Decisiones tomadas"
en `PRODUCT.md`) — construir **al pie de la letra**; ante ambigüedad real, anotar la duda en
`STATUS.md` y elegir la opción más simple compatible con estas especificaciones.

**Al terminar cada tarea y cada fase** (regla obligatoria): actualizar `DATA-MODEL.md`,
`PROCESSES.md` y el `AGENTS.md` del módulo tocado, marcar la casilla aquí, y dejar la
**descarga de conocimiento** en `STATUS.md` (qué quedó listo, qué falta, qué se necesita, qué
sigue). Commits cortos de una línea. Respetar `ARCHITECTURE.md` siempre.

## Fase 0 — Identidad, roles y arquitectura
- [ ] **Ampliar User**: `cedula` (única, formato colombiano — validar solo formato básico de
  dígitos, sin contraste externo), `username` (único), `role` (enum `USER|TEACHER|ADMIN|
  SUPPORT`), `bio`, `avatarKey`, `isPublic` (default `false`). *Dónde:* `prisma/schema.prisma`,
  DTO de registro en `src/auth`, `src/users`. *Por qué:* registro exige cédula, nombre,
  username, contraseña y correo; los roles y la privacidad cuelgan de aquí.
- [ ] **Guard de roles**: `@Roles(...)` + `RolesGuard` en `src/common`. Todo endpoint nuevo
  declara roles explícitos desde ahora.
- [ ] **Asignación de rol profesor**: `PATCH /api/admin/users/:id/role` solo ADMIN (germen del
  módulo `admin`). *Por qué:* decidido — el admin otorga TEACHER; la automatización con la
  Universidad de Antioquia llega en Fase 11.
- [ ] **Eventos de dominio**: instalar `@nestjs/event-emitter`, crear `src/events/` con los
  contratos base (ver `ARCHITECTURE.md`). *Por qué:* columna vertebral de la integración entre
  módulos y de las notificaciones extraíbles.
- [ ] **Perfil**: `GET/PATCH /api/users/me` (bio, nombre, avatar vía `StorageService`,
  **toggle `isPublic`**) y `GET /api/users/:username` (perfil público / limitado si privado).

## Fase 1 — Biblioteca completa
- [ ] **Sub-carpetas**: `parentId` en `Folder`, validación de ciclos, unicidad
  (userId, parentId, name). *Dónde:* `src/folders`.
- [ ] **Audio**: `AUDIO` en `FileType` + mimeTypes. *Por qué:* chat y obra sonora.

## Fase 2 — Publicaciones y feed propio
- [ ] **Módulo `posts`**: `Post` + `PostMedia` (ver `DATA-MODEL.md`), CRUD con descripción y
  medios de la biblioteca; `position` + endpoint de **reordenamiento en lote** (drag & drop del
  cliente). Emite `post.created`.
- [ ] **Ajustes de feed**: `feedLayout (GRID|MASONRY)`, `feedColumns (1–6)`, `feedGap` —
  expuestos en el perfil (`GET /users/:username` los incluye) y editables en `PATCH /users/me`.
  *Por qué:* el dueño cura cómo se ve su feed y los visitantes lo ven igual.

## Fase 3 — Grafo social y privacidad
- [ ] **Módulo `social` — follows**: entidad `Follow` con `isFavorite`;
  `POST/DELETE /api/users/:username/follow`, `PATCH .../follow` (favorito on/off),
  `GET /api/me/following`, `GET /api/me/followers`. Emite `user.followed`.
- [ ] **Regla de visibilidad**: helper único en `social` que responde "¿puede X ver el
  contenido de Y?" (público, o follow mutuo si privado). **Toda** consulta de posts, perfil y
  búsqueda pasa por ahí. *Por qué:* privado por defecto es requisito central; centralizar evita
  fugas.
- [ ] **Home feed**: `GET /api/feed` paginado — publicaciones de seguidos con prioridad a
  favoritos + descubrimiento de perfiles públicos, cronológico.

## Fase 4 — Interacciones
- [ ] **Likes**: `POST/DELETE /api/posts/:id/like`; `GET /api/posts/:id/likes` (número + lista
  de usuarios) **solo para el dueño del post**. Emite `post.liked`.
- [ ] **Guardados**: `POST/DELETE /api/posts/:id/save`, `GET /api/me/saved`.
- [ ] **Comentarios**: CRUD en `POST /api/posts/:id/comments`. Emite `comment.created`.

## Fase 5 — Chat (sockets)
- [ ] **Módulo `chat`**: gateway WebSocket (socket.io) autenticado con access token;
  `Conversation`, `ConversationParticipant`, `Message`, `ChatAttachment` (**separado de
  `FileAsset`**: los adjuntos de chat no van a la biblioteca). Texto, imagen, audio, video;
  compartir posts (`sharedPostId`). Emite `message.sent`.
- [ ] **Historial REST**: `GET /api/conversations`, `GET /api/conversations/:id/messages`.

## Fase 6 — Notificaciones (módulo extraíble)
- [ ] **Módulo `notifications`** siguiendo al pie de la letra `ARCHITECTURE.md`: solo consume
  eventos (`post.liked`, `comment.created`, `message.sent`, `post.created`, `user.followed`),
  tablas con prefijo propio y sin FKs, API de lectura + namespace de socket propio, y su
  `AGENTS.md` con el **plan de extracción** a microservicio documentado.

## Fase 7 — Mercado (sin pagos)
- [ ] **Módulo `market`**: `MarketItem` con categoría obligatoria (`SERVICE|ARTWORK|EVENT|
  RESOURCE`), CRUD del vendedor, listado público, compartir al feed propio. Los pagos NO van
  aquí (Fase 11).

## Fase 8 — Búsqueda
- [ ] **Módulo `search`**: `GET /api/search?q=&type=users|posts|market&category=` — usuarios
  por username/nombre, palabras clave en posts, ítems de market con filtro por categoría.
  Aplica la regla de visibilidad de la Fase 3. Postgres `ILIKE`/pg_trgm primero.

## Fase 9 — Grupos de profesores
- [ ] **Módulo `groups`**: `Group`, `GroupMember`, `GroupFolder`, `Submission`, `Grade` (ver
  `DATA-MODEL.md`). Profesor (rol TEACHER) crea grupos/carpetas de curso; el alumno entrega
  (el archivo queda en SU biblioteca y decide si publicarlo); el profesor lista alumnos y
  trabajos en formato tabular y califica.

## Fase 10 — Administración y soporte
- [ ] **Módulo `admin`** completo: visualización global (usuarios, recursos, chats) solo ADMIN;
  delegación de permisos de visualización a SUPPORT (`SupportGrant`). Alcance fino por
  determinar con el dueño — implementar lo mínimo útil y documentar.

## Fase 11 — Futuro (no empezar sin el dueño del producto)
- [ ] **Pagos del market** (proveedor detrás de interfaz, ver `ARCHITECTURE.md`).
- [ ] **Validación con la Universidad de Antioquia**: contraste de cédulas y otorgamiento
  automático del rol TEACHER (integración detrás de interfaz).

## Transversales (cuando toque)
- [ ] Semillas (`prisma/seed.ts`) con usuarios de cada rol.
- [ ] Rate limiting fino y auditoría de acciones admin/soporte.
- [ ] E2E de flujos críticos (auth, posts, visibilidad, chat).
