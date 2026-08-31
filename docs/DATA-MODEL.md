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
Cuenta de la aplicación e identidad social (Fase 0: registro con cédula/username/rol).

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| email | string único | credencial de login |
| passwordHash | string | bcrypt |
| name | string? | requerido por el DTO de registro; la columna sigue nullable a nivel de esquema |
| cedula | string único | formato colombiano; solo se valida formato básico (6–10 dígitos), sin contraste externo. **Nunca se devuelve** en ninguna respuesta |
| username | string único | nametag público; formato elegido (simple, sin espec previa): `^[a-z0-9_.]{3,30}$` |
| role | enum `Role` @default(`USER`) | `USER \| TEACHER \| ADMIN \| SUPPORT`; solo un ADMIN lo cambia (`PATCH /api/admin/users/:id/role`) |
| bio | string? | editable vía `PATCH /api/users/me` |
| avatarKey | string? | key en S3; se sube vía `PATCH /api/users/me/avatar` (multipart) |
| isPublic | boolean @default(`false`) | perfiles privados por defecto |
| createdAt / updatedAt | datetime | |

Relaciones: `1—N Folder`.

Migración: `20260831000000_extend_user_identity_roles`.

### Enum Role (Fase 0)
`USER | TEACHER | ADMIN | SUPPORT`. Viaja en el JWT (access y refresh) para que `RolesGuard`
no necesite una consulta a base de datos por request; un cambio de rol se refleja en el
siguiente refresh de token (el access token dura poco, `JWT_ACCESS_EXPIRES_IN`).

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
(Fase 6) decidirá si comparte el enum o define el suyo.

---

## Modelo objetivo (planificado)

> Nada de esto existe aún. Cada fase del `ROADMAP.md` indica cuándo implementarlo. Los nombres
> son la convención a seguir; si al implementar cambia algo, se actualiza aquí con el porqué.

### Fase 0 — Identidad y roles — **implementado**
Ver la entidad `User` y el enum `Role` en "Entidades existentes" arriba.

### Fase 2 — Publicaciones y feed propio
- **Post**: `id, authorId → User, description, tags String[] (máx 10, normalizadas por el
  servidor — reglas exactas en `API-CONTRACTS.md`; índice GIN para búsqueda y afinidad),
  position (orden en el feed del autor), createdAt/updatedAt`. Una publicación agrupa 1..N
  medios. *Por qué tags como arreglo y no tabla:* no hay metadatos por etiqueta; Postgres +
  GIN cubren búsqueda y conteo sin joins.
- **PostMedia**: `id, postId → Post, fileAssetId → FileAsset, order`. Une publicación con
  archivos de biblioteca (no se duplica el binario). Borrar un FileAsset usado por un Post debe
  bloquearse o marcarse (decisión al implementar; documentarla aquí).
- **Ajustes de presentación del feed** (en User o tabla 1–1 `FeedSettings`, decidir al
  implementar y documentar): `feedLayout (enum GRID | MASONRY)`, `feedColumns Int` (1–6),
  `feedGap Int` (índice 0–5 en la escala de espaciado del design system; ver
  `API-CONTRACTS.md`). *Por qué:* el dueño elige cuadrícula o
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

### Fase 5 — Afinidad y ranking (módulo `ranking`)
- **UserAffinity**: `id, userId → User, targetUserId → User, score Float @default(0),
  updatedAt`, único (userId, targetUserId). Afinidad de un usuario hacia otro, acumulada por
  likes/comentarios/guardados/compartidos con pesos fijos y vida media de 90 días — señales,
  pesos y fórmula de decaimiento exactos en `API-CONTRACTS.md` ("Afinidad y ranking").
- **UserTagAffinity**: `id, userId → User, tag String, score Float @default(0), updatedAt`,
  único (userId, tag). Afinidad hacia etiquetas.
