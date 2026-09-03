# Micelio — Bitácora de estado (back-end)

**Descarga de conocimiento obligatoria.** Al terminar **cada tarea** y al cerrar **cada fase**
del `ROADMAP.md`, el agente agrega una entrada **al inicio** de la sección "Entradas" con este
formato. El objetivo: que cualquiera (humano o agente) entienda en qué punto va el proyecto sin
leer el historial de git.

```
### AAAA-MM-DD — <tarea o fase> (tarea | cierre de fase)
- **Listo:** qué quedó funcionando y dónde (módulos, endpoints, migraciones).
- **Falta:** qué quedó pendiente de esta tarea/fase y por qué.
- **Necesito:** bloqueos, decisiones pendientes del dueño, dependencias de otros repos.
- **Sigue:** cuál es el siguiente paso concreto y dónde empezar.
```

Reglas: no borrar ni editar entradas anteriores (solo agregar); escribir concreto y con rutas
de archivos; si una fase se cierra, la entrada de cierre resume la fase completa.

---

### 2026-09-03 — Completar DTOs de respuesta faltantes (tarea, deuda técnica)
- **Listo:** `docs/openapi.json` ya cubre las 8 rutas que faltaban: `folders` completo
  (`FolderResponseDto`/`FolderDetailResponseDto`/`FolderCountDto`/`FolderPathItemDto`), `GET
  /api/health`, `POST /api/auth/logout`, `PATCH /api/admin/users/:id/role`. Verificado por mí de
  forma independiente: lint/build/test (154/154)/api:export en verde.
- **Necesito — dos discrepancias reales encontradas al confirmar las formas contra el código
  (no corregidas, son tuyas para decidir):**
  1. `API-CONTRACTS.md` dice que `Folder._count` siempre viene, pero `POST /api/folders` y
     `PATCH /api/folders/:id` devuelven la fila cruda de Prisma **sin** ese agregado (no usan
     `include`). El DTO quedó fiel al código real (`_count` opcional en la base, requerido solo
     en el detalle) en vez de mentir sobre lo que el contrato prometía. ¿La prosa del contrato es
     aspiracional y hay que corregirla, o `create`/`update` deberían empezar a incluir `_count`
     para ser consistentes con el resto?
  2. `DELETE /api/folders/:id` documenta `204` pero el handler no tiene `@HttpCode(204)` (a
     diferencia de sus equivalentes en `posts`/`social`, que sí lo tienen) — hoy responde `200`
     por defecto de Nest. Bug preexistente, no introducido por esta tarea; se dejó igual porque
     corregirlo cambia comportamiento real de la API y no era el alcance pedido.
- **Falta:** nada de esta tarea.
- **Sigue:** el refactor del ciclo de tres módulos (`users`↔`social`↔`posts`) que decidiste
  hacer ahora, en una tarea aparte.

### 2026-09-03 — Fase 4: likes, guardados y comentarios (cierre de fase, back-end)
- **Listo:**
  - **`Like`, `SavedPost`, `Comment`** en `prisma/schema.prisma` exactos a `DATA-MODEL.md`;
    migración `20260903002142_add_likes_saves_comments`.
  - **Likes**: `POST/DELETE /api/posts/:id/like` (idempotentes, mismo criterio que `follow`:
    reintento no reemite `post.liked`/`post.unliked`); `GET /api/posts/:id/likes` (`403` si el
    viewer no es el autor).
  - **Guardados**: `POST/DELETE /api/posts/:id/save`, `GET /api/me/saved` (post completo +
    `savedAt`). Mismo criterio de idempotencia.
  - **Comentarios**: `POST/GET /api/posts/:id/comments`, `GET /api/comments/:id/replies`,
    `PATCH/DELETE /api/comments/:id`. **Anidados desde el inicio** con un solo nivel real:
    responder a una respuesta cuelga del mismo raíz (`parentId = parent.parentId ?? parent.id`).
    Borrar un raíz cascada sus respuestas (a nivel de base de datos).
  - `PostResponseDto.viewerHasLiked/viewerHasSaved/likeCount/commentCount` ya no son `0`/`false`
    fijos — `SocialService.getInteractionInfoFor` los agrega en una sola pasada, sin que `posts`
    consulte `Like`/`SavedPost`/`Comment` con Prisma (regla 7 respetada).
  - Todo endpoint nuevo con DTO de respuesta decorado desde el inicio (no backfill posterior) —
    `docs/openapi.json` regenerado, 7 rutas y 8 schemas nuevos verificados.
  - `docs/DATA-MODEL.md`, `docs/PROCESSES.md`, `src/social/AGENTS.md`, `src/posts/AGENTS.md`,
    `docs/ROADMAP.md` (3 casillas) actualizados. Verificado por mí de forma independiente:
    lint/build/test (154/154)/api:export en verde, además de leer a mano la lógica de
    idempotencia y de anidamiento de comentarios.
- **Falta:** nada de las 3 tareas de la fase. Fase 5 (afinidad/ranking) es la siguiente del back
  — ya tiene consumidores listos para escuchar (`post.liked/unliked/saved/unsaved`,
  `comment.created`), no implementados aquí a propósito (fuera de alcance de esta fase).
