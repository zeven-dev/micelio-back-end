# Módulo `files`

**Responsabilidad:** subida, listado y borrado de archivos (`FileAsset`) dentro de carpetas.
Estos archivos son la **biblioteca de publicaciones** del usuario.

## Contrato actual
- `POST /api/folders/:id/files` (multipart, Multer en memoria), `GET`, `DELETE`.
- Valida mimeType y tamaño; sube a S3 vía `StorageService`; devuelve URLs firmadas con
  expiración.

## Límites de peso
Configurables por entorno (`UPLOAD_MAX_IMAGE_MB`, `UPLOAD_MAX_VIDEO_MB`, `UPLOAD_MAX_TEXT_MB`),
nunca hardcodeados. `utils/file-type.util.ts` solo mapea `FileType` → clave de configuración
(`MAX_SIZE_CONFIG_KEY`); los valores los lee `FilesService` con `ConfigService` en cada subida,
así que cambiar un tope es cambiar el `.env` y reiniciar. El tope de Multer se arma en
`files.module.ts` (`MulterModule.registerAsync`) como el mayor de los límites **más 1 MB de
holgura**, para que el mensaje de error sea el del servicio (en español, con el tope vigente) y
no el `File too large` de Multer. **No se valida duración** (decisión #11 de `PRODUCT.md`).

## Reglas del módulo
- **Nunca escribir a disco local**: buffer en memoria → S3.
- Los adjuntos de chat NO usan este módulo ni `FileAsset` — serán `ChatAttachment` en el módulo
  `chat` (decisión de producto: biblioteca y chat son cosas separadas).
- Al borrar un `FileAsset`, borrar también el objeto S3. Cuando existan publicaciones (Fase 2),
  impedir/gestionar el borrado de archivos referenciados por un `Post` y documentar la decisión
  en `docs/DATA-MODEL.md`.
- Tipos nuevos (p. ej. AUDIO, Fase 1) → actualizar `FileType`, `ALLOWED_MIME_TYPES` y
  `MAX_SIZE_CONFIG_KEY` en `utils/file-type.util.ts`, la variable `UPLOAD_MAX_<TIPO>_MB` en los
  tres sitios que exige `src/config/AGENTS.md`, el `Math.max` del tope de Multer en
  `files.module.ts`, y `docs/DATA-MODEL.md`.
