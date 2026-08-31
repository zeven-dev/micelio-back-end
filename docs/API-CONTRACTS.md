# Micelio — Contratos de API

Formas **exactas** de peticiones y respuestas para que los agentes (back, web y app) no tengan
que inferir nada. Ante cualquier duda de forma, **este documento manda**; si al implementar hay
una razón fuerte para desviarse, se actualiza aquí en la misma tarea y se anota en
`PROCESSES.md`. Los endpoints ya existentes (auth, folders, files) conservan su forma actual;
esto especifica lo nuevo.

## Convenciones generales (obligatorias)

- **Envelope de éxito** (lo aplica `TransformInterceptor`, no lo construyas a mano):
  `{ "success": true, "data": <payload> }`. Todo lo especificado abajo es el contenido de
  `data`.
- **Envelope de error** (lo aplica `HttpExceptionFilter`):
  `{ "success": false, "statusCode": 404, "path": "/api/...", "timestamp": ISO, "message": string | string[] }`.
- **Nombres** en `camelCase`; fechas en **ISO 8601 UTC** (`2026-08-31T12:00:00.000Z`); ids
  `uuid` string.
- **Paginación por cursor** en toda lista potencialmente larga:
  petición `?cursor=<opaco>&limit=<n>` (default 20, máx 50); respuesta
  `{ "items": [...], "nextCursor": string | null }`. `nextCursor: null` = no hay más. El cursor
  es opaco para el cliente (base64 de JSON interno); el cliente solo lo reenvía.
- **URLs de medios**: siempre firmadas y con expiración (`url` + `expiresAt`); el cliente no
  construye URLs de S3.

## Formas de recursos

### UserPublic — lo que cualquiera puede ver de un usuario
```json
{
  "id": "uuid", "username": "string", "name": "string",
  "avatarUrl": "string|null", "isPublic": true,
  "followersCount": 0, "followingCount": 0,
  "viewerFollows": false, "followsViewer": false
}
```
Si el perfil es **privado sin follow mutuo** con el viewer, esto es TODO lo que se devuelve
(sin bio, sin posts, sin feed settings). Con acceso (público, o mutuo, o es el propio) se
agrega:
```json
{ "bio": "string|null",
  "feedSettings": { "layout": "GRID|MASONRY", "columns": 1, "gap": 2 } }
```
`gap` es el índice 0–5 en la escala de espaciado del design system, no píxeles.

### Me — `GET /api/users/me` (solo el propio)
`UserPublic` completo + `{ "email": "string", "role": "USER|TEACHER|ADMIN|SUPPORT" }`.
La **cédula nunca se devuelve** en ninguna respuesta, ni siquiera en `me`.

### Post
```json
{
  "id": "uuid", "author": UserPublic, "description": "string|null",
  "tags": ["string"], "position": 0, "createdAt": ISO,
  "media": [ { "id": "uuid", "order": 0, "type": "IMAGE|VIDEO|AUDIO|TEXT",
               "url": "string", "expiresAt": ISO, "width": 0, "height": 0 } ],
  "viewerHasLiked": false, "viewerHasSaved": false,
  "likeCount": 0, "commentCount": 0
}
```
`likeCount` **solo** se incluye cuando el viewer es el autor; para cualquier otro viewer el
campo **se omite** (no se manda en 0 — se omite). `width`/`height` son necesarios para el
masonry de los clientes.

**Etiquetas (`tags`):** al crear/editar un post el cliente manda `tags: string[]` explícitas y
el servidor además extrae todo token `#palabra` de la descripción y lo fusiona. Normalización
servidor: minúsculas, sin `#`, trim, solo `[a-z0-9_áéíóúñü-]`, máx 30 caracteres por etiqueta;
se eliminan vacías y duplicadas. Si tras normalizar quedan más de **10**, responde `400`. Las
etiquetas alimentan la búsqueda y la afinidad por temas (ver "Afinidad y ranking").

### Comment
```json
{ "id": "uuid", "author": UserPublic, "body": "string", "createdAt": ISO }
```

### Notification
```json
{ "id": "uuid", "type": "MESSAGE|COMMENT|LIKE|POST|FOLLOW",
  "actor": { "id": "uuid", "username": "string", "avatarUrl": "string|null" },
  "payload": { }, "readAt": "ISO|null", "createdAt": ISO }
```
`payload` lleva lo necesario para navegar (p. ej. `{ "postId": "..." }`), denormalizado.

### MarketItem
```json
{ "id": "uuid", "seller": UserPublic, "title": "string", "description": "string",
  "category": "SERVICE|ARTWORK|EVENT|RESOURCE", "price": "string|null",
  "currency": "COP|null", "active": true,
  "media": [ { "url": "string", "expiresAt": ISO } ], "createdAt": ISO }
```
`price` es string decimal (evita flotantes); `currency` ISO 4217, default `COP`.