- **Necesito — dos cosas para que revises:**
  1. **Hallazgo arquitectónico real, no una decisión mía:** implementar like/guardar/
     comentar en `social` (como indica su propio `AGENTS.md`) hizo que el ciclo `users` ↔
     `social`, ya documentado en `ARCHITECTURE.md`, se volviera de **tres módulos**
     (`users` ↔ `social` ↔ `posts`). Se resolvió con `forwardRef` en los tres módulos —sigue sin
     haber acceso cruzado a tablas ajenas, el cruce sigue siendo por servicio público— pero
     `ARCHITECTURE.md` quedó actualizado con esto marcado explícitamente "a revisar por el
     dueño": ¿un ciclo de tres módulos es arquitectura estable, o en una fase futura conviene
     mover like/guardar/comentar a `posts` (donde ya vive el resto del contenido) para
     deshacerlo? No se decidió, solo se resolvió lo mínimo para que la fase cerrara.
  2. Ambigüedades menores resueltas con la opción más simple, sin bloquear: límite de
     `Comment.body` en 1000 caracteres (el contrato solo pedía "razonable"); `commentCount`
     cuenta raíces + respuestas (no solo raíces); un post guardado sigue apareciendo en
     `GET /api/me/saved` aunque el autor se vuelva privado después de guardarlo (se trata como
     marcador, no se revalida visibilidad en cada lectura); la regla `403`/`404` de visibilidad
     se aplicó también a like/unlike aunque esa sub-sección del contrato no la repetía
     explícitamente (sí lo hacen las de guardados/comentarios, y es el criterio consistente en
     todo el módulo).
- **Sigue:** Fase 5 del `ROADMAP.md` (afinidad y ranking personalizado, módulo `ranking`) usando
  este mismo protocolo de orquestación.

## Entradas

### 2026-09-02 — Protocolo de orquestación jefe+hijos (tarea, proceso entre repos)
- **Listo:** `docs/ORCHESTRATION.md` — protocolo para ejecutar una fase en los tres repos con
  supervisión mínima del dueño: back-end siempre primero (contrato cerrado y exportado antes de
  que front/app empiecen), un gate mecánico que el jefe verifica corriendo los comandos de
  calidad él mismo (nunca confía en el reporte de un hijo), delegación a subagentes con alcance
  explícito y prohibición de inventar forma de contrato ante ambigüedad, tabla de qué modelo usar
  según el rol, y una lista cerrada de los únicos tres casos donde el jefe debe pausar y
  preguntar en vez de ejecutar. Enlazado desde el `AGENTS.md` de los tres repos.
- **Falta:** unificar los tokens de `DESIGN-SYSTEM.md` de front-end y app en un archivo fuente
  único verificable por diff (hoy siguen siendo prosa duplicada) — queda anotado en el propio
  `ORCHESTRATION.md` como pendiente, no se hizo en esta tarea.
- **Necesito:** que el dueño del producto revise el protocolo una vez, ya que cambios futuros a
  este documento requieren su acuerdo explícito (misma regla que `ARCHITECTURE.md`).
- **Sigue:** usar este protocolo para ejecutar la Fase 4 (`Interacciones`) en los tres repos.

### 2026-09-02 — Contrato exportable a OpenAPI (tarea, preparación Fase 4)
- **Listo:** `docs/API-CONTRACTS.md` sigue siendo la fuente de reglas de negocio y algoritmos,
  pero las formas exactas de petición/respuesta ahora también se exportan como OpenAPI real:
  `UserPublicView`/`MeView`/`FeedSettingsView` (antes `interface`, ahora clases decoradas en
  `src/users/users.service.ts`), DTOs de respuesta de `posts`, `files`, `social` y `auth`
  completados con `@ApiProperty`/`@ApiPropertyOptional`, decorador reutilizable
  `ApiCursorPaginatedResponse` para listas paginadas (`src/common/dto/cursor-pagination.dto.ts`),
  y las rutas de los 8 controladores con `@ApiOkResponse`/`@ApiCreatedResponse` donde existe un
  DTO real. Nuevo `npm run api:export` (`scripts/export-openapi.ts`) → `docs/openapi.json`
  (committeado; se regenera con ese comando, no se edita a mano). `micelio-front-end` y
  `micelio-app` generan sus tipos desde ese archivo (`npm run sync:api`) en vez de retipar a mano
  leyendo la prosa de `API-CONTRACTS.md`.
- **Falta:** 3 rutas sueltas y el módulo `folders` completo no tienen DTO de respuesta, así que
  quedan fuera del OpenAPI exportado: `GET /api/health`, `PATCH /api/admin/users/:id/role`,
  `POST /api/auth/logout`, y las 5 rutas de `src/folders/folders.controller.ts` (el servicio
  devuelve el `Folder` de Prisma más extensiones ad-hoc `_count`/`path`, sin DTO). No se inventó
  un DTO para no fijar una forma que nadie decidió.
- **Necesito:** que el dueño del producto decida la forma exacta de respuesta de `folders` (hoy
  expone el modelo de Prisma tal cual) para poder darle DTO y sumarlo al contrato exportado;
  igual para las 3 rutas sueltas (formas simples, bajo riesgo, pero deben decidirse antes de
  tiparlas para no tener que romperlas después).
- **Sigue:** Fase 4 del `ROADMAP.md` (`Interacciones`: likes, guardados, comentarios) — todo
  endpoint nuevo debe llevar sus DTOs de respuesta decorados desde el inicio, no como backfill
  posterior.

