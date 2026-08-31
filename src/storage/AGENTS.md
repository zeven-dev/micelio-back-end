# Módulo `storage`

**Responsabilidad:** abstracción de almacenamiento de objetos. Interfaz `StorageService`
(`upload`, `getSignedDownloadUrl`, `delete`) con implementación S3 (`s3-storage.service.ts`).

## Reglas del módulo
- Ningún otro módulo habla con el SDK de AWS directamente: siempre a través de
  `StorageService`.
- MinIO en local / S3 real en producción se controla solo por variables de entorno
  (`AWS_S3_ENDPOINT`, `AWS_S3_FORCE_PATH_STYLE`); no introducir ramas de código por entorno.
- Las URLs de lectura siempre son firmadas y con expiración; el bucket permanece privado.
- Si un módulo nuevo necesita otro "espacio" (avatares, adjuntos de chat, market), usar
  prefijos de key distintos (`avatars/`, `chat/`, `market/`), no buckets nuevos, salvo decisión
  documentada.
- En uso desde la Fase 0: `avatars/{userId}/{uuid}.ext` (módulo `users`,
  `PATCH /api/users/me/avatar`); `users/{userId}/folders/{folderId}/{uuid}.ext` (módulo
  `files`, biblioteca).
