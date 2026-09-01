# Módulo `folders`

**Responsabilidad:** CRUD de carpetas ("proyectos") de la biblioteca de cada usuario, con
**sub-carpetas** (árbol) desde la Fase 1.

## Contrato actual
- `GET /api/folders?parentId=<uuid>` — hijas directas de esa carpeta. **Sin `parentId` devuelve
  la raíz.** Cada carpeta trae `_count: { files, children }`.
- `GET /api/folders/:id` — la carpeta + `path`: el breadcrumb `[{ id, name }]` desde la raíz
  hasta ella (ella incluida), que es lo que las dos vistas de detalle usan para navegar.
- `POST /api/folders` — `{ name, parentId? }`. `parentId` ausente o `null` = carpeta raíz.
- `PATCH /api/folders/:id` — `{ name?, parentId? }`. Renombra y/o mueve: **`parentId` ausente no
  mueve la carpeta; `parentId: null` la manda a la raíz.** (`class-transformer` solo asigna las
  claves presentes en el body, así que `undefined` y `null` se distinguen.)
- `DELETE /api/folders/:id` — borra la carpeta, sus sub-carpetas y las filas de sus archivos
  (FK autorreferente `ON DELETE CASCADE`).
- Toda operación filtra por el `userId` del token: un usuario jamás ve ni mueve carpetas ajenas.

Formas exactas en [`docs/API-CONTRACTS.md`](../../docs/API-CONTRACTS.md) ("Carpetas y
sub-carpetas").

## Invariantes del árbol (`FoldersService`)
- **Nombre único entre hermanos**, no globalmente: `Obra` puede existir en la raíz y dentro de
  otra carpeta. Se valida en el servicio (→ `409`) antes de escribir; los índices de la base son
  la red de seguridad, no la validación. Ojo: en Postgres dos `NULL` son distintos, así que la
  raíz la cubre el índice parcial `folders_userId_name_root_key` de la migración
  `20260901000000_add_subfolders_and_audio`, no el `@@unique` del schema.
- **Sin ciclos**: mover una carpeta dentro de sí misma o de una de sus descendientes es `400`.
  `assertMoveIsLegal` sube por los ancestros del nuevo padre antes de escribir.
- Los recorridos del árbol (breadcrumb, ancestros) están topeados con `MAX_TREE_DEPTH`: un árbol
  sano nunca lo alcanza, pero un ciclo dejado por una escritura fuera de este servicio no puede
  colgar el proceso.

## Pendiente
- **Objetos huérfanos en S3 al borrar una carpeta**: la cascada borra las filas `FileAsset`, no
  los binarios del bucket. Con sub-carpetas el hueco es mayor (un borrado se lleva un subárbol
  entero). Arreglarlo cruza dominios (`folders` no puede consultar datos de `files`, y
  `files` ya importa a `folders`), así que necesita una decisión de arquitectura: evento de
  dominio `folder.deleted` con un listener en `files`, o barrido por prefijo en `storage`.
  Ver `docs/STATUS.md`.
- Carpetas de grupo/curso vivirán en el módulo futuro `groups`, NO aquí — este módulo es solo
  biblioteca personal.

## Reglas del módulo
- La autorización por dueño se hace en el servicio (no confiar en el controlador).
- Cambios de estructura → actualizar `docs/DATA-MODEL.md`.
