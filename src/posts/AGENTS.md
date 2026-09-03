# Módulo `posts`

**Responsabilidad:** publicaciones de cada usuario (descripción, etiquetas y medios tomados de
su biblioteca), el **orden curado** de su feed propio (Fase 2), el **home feed** (Fase 3) y,
desde el refactor del 2026-09-03, **likes, guardados y comentarios anidados** (Fase 4 — vivieron
en `social` hasta ese refactor, ver "Ciclo con `social`" abajo).

## Contrato actual — publicaciones y feed
- `POST /api/posts` — `{ description?, tags?, media: [{ fileAssetId, width?, height? }] }` →
  `Post`. El orden del arreglo `media` **es** el orden del carrusel. Emite `post.created`.
- `GET /api/posts/:id` — `Post`. `403` si el perfil del autor no es visible para el viewer.
- `GET /api/users/:username/posts?cursor=&limit=` — paginado estándar del feed propio de ese
  perfil, en el orden que curó su dueño (`position` asc, desempate `id` asc).
- `PATCH /api/posts/:id` — `{ description?, tags?, media? }`. Parcial; **`media` presente
  reemplaza la lista completa** (no hay deltas).
- `DELETE /api/posts/:id` — `204`. Los archivos siguen en la biblioteca; solo se borra la
  publicación y sus `post_media`.
- `PATCH /api/posts/reorder` — `{ orderedIds }` con **todas** las publicaciones del autor en el
  nuevo orden → `{ reordered: true }`. `400` si el conjunto no coincide exactamente.
- `GET /api/feed?cursor=&limit=` — **home feed v1** (Fase 3): paginado estándar de `Post` con el
  algoritmo exacto de `API-CONTRACTS.md` (streams S y D, +12 h a favoritos, mezcla 4:1, cursor
  doble). Determinista y sin aleatoriedad.

Formas exactas en [`docs/API-CONTRACTS.md`](../../docs/API-CONTRACTS.md) ("Post",
"Publicaciones — Fase 2", "Reordenar el feed propio").

## Contrato actual — likes, guardados y comentarios (Fase 4)
Handlers en `post-interactions.controller.ts` (`PostInteractionsController`) salvo
`GET /api/me/saved`, que vive en `posts.controller.ts` junto al resto de lecturas de `Post`
completo. Lógica en `post-interactions.service.ts` (`PostInteractionsService`).

- `POST/DELETE /api/posts/:id/like` → `{ liked }`. **Idempotente** (mismo criterio que follow).
- `GET /api/posts/:id/likes` → `403` si el viewer **no es el autor** del post; si lo es,
  `{ total, items: [{ user, likedAt }], nextCursor }`, orden `likedAt` desc.
- `POST/DELETE /api/posts/:id/save` → `{ saved }`. Idempotente; emite `post.saved`/
  `post.unsaved` solo al crear/borrar la fila de verdad.
- `GET /api/me/saved` → paginado de `{ post: Post, savedAt }`, orden `savedAt` desc, con el
  `Post` completo embebido.
