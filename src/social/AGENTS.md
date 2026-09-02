# Módulo `social`

**Responsabilidad:** el grafo social —seguir, dejar de seguir, favoritos— y la **regla de
visibilidad** del proyecto. Fase 3 del `ROADMAP.md`. En la Fase 4 crece con likes, guardados y
comentarios.

## Contrato actual
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

## La regla de visibilidad vive aquí
`canView(owner, viewerId)` y `canViewWithGraph(owner, viewerId, graph)` son **el único lugar**
donde se decide si alguien puede ver el contenido de un perfil: el dueño siempre, un perfil
público siempre, y un perfil privado **solo con follow mutuo** (decisión #6 de `PRODUCT.md`).

- La variante `WithGraph` es para quien ya cargó la relación (p. ej. `users` al armar varios
  `UserPublic` de un golpe): misma decisión, sin consultas extra.
- La usan `users` (para abrir o no `bio`/`feedSettings`) y `posts` (detalle, feed de un perfil y
  home). **Nadie la reimplementa**; cualquier consulta nueva de contenido debe pasar por aquí.

## Servicios públicos que consumen otros módulos
- `getGraphInfoFor(ids, viewerId?)` — conteos y relación con el viewer, **en una sola pasada**
  agregada para todos los ids. Lo llama `users` al construir `UserPublic`.
- `getFollowedIds` / `getFavoriteIds` / `getMutualIds` — los usa el home feed (`posts`).
- `areMutual(a, b)` — el mutuo es una consulta (`count === 2`), no una tabla.

## Reglas del módulo
- **`forwardRef` con `users`**, a propósito: se necesitan mutuamente (el perfil muestra conteos
  del grafo; el grafo resuelve usernames y arma vistas de usuario). El cruce sigue siendo por
  servicio público — este módulo **no** consulta la tabla `users` con Prisma, ni `users` la
  tabla `follows`.
- Seguir es una **arista**, no un contador: nunca se materializan `followersCount` ni el follow
  mutuo. Si algún día el conteo pesa, se cachea aquí, no se duplica en `users`.
- `user.followed` se emite **solo al crear** la arista. Quien escuche (notificaciones, Fase 7)
  no debe recibir un aviso por cada reintento del cliente.
- El **home feed no vive aquí** sino en `posts`, para no hacer circular la dependencia entre los
  dos módulos: ver la desviación documentada en `docs/ARCHITECTURE.md`.

## Pendiente (Fase 4, no improvisar aquí)
- Likes, guardados y comentarios, con sus eventos (`post.liked`, `post.saved`,
  `comment.created`). Los campos ya existen en la respuesta de `Post` en `0`/`false`.
