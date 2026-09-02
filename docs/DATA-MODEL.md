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
| feedLayout | enum `FeedLayout` @default(`GRID`) | Fase 2 — ver "Ajustes de feed en User" |
| feedColumns | int @default(`3`) | Fase 2 — 1–6 |
| feedGap | int @default(`2`) | Fase 2 — índice 0–5 de la escala de espaciado |
| createdAt / updatedAt | datetime | |

Relaciones: `1—N Folder`, `1—N Post`, `1—N Follow` (como seguidor y como seguido).

Migración: `20260831000000_extend_user_identity_roles`.

**Relleno de usuarios anteriores a la Fase 0.** `cedula` y `username` son `NOT NULL` + únicos,
pero la tabla ya existía desde `20260826000000_init`. La migración por tanto agrega ambas
columnas *nullable*, rellena las filas previas y solo entonces aplica `SET NOT NULL` y los
índices únicos. Sin ese orden, la migración aborta con *"column contains null values"* en
cualquier base que ya tenga usuarios. Los valores de relleno se derivan del `id` (uuid), así
que son deterministas y únicos:

| Campo | Valor de relleno | Consecuencia |
| --- | --- | --- |
| `username` | `u_` + 28 hex del id | Cumple `^[a-z0-9_.]{3,30}$`; el usuario puede cambiarlo después |
| `cedula` | `PENDIENTE-` + 32 hex del id | **No** cumple `^[0-9]{6,10}$`: es imposible confundirlo con una cédula real, y marca a quién hay que volver a pedírsela |

Ningún flujo actual vuelve a capturar la cédula (`PATCH /api/users/me` no la acepta). Si alguna
base productiva llega a tener filas `PENDIENTE-*`, hace falta un flujo de recaptura — hoy no
existe porque no hay despliegue.

### Enum Role (Fase 0)
`USER | TEACHER | ADMIN | SUPPORT`. Viaja en el JWT (access y refresh) para que `RolesGuard`
no necesite una consulta a base de datos por request; un cambio de rol se refleja en el
siguiente refresh de token (el access token dura poco, `JWT_ACCESS_EXPIRES_IN`).

### Folder (`folders`)
Carpeta/"proyecto" de un usuario para organizar su biblioteca de archivos.

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| name | string | único entre hermanos: (userId, parentId, name) |
| userId | FK → User | cascade delete |
| parentId | FK → Folder, nullable | `null` = carpeta raíz; cascade delete |

Relaciones: `N—1 User`, `N—1 Folder` (madre), `1—N Folder` (hijas), `1—N FileAsset`.

**Sub-carpetas (Fase 1).** `parentId` es una FK autorreferente `ON DELETE CASCADE`: borrar una
carpeta se lleva su subárbol completo y, por la FK de `file_assets`, las filas de sus archivos.
El árbol no tiene profundidad máxima; `FoldersService` impide los ciclos (mover una carpeta
dentro de sí misma o de una descendiente → `400`).

*Por qué la unicidad necesita dos índices:* en Postgres dos `NULL` son distintos entre sí, así
que `@@unique([userId, parentId, name])` **no** impide dos carpetas raíz con el mismo nombre.
La migración `20260901000000_add_subfolders_and_audio` agrega a mano el índice parcial
`folders_userId_name_root_key` (`UNIQUE (userId, name) WHERE parentId IS NULL`) para cubrir ese
caso. Prisma no sabe expresarlo en el schema; ahí queda anotado en un comentario del modelo.

### FileAsset (`file_assets`)
Archivo de la **biblioteca** de un usuario (imagen, video, audio o texto), almacenado en S3. Es la
materia prima de las publicaciones. **Nunca** se usa para adjuntos de chat (eso será
`ChatAttachment`, entidad separada por decisión de producto).

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| folderId | FK → Folder | cascade delete |
| originalName | string | nombre original de subida |
| key | string único | key en S3 |
| mimeType | string | |
| type | enum `IMAGE\|VIDEO\|AUDIO\|TEXT` | derivado del mimeType |
| size | int | bytes — el que reporta S3 (`HeadObject`), no el que declara el cliente |
| width / height | int? | píxeles **declarados por el cliente** al confirmar la subida (el binario nunca pasa por el backend). Nulos en audio, texto y en todo lo subido antes de la Fase 2. Las publicaciones los heredan para el masonry |

