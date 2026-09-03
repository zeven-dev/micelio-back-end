# Módulo `social`

**Responsabilidad:** el grafo social —seguir, dejar de seguir, favoritos—, la **regla de
visibilidad** del proyecto (Fase 3) y, desde la Fase 4, likes, guardados y comentarios anidados.

## Contrato actual — grafo social (Fase 3)
- `POST /api/users/:username/follow` → `{ following: true, isFavorite }`. **Idempotente**: si ya
  lo sigues devuelve el estado y no vuelve a emitir `user.followed`.
- `DELETE /api/users/:username/follow` → `{ following: false }`. También idempotente.
- `PATCH /api/users/:username/follow` — `{ isFavorite }` → estado resultante. `404` si no lo
  sigues: no se puede tener como favorito a quien no sigues.
- `GET /api/me/following` — paginado de `{ user: UserPublic, isFavorite, since }`.
- `GET /api/me/followers` — paginado de `{ user: UserPublic, since }` (**sin** `isFavorite`: esa
  marca es de quien sigue, no de quien es seguido).
- Seguirte a ti mismo es `400`; un username inexistente, `404`.

Formas exactas en [`docs/API-CONTRACTS.md`](../../docs/API-CONTRACTS.md) ("Follows — Fase 3").

## Contrato actual — likes, guardados y comentarios (Fase 4)
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
"Comentarios — Fase 4", "Comment" en "Formas de recursos").

## La regla de visibilidad vive aquí
`canView(owner, viewerId)` y `canViewWithGraph(owner, viewerId, graph)` son **el único lugar**
donde se decide si alguien puede ver el contenido de un perfil: el dueño siempre, un perfil
público siempre, y un perfil privado **solo con follow mutuo** (decisión #6 de `PRODUCT.md`).

- La variante `WithGraph` es para quien ya cargó la relación (p. ej. `users` al armar varios
  `UserPublic` de un golpe): misma decisión, sin consultas extra.
- La usan `users` (para abrir o no `bio`/`feedSettings`) y `posts` (detalle, feed de un perfil y
  home). Los endpoints de like/guardado/comentario de este mismo módulo también pasan por aquí
  (vía `UsersService.canViewContentOf`, `requireVisiblePost` en `SocialService`) — **nadie la
  reimplementa**; cualquier consulta nueva de contenido debe pasar por esta regla.

## Servicios públicos que consumen otros módulos
- `getGraphInfoFor(ids, viewerId?)` — conteos y relación con el viewer, **en una sola pasada**
  agregada para todos los ids. Lo llama `users` al construir `UserPublic`.
- `getFollowedIds` / `getFavoriteIds` / `getMutualIds` — los usa el home feed (`posts`).
- `areMutual(a, b)` — el mutuo es una consulta (`count === 2`), no una tabla.
- `getInteractionInfoFor(postIds, viewerId)` — `viewerHasLiked/viewerHasSaved/likeCount/
  commentCount` de una página de posts en una sola pasada agregada. Lo llama `posts` al armar
  `PostResponseDto` (Fase 4).

## Métodos de `posts` que este módulo consume
- `PostsService.getPostRef(id)` — lo mínimo de un post (`id, authorId, tags`) para validar
  visibilidad y armar los eventos de like/save/comment, sin consultar la tabla `posts` con
  Prisma (regla 7).
- `PostsService.findManyByIdsForViewer(ids, viewerId)` — el `Post` completo para `GET
  /api/me/saved`; solo `posts` sabe construir esa forma (medios firmados, contadores…).

## Reglas del módulo
- **`forwardRef` con `users`** y, desde la Fase 4, **también con `posts`**: like/save/comment
  necesitan el post (autor, etiquetas, visibilidad), y `posts` ya necesitaba `social` (grafo del
  home). Es un ciclo real de tres módulos (`users` ↔ `social` ↔ `posts`), no un descuido — ver
  "Ciclo `posts` ↔ `social`" en `docs/PROCESSES.md` para el detalle de cómo se resolvió (y una
  trampa real: en un ciclo de tres, `forwardRef` hace falta en **todo** enlace que comparta
  camino de carga con el ciclo, no solo en los dos que se necesitan "directamente" — `posts` →
  `users` no es circular por sí solo y aun así necesitó `forwardRef` en ambos lados). El cruce
  sigue siendo por servicio público — este módulo **no** consulta `users`, `posts` ni
  `file_assets` con Prisma, y `posts` no consulta `likes`, `saved_posts` ni `comments`.
- Seguir es una **arista**, no un contador: nunca se materializan `followersCount` ni el follow
  mutuo. Si algún día el conteo pesa, se cachea aquí, no se duplica en `users`.
- `user.followed`/`post.liked`/`post.saved` se emiten **solo al crear** la fila; `post.unliked`/
  `post.unsaved` **solo al borrar** una que existía. Quien escuche (notificaciones Fase 7,
  ranking Fase 5) no debe recibir un aviso por cada reintento del cliente.
- **Comentarios: un solo nivel.** La regla ("responder a una respuesta cuelga del mismo raíz")
  vive en `SocialService.createComment`, no en el schema — `Comment.parentId` no tiene ningún
  CHECK que la exija.
- El **home feed no vive aquí** sino en `posts`, para no hacer circular la dependencia entre los
  dos módulos: ver la desviación documentada en `docs/ARCHITECTURE.md`.