### 2026-09-02 — Fase 3: grafo social, privacidad y home feed (cierre de fase, back-end)
- **Listo:**
  - **Módulo `social`** (`src/social/`, con su `AGENTS.md`): `POST/DELETE/PATCH
    /api/users/:username/follow`, `GET /api/me/following`, `GET /api/me/followers`. Seguir y
    dejar de seguir son **idempotentes**; seguirse a uno mismo es `400`; marcar favorito sin
    seguir, `404`. Emite `user.followed` **solo** al crear la arista (un reintento del cliente no
    debe volver a notificar).
  - **Entidad `Follow`** (`isFavorite`, único por par, cascade a `User`); migración
    `20260902100000_add_follows`.
  - **Regla de visibilidad única** en `SocialService.canView` / `canViewWithGraph`: el dueño, un
    perfil público, o **follow mutuo**. La usan `users` (para abrir `bio`/`feedSettings`) y
    `posts` (detalle, feed de perfil y home). Nadie más la reimplementa.
  - **`UserPublic` con datos reales**: `followersCount`, `followingCount`, `viewerFollows` y
    `followsViewer` los aporta el grafo en **una sola pasada agregada** por página de perfiles
    (`getGraphInfoFor`), no cuatro consultas por usuario. Cierra la ambigüedad #3 de la Fase 0.
  - **Home feed v1** — `GET /api/feed` (`PostsService.getHomeFeed`), con el algoritmo exacto del
    contrato: stream S (seguidos visibles) con `rankAt = createdAt + 12 h` si el autor es
    favorito, stream D (públicos no seguidos) con `rankAt = createdAt`, orden `rankAt` desc y
    desempate `id` desc, **mezcla 4:1** (cada posición múltiplo de 5 sale de D; si un stream se
    agota, el otro llena) y **cursor doble** `{ s, d }`. Determinista, sin aleatoriedad. Si un
    stream no aporta en una página, su marca se conserva para no reiniciarlo.
  - **Pruebas:** `social.service.spec.ts` (15 casos: idempotencia, 400/404, la regla de
    visibilidad en sus dos variantes, agregación del grafo, listados y mutuos) y 8 casos nuevos
    en `posts.service.spec.ts` que traducen la especificación del feed una por una (mezcla 4:1,
    boost de favorito, privado sin/con mutuo, exclusiones del descubrimiento, reanudación por
    cursor, página corta, cursor inválido).
  - **Verificación:** `npm run lint`, `npm run build` y `npm test` (9 suites, **131 tests**).
- **Decisiones de arquitectura (a revisar por el dueño; anotadas en `ARCHITECTURE.md`):**
  1. **El home feed vive en `posts`, no en `social`**, aunque el `AGENTS.md` raíz decía lo
     contrario: el home necesita leer publicaciones y `posts` necesita la regla de visibilidad,
     así que ponerlo en `social` habría creado una dependencia circular entre dos dominios. Con
     el feed en `posts`, las dependencias van en una sola dirección (`posts → social → users`).
  2. **`users` y `social` se inyectan con `forwardRef`**: es un ciclo real del dominio (el perfil
     muestra conteos del grafo; el grafo resuelve usernames y arma vistas de usuario). El cruce
     sigue siendo por servicio público — ninguno toca las tablas del otro.
- **Falta:**
  - **Límite conocido del stream de descubrimiento:** `findPublicUserIds` trae **todos** los ids
    de perfiles públicos para poder filtrar sin unir `posts` con `users` (regla 7). Sirve de
    sobra hoy; a partir de unos miles de usuarios públicos habrá que denormalizar `isPublic` en
    `Post` o materializar el stream. No se optimizó por adelantado.
  - Likes, guardados y comentarios (Fase 4): `viewerHasLiked`, `viewerHasSaved`, `likeCount` y
    `commentCount` siguen en `0`/`false` porque hoy ese **es** el valor real.
  - Sin base de datos en este entorno: el feed está verificado con pruebas unitarias sobre mocks
    (incluida la traducción literal del algoritmo), no contra Postgres. Un smoke test con datos
    reales —dos usuarios, uno favorito, uno público ajeno— es lo primero cuando haya entorno.
- **Necesito:** que el dueño revise las dos decisiones de arquitectura de arriba, en especial
  dónde debe vivir el home feed a largo plazo.
- **Sigue:** los clientes (web y app) con su Fase 3: seguir/favoritos, privacidad en la UI y el
  home real consumiendo `GET /api/feed` con dedupe por `id`.

