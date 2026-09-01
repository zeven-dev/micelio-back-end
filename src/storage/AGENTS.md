# Módulo `storage`

**Responsabilidad:** abstracción de almacenamiento de objetos. Interfaz `StorageService`
(`getSignedDownloadUrl`, `getSignedUploadUrl`, `headObject`, `delete`) con implementación S3
(`s3-storage.service.ts`). **Desde la Fase 0.5 no existe subida server-side**: los binarios
suben directo del cliente a S3 con la URL de `getSignedUploadUrl` (`PutObjectCommand` firmado);
el backend solo entrega esa URL y confirma con `headObject` que el objeto ya llegó antes de
persistir cualquier metadato. Por eso ya no hay método `upload(buffer)` en la interfaz.

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
- El bucket necesita su propia política CORS (fuera de este repo) que permita `PUT` con header
  `Content-Type` desde los orígenes de la web y la app; sin eso, la subida directa del cliente
  falla en el navegador aunque el backend esté bien.