### Enum FileType
`IMAGE | VIDEO | AUDIO | TEXT`. `AUDIO` entró en la Fase 1 (biblioteca completa, para obra
sonora y para el chat); se valida **solo por peso, nunca por duración** (decisión #11 de
`PRODUCT.md`), con `UPLOAD_MAX_AUDIO_MB` (50 MB por defecto). El chat (Fase 6) decidirá si
comparte el enum o define el suyo.

### Follow (`follows`)
Grafo social (Fase 3): A sigue a B, y opcionalmente lo marca como **favorito**.

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| followerId | FK → User | quien sigue; cascade delete |
| followedId | FK → User | a quién sigue; cascade delete |
| isFavorite | boolean @default(`false`) | marca de **quien sigue**: le da 12 h de prioridad en su home |
| createdAt | datetime | el `since` de los listados |

Único `(followerId, followedId)`: la arista existe o no existe, nunca duplicada — por eso
seguir dos veces es idempotente. Índice extra por `followedId` porque las dos lecturas del
grafo son opuestas (a quién sigue alguien / quién lo sigue).

**Por qué no hay tabla de "follow mutuo":** el mutuo es una consulta (`count === 2`), no un
dato. Materializarlo obligaría a mantener dos filas sincronizadas por relación.

Migración: `20260902100000_add_follows`.

### Post (`posts`)
Publicación del feed propio de un usuario: descripción, etiquetas y 1..N medios tomados de su
biblioteca. Fase 2.

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| authorId | FK → User | cascade delete |
| description | string? | máx 2200 caracteres (validación del DTO) |
| tags | string[] | normalizadas por el servidor, máx 10 — reglas exactas en `API-CONTRACTS.md`; índice **GIN** para la búsqueda (Fase 9) y la afinidad por temas (Fase 5) |
| position | int | orden en el feed del autor: `0` es la primera. La publicación nueva entra en `0` y las demás suben un puesto |
| createdAt / updatedAt | datetime | |

Relaciones: `N—1 User`, `1—N PostMedia`. Índice `(authorId, position)`: el feed propio siempre
se lee por autor y en su orden curado.

*Por qué `tags` como arreglo y no tabla:* no hay metadatos por etiqueta; Postgres + GIN cubren
búsqueda y conteo sin joins.

*Por qué `position` deja huecos al borrar:* renumerar todo el feed en cada borrado es escritura
masiva para nada — lo que importa es el orden relativo, y el siguiente `PATCH /api/posts/reorder`
renumera de todos modos.

### PostMedia (`post_media`)
Une una publicación con archivos de la biblioteca (**no** se duplica el binario).

| Campo | Tipo | Notas |
| --- | --- | --- |
| id | uuid PK | |
| postId | FK → Post | cascade delete |
| fileAssetId | FK → FileAsset | **`onDelete: Restrict`** (ver abajo) |
| order | int | posición en el carrusel; es el índice del arreglo que manda el cliente |
| width / height | int? | **override** opcional de las dimensiones del archivo; normalmente nulos (ver abajo) |

Único `(postId, fileAssetId)`: un archivo no se repite dentro de la misma publicación.

**Decisión de la Fase 2, confirmada por el dueño el 2026-09-02: borrar un `FileAsset` usado por
un `Post` se bloquea.** La FK es `Restrict`, así que `DELETE /api/files/:id` responde `409` y `DELETE
/api/folders/:id` también si algún archivo del subárbol está publicado (la cascada se detiene y
Postgres aborta el borrado). *Por qué bloquear y no cascadear:* una publicación sin medio es una
publicación rota, y el usuario tiene la acción alternativa a mano (borrar la publicación).
*Por qué no "marcar":* obligaría a inventar un estado de medio ausente que ningún contrato
define.