### 2026-09-02 — Decisiones del dueño sobre la Fase 2 (tarea)
- **Listo:**
  - **Dimensiones en la biblioteca.** `FileAsset` gana `width`/`height` (`Int?`), migración
    `20260902000000_add_file_asset_dimensions`. `POST .../files/confirm` los acepta
    **opcionales** y `FileAsset` los devuelve; `Post.media` los **hereda** del archivo y lo que
    el cliente mande al publicar los pisa (decisión: "archivo, con override del cliente").
    Con esto web y app pintan igual el mismo archivo, que era el problema del video en móvil.
  - **Huérfanos de S3 resueltos por evento** (hueco abierto desde la Fase 1). `folders` emite
    `folder.deleted` (`{ userId, folderIds }`) con el subárbol recogido **antes** de borrar, y
    `files` lo escucha (`files-cleanup.listener.ts`) para barrer S3 **por prefijo** con el nuevo
    `StorageService.deleteByPrefix` (lista y borra por páginas de 1000). Va por evento porque la
    llamada directa sería circular (`files` ya importa a `folders`), y por prefijo porque cuando
    el listener corre las filas ya no existen. Un fallo de S3 se registra y no se propaga: la
    carpeta ya se borró. `folder.deleted` quedó anotado en `ARCHITECTURE.md` con su porqué.
  - **Borrado bloqueado confirmado** por el dueño: un archivo publicado no se borra (`409`), y
    tampoco la carpeta que lo contiene. Sin cambios de código; la decisión quedó fechada en
    `DATA-MODEL.md`.
  - **Pruebas nuevas:** `files-cleanup.listener.spec.ts` (barrido por prefijo y tolerancia a
    fallos de S3), emisión de `folder.deleted` con el subárbol y **no** emisión cuando el
    borrado se bloquea, dimensiones en `confirm`, y herencia + override en `posts`.
  - **Verificación:** `npm run lint`, `npm run build` y `npm test` (8 suites, **106 tests**).
- **Falta:**
  - Que los clientes manden las dimensiones en el `confirm` (tarea siguiente en web y app) y que
    dejen de medirlas al publicar. Los archivos ya subidos quedan con `null` — se ven cuadrados
    en masonry hasta que se vuelvan a subir; no hay backfill posible sin leer los binarios.
  - Sin base de datos ni S3 en este entorno: la limpieza por prefijo está verificada con mocks,
    no contra MinIO real. Es lo primero que hay que probar cuando haya entorno
    (`docker compose up -d` + borrar una carpeta con archivos).
- **Necesito:** nada bloqueante. El dueño pidió edición de publicaciones **solo de descripción y
  etiquetas** en los clientes: el back ya lo soporta con `PATCH /api/posts/:id` (acepta también
  `media`, que los clientes simplemente no van a mandar).
- **Sigue:** los clientes (web y app): medir al subir, heredar dimensiones al publicar y la
  edición ligera. Después, Fase 3 del `ROADMAP.md`.

### 2026-09-01 — Fase 2: publicaciones y feed propio (cierre de fase)
- **Listo:**
  - **Módulo `posts`** (`src/posts/`, con su `AGENTS.md`): `POST /api/posts`,
    `GET /api/posts/:id`, `PATCH /api/posts/:id`, `DELETE /api/posts/:id`,
    `GET /api/users/:username/posts` (paginado por cursor) y `PATCH /api/posts/reorder`.
    Formas exactas en `docs/API-CONTRACTS.md` ("Publicaciones — Fase 2" + "Post"). Emite
    `post.created` — primer productor real de eventos de dominio del proyecto.
  - **Entidades** `Post` y `PostMedia` + `feedLayout/feedColumns/feedGap` en `User`; enum
    `FeedLayout`; migración `20260901120000_add_posts_and_feed_settings` (incluye el índice
    **GIN** sobre `tags` que la búsqueda de la Fase 9 y la afinidad de la Fase 5 van a usar).
  - **Etiquetas** en `src/posts/utils/tags.util.ts`, un solo lugar: explícitas del cliente +
    `#hashtags` de la descripción, minúsculas, sin `#`, solo `[a-z0-9_áéíóúñü-]`, 30 caracteres
    por etiqueta, sin duplicadas y en orden de aparición; más de 10 → `400`. Al editar la
    descripción se recalculan aunque el cliente no mande `tags`.
  - **Orden curado:** `position` asc con desempate por `id`. La publicación nueva entra
    **primera** (`position: 0`, las demás suben un puesto en la misma transacción). `reorder`
    exige la lista **completa** de ids del autor (misma cantidad, sin repetidos, todos suyos) y
    persiste el índice del arreglo.
  - **Ajustes de feed:** `PATCH /api/users/me` acepta `{ feedSettings: { layout?, columns?, gap? } }`
    (parcial dentro de parcial) y `feedSettings` viaja en todo `UserPublic` **extendido**; en la
    vista limitada de un perfil privado se omite, igual que `bio`. Cierra la ambigüedad #4 de la
    Fase 0, que quedaba esperando estas columnas.
  - **Frontera de dominios respetada** (regla 7 / `ARCHITECTURE.md`): `posts` no consulta
    `users`, `folders` ni `file_assets` con Prisma. Para eso `UsersService` expone
    `canViewContentOf` y `getPublicViewsByIds`, y `FilesService` expone `findOwnedByUser` y
    `findManyByIds` (`FilesModule` ahora exporta su servicio).
  - **Piezas transversales nuevas en `src/common`:** `dto/cursor-pagination.dto.ts`
    (`CursorPaginationDto` + `CursorPage<T>`, default 20 / máx 50) y `pagination/cursor.util.ts`
    (cursor base64 opaco; uno corrupto es `400`, no `500`). Las reusarán el home feed (Fase 3),
    los likes (Fase 4) y la búsqueda (Fase 9).
  - **Borrado bloqueado:** `post_media` → `file_assets` con `onDelete: Restrict`. `DELETE
    /api/files/:id` responde `409` si el archivo está publicado (y **la fila se borra antes que
    el binario**, para no dejar una publicación apuntando a un objeto inexistente);
    `DELETE /api/folders/:id` responde `409` si algún archivo del subárbol está publicado.
  - **Pruebas:** `src/posts/posts.service.spec.ts` (28 casos: etiquetas, orden de medios,
    posiciones, cursor, visibilidad, reorder, edición y borrado) y `src/posts/utils/tags.util.spec.ts`;
    casos nuevos en `users.service.spec.ts` (feedSettings y `canViewContentOf`),
    `files.service.spec.ts` y `folders.service.spec.ts` (el `409` y el orden fila → S3).
  - **Verificación:** `npm run lint`, `npm run build` y `npm test` (7 suites, 98 tests) en verde.
