# Micelio — Modelo de datos

Este documento es la **fuente de verdad legible** del modelo de datos. Todo cambio en
`prisma/schema.prisma` debe reflejarse aquí en la misma tarea: qué es la entidad, por qué
existe, qué relaciones tiene y qué cambió. El objetivo es trazabilidad total.

Formato: primero las entidades **existentes** (implementadas hoy), luego el **modelo objetivo**
(planificado, por fase del `ROADMAP.md`). Al implementar una entidad planificada, muévela a la
sección de existentes con su detalle final.

---

## Entidades existentes

### User (`users`)
Cuenta de la aplicación. Hoy solo soporta email/contraseña.

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| email | string único | credencial de login |
| passwordHash | string | bcrypt |
| name | string? | |
| createdAt / updatedAt | datetime | |

Relaciones: `1—N Folder`.

Pendiente (Fase 0 del roadmap): `cedula` (único), `username` (único, nametag público), `role`
(enum `USER | TEACHER | ADMIN | SUPPORT`), `bio`, `avatarUrl`.

### Folder (`folders`)
Carpeta/"proyecto" de un usuario para organizar su biblioteca de archivos.

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| name | string | único por (userId, name) |
| userId | FK → User | cascade delete |

Relaciones: `N—1 User`, `1—N FileAsset`.

Pendiente (Fase 1): `parentId` (FK autorreferente, nullable) para **sub-carpetas**; la
unicidad de nombre pasa a ser por (userId, parentId, name).

### FileAsset (`file_assets`)
Archivo de la **biblioteca** de un usuario (imagen, video o texto), almacenado en S3. Es la
materia prima de las publicaciones. **Nunca** se usa para adjuntos de chat (eso será
`ChatAttachment`, entidad separada por decisión de producto).

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| folderId | FK → Folder | cascade delete |
| originalName | string | nombre original de subida |
| key | string único | key en S3 |
| mimeType | string | |
| type | enum `IMAGE\|VIDEO\|TEXT` | derivado del mimeType |
| size | int | bytes |

### Enum FileType
`IMAGE | VIDEO | TEXT`. Se ampliará con `AUDIO` cuando llegue el chat (Fase 4), si se decide
compartir el enum.

---

## Modelo objetivo (planificado)

> Nada de esto existe aún. Cada fase del `ROADMAP.md` indica cuándo implementarlo. Los nombres
> son la convención a seguir; si al implementar cambia algo, se actualiza aquí con el porqué.

### Fase 0 — Identidad y roles
- **User** gana: `cedula String @unique`, `username String @unique`, `role Role @default(USER)`,
  `bio String?`, `avatarKey String?`.
- **enum Role**: `USER | TEACHER | ADMIN | SUPPORT`.

### Fase 2 — Publicaciones y feed
- **Post**: `id, authorId → User, description, position (orden en el feed del autor),
  createdAt/updatedAt`. Una publicación agrupa 1..N medios.
- **PostMedia**: `id, postId → Post, fileAssetId → FileAsset, order`. Une publicación con
  archivos de biblioteca (no se duplica el binario). Borrar un FileAsset usado por un Post debe
  bloquearse o marcarse (decisión al implementar; documentarla aquí).

### Fase 3 — Interacciones sociales
- **Like**: `id, postId, userId, createdAt` con único (postId, userId). El contador se calcula;
  solo visible para el dueño del post.
- **SavedPost**: `id, postId, userId, createdAt` único (postId, userId) — guardados.
- **Comment**: `id, postId, authorId, body, createdAt`. (Respuestas anidadas: pregunta abierta.)

### Fase 4 — Chat
- **Conversation**: `id, createdAt` (1 a 1 inicialmente; grupos de chat: pregunta abierta).
- **ConversationParticipant**: `conversationId, userId, lastReadAt`.
- **Message**: `id, conversationId, senderId, type (TEXT|IMAGE|VIDEO|AUDIO), body?,
  attachmentId?, sharedPostId? (compartir publicación por chat), createdAt`.
- **ChatAttachment**: `id, key S3, mimeType, size` — **separado de FileAsset** a propósito:
  los archivos de chat no aparecen en la biblioteca de publicaciones.

### Fase 5 — Notificaciones
- **Notification**: `id, recipientId, type (MESSAGE|COMMENT|LIKE|POST), actorId?, postId?,
  messageId?, readAt?, createdAt`. Si se decide microservicio, esta tabla vive allá y aquí solo
  se emiten eventos; decisión pendiente con el dueño del producto.

### Fase 6 — Mercado
- **MarketItem**: `id, sellerId → User, title, description, category (enum MarketCategory),
  price?, currency?, mediaKey/media relation, active, createdAt/updatedAt`.
- **enum MarketCategory**: `SERVICE | ARTWORK | EVENT | RESOURCE` (ampliable).
- Compartir en feed: un Post puede referenciar `marketItemId?` (el usuario decide compartirlo).

### Fase 8 — Grupos de profesores
- **Group**: `id, teacherId → User(role TEACHER), name, description?, createdAt`.
- **GroupMember**: `groupId, userId, joinedAt`.
- **GroupFolder**: `id, groupId, name` — carpeta de curso donde los alumnos entregan.
- **Submission**: `id, groupFolderId, studentId, fileAssetId → FileAsset, createdAt`. El archivo
  entregado queda en la biblioteca del alumno (FileAsset suyo); él decide si además lo publica.
- **Grade**: `id, submissionId único, teacherId, score, feedback?, gradedAt`.

### Fase 9 — Soporte
- **SupportGrant** (nombre tentativo): permisos de visualización que el ADMIN delega a un
  SUPPORT: `id, supportUserId, scope, grantedById, createdAt`. Alcance por definir.

---

## Registro de cambios del modelo

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 2026-08-31 | Documento creado con el modelo actual (User, Folder, FileAsset) y el objetivo | Punto de partida de la documentación del proyecto |
