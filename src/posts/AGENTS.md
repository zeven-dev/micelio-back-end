# Módulo `posts`

**Responsabilidad:** publicaciones de cada usuario (descripción, etiquetas y medios tomados de
su biblioteca), el **orden curado** de su feed propio (Fase 2) y el **home feed** (Fase 3).

## Contrato actual
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

## Reglas del módulo
- **Etiquetas:** `utils/tags.util.ts` es el único lugar donde se normalizan. Explícitas del
  cliente + `#hashtags` de la descripción, minúsculas, sin `#`, solo `[a-z0-9_áéíóúñü-]`, 30
  caracteres por etiqueta, sin duplicadas; más de 10 → `400`. Si cambia la descripción, las
  etiquetas se recalculan aunque el cliente no mande `tags`.
- **Frontera de dominios (regla 7):** este módulo **no** consulta `users`, `folders` ni
  `file_assets` con Prisma. El autor y la visibilidad vienen de `UsersService`
  (`getPublicViewsByIds`, `canViewContentOf`); los archivos, de `FilesService`
  (`findOwnedByUser` al escribir, `findManyByIds` al leer).
- **Visibilidad:** la decide `social` (`canView`: dueño, perfil público o **follow mutuo**);
  aquí se llama vía `UsersService.canViewContentOf`. Este módulo no reimplementa la regla.
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
- **Contadores sociales:** `likeCount` solo se incluye si el viewer es el autor; hoy vale `0`,
  igual que `commentCount`, `viewerHasLiked` y `viewerHasSaved` — no hay likes ni comentarios
  hasta la Fase 4, así que es el valor real y no un marcador inventado.

## Dependencias en otros módulos
- `FileAsset` ↔ `PostMedia` con `onDelete: Restrict`: borrar un archivo publicado responde
  `409` en `files`, y borrar una carpeta cuyo subárbol tenga archivos publicados responde `409`
  en `folders`. Ver `docs/DATA-MODEL.md` y `docs/PROCESSES.md`.
- Los ajustes de presentación (`feedSettings`) viven en `users` (columnas `feedLayout`,
  `feedColumns`, `feedGap` de `User`), no aquí: son del perfil, no de una publicación.

## Pendiente (fases siguientes, no improvisar aquí)
- Likes, guardados y comentarios (Fase 4) — los campos ya están en la respuesta.
- **Feed v2** (Fase 5): el mismo endpoint gana los boosts por afinidad. La respuesta y el cursor
  no cambian, así que los clientes no se tocan.