- Ambas tablas se escriben **solo** desde los listeners de eventos del módulo `ranking`;
  ningún otro módulo las toca. *Por qué:* alimentan el feed v2, el explore y el orden de
  búsqueda sin ML y sin jobs de mantenimiento.

### Fase 6 — Chat
- **Conversation**: `id, createdAt` (1 a 1 inicialmente; grupos de chat: pregunta abierta).
- **ConversationParticipant**: `conversationId, userId, lastReadAt`.
- **Message**: `id, conversationId, senderId, type (TEXT|IMAGE|VIDEO|AUDIO), body?,
  attachmentId?, sharedPostId? (compartir publicación por chat), createdAt`.
- **ChatAttachment**: `id, key S3, mimeType, size` — **separado de FileAsset** a propósito:
  los archivos de chat no aparecen en la biblioteca de publicaciones.

### Fase 7 — Notificaciones (módulo extraíble)
- **Notification** (tabla `notification_items`, prefijo propio): `id, recipientId,
  type (MESSAGE|COMMENT|LIKE|POST|FOLLOW), actorId?, postId?, messageId?, payload Json,
  readAt?, createdAt`. **Sin FKs hacia otros dominios** (ids "en frío" + payload denormalizado)
  — decisión de arquitectura para que el módulo sea extraíble a microservicio; ver
  `docs/ARCHITECTURE.md`.

### Fase 8 — Mercado
- **MarketItem**: `id, sellerId → User, title, description, category (enum MarketCategory),
  price?, currency?, mediaKey/media relation, active, createdAt/updatedAt`. Sin pagos en esta
  fase (los pagos llegan en la Fase 12 con su propia entidad de órdenes; se diseñará entonces).
- **enum MarketCategory**: `SERVICE | ARTWORK | EVENT | RESOURCE` (ampliable).
- Compartir en feed: un Post puede referenciar `marketItemId?` (el usuario decide compartirlo).

### Fase 10 — Grupos de profesores
- **Group**: `id, teacherId → User(role TEACHER), name, description?, createdAt`.
- **GroupMember**: `groupId, userId, joinedAt`.
- **GroupFolder**: `id, groupId, name` — carpeta de curso donde los alumnos entregan.
- **Submission**: `id, groupFolderId, studentId, fileAssetId → FileAsset, createdAt`. El archivo
  entregado queda en la biblioteca del alumno (FileAsset suyo); él decide si además lo publica.
- **Grade**: `id, submissionId único, teacherId, score, feedback?, gradedAt`.

### Fase 11 — Soporte
- **SupportGrant** (nombre tentativo): permisos de visualización que el ADMIN delega a un
  SUPPORT: `id, supportUserId, scope, grantedById, createdAt`. Alcance por definir.

### Fase 12 — Futuro (diseñar al llegar)
- Órdenes/pagos del market (proveedor detrás de interfaz, ver `ARCHITECTURE.md`).
- Validación de cédula y rol profesor contra bases de datos de la Universidad de Antioquia.

---

## Registro de cambios del modelo

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 2026-08-31 | Documento creado con el modelo actual (User, Folder, FileAsset) y el objetivo | Punto de partida de la documentación del proyecto |
| 2026-08-31 | Modelo objetivo ampliado: `isPublic` (privado por defecto), `Follow` con favoritos, ajustes de feed (layout/columnas/espaciado), likes con lista visible al dueño, `Notification` sin FKs (extraíble), fases renumeradas | Decisiones del dueño del producto (ver `PRODUCT.md`) |
| 2026-08-31 | `tags` en Post; nueva Fase 5 con `UserAffinity` y `UserTagAffinity` (módulo `ranking`); fases posteriores renumeradas (+1) | Decisión del dueño: ranking personalizado por interacciones |
| 2026-08-31 | Fase 0 implementada: `User` gana `cedula`, `username`, `role`, `bio`, `avatarKey`, `isPublic`; nuevo enum `Role`; migración `20260831000000_extend_user_identity_roles` | Cierre de la Fase 0 del `ROADMAP.md` |
