# Módulo `files`

**Responsabilidad:** subida, listado y borrado de archivos (`FileAsset`) dentro de carpetas.
Estos archivos son la **biblioteca de publicaciones** del usuario.

## Contrato actual
- `POST /api/folders/:id/files` (multipart, Multer en memoria), `GET`, `DELETE`.
- Valida mimeType y tamaño; sube a S3 vía `StorageService`; devuelve URLs firmadas con
  expiración.

## Reglas del módulo
- **Nunca escribir a disco local**: buffer en memoria → S3.
- Los adjuntos de chat NO usan este módulo ni `FileAsset` — serán `ChatAttachment` en el módulo
  `chat` (decisión de producto: biblioteca y chat son cosas separadas).
- Al borrar un `FileAsset`, borrar también el objeto S3. Cuando existan publicaciones (Fase 2),
  impedir/gestionar el borrado de archivos referenciados por un `Post` y documentar la decisión
  en `docs/DATA-MODEL.md`.
- Tipos nuevos (p. ej. AUDIO) → actualizar `FileType`, `utils/file-type.util.ts` y
  `docs/DATA-MODEL.md`.
