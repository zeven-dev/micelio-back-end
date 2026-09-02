# Módulo `files`

**Responsabilidad:** subida, listado y borrado de archivos (`FileAsset`) dentro de carpetas.
Estos archivos son la **biblioteca de publicaciones** del usuario.

## Contrato actual (subida directa a S3 desde Fase 0.5)
- `POST /api/folders/:id/files/presign` — valida carpeta/mimeType/tamaño, devuelve
  `{ key, uploadUrl, expiresIn }`. El cliente hace `PUT uploadUrl` directo a S3 (fuera de este
  backend).
- `POST /api/folders/:id/files/confirm` — valida prefijo de `key` + `HeadObject` (el objeto debe
  existir ya en S3) y recién ahí crea el `FileAsset`. Acepta además `width`/`height`
  **opcionales** en píxeles: el cliente los mide (el servidor no puede, el binario no pasa por
  aquí) y las publicaciones los heredan para el masonry. Si faltan quedan `null` y ese medio se
  dibuja cuadrado — un fallo midiendo nunca impide subir.
- `GET /api/folders/:id/files`, `DELETE /api/files/:id` sin cambios de forma. Desde la Fase 2,
  `DELETE` responde **`409`** si el archivo está en una publicación (ver abajo).
- Detalle completo de los dos pasos en `docs/API-CONTRACTS.md` ("Subida directa a S3").

## Límites de peso
Configurables por entorno (`UPLOAD_MAX_IMAGE_MB`, `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_AUDIO_MB`,
`UPLOAD_MAX_TEXT_MB`), **nunca hardcodeados**. `utils/file-type.util.ts` solo mapea `FileType` →
clave de configuración (`MAX_SIZE_CONFIG_KEY`); los valores los lee `FilesService.maxBytesFor()`
con `ConfigService` en cada subida, así que cambiar un tope es cambiar el `.env` y reiniciar.
**No se valida duración** (decisión #11 de `PRODUCT.md`): el peso es el único tope, también para
audio y video.

Ya no hay tope de Multer que armar: desde la Fase 0.5 ningún binario pasa por la API.

**El tamaño se valida dos veces, y la segunda es la que manda.** En `presign` el `size` del DTO
es lo que el cliente *promete* subir; la URL prefirmada no impone tamaño, así que en `confirm`
se vuelve a validar contra el `HeadObject` de S3 —el único dato real— y **ese** es el que se
persiste en `FileAsset.size`. Un objeto que se pasa del límite se borra del bucket en el mismo
paso: sin fila en la base, nadie volvería a encontrarlo para limpiarlo.

## Reglas del módulo
- **El backend nunca recibe el binario**: ni a disco ni en memoria (se quitó `FileInterceptor`).
  Todo el peso del archivo va directo del cliente al bucket con la URL firmada.
- Los adjuntos de chat NO usan este módulo ni `FileAsset` — serán `ChatAttachment` en el módulo
  `chat` (decisión de producto: biblioteca y chat son cosas separadas).
- Al borrar un `FileAsset`, borrar también el objeto S3 — pero **la fila va primero**: desde la
  Fase 2 `post_media` referencia `file_assets` con `onDelete: Restrict`, así que un archivo
  publicado no se puede borrar (`P2003` → `409` con mensaje claro). Si se borrara el binario
  antes, una publicación viva quedaría apuntando a un objeto inexistente. Decisión registrada en
  `docs/DATA-MODEL.md` (bloquear, no cascadear ni marcar).
- **Servicios públicos para otros dominios (regla 7):** `findOwnedByUser(ids, userId)` (valida
  propiedad vía `FoldersService`; `404`/`403`) y `findManyByIds(ids)` (sin control de propiedad,
  para contenido ajeno ya autorizado por quien llama). Ambos devuelven también `width`/`height`.
  Los usa `posts` para armar sus medios; nadie más consulta `file_assets` con Prisma.
- **Limpieza de S3 (`files-cleanup.listener.ts`):** escucha `folder.deleted` y borra **por
  prefijo** los binarios del subárbol borrado. Va por evento porque `folders` no puede consultar
  `file_assets` y `files` ya lo importa (la dependencia inversa sería circular); y por prefijo
  porque cuando el listener corre las filas ya no existen. El esquema de keys vive en
  `utils/library-key.util.ts` — este módulo las genera, así que es el único que las interpreta.
  Un fallo de S3 se registra y no se propaga: la carpeta ya se borró.
- Tipos nuevos → actualizar `FileType` (schema + migración), `ALLOWED_MIME_TYPES`,
  `MAX_SIZE_CONFIG_KEY` y `FILE_TYPE_LABEL` en `utils/file-type.util.ts`, la variable
  `UPLOAD_MAX_<TIPO>_MB` en los tres sitios que exige `src/config/AGENTS.md`, y
  `docs/DATA-MODEL.md`. Los cuatro `Record<FileType, …>` son exhaustivos: si olvidas uno, el
  compilador te lo dice. `AUDIO` ya entró en la Fase 1.
