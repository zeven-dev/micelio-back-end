# Módulo `files`

**Responsabilidad:** subida, listado y borrado de archivos (`FileAsset`) dentro de carpetas.
Estos archivos son la **biblioteca de publicaciones** del usuario.

## Contrato actual (subida directa a S3 desde Fase 0.5)
- `POST /api/folders/:id/files/presign` — valida carpeta/mimeType/tamaño, devuelve
  `{ key, uploadUrl, expiresIn }`. El cliente hace `PUT uploadUrl` directo a S3 (fuera de este
  backend).
- `POST /api/folders/:id/files/confirm` — valida prefijo de `key` + `HeadObject` (el objeto debe
  existir ya en S3) y recién ahí crea el `FileAsset`.
- `GET /api/folders/:id/files`, `DELETE /api/files/:id` sin cambios de forma.
- Detalle completo de los dos pasos en `docs/API-CONTRACTS.md` ("Subida directa a S3").

## Límites de peso
Configurables por entorno (`UPLOAD_MAX_IMAGE_MB`, `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_TEXT_MB`),
nunca hardcodeados. `utils/file-type.util.ts` solo mapea `FileType` → clave de configuración
(`MAX_SIZE_CONFIG_KEY`); los valores los lee `FilesService` con `ConfigService` en cada subida,
así que cambiar un tope es cambiar el `.env` y reiniciar. El tope de Multer se arma en
`files.module.ts` (`MulterModule.registerAsync`) como el mayor de los límites **más 1 MB de
holgura**, para que el mensaje de error sea el del servicio (en español, con el tope vigente) y
no el `File too large` de Multer. **No se valida duración** (decisión #11 de `PRODUCT.md`).

## Reglas del módulo
- **El backend nunca recibe el binario**: ni a disco ni en memoria (se quitó `FileInterceptor`).
  Todo el peso del archivo va directo del cliente al bucket con la URL firmada.
- Los adjuntos de chat NO usan este módulo ni `FileAsset` — serán `ChatAttachment` en el módulo
  `chat` (decisión de producto: biblioteca y chat son cosas separadas).
- Al borrar un `FileAsset`, borrar también el objeto S3. Cuando existan publicaciones (Fase 2),
  impedir/gestionar el borrado de archivos referenciados por un `Post` y documentar la decisión
  en `docs/DATA-MODEL.md`.
- Tipos nuevos (p. ej. AUDIO, Fase 1) → actualizar `FileType`, `ALLOWED_MIME_TYPES` y
  `MAX_SIZE_CONFIG_KEY` en `utils/file-type.util.ts`, la variable `UPLOAD_MAX_<TIPO>_MB` en los
  tres sitios que exige `src/config/AGENTS.md`, el `Math.max` del tope de Multer en
  `files.module.ts`, y `docs/DATA-MODEL.md`.
