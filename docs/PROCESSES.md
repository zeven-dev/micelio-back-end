# Micelio — Registro de procesos (back-end)

Todo proceso/flujo de la API se registra aquí: **qué hace, dónde vive, por qué existe**. Si un
agente crea, modifica, ajusta o elimina un proceso, actualiza este documento en la misma tarea.
La meta: que el siguiente agente sepa dónde buscar, qué buscar y por qué, sin leer todo el
código.

Formato de cada entrada: nombre, módulo(s), disparador, pasos clave, notas. Al eliminar un
proceso, no borres la entrada: muévela a "Procesos eliminados" con el motivo.

---

## Procesos activos

### Registro de usuario
- **Módulos:** `src/auth`, `src/users`
- **Disparador:** `POST /api/auth/register` (público)
- **Pasos:** valida DTO → verifica email libre → hashea contraseña (bcrypt) → crea User →
  emite access + refresh token (misma respuesta que login).
- **Notas:** pendiente Fase 0: cédula + username + rol. El refresh se entrega como cookie
  httpOnly (web) y también en el body (móvil).

### Login / Refresh / Logout
- **Módulos:** `src/auth`
- **Disparadores:** `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`
- **Pasos:** login valida credenciales y emite par de tokens; refresh acepta cookie httpOnly
  (web) o refresh token en body (móvil) vía `jwt-refresh.strategy`; logout limpia la cookie.
- **Notas:** access token corto vivido, solo en memoria del cliente. Guard JWT global: todo
  endpoint es privado salvo `@Public()`.

### CRUD de carpetas
- **Módulos:** `src/folders`
- **Disparadores:** `GET/POST /api/folders`, `GET/PATCH/DELETE /api/folders/:id`
- **Pasos:** toda operación filtra por `userId` del token (un usuario nunca ve carpetas ajenas);
  nombre único por usuario; borrar cascadea a archivos (y sus objetos S3 vía FilesService).
- **Notas:** pendiente Fase 1: sub-carpetas (`parentId`).

### Subida y gestión de archivos de biblioteca
- **Módulos:** `src/files`, `src/storage`
- **Disparadores:** `POST /api/folders/:id/files` (multipart), `GET`, `DELETE`
- **Pasos:** Multer en memoria (nunca disco) → valida mimeType/tamaño → `StorageService.upload`
  a S3 con key única → registra `FileAsset` → las lecturas devuelven URLs firmadas con
  expiración (`AWS_S3_SIGNED_URL_EXPIRES_IN`).
- **Notas:** MinIO en local (docker-compose), S3 real en producción sin cambio de código.
  Estos archivos son la **biblioteca de publicaciones**; los adjuntos de chat serán otro flujo.

### Manejo transversal de peticiones
- **Módulos:** `src/common`, `src/main.ts`
- **Qué:** `TransformInterceptor` envuelve las respuestas, `HttpExceptionFilter` normaliza los
  errores, `ValidationPipe` global con whitelist, throttling (`@nestjs/throttler`), CORS con
  credenciales para la web.

---

## Procesos eliminados

*(vacío)*
