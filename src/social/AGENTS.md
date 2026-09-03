# Módulo `social`

**Responsabilidad:** el grafo social —seguir, dejar de seguir, favoritos— y la **regla de
visibilidad** del proyecto (Fase 3). Punto: likes, guardados y comentarios vivieron aquí durante
la Fase 4 y se movieron a `posts` en un refactor posterior (ver "Ciclo con `posts`" abajo) — este
módulo ya no sabe nada de `Like`, `SavedPost` ni `Comment`.

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

## La regla de visibilidad vive aquí
`canView(owner, viewerId)` y `canViewWithGraph(owner, viewerId, graph)` son **el único lugar**
donde se decide si alguien puede ver el contenido de un perfil: el dueño siempre, un perfil
público siempre, y un perfil privado **solo con follow mutuo** (decisión #6 de `PRODUCT.md`).

- La variante `WithGraph` es para quien ya cargó la relación (p. ej. `users` al armar varios
  `UserPublic` de un golpe): misma decisión, sin consultas extra.
- La usan `users` (para abrir o no `bio`/`feedSettings`), `posts` (detalle, feed de un perfil,
  home, y desde el refactor también like/guardar/comentar vía `UsersService.canViewContentOf`,
  que llama aquí) — **nadie la reimplementa**; cualquier consulta nueva de contenido debe pasar
  por esta regla.

## Servicios públicos que consumen otros módulos
- `getGraphInfoFor(ids, viewerId?)` — conteos y relación con el viewer, **en una sola pasada**
  agregada para todos los ids. Lo llama `users` al construir `UserPublic`.
- `getFollowedIds` / `getFavoriteIds` / `getMutualIds` — los usa el home feed (`posts`).
- `areMutual(a, b)` — el mutuo es una consulta (`count === 2`), no una tabla.

Este módulo **no** consume ningún servicio de `posts`: desde el refactor que deshizo el ciclo de
tres módulos, `social` no importa `PostsModule`.

## Reglas del módulo
- **`forwardRef` con `users`** (Fase 3): `social` y `users` se necesitan mutuamente (el perfil
  muestra conteos del grafo; el grafo resuelve usernames y arma vistas de usuario). Es un ciclo
  real, no un descuido. El cruce sigue siendo por servicio público — este módulo **no** consulta
  `users` con Prisma. Es el único ciclo real del proyecto (ver `docs/ARCHITECTURE.md`).
- Seguir es una **arista**, no un contador: nunca se materializan `followersCount` ni el follow
  mutuo. Si algún día el conteo pesa, se cachea aquí, no se duplica en `users`.
- `user.followed` se emite **solo al crear** la fila. Quien escuche (notificaciones Fase 7,
  ranking Fase 5) no debe recibir un aviso por cada reintento del cliente.
- El **home feed no vive aquí** sino en `posts`, para no hacer circular la dependencia entre los
  dos módulos: ver la desviación documentada en `docs/ARCHITECTURE.md`.

## Ciclo con `posts` (Fase 4 → deshecho)
Durante la Fase 4 este módulo también implementó likes, guardados y comentarios, lo que le hizo
depender de `posts` (necesitaba el post) mientras `posts` ya dependía de `social` (grafo del
home): un ciclo real de **tres** módulos (`users` ↔ `social` ↔ `posts`), resuelto entonces con
`forwardRef` en los tres. El dueño del producto decidió no aceptar ese ciclo de tres como
arquitectura estable y en su lugar devolver like/guardar/comentar a `posts` (donde ya vive el
resto del contenido). Con eso: `social` **ya no importa `PostsModule`** y el ciclo colapsó de
vuelta a `posts → social` en una sola dirección (grafo del home) + el ciclo real `users` ↔
`social` de la entrada anterior, que no cambió. Detalle completo del refactor en
`docs/PROCESSES.md` ("Ciclo `posts` ↔ `social`", en "Procesos eliminados") y
`docs/ARCHITECTURE.md`. El contrato de likes/guardados/comentarios vive ahora en
[`src/posts/AGENTS.md`](../posts/AGENTS.md).