### Conversation y Message
```json
{ "id": "uuid", "participants": [UserPublic],
  "lastMessage": Message|null, "unreadCount": 0, "updatedAt": ISO }

{ "id": "uuid", "conversationId": "uuid", "senderId": "uuid",
  "type": "TEXT|IMAGE|VIDEO|AUDIO", "body": "string|null",
  "attachment": { "url": "string", "expiresAt": ISO, "mimeType": "string" } | null,
  "sharedPost": Post|null, "createdAt": ISO }
```

## Endpoints con contrato fino

### Reordenar el feed propio — `PATCH /api/posts/reorder`
Body: `{ "orderedIds": ["uuid", ...] }` — la lista **completa** de ids de posts del usuario en
el nuevo orden (no deltas). El servidor valida que el conjunto coincida exactamente con los
posts del usuario (si no, `400`) y persiste `position` = índice en el array. Respuesta:
`{ "reordered": true }`. *Por qué lista completa:* elimina toda ambigüedad de movimientos
concurrentes y hace el optimistic update trivial en los clientes.

### Ajustes de feed — `PATCH /api/users/me`
Acepta parcial: `{ "feedSettings": { "layout"?, "columns"?, "gap"? } }` además de
`name?, bio?, isPublic?`. Validación: `columns` entero 1–6; `gap` entero 0–5;
`layout` ∈ {GRID, MASONRY}. Avatar aparte: `PATCH /api/users/me/avatar` (multipart).

### Likes — Fase 4
- `POST /api/posts/:id/like` → `{ "liked": true }` (idempotente; repetir no duplica).
- `DELETE /api/posts/:id/like` → `{ "liked": false }` (idempotente).
- `GET /api/posts/:id/likes` → **403 si el viewer no es el autor**. Si lo es:
  `{ "total": 0, "items": [ { "user": UserPublic, "likedAt": ISO } ], "nextCursor": ... }`
  ordenado por `likedAt` desc.

### Follows — Fase 3
- `POST /api/users/:username/follow` → `{ "following": true, "isFavorite": false }`.
- `DELETE /api/users/:username/follow` → `{ "following": false }`.
- `PATCH /api/users/:username/follow` body `{ "isFavorite": bool }` → estado resultante.
- `GET /api/me/following` / `GET /api/me/followers` → paginado de
  `{ "user": UserPublic, "isFavorite": bool, "since": ISO }` (en followers no hay
  `isFavorite`).

### Búsqueda — `GET /api/search?q=&type=&category=&cursor=&limit=`
`type` ∈ {`users`,`posts`,`market`} (obligatorio, una a la vez — los clientes usan tabs).
Respuesta: paginado estándar de `UserPublic` | `Post` | `MarketItem` según `type`.
`category` solo aplica con `type=market`. Solo devuelve contenido que pasa la regla de
visibilidad del viewer.

## `GET /api/feed` — algoritmo del home (especificación exacta)

Determinista, sin ML, sin aleatoriedad: **mismo viewer + mismo estado de afinidad + mismo
cursor ⇒ misma página**. Se implementa en dos versiones: **v1 en la Fase 3** (sin afinidad) y
**v2 en la Fase 5** (con afinidad). La forma de la respuesta y el cursor son idénticos en
ambas; los clientes no cambian.

**Streams de candidatos** (siempre excluyen los posts del propio viewer y todo lo que no pase
la regla de visibilidad de `social`):

- **Stream S (seguidos):** posts de usuarios que el viewer sigue.
- **Stream D (descubrimiento):** posts de perfiles **públicos** que el viewer **no** sigue.

**Clave de orden `rankAt`** (por post, por viewer; orden `rankAt` desc, desempate `id` desc):

| | v1 (Fase 3) | v2 (Fase 5, reemplaza a v1) |
| --- | --- | --- |
| Stream S | `createdAt` + 12 h si favorito | `createdAt` + 12 h si favorito + `min(48 h, effA(x, autor)` horas`)` |
| Stream D | `createdAt` | `createdAt` + `min(48 h, effA(x, autor)` horas`)` + `min(24 h, Σ effT(x, tag)` horas por las tags del post`)` |

En v2 el boost total de un post se limita a **+72 h**. `effA` y `effT` se definen en "Afinidad
y ranking" abajo. *Efecto:* lo que te interesa "flota" como si fuera más reciente — prioridad
sin ocultar nada y sin salirse de un orden temporal comprensible.

