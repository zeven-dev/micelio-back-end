# Módulo `users`

**Responsabilidad:** acceso a datos de usuario, y el perfil propio/público. Único punto por el
que otros módulos leen o escriben usuarios (nunca consultar la tabla `users` con Prisma desde
otro módulo).

## Contrato actual (Fase 0; avatar rehecho a subida directa en Fase 0.5)
- `GET /api/users/me` — `Me` completo (`UserPublic` + `email` + `role`); nunca incluye `cedula`.
- `PATCH /api/users/me` — parcial `{ name?, bio?, isPublic?, feedSettings? }`. `feedSettings`
  es parcial dentro de parcial (`{ layout?, columns?, gap? }`, Fase 2): la clave ausente no se
  toca. `columns` 1–6, `gap` 0–5 (índice de la escala de espaciado del design system, no
  píxeles), `layout` ∈ {GRID, MASONRY}.
- `POST /api/users/me/avatar/presign` (JSON `{ mimeType, size }`) — valida tipo/tamaño
  (`image/jpeg|png|webp`, tope propio `UPLOAD_MAX_AVATAR_MB` — **no** el de las imágenes de
  biblioteca) y devuelve `{ key, uploadUrl, expiresIn }`; el cliente sube
  el binario directo a S3 con `PUT uploadUrl`.
- `PATCH /api/users/me/avatar` (JSON `{ key }`) — confirma con `HeadObject` que el objeto ya
  llegó a S3, **revalida el tamaño real** que este reporta (la URL firmada no impone tamaño; si
  se pasó del tope, borra el objeto y responde `413`), actualiza `avatarKey` y borra la key
  anterior. El backend **nunca** recibe el binario del avatar (se quitó `FileInterceptor`/Multer
  de este endpoint, y también el `MulterModule` que había quedado registrado en el módulo).
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
- **Servicios públicos que consume `posts` (Fase 2)**, para que ningún módulo lea la tabla
  `users` por su cuenta:
  - `canViewContentOf(ownerId, viewerId?)` — regla de visibilidad **única**: el dueño siempre,
    y cualquiera si el perfil es público. En la Fase 3 esta regla se muda al helper de `social`
    (follow mutuo); quien la llame no debería notar el cambio.
  - `getPublicViewsByIds(ids, viewerId?)` — `UserPublic` de varios usuarios de un golpe
    (evita una consulta y una firma de avatar por publicación).

## Grafo social (Fase 3)
- `followersCount`, `followingCount`, `viewerFollows` y `followsViewer` son **reales**: los
  aporta `SocialService.getGraphInfoFor`, y `users` los pide una sola vez por página de
  perfiles. Este módulo **no** consulta `follows` con Prisma.
- La vista extendida (`bio`, `feedSettings`) de un perfil privado se abre con **follow mutuo**;
  la decisión la toma `social`, aquí solo se aplica.
- `users` y `social` se inyectan con `forwardRef`: es un ciclo real del dominio, documentado en
  `docs/ARCHITECTURE.md`.

## Desviaciones documentadas de `API-CONTRACTS.md` (ver también `docs/STATUS.md`)
- `feedSettings` ya existe desde la Fase 2 (`feedLayout/feedColumns/feedGap` en `User`) y viaja
  en todo `UserPublic` **extendido**; en la vista limitada de un perfil privado se omite, igual
  que `bio`. Valores por defecto: `GRID`, 3 columnas, gap 2.

## Reglas del módulo
- Nunca exponer `passwordHash` ni `cedula` en respuestas públicas; la cédula es dato sensible de
  registro, no de perfil.
- Todo campo nuevo de usuario se documenta en `docs/DATA-MODEL.md`.
- La regla de visibilidad completa (follow mutuo) vive en el futuro módulo `social` (Fase 3);
  hasta entonces, `isPublic` es el único criterio.