- `POST /api/posts/:id/comments` — body `{ body, parentId? }` → `Comment`. Si `parentId` apunta
  a una respuesta, el nuevo comentario cuelga del **mismo raíz** (un solo nivel de profundidad,
  decisión #12 de `PRODUCT.md`).
- `GET /api/posts/:id/comments` → paginado de comentarios **raíz** del post, orden `createdAt`
  asc, cada uno con `replyCount`.
- `GET /api/comments/:id/replies` → paginado de las respuestas de un raíz, mismo orden. `404` si
  `:id` no existe o no es un comentario raíz.
- `PATCH /api/comments/:id` — body `{ body }` → `Comment` actualizado. Solo el autor (`403` si
  no). `DELETE /api/comments/:id` → `204`, solo el autor; si es raíz, sus respuestas caen en
  cascada (`onDelete: Cascade`, no hay limpieza manual).
- Todas exigen que el post sea visible para el viewer (`403`/`404`, misma regla que
  `GET /api/posts/:id`) salvo `GET /api/posts/:id/likes`, que en cambio exige ser el autor.

Formas exactas en `docs/API-CONTRACTS.md` ("Likes — Fase 4", "Guardados — Fase 4",
"Comentarios — Fase 4", "Comment" en "Formas de recursos"). DTOs en `dto/comment.dto.ts`,
`dto/create-comment.dto.ts`, `dto/update-comment.dto.ts`, `dto/like-response.dto.ts`,
`dto/save-response.dto.ts`.

## Reglas del módulo
- **Etiquetas:** `utils/tags.util.ts` es el único lugar donde se normalizan. Explícitas del
  cliente + `#hashtags` de la descripción, minúsculas, sin `#`, solo `[a-z0-9_áéíóúñü-]`, 30
  caracteres por etiqueta, sin duplicadas; más de 10 → `400`. Si cambia la descripción, las
  etiquetas se recalculan aunque el cliente no mande `tags`.
- **Frontera de dominios (regla 7):** este módulo **no** consulta `users`, `folders` ni
  `file_assets` con Prisma. El autor y la visibilidad vienen de `UsersService`
  (`getPublicViewsByIds`, `canViewContentOf`); los archivos, de `FilesService`
  (`findOwnedByUser` al escribir, `findManyByIds` al leer). `PostInteractionsService` sí
  consulta `post`/`like`/`saved_posts`/`comment` directo con Prisma — son sus propias tablas,
  dentro del mismo módulo, no un cruce de dominios.
- **Visibilidad:** la decide `social` (`canView`: dueño, perfil público o **follow mutuo**);
  aquí se llama vía `UsersService.canViewContentOf`, tanto en `PostsService` como en
  `PostInteractionsService`. Este módulo no reimplementa la regla — un solo camino a ella.
- **Home feed:** vive aquí y no en `social` para no hacer circular la dependencia entre ambos
  (desviación documentada en `docs/ARCHITECTURE.md`). El algoritmo está en `getHomeFeed`, con
  cada paso comentado contra la especificación; `social` solo aporta seguidos, favoritos y
  mutuos, y `users` los ids públicos.
- **Posiciones:** una publicación nueva entra en `position: 0` y las demás suben un puesto
  (`updateMany` + `create` en una transacción). Borrar deja un hueco en la numeración a
  propósito: lo que importa es el orden relativo, y el siguiente `reorder` renumera igual.
- **Medios:** un archivo no puede repetirse dentro de la misma publicación (índice único
  `(postId, fileAssetId)` + validación previa con `400`). `width`/`height` los declara el
  cliente al publicar — el binario nunca pasa por el backend, así que nadie más los conoce — y
  son nulos para audio/texto.
- **URLs firmadas:** cada medio se sirve con `url` + `expiresAt` (`AWS_S3_SIGNED_URL_EXPIRES_IN`).
  El cliente nunca arma URLs de S3.
- **Contadores sociales:** `viewerHasLiked`, `viewerHasSaved`, `likeCount` (solo si el viewer es
  el autor) y `commentCount` (raíces + respuestas) vienen de
  `PostInteractionsService.getInteractionInfoFor(postIds, viewerId)`, pedido una sola vez por
  página en `PostsService.toResponseList` — no consulta por post. Desde el refactor esta es una
  llamada interna al mismo módulo, no un cruce a `social`.
- **Comentarios: un solo nivel.** La regla ("responder a una respuesta cuelga del mismo raíz")
  vive en `PostInteractionsService.createComment`, no en el schema — `Comment.parentId` no tiene
  ningún CHECK que la exija.
- `post.liked`/`post.saved`/`comment.created` (y sus contrapartes `post.unliked`/`post.unsaved`)
  se emiten con el mismo criterio que `user.followed` en `social`: solo al crear/borrar la fila
  de verdad, nunca por un reintento idempotente del cliente.

## Dependencias en otros módulos
- `FileAsset` ↔ `PostMedia` con `onDelete: Restrict`: borrar un archivo publicado responde
  `409` en `files`, y borrar una carpeta cuyo subárbol tenga archivos publicados responde `409`
  en `folders`. Ver `docs/DATA-MODEL.md` y `docs/PROCESSES.md`.
- Los ajustes de presentación (`feedSettings`) viven en `users` (columnas `feedLayout`,
  `feedColumns`, `feedGap` de `User`), no aquí: son del perfil, no de una publicación.

## Métodos públicos que consume otros módulos
- `findManyByIdsForViewer(ids, viewerId)` — el `Post` completo (armado igual que cualquier otra
  lectura, medios firmados incluidos) para varios ids a la vez; hoy solo lo usa `listSaved` (uso
  interno al propio módulo, ya no cruza a `social`).

## Ciclo con `social` — historia
Durante la Fase 4, like/guardar/comentar se implementaron en `social` (por instrucción de su
`AGENTS.md` de entonces) pero necesitaban el post, así que `social` pasó a depender también de
`posts`, que ya dependía de `social` (grafo del home): un ciclo real de **tres** módulos
(`users` ↔ `social` ↔ `posts`), resuelto con `forwardRef` en las tres puntas. El dueño del
producto decidió no aceptarlo como arquitectura estable y en su lugar mover like/guardar/
comentar de vuelta a `posts`, donde ya vive el resto del contenido (refactor del 2026-09-03).
Con eso, `social` dejó de depender de `posts` en absoluto: el borde `posts → social` (grafo del
home) volvió a ser de una sola dirección, **sin `forwardRef`** — confirmado arrancando el
`AppModule` real (`npm run api:export`), no asumido. El `forwardRef` que `posts` tenía sobre
`UsersModule` desde la Fase 4 (necesario solo por compartir camino de carga con el ciclo de tres)
tampoco hizo falta más, por la misma razón. El ciclo real que queda en el proyecto es
`users` ↔ `social` (independiente de este módulo, sin cambios). Detalle completo en
`docs/ARCHITECTURE.md` y `docs/PROCESSES.md` ("Ciclo `posts` ↔ `social`", en "Procesos
eliminados").

## Pendiente (fases siguientes, no improvisar aquí)
- **Feed v2** (Fase 5): el mismo endpoint gana los boosts por afinidad. La respuesta y el cursor
  no cambian, así que los clientes no se tocan.
