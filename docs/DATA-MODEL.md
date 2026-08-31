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

Pendiente (Fase 0 del roadmap): `cedula` (único, formato colombiano, sin validar por ahora),
`username` (único, nametag público), `role` (enum `USER | TEACHER | ADMIN | SUPPORT`), `bio`,
`avatarKey`, `isPublic` (default `false`: perfiles privados por defecto).

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
`IMAGE | VIDEO | TEXT`. Se ampliará con `AUDIO` en la Fase 1 (biblioteca completa); el chat
(Fase 5) decidirá si comparte el enum o define el suyo.

---

## Modelo objetivo (planificado)

> Nada de esto existe aún. Cada fase del `ROADMAP.md` indica cuándo implementarlo. Los nombres
> son la convención a seguir; si al implementar cambia algo, se actualiza aquí con el porqué.

### Fase 0 — Identidad y roles
- **User** gana: `cedula String @unique` (formato colombiano; solo se almacena, sin validación
  por ahora — futura validación contra bases de datos de la Universidad de Antioquia),
  `username String @unique`, `role Role @default(USER)`, `bio String?`, `avatarKey String?`,
  `isPublic Boolean @default(false)` (perfiles **privados por defecto**; el dueño puede hacerse
  público desde la configuración de su perfil).
- **enum Role**: `USER | TEACHER | ADMIN | SUPPORT`. El rol TEACHER lo asigna un ADMIN
  (endpoint de admin); en el futuro será automático vía contraste con la universidad.

### Fase 2 — Publicaciones y feed propio
- **Post**: `id, authorId → User, description, position (orden en el feed del autor),
  createdAt/updatedAt`. Una publicación agrupa 1..N medios.
- **PostMedia**: `id, postId → Post, fileAssetId → FileAsset, order`. Une publicación con
  archivos de biblioteca (no se duplica el binario). Borrar un FileAsset usado por un Post debe
  bloquearse o marcarse (decisión al implementar; documentarla aquí).
- **Ajustes de presentación del feed** (en User o tabla 1–1 `FeedSettings`, decidir al
  implementar y documentar): `feedLayout (enum GRID | MASONRY)`, `feedColumns Int` (1–6),
  `feedGap Int` (paso de espaciado en tokens de diseño). *Por qué:* el dueño elige cuadrícula o
  masonry, cuántas columnas y el espaciado entre publicaciones; los visitantes ven el feed como
  el dueño lo curó.

### Fase 3 — Grafo social y privacidad
- **Follow**: `id, followerId → User, followedId → User, isFavorite Boolean @default(false),
  createdAt`, único (followerId, followedId). `isFavorite` = el seguidor marca a ese seguido
  como favorito (prioridad en su home).
- **Regla de visibilidad** (se aplica en servicios, no es tabla): perfil público → contenido
  visible para todos; perfil privado → contenido visible solo con **follow mutuo** (A sigue a B
  y B sigue a A). Toda consulta de posts/perfil/búsqueda debe pasar por esta regla.

### Fase 4 — Interacciones sociales
- **Like**: `id, postId, userId, createdAt` con único (postId, userId). El dueño del post ve el
  contador **y la lista de quiénes** dieron like; nadie más ve nada.
- **SavedPost**: `id, postId, userId, createdAt` único (postId, userId) — guardados.
- **Comment**: `id, postId, authorId, body, createdAt`. (Respuestas anidadas: pregunta abierta.)

### Fase 5 — Chat
- **Conversation**: `id, createdAt` (1 a 1 inicialmente; grupos de chat: pregunta abierta).
- **ConversationParticipant**: `conversationId, userId, lastReadAt`.
- **Message**: `id, conversationId, senderId, type (TEXT|IMAGE|VIDEO|AUDIO), body?,
  attachmentId?, sharedPostId? (compartir publicación por chat), createdAt`.
- **ChatAttachment**: `id, key S3, mimeType, size` — **separado de FileAsset** a propósito:
  los archivos de chat no aparecen en la biblioteca de publicaciones.

### Fase 6 — Notificaciones (módulo extraíble)
- **Notification** (tabla `notification_items`, prefijo propio): `id, recipientId,
  type (MESSAGE|COMMENT|LIKE|POST|FOLLOW), actorId?, postId?, messageId?, payload Json,
  readAt?, createdAt`. **Sin FKs hacia otros dominios** (ids "en frío" + payload denormalizado)
  — decisión de arquitectura para que el módulo sea extraíble a microservicio; ver
  `docs/ARCHITECTURE.md`.

### Fase 7 — Mercado
- **MarketItem**: `id, sellerId → User, title, description, category (enum MarketCategory),
  price?, currency?, mediaKey/media relation, active, createdAt/updatedAt`. Sin pagos en esta
  fase (los pagos llegan en la Fase 11 con su propia entidad de órdenes; se diseñará entonces).
- **enum MarketCategory**: `SERVICE | ARTWORK | EVENT | RESOURCE` (ampliable).
- Compartir en feed: un Post puede referenciar `marketItemId?` (el usuario decide compartirlo).

### Fase 9 — Grupos de profesores
- **Group**: `id, teacherId → User(role TEACHER), name, description?, createdAt`.
- **GroupMember**: `groupId, userId, joinedAt`.
- **GroupFolder**: `id, groupId, name` — carpeta de curso donde los alumnos entregan.
- **Submission**: `id, groupFolderId, studentId, fileAssetId → FileAsset, createdAt`. El archivo
  entregado queda en la biblioteca del alumno (FileAsset suyo); él decide si además lo publica.
- **Grade**: `id, submissionId único, teacherId, score, feedback?, gradedAt`.

### Fase 10 — Soporte
- **SupportGrant** (nombre tentativo): permisos de visualización que el ADMIN delega a un
  SUPPORT: `id, supportUserId, scope, grantedById, createdAt`. Alcance por definir.

### Fase 11 — Futuro (diseñar al llegar)
- Órdenes/pagos del market (proveedor detrás de interfaz, ver `ARCHITECTURE.md`).
- Validación de cédula y rol profesor contra bases de datos de la Universidad de Antioquia.

---

## Registro de cambios del modelo

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 2026-08-31 | Documento creado con el modelo actual (User, Folder, FileAsset) y el objetivo | Punto de partida de la documentación del proyecto |
| 2026-08-31 | Modelo objetivo ampliado: `isPublic` (privado por defecto), `Follow` con favoritos, ajustes de feed (layout/columnas/espaciado), likes con lista visible al dueño, `Notification` sin FKs (extraíble), fases renumeradas | Decisiones del dueño del producto (ver `PRODUCT.md`) |
