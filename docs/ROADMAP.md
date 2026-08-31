# Micelio — Hoja de ruta (back-end)

Lista de tareas para los agentes, en orden recomendado. Cada tarea dice **qué** hacer, **dónde**,
**cómo** y **por qué**. Al terminar una tarea: márcala, actualiza `DATA-MODEL.md`,
`PROCESSES.md` y el `AGENTS.md` del módulo tocado, y deja commits cortos.

Las fases con dependencias de decisión están marcadas con ⚠️ — revisar "Preguntas abiertas" en
`PRODUCT.md` antes de implementarlas; si la respuesta no existe aún, implementar la opción
recomendada y dejarlo anotado.

## Fase 0 — Identidad y roles
- [ ] **Ampliar registro**: agregar `cedula`, `username`, `role`, `bio`, `avatarKey` a `User`
  (enum `Role`: USER, TEACHER, ADMIN, SUPPORT). *Dónde:* `prisma/schema.prisma`, `src/auth`
  (DTO de registro), `src/users`. *Por qué:* el producto exige registro con cédula, nombre,
  username, contraseña y correo; los 4 tipos de usuario dependen del rol.
- [ ] **Guard de roles**: decorador `@Roles(...)` + `RolesGuard` en `src/common`. Todo endpoint
  futuro declara roles explícitos. *Por qué:* profesores/admin/soporte tienen permisos distintos.
- [ ] **Perfil**: `GET/PATCH /api/users/me` (bio, nombre, avatar) y subida de avatar vía
  `StorageService`. `GET /api/users/:username` para perfiles públicos.

## Fase 1 — Biblioteca completa
- [ ] **Sub-carpetas**: `parentId` en `Folder`, validación de ciclos, unicidad
  (userId, parentId, name). *Dónde:* `src/folders`. *Por qué:* los proyectos admiten jerarquía.
- [ ] **Audio**: agregar `AUDIO` a `FileType` y validación de mimeTypes. *Por qué:* el chat y la
  obra sonora lo necesitarán.

## Fase 2 — Publicaciones y feed
- [ ] **Módulo `posts`**: entidades `Post` + `PostMedia` (ver `DATA-MODEL.md`), CRUD con
  descripción, medios desde la biblioteca (`FileAsset`), y campo `position` para que el dueño
  **reordene su feed a gusto**. Endpoint de reordenamiento en lote.
  *Por qué:* es el corazón del producto (perfil-repositorio).
- [ ] **Home feed**: `GET /api/feed` paginado con publicaciones de otros usuarios. ⚠️ ¿follows o
  global? Recomendado: global-cronológico primero, follows después si se aprueba.

## Fase 3 — Interacciones sociales
- [ ] **Likes**: módulo `social`; `POST/DELETE /api/posts/:id/like`; el contador solo lo ve el
  dueño (`GET /api/posts/:id` incluye `likeCount` solo si `authorId === userId`).
- [ ] **Guardados**: `POST/DELETE /api/posts/:id/save`, `GET /api/me/saved`.
- [ ] **Comentarios**: CRUD sobre `POST /api/posts/:id/comments`.

## Fase 4 — Chat (sockets)
- [ ] **Gateway WebSocket** (`@nestjs/websockets` + socket.io): módulo `chat` con
  `Conversation`, `ConversationParticipant`, `Message`, `ChatAttachment` (separado de
  `FileAsset` — decisión de producto: los adjuntos de chat NO van a la biblioteca).
  Autenticación del socket con el access token. Mensajes de texto, imagen, audio y video;
  compartir publicaciones (`sharedPostId`).
  *Por qué:* comunicación entre usuarios es requisito central.
- [ ] **Historial REST**: `GET /api/conversations`, `GET /api/conversations/:id/messages`
  paginado. Los sockets solo transportan lo nuevo.

## Fase 5 — Notificaciones ⚠️
- [ ] **Módulo `notifications`** dentro del monolito, emitiendo por el mismo gateway de sockets
  y persistiendo en tabla `Notification` (mensajes, comentarios, likes, publicaciones).
  *Recomendación:* empezar como módulo con eventos internos (`@nestjs/event-emitter`) bien
  aislado; si crece, extraerlo a microservicio será natural. **Conversar con el dueño antes de
  crear repositorio aparte.**

## Fase 6 — Mercado
- [ ] **Módulo `market`**: `MarketItem` con categoría obligatoria (`SERVICE | ARTWORK | EVENT |
  RESOURCE`), CRUD del vendedor, listado público. Opción de compartir un ítem al feed propio.
  *Por qué:* los usuarios promocionan/venden obras, servicios y eventos.

## Fase 7 — Búsqueda
- [ ] **Módulo `search`**: `GET /api/search?q=&type=users|posts|market&category=` — usuarios por
  username/nombre, palabras clave en descripciones de posts, ítems de market con filtro por
  categoría. Empezar con `ILIKE`/índices de Postgres (pg_trgm); motor dedicado solo si escala.

## Fase 8 — Grupos de profesores
- [ ] **Módulo `groups`**: `Group`, `GroupMember`, `GroupFolder`, `Submission`, `Grade` (ver
  `DATA-MODEL.md`). El profesor crea grupos y carpetas de curso; el alumno entrega archivos
  (quedan en SU biblioteca y decide si publicarlos); el profesor lista alumnos/trabajos y
  califica. *(La visualización fina está por delimitar; la API debe exponer datos tabulares.)*

## Fase 9 — Administración y soporte
- [ ] **Módulo `admin`**: endpoints de visualización global (usuarios, recursos, chats) solo
  para `ADMIN`; delegación de permisos de visualización a `SUPPORT` (`SupportGrant`).
  ⚠️ Alcance de visualización por determinar — implementar lo mínimo y documentar.

## Transversales (cuando toque)
- [ ] Rate limiting fino por endpoint sensible; auditoría de acciones de admin/soporte.
- [ ] Semillas (`prisma/seed.ts`) con usuarios de cada rol para desarrollo.
- [ ] E2E de los flujos críticos (auth, posts, chat).