- **Ambigüedades reales resueltas (opción más simple compatible con las specs — revisar):**
  1. **De dónde salen `width`/`height` de un medio.** El contrato los exige para el masonry,
     pero el binario nunca pasa por el backend (subida directa a S3), así que el servidor no
     puede medirlos. Elegido: los **declara el cliente** al publicar y se guardan en
     `PostMedia` (no en `FileAsset`, que además cambiaría una respuesta que los dos clientes ya
     consumen); se devuelven como `number | null` — nulos en audio/texto. Anotado en
     `API-CONTRACTS.md` y `DATA-MODEL.md`.
  2. **Qué pasa al borrar un archivo publicado.** `DATA-MODEL.md` decía "bloquearse o marcarse".
     Elegido **bloquear** con FK `Restrict` (→ `409`), incluido el borrado de carpetas: una
     publicación sin medio es una publicación rota, y el usuario tiene la salida a mano.
  3. **Dónde viven los ajustes de feed.** `DATA-MODEL.md` dejaba abierto "User o tabla 1–1".
     Elegido **columnas en `User`**: siempre se leen junto al perfil.
  4. **Dónde entra una publicación nueva.** Nadie lo especifica. Elegido `position: 0`
     (primera, como Instagram), empujando las demás en la misma transacción.
  5. **Endpoints del CRUD.** `API-CONTRACTS.md` definía la forma de `Post`, `reorder` y
     `feedSettings`, pero no cómo se crea/edita/lista/borra. Se agregaron con la forma mínima
     coherente con el resto (sección "Publicaciones — Fase 2"), sin inventar campos nuevos.
  6. **Topes sin especificar:** 1–10 medios por publicación y 2200 caracteres de descripción
     (validación de DTO). Son topes de cordura, no reglas de producto: cambiarlos es una línea.
  7. **Visibilidad del listado ajeno:** perfil privado → `403` (no una lista vacía), para que el
     cliente distinga "no puedo ver esto" de "no hay publicaciones".
  8. **Borrar deja huecos en `position`** a propósito (renumerar sería escritura masiva inútil).
- **Falta:**
  - Likes, guardados y comentarios: `likeCount` (solo para el autor), `commentCount`,
    `viewerHasLiked` y `viewerHasSaved` responden `0`/`false` porque hoy ese **es** el valor
    real; se llenan en la Fase 4.
  - `GET /api/feed` (home) y la regla de visibilidad por **follow mutuo**: Fase 3. Hoy la regla
    vive centralizada en `UsersService.canViewContentOf`, lista para mudarse al helper de
    `social` sin tocar `posts`.
  - **Objetos huérfanos en S3** al borrar carpetas: sigue igual que en la Fase 1 (el `409` nuevo
    solo cubre los archivos publicados, no el hueco de fondo).
  - Sin verificación end-to-end contra Postgres/MinIO reales: no hay base de datos en este
    entorno. Verificado por lint, build, tipos y pruebas unitarias, y la migración se generó con
    `prisma migrate diff` (no a mano) para que coincida exactamente con el esquema.
- **Necesito:** que el dueño revise las 8 ambigüedades de arriba, sobre todo la #1 (dimensiones
  declaradas por el cliente), la #2 (bloquear el borrado de archivos publicados, que también
  frena borrar carpetas) y la #4 (publicación nueva primera). Sigue pendiente de decisión el
  hueco de los huérfanos en S3 (evento `folder.deleted` vs. barrido por prefijo).
- **Sigue:** Fase 3 del `ROADMAP.md` (módulo `social`: `Follow` con favoritos, helper único de
  visibilidad y `GET /api/feed` v1). Los clientes ya pueden consumir toda la Fase 2: crear
  publicaciones desde la biblioteca, ver el feed de un perfil, reordenarlo y configurar
  layout/columnas/espaciado.

