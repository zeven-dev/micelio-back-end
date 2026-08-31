# Módulo `users`

**Responsabilidad:** acceso a datos de usuario, y el perfil propio/público. Único punto por el
que otros módulos leen o escriben usuarios (nunca consultar la tabla `users` con Prisma desde
otro módulo).

## Contrato actual (Fase 0)
- `GET /api/users/me` — `Me` completo (`UserPublic` + `email` + `role`); nunca incluye `cedula`.
- `PATCH /api/users/me` — parcial `{ name?, bio?, isPublic? }`. `feedSettings` **no** se acepta
  todavía (llega en la Fase 2 con los campos de layout del feed).
- `PATCH /api/users/me/avatar` (multipart, campo `avatar`) — sube a S3 vía `StorageService`
  (prefijo `avatars/{userId}/`, solo `image/jpeg|png|webp`, máx 5 MB) y borra la key anterior.
  El borrado es limpieza *best-effort*: si S3 falla se registra un warning y la key queda
  huérfana, en vez de devolver `500` sobre un avatar que sí quedó guardado.
- `GET /api/users/:username` — `UserPublic`; si el viewer no es el dueño y el perfil no es
  público, se omiten `bio` y `feedSettings`. **Autenticación opcional** (`@OptionalAuth()`):
  responde con o sin sesión, porque los perfiles se comparten por link (decisión #10 de
  `PRODUCT.md`). Sin sesión no hay dueño posible, así que solo se abren los perfiles públicos;
  un token inválido o expirado da `401` en vez de degradar a anónimo. Es la **única** ruta de la
  API que no exige sesión además de las `@Public()` de `auth` y el health check.

## Piezas
- `users.service.ts` — búsqueda por id/email/username/cedula, creación (usado por `auth`),
  `updateRole` (usado por `admin`), y las vistas `UserPublicView`/`MeView` que arma
  `toUserPublic()`.

## Desviaciones documentadas de `API-CONTRACTS.md` (ver también `docs/STATUS.md`)
- `followersCount`, `followingCount`, `viewerFollows`, `followsViewer`: siempre `0`/`false`
  hasta que exista `Follow` (módulo `social`, Fase 3). No son un placeholder falso: hoy es el
  valor real (nadie sigue a nadie todavía).
- `feedSettings` se omite por completo del `UserPublic` extendido hasta la Fase 2 (los campos
  `feedLayout/feedColumns/feedGap` no existen aún en el esquema).

## Reglas del módulo
- Nunca exponer `passwordHash` ni `cedula` en respuestas públicas; la cédula es dato sensible de
  registro, no de perfil.
- Todo campo nuevo de usuario se documenta en `docs/DATA-MODEL.md`.
- La regla de visibilidad completa (follow mutuo) vive en el futuro módulo `social` (Fase 3);
  hasta entonces, `isPublic` es el único criterio.