**`width`/`height` aquí son un override.** La fuente normal es el `FileAsset` (se miden **al
subir a la biblioteca**, decisión del dueño del 2026-09-02): así web y app pintan igual el mismo
archivo. Estas columnas solo pisan ese valor cuando el cliente manda dimensiones al publicar
—útil si alguna vez se recorta un medio al publicarlo— y quedan nulas en el caso normal.
Lectura: `PostMedia.width ?? FileAsset.width`.

### Ajustes de feed en User (Fase 2)
`feedLayout` (enum `FeedLayout`: `GRID | MASONRY`, default `GRID`), `feedColumns` (int,
default 3, validado 1–6) y `feedGap` (int, default 2, validado 0–5 — **índice** de la escala de
espaciado del design system, no píxeles). Viven **en `User`** y no en una tabla 1–1 porque
siempre se leen junto al perfil (`UserPublic.feedSettings`) y jamás por separado: una tabla
aparte serían un join y una fila extra por usuario a cambio de nada.

Migración: `20260901120000_add_posts_and_feed_settings`.

---

## Modelo objetivo (planificado)

> Nada de esto existe aún. Cada fase del `ROADMAP.md` indica cuándo implementarlo. Los nombres
> son la convención a seguir; si al implementar cambia algo, se actualiza aquí con el porqué.

### Fase 0 — Identidad y roles — **implementado**
Ver la entidad `User` y el enum `Role` en "Entidades existentes" arriba.

### Fase 2 — Publicaciones y feed propio — **implementado**
Ver `Post`, `PostMedia` y los ajustes de feed en "Entidades existentes" arriba.

### Fase 3 — Grafo social y privacidad — **implementado**
Ver `Follow` en "Entidades existentes". La **regla de visibilidad** no es una tabla: vive en
`SocialService` (`canView` / `canViewWithGraph`) y es el único lugar donde se decide si X ve el
contenido de Y (propio, público, o follow mutuo).

### Fase 4 — Interacciones sociales
- **Like**: `id, postId, userId, createdAt` con único (postId, userId). El dueño del post ve el
  contador **y la lista de quiénes** dieron like; nadie más ve nada.
- **SavedPost**: `id, postId, userId, createdAt` único (postId, userId) — guardados.
- **Comment**: `id, postId, authorId, body, parentId?, createdAt`. `parentId` apunta a otro
  `Comment` del mismo post (auto-relación, `onDelete: Cascade`): **respuestas anidadas desde el
  inicio**, decisión del dueño (PRODUCT.md #12), tomada antes de crear la entidad para no pagar
  la migración después. Índice por `(postId, parentId, createdAt)`: los comentarios raíz son los
  de `parentId = null`.

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
| 2026-09-01 | Fase 1 implementada: `Folder` gana `parentId` (sub-carpetas, unicidad por hermanos + índice parcial para la raíz); `FileType` gana `AUDIO`; migración `20260901000000_add_subfolders_and_audio` | Cierre de la Fase 1 del `ROADMAP.md` |
| 2026-09-01 | Fase 2 implementada: `Post` (tags con índice GIN, `position`), `PostMedia` (`Restrict` sobre `FileAsset`, `width`/`height` declarados por el cliente) y ajustes de feed en `User` (`feedLayout`/`feedColumns`/`feedGap`); migración `20260901120000_add_posts_and_feed_settings` | Cierre de la Fase 2 del `ROADMAP.md` |
| 2026-09-02 | `FileAsset` gana `width`/`height` (opcionales, declaradas por el cliente al confirmar); las publicaciones las heredan y `PostMedia.width/height` queda como override; migración `20260902000000_add_file_asset_dimensions` | Decisión del dueño: medir al subir a la biblioteca para que web y app pinten igual el mismo archivo |
| 2026-09-02 | Fase 3: `Follow` (con `isFavorite`, único por par y cascade a `User`); migración `20260902100000_add_follows` | Grafo social, favoritos y la regla de visibilidad por follow mutuo |