### 2026-09-01 — Fase 1: biblioteca completa (cierre de fase)
- **Listo:**
  - **Sub-carpetas.** `Folder.parentId` (FK autorreferente `ON DELETE CASCADE`), migración
    `20260901000000_add_subfolders_and_audio`. Contrato en `docs/API-CONTRACTS.md`
    ("Carpetas y sub-carpetas"): `GET /api/folders[?parentId=]` lista **un solo nivel** (sin
    `parentId`, la raíz); `GET /api/folders/:id` agrega `path`, el breadcrumb desde la raíz;
    `POST` acepta `parentId`; `PATCH` renombra y/o mueve (**`parentId` ausente = no mover;
    `parentId: null` = mover a la raíz**). Cada carpeta trae `_count: { files, children }`.
  - **Invariantes del árbol** en `src/folders/folders.service.ts`: nombre único **entre
    hermanos** (→ `409`, validado en el servicio antes de escribir) y **sin ciclos**
    (`assertMoveIsLegal` sube por los ancestros del nuevo padre → `400`). Los recorridos están
    topeados con `MAX_TREE_DEPTH` para que un ciclo dejado por una escritura externa no cuelgue
    el proceso.
  - **Unicidad de las carpetas raíz.** En Postgres dos `NULL` son distintos, así que
    `@@unique([userId, parentId, name])` no cubre la raíz: la migración crea a mano el índice
    parcial `folders_userId_name_root_key` (`UNIQUE (userId, name) WHERE parentId IS NULL`).
    Anotado en el schema y en `docs/DATA-MODEL.md` — es el detalle que más fácil se pierde.
  - **Audio.** `AUDIO` en `FileType` + 8 mimeTypes en `ALLOWED_MIME_TYPES`, con
    `UPLOAD_MAX_AUDIO_MB` (50) en los tres sitios de rigor. Validado **solo por peso, nunca por
    duración** (decisión #11 de `PRODUCT.md`).
  - **Correcciones de procesos rotos que venían de la Fase 0.5** (`main` estaba con `npm run
    lint` y `npm test` en rojo, contra la regla 11 de `AGENTS.md`):
    1. Los límites de subida estaban **hardcodeados** (`MAX_FILE_SIZE_BYTES`: imagen 15, video
       **100**, texto 5 MB) y `UPLOAD_MAX_*_MB` no se leía en ningún lado, pese a que la doc y
       el `.env.example` prometían lo contrario. Efecto real: un video de 150 MB se rechazaba
       aunque `UPLOAD_MAX_VIDEO_MB=250`. Ahora `FilesService.maxBytesFor()` lee la
       configuración vía `MAX_SIZE_CONFIG_KEY`, y la constante hardcodeada desapareció.
    2. El **avatar** usaba el límite de las imágenes de biblioteca (15 MB) con un mensaje que
       decía "5 MB", y `uploads.maxAvatarMb` no se usaba. Era el test que fallaba en `main`.
       Ahora usa su propia variable y el mensaje sale del valor vigente.
    3. `confirm` (biblioteca y avatar) confiaba en el `size` **declarado por el cliente**. La
       URL prefirmada no impone tamaño, así que se podía declarar 1 byte y subir 500 MB. Ahora
       se revalida el `ContentLength` real de `HeadObject`, se persiste **ese** en
       `FileAsset.size` y, si excede, el objeto se borra del bucket y responde `413`.
    4. Restos de Multer: `MulterModule` seguía registrado en `files.module.ts` y
       `users.module.ts` con su `UPLOAD_CEILING_HEADROOM_BYTES`, aunque desde la Fase 0.5 ningún
       binario pasa por la API. Eliminados.
  - **Pruebas.** Nuevo `src/files/files.service.spec.ts` (no existía, y era justo el servicio
    donde estaban los bugs): límites por configuración, audio, y el tamaño real de S3.
    `folders.service.spec.ts` reescrito para el árbol (listado por nivel, breadcrumb, ciclos,
    unicidad entre hermanos). `users.service.spec.ts`: mock de `ConfigService` **por clave** —
    el mock plano que devolvía `300` para todo era lo que escondía el bug del avatar.
  - **Verificación:** `npm run lint`, `npm run build` y `npm test` (5 suites, 58 tests) en
    verde. Además smoke test end-to-end contra Postgres real: árbol de 3 niveles, listado por
    nivel, breadcrumb correcto, `409` por nombre repetido entre hermanos, mismo nombre permitido
    en ramas distintas, `400` en ciclo y en auto-referencia, mover a la raíz con
    `parentId: null`, y borrado en cascada del subárbol.
- **Falta:**
  - **Objetos huérfanos en S3 al borrar una carpeta** (hueco que ya existía antes de esta fase,
    pero que las sub-carpetas agrandan: un borrado se lleva un subárbol entero). La cascada de
    la base borra las filas `FileAsset`; los binarios quedan en el bucket para siempre.
    Arreglarlo cruza dominios —`folders` no puede consultar datos de `files` (regla 7), y
    `files` ya importa a `folders`, así que la dependencia inversa sería circular— y por eso
    **necesita decisión de arquitectura** antes de tocarlo: evento de dominio `folder.deleted`
    con listener en `files`, o un barrido por prefijo en `storage`. No se improvisó.
  - Mover/copiar **archivos** entre carpetas: no está en el `ROADMAP.md` y nadie lo pidió; hoy
    un archivo solo se sube a la carpeta donde se creó.
- **Necesito:** que el dueño elija cómo resolver los huérfanos de S3 (evento vs. barrido). Nada
  más bloquea la Fase 2.
- **Sigue:** Fase 2 del `ROADMAP.md` (módulo `posts`: `Post` + `PostMedia`, etiquetas,
  `PATCH /api/posts/reorder`, y los campos `feedLayout/feedColumns/feedGap` en `User`). Los
  clientes ya tienen las sub-carpetas consumidas, así que no quedan dependencias abiertas de la
  Fase 1.

### 2026-09-01 — Fase 0.5: subida directa a S3 (cierre de fase, solo back-end)
- **Listo:**
  - `StorageService` cambia su interfaz: se quita `upload(buffer)` (ya no tiene llamadores) y se
    agregan `getSignedUploadUrl(key, contentType, expiresInSeconds?)` (URL firmada de escritura,
    `PutObjectCommand`) y `headObject(key)` (`HeadObjectCommand`, `null` si el objeto no existe
    todavía) — `src/storage/storage.service.ts`, `src/storage/s3-storage.service.ts`.
  - `src/files`: `POST /api/folders/:id/files` (multipart) se reemplaza por
    `POST .../files/presign` (valida carpeta + mimeType/tamaño, devuelve
    `{ key, uploadUrl, expiresIn }`) y `POST .../files/confirm` (valida prefijo de `key` +
    `HeadObject`, crea el `FileAsset`). Se quitó `FileInterceptor`/Multer del controlador; el
    backend ya no recibe binarios de biblioteca. DTOs nuevos en `src/files/dto/`
    (`presign-file.dto.ts`, `confirm-file.dto.ts`, `presign-response.dto.ts`).
  - `src/users`: mismo patrón para el avatar. `POST /api/users/me/avatar/presign` (JSON
    `{ mimeType, size }`) + `PATCH /api/users/me/avatar` ahora JSON `{ key }` (antes multipart).
    DTOs nuevos en `src/users/dto/` (`presign-avatar.dto.ts`, `confirm-avatar.dto.ts`,
    `presign-avatar-response.dto.ts`).
  - `docs/API-CONTRACTS.md`, `docs/PROCESSES.md`, `src/storage/AGENTS.md`,
    `src/files/AGENTS.md`, `src/users/AGENTS.md` actualizados con el contrato de dos pasos
    (presign → `PUT` directo del cliente a S3 → confirm) y la nota de infraestructura: el
    bucket necesita su propia política **CORS** que permita `PUT` con `Content-Type` desde los
    orígenes de la web y la app — no es algo configurable desde este repo.
  - `src/users/users.service.spec.ts` reescrito para el nuevo flujo (`presignAvatar`,
    `updateAvatar` con `ForbiddenException`/`NotFoundException`); `npm run lint`, `npm run
    build` y `npm test` (4 suites, 26 tests) en verde.
- **Falta:** nada de la parte de back-end de esta fase. El resto de la Fase 0.5 (quitar sidebar,
  navegación tipo Instagram, perfil rediseñado, Home preparado, Carpetas migradas al perfil) es
  rediseño visual puro y no toca este repo — ver `docs/ROADMAP.md`.
- **Necesito:**
  - **CORS del bucket S3**, fuera de este repo: sin esa política, el `PUT` directo del navegador
    falla aunque el backend esté perfecto. No hay bandera de entorno para esto — se configura en
    AWS directamente.
  - No hay `.env` real en este sandbox (solo `.env.example`, con credenciales de MinIO); el
    dueño confirmó que las variables de AWS reales ya están seteadas en el entorno de destino.
    No se pudo hacer una verificación end-to-end contra S3/MinIO real en esta tarea —
    verificado por lectura de código, tipos, lint, build y tests unitarios únicamente.
- **Sigue:** cuando la web y la app integren el nuevo flujo (presign → PUT directo → confirm),
  probar con un bucket real o MinIO local (`docker compose up -d`) antes de dar por cerrado el
  camino feliz de subida.

### 2026-08-31 — Fase 0: identidad, roles y arquitectura (cierre de fase)
- **Listo:**
  - `User` ampliado en `prisma/schema.prisma` con `cedula`, `username`, `role` (enum `Role`),
    `bio`, `avatarKey`, `isPublic`; migración `20260831000000_extend_user_identity_roles`
    aplicada. `docs/DATA-MODEL.md` actualizado.
  - `POST /api/auth/register` ahora exige `cedula`, `username` además de `name` (antes
    opcional); valida unicidad de los tres campos con `409` específico por campo
    (`src/auth/dto/register.dto.ts`, `src/auth/auth.service.ts`).
  - `@Roles(...)` + `RolesGuard` en `src/common` (`decorators/roles.decorator.ts`,
    `guards/roles.guard.ts`), registrado como `APP_GUARD` global en
    `src/auth/auth.module.ts` justo después de `JwtAuthGuard`. El rol viaja en el JWT
    (`JwtPayload`/`AuthenticatedUser` ganan `role`) para no consultar la base de datos en cada
    request.
  - `PATCH /api/admin/users/:id/role` (`@Roles(ADMIN)`) — módulo nuevo `src/admin` (germen,
    ver su `AGENTS.md`).
  - `@nestjs/event-emitter` instalado y registrado global (`EventEmitterModule.forRoot()` en
    `AppModule`); `src/events/domain-events.ts` con nombres y payloads de los 9 eventos de
    `ARCHITECTURE.md`. Sin productores/consumidores todavía (scaffold puro).
  - `GET/PATCH /api/users/me`, `PATCH /api/users/me/avatar` (multipart, S3 vía
    `StorageService`), `GET /api/users/:username` — módulo `users` (`users.controller.ts`,
    `users.service.ts`).
  - Verificación: `npm run lint` (sin errores), `npm run build` (sin errores),
    `npm test` (4 suites, 24 tests, todos en verde). Además smoke test manual end-to-end con el
    servidor corriendo contra Postgres real: registro de 2 usuarios, colisión de email/username
    (`409`), perfil privado por defecto (oculta `bio` a terceros), `PATCH /users/me`
    (`isPublic:true`) revela `bio` a terceros, `RolesGuard` responde `403` a un no-ADMIN, y un
    ADMIN promueve a otro usuario a `TEACHER` correctamente.
- **Ambigüedades reales resueltas (elegida la opción más simple compatible con las specs):**
  1. **Formato de `username`:** ninguna doc fijaba el patrón exacto. Elegido
     `^[a-z0-9_.]{3,30}$` (minúsculas, dígitos, `_`, `.`). Si el dueño del producto quiere otro
     formato (mayúsculas visibles, guiones, longitud distinta), es un cambio de una sola
     validación en `register.dto.ts`.
  2. **Formato de `cedula`:** la spec solo pide "formato básico de dígitos". Elegido
     `^[0-9]{6,10}$` (rango típico de cédulas colombianas, sin dígito de verificación).
  3. **`UserPublic.followersCount/followingCount/viewerFollows/followsViewer`:** el contrato ya
     los define, pero `Follow` no existe hasta la Fase 3. Se devuelven `0`/`false` — es el valor
     real hoy (no hay follows), no un placeholder inventado. Se actualizará solo cuando exista
     `social`.
  4. **`UserPublic.feedSettings`:** depende de columnas que llegan en la Fase 2
     (`feedLayout/feedColumns/feedGap`). Se **omite** del todo en vez de inventar valores por
     defecto no persistidos, para no mentir sobre datos que el usuario no ha configurado.
  5. **`GET /api/users/:username`, ¿público o autenticado?** Ninguna doc lo especifica. Elegido
     autenticado (no `@Public()`), consistente con la regla "todo endpoint es privado por
     defecto" de `AGENTS.md`. Fácil de revertir si el producto quiere perfiles públicos
     navegables sin sesión.
  6. **`PATCH /api/users/me/avatar` vs. avatar dentro de `PATCH /api/users/me`:** el `ROADMAP.md`
     decía "avatar vía StorageService" dentro de la tarea de perfil, pero `API-CONTRACTS.md` ya
     especifica el endpoint separado (`PATCH /api/users/me/avatar`, multipart) — se implementó
     el contrato exacto, no la redacción suelta del roadmap.
- **Falta:** nada de la Fase 0. Fase 1 (sub-carpetas, `AUDIO`) no ha empezado.
- **Necesito:** que el dueño del producto revise las 6 ambigüedades resueltas arriba,
  especialmente el formato de `username`/`cedula` y si el perfil público debe ser navegable sin
  sesión.
- **Sigue:** Fase 1 del `ROADMAP.md` (`src/folders`: `parentId` para sub-carpetas; `AUDIO` en
  `FileType`). El front-end y la app pueden empezar su propia Fase 0 ya mismo: login/registro
  con los campos nuevos, pantalla de perfil (`GET/PATCH /api/users/me`, avatar, toggle
  público/privado) y perfil público limitado.

### 2026-08-31 — Ranking personalizado y etiquetas especificados (tarea)
- **Listo:** decisión del dueño incorporada: afinidad usuario→usuario y usuario→etiqueta con
  pesos fijos (like +1, comentario +2, guardado +3, compartido +2) y vida media de 90 días,
  feed v2, `GET /api/explore` y orden de búsqueda por afinidad — todo exacto en
  `API-CONTRACTS.md`. Nuevo módulo `ranking` en `ARCHITECTURE.md` y `DATA-MODEL.md`
  (`UserAffinity`, `UserTagAffinity`); `tags` en Post. Nueva Fase 5 en `ROADMAP.md`; fases
  posteriores renumeradas (chat 6, notificaciones 7, market 8, búsqueda/explore 9, grupos 10,
  admin 11, futuro 12).
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada nuevo.
- **Sigue:** Fase 0 del `ROADMAP.md`.

### 2026-08-31 — Cierre de huecos de especificación (tarea)
- **Listo:** `docs/API-CONTRACTS.md` nuevo: convenciones (envelope, cursor, ISO), formas
  exactas de UserPublic/Me/Post/Comment/Notification/MarketItem/Conversation/Message,
  contratos finos (reorder, feedSettings, likes, follows, search) y el **algoritmo determinista
  del home feed** (streams S/D, boost 12 h a favoritos, mezcla 4:1, cursor doble). ROADMAP,
  DATA-MODEL y AGENTS.md enlazados a él.
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada; las preguntas abiertas de `PRODUCT.md` siguen sin bloquear Fases 0–8.
- **Sigue:** Fase 0 del `ROADMAP.md`. Todo endpoint nuevo debe implementar la forma exacta de
  `API-CONTRACTS.md`.

### 2026-08-31 — Documentación y decisiones de producto (cierre de preparación)
- **Listo:** `AGENTS.md` raíz y por módulo; `docs/PRODUCT.md` (canónico, con decisiones del
  dueño), `docs/DATA-MODEL.md` (modelo actual + objetivo por fases), `docs/PROCESSES.md`
  (flujos existentes), `docs/ARCHITECTURE.md` (monolito modular + eventos + notificaciones
  extraíbles), `docs/ROADMAP.md` (Fases 0–11 detalladas).
- **Falta:** todo el desarrollo desde la Fase 0; no hay código nuevo, solo documentación.
- **Necesito:** respuestas a las "Preguntas abiertas" de `PRODUCT.md` (límites de video/audio,
  comentarios anidados, chats grupales, alcance admin/soporte) — no bloquean las Fases 0–2.
- **Sigue:** Fase 0 del `ROADMAP.md`: ampliar `User` (cédula, username, rol, isPublic) en
  `prisma/schema.prisma` + DTO de registro, guard de roles y `src/events/`.