**Mezcla:** página de `limit` (default 20). Se llena por posiciones 1..limit: cada posición
múltiplo de 5 (5, 10, 15, 20) toma el siguiente de **D**; el resto toman el siguiente de
**S**. Si un stream se agota, las posiciones restantes se llenan del otro. Si ambos se agotan,
la página sale corta y `nextCursor: null`.

**Cursor:** base64 de `{ "s": [rankAtISO, id] | null, "d": [rankAtISO, id] | null }` — la
última entrada consumida de cada stream. La página siguiente reanuda cada stream estrictamente
después de su marca (`<` sobre la clave compuesta). Como en v2 la afinidad puede cambiar entre
páginas (si el usuario interactúa mientras navega), un post puede repetirse entre páginas:
**los clientes deben deduplicar por `id` al concatenar páginas** (obligatorio).

**Queda fuera a propósito (no implementar por iniciativa propia):** registro de "ya visto",
ranking por engagement global (posts populares para todos), ML. Cualquier evolución la decide
el dueño del producto y se especifica aquí primero.

## Afinidad y ranking personalizado (Fase 5, especificación exacta)

Objetivo (decisión del dueño del producto): si el usuario X interactúa mucho con el contenido
del usuario Y — lo siga o no — Y se vuelve más relevante en el home y el explore de X; lo mismo
con las **etiquetas** con las que X interactúa. Sin ML: contadores con pesos fijos y
decaimiento.

**Señales y pesos** (se aplican al autor del post Y **y** a cada etiqueta del post; nunca dejan
un score por debajo de 0):

| Señal | Delta |
| --- | --- |
| Dar like | +1 |
| Quitar like | −1 |
| Comentar (cada comentario) | +2 |
| Guardar | +3 |
| Quitar de guardados | −3 |
| Compartir un post por chat | +2 |

**Almacenamiento** (módulo `ranking`, ver `ARCHITECTURE.md`): `UserAffinity(userId,
targetUserId, score Float, updatedAt)` único por par, y `UserTagAffinity(userId, tag,
score Float, updatedAt)` único por par. Se actualizan **solo** escuchando eventos de dominio
(`post.liked`, `post.unliked`, `comment.created`, `post.saved`, `post.unsaved`,
`post.shared`); nadie escribe estas tablas directamente. Las interacciones con contenido
propio no generan afinidad.

**Decaimiento — vida media de 90 días.** Valor efectivo en lectura:
`eff(score, updatedAt) = score × 0.5^(díasDesde(updatedAt) / 90)`.
Al escribir un delta: primero se decae el score almacenado a hoy, luego se suma el delta y se
guarda con `updatedAt = ahora`. Así no hay jobs de mantenimiento y los intereses viejos se
apagan solos.

**Uso:** `effA(x, y)` = afinidad efectiva de X hacia el autor Y; `effT(x, tag)` = afinidad
efectiva de X hacia una etiqueta. Alimentan el feed v2 (arriba), el explore y el orden de la
búsqueda (abajo). 1 punto de afinidad = 1 hora de boost, con los topes ya definidos.

## `GET /api/explore` — descubrimiento en la búsqueda (Fase 9)

La cuadrícula tipo Instagram que se muestra en la sección de búsqueda **antes de escribir**.
`?cursor=&limit=` → paginado estándar de `Post`.

- **Candidatos:** posts de perfiles públicos, excluyendo los del propio viewer y los de
  autores que ya sigue (eso ya vive en su home).
- **Orden:** el `rankAt` del stream D de v2 (recencia + afinidad al autor + afinidad a las
  etiquetas), desempate `id` desc. Cursor estándar de un solo stream. Dedupe por `id` en el
  cliente, igual que el feed.

## Orden de resultados de búsqueda (Fase 9)

Con `q` presente, después de filtrar por visibilidad:

- `type=users`: primero username con **prefijo exacto** de `q`, luego por `effA(viewer,
  usuario)` desc, luego por `followersCount` desc.
- `type=posts`: coincidencia de `q` en descripción o etiquetas; orden por el `rankAt` de v2.
- `type=market`: coincidencia en título/descripción (+ filtro `category`); orden por
  `createdAt + min(48 h, effA(viewer, seller) horas)`.

## Registro de cambios de contrato

| Fecha | Cambio | Motivo |
| --- | --- | --- |
| 2026-08-31 | Documento creado: convenciones, formas de recursos, contratos finos y algoritmo del feed | Eliminar ambigüedad para los agentes de las Fases 2–8 |
| 2026-08-31 | Etiquetas en Post; afinidad usuario→usuario y usuario→etiqueta con pesos y decaimiento; feed v2; `GET /api/explore`; orden de búsqueda | Decisión del dueño: ranking personalizado del home y la búsqueda |
