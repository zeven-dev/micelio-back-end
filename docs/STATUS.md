# Micelio — Bitácora de estado (back-end)

**Descarga de conocimiento obligatoria.** Al terminar **cada tarea** y al cerrar **cada fase**
del `ROADMAP.md`, el agente agrega una entrada **al inicio** de la sección "Entradas" con este
formato. El objetivo: que cualquiera (humano o agente) entienda en qué punto va el proyecto sin
leer el historial de git.

```
### AAAA-MM-DD — <tarea o fase> (tarea | cierre de fase)
- **Listo:** qué quedó funcionando y dónde (módulos, endpoints, migraciones).
- **Falta:** qué quedó pendiente de esta tarea/fase y por qué.
- **Necesito:** bloqueos, decisiones pendientes del dueño, dependencias de otros repos.
- **Sigue:** cuál es el siguiente paso concreto y dónde empezar.
```

Reglas: no borrar ni editar entradas anteriores (solo agregar); escribir concreto y con rutas
de archivos; si una fase se cierra, la entrada de cierre resume la fase completa.

---

## Entradas

### 2026-08-31 — Revisión de la Fase 0: cierre de huecos (tarea)

Repaso de la Fase 0 ya cerrada, verificando el código contra lo que afirmaba esta bitácora. Las
13 casillas de las tres hojas de ruta estaban efectivamente implementadas y las puertas de
calidad pasaban. Se encontraron y corrigieron seis huecos reales:

- **Listo:**
  1. **Migración aplicable sobre datos existentes.** `20260831000000_extend_user_identity_roles`
     agregaba `cedula`/`username` como `NOT NULL` sin relleno: fallaba con *"column contains
     null values"* en cualquier base que ya tuviera usuarios (reproducido contra Postgres real).
     Ahora agrega las columnas nullable, rellena las filas previas de forma determinista a
     partir del `id` y solo entonces aplica `SET NOT NULL` + índices únicos. Verificado:
     migra bien sobre base vacía **y** sobre base con usuarios, y
     `prisma migrate diff` contra `schema.prisma` reporta "No difference detected".
     Valores de relleno y sus consecuencias en `docs/DATA-MODEL.md`.
     *Nota:* se editó una migración ya aplicada (excepción a la regla 5). Fue deliberado: una
     migración que **falla** no se puede reparar con otra posterior, y no hay despliegue. Quien
     tenga una base local con esta migración aplicada debe correr `prisma migrate reset`.
  2. **`RolesGuard` ahora es fail-closed.** Antes permitía el acceso cuando la ruta no declaraba
     `@Roles`, así que la regla 8 ("todo endpoint declara sus roles") dependía de la memoria del
     agente — y los endpoints nuevos de la propia Fase 0 no la cumplían. Ahora una ruta que no
     sea `@Public()` y no declare `@Roles(...)` responde `500` nombrando controlador y handler.
     `users`, `folders`, `files` y `auth/logout` declaran `@Roles(...ALL_ROLES)`.
  3. **Registro concurrente devuelve `409`, no `500`.** Las tres pre-consultas de unicidad son
     TOCTOU; ahora el `P2002` de Prisma se traduce al mismo `409` por campo
     (`AuthService.createUserOrConflict`), con specs para los tres índices.
  4. **`GET /api/auth/me` eliminado.** Quedó con la forma anterior a la Fase 0 (sin `username`
     ni `role`) y ningún cliente lo consumía; `GET /api/users/me` es el contrato. Registrado en
     "Procesos eliminados" de `docs/PROCESSES.md`.
  5. **`GET /health` eliminado.** Se registraba después de `app.listen()` y nunca respondió
     (`404`, verificado). El health real es `GET /api/health` en `AppController`.
  6. **Borrado del avatar anterior ahora es best-effort.** Un fallo de S3 al limpiar la key
     vieja devolvía `500` sobre un cambio de avatar que sí se había aplicado.
- **Verificación:** `npm run lint`, `npm run build` y `npm test` (**30 tests**, antes 24) en
  verde. Además smoke test end-to-end con la API corriendo contra Postgres real: las 17 rutas
  responden lo esperado con el guard fail-closed (ninguna quedó bloqueada), registro duplicado
  da `409` con el mensaje del campo, perfil privado oculta `bio` a terceros y la muestra al
  dueño, `cedula` y `passwordHash` nunca salen, un no-ADMIN recibe `403` y un ADMIN promueve a
  TEACHER correctamente.
- **Falta:** **integrar los clientes.** El back-end está en `main`, pero `micelio-front-end` y
  `micelio-app` tienen su Fase 0 solo en rama. Hoy, `main` contra `main`, el registro está roto:
  la API exige `cedula`/`username` y las pantallas de login de `main` no los envían.
- **Necesito:** decisión del dueño sobre (a) integrar las ramas de los dos clientes a `main`, y
  (b) las 6 ambigüedades de la entrada siguiente, que siguen sin revisar.
- **Sigue:** Fase 1 del `ROADMAP.md` (`src/folders`: `parentId` para sub-carpetas; `AUDIO` en
  `FileType`). No se empezó por decisión explícita: esta tarea era solo el repaso de la Fase 0.

### 2026-08-31 — Fase 0: identidad, roles y arquitectura (cierre de fase)
- **Listo:**
  - `User` ampliado en `prisma/schema.prisma` con `cedula`, `username`, `role` (enum `Role`),
    `bio`, `avatarKey`, `isPublic`; migración `20260831000000_extend_user_identity_roles`
    aplicada. `docs/DATA-MODEL.md` actualizado.
  - `POST /api/auth/register` ahora exige `cedula`, `username` además de `name` (antes
    opcional); valida unicidad de los tres campos con `409` específico por campo
    (`src/auth/dto/register.dto.ts`, `src/auth/auth.service.ts`).
  - `@Roles(...)` + `RolesGuard` en `src/common` (`decorators/roles.decorator.ts`,
    `guards/roles.guard.ts`), registrado como `APP_GUARD` global en
    `src/auth/auth.module.ts` justo después de `JwtAuthGuard`. El rol viaja en el JWT
    (`JwtPayload`/`AuthenticatedUser` ganan `role`) para no consultar la base de datos en cada
    request.
  - `PATCH /api/admin/users/:id/role` (`@Roles(ADMIN)`) — módulo nuevo `src/admin` (germen,
    ver su `AGENTS.md`).
  - `@nestjs/event-emitter` instalado y registrado global (`EventEmitterModule.forRoot()` en
    `AppModule`); `src/events/domain-events.ts` con nombres y payloads de los 9 eventos de
    `ARCHITECTURE.md`. Sin productores/consumidores todavía (scaffold puro).
  - `GET/PATCH /api/users/me`, `PATCH /api/users/me/avatar` (multipart, S3 vía
    `StorageService`), `GET /api/users/:username` — módulo `users` (`users.controller.ts`,
    `users.service.ts`).
  - Verificación: `npm run lint` (sin errores), `npm run build` (sin errores),
    `npm test` (4 suites, 24 tests, todos en verde). Además smoke test manual end-to-end con el
    servidor corriendo contra Postgres real: registro de 2 usuarios, colisión de email/username
    (`409`), perfil privado por defecto (oculta `bio` a terceros), `PATCH /users/me`
    (`isPublic:true`) revela `bio` a terceros, `RolesGuard` responde `403` a un no-ADMIN, y un
    ADMIN promueve a otro usuario a `TEACHER` correctamente.
- **Ambigüedades reales resueltas (elegida la opción más simple compatible con las specs):**
  1. **Formato de `username`:** ninguna doc fijaba el patrón exacto. Elegido
     `^[a-z0-9_.]{3,30}$` (minúsculas, dígitos, `_`, `.`). Si el dueño del producto quiere otro
     formato (mayúsculas visibles, guiones, longitud distinta), es un cambio de una sola
     validación en `register.dto.ts`.
  2. **Formato de `cedula`:** la spec solo pide "formato básico de dígitos". Elegido
     `^[0-9]{6,10}$` (rango típico de cédulas colombianas, sin dígito de verificación).
  3. **`UserPublic.followersCount/followingCount/viewerFollows/followsViewer`:** el contrato ya
     los define, pero `Follow` no existe hasta la Fase 3. Se devuelven `0`/`false` — es el valor
     real hoy (no hay follows), no un placeholder inventado. Se actualizará solo cuando exista
     `social`.
  4. **`UserPublic.feedSettings`:** depende de columnas que llegan en la Fase 2
     (`feedLayout/feedColumns/feedGap`). Se **omite** del todo en vez de inventar valores por
     defecto no persistidos, para no mentir sobre datos que el usuario no ha configurado.
  5. **`GET /api/users/:username`, ¿público o autenticado?** Ninguna doc lo especifica. Elegido
     autenticado (no `@Public()`), consistente con la regla "todo endpoint es privado por
     defecto" de `AGENTS.md`. Fácil de revertir si el producto quiere perfiles públicos
     navegables sin sesión.
  6. **`PATCH /api/users/me/avatar` vs. avatar dentro de `PATCH /api/users/me`:** el `ROADMAP.md`
     decía "avatar vía StorageService" dentro de la tarea de perfil, pero `API-CONTRACTS.md` ya
     especifica el endpoint separado (`PATCH /api/users/me/avatar`, multipart) — se implementó
     el contrato exacto, no la redacción suelta del roadmap.
- **Falta:** nada de la Fase 0. Fase 1 (sub-carpetas, `AUDIO`) no ha empezado.
- **Necesito:** que el dueño del producto revise las 6 ambigüedades resueltas arriba,
  especialmente el formato de `username`/`cedula` y si el perfil público debe ser navegable sin
  sesión.
- **Sigue:** Fase 1 del `ROADMAP.md` (`src/folders`: `parentId` para sub-carpetas; `AUDIO` en
  `FileType`). El front-end y la app pueden empezar su propia Fase 0 ya mismo: login/registro
  con los campos nuevos, pantalla de perfil (`GET/PATCH /api/users/me`, avatar, toggle
  público/privado) y perfil público limitado.

### 2026-08-31 — Ranking personalizado y etiquetas especificados (tarea)
- **Listo:** decisión del dueño incorporada: afinidad usuario→usuario y usuario→etiqueta con
  pesos fijos (like +1, comentario +2, guardado +3, compartido +2) y vida media de 90 días,
  feed v2, `GET /api/explore` y orden de búsqueda por afinidad — todo exacto en
  `API-CONTRACTS.md`. Nuevo módulo `ranking` en `ARCHITECTURE.md` y `DATA-MODEL.md`
  (`UserAffinity`, `UserTagAffinity`); `tags` en Post. Nueva Fase 5 en `ROADMAP.md`; fases
  posteriores renumeradas (chat 6, notificaciones 7, market 8, búsqueda/explore 9, grupos 10,
  admin 11, futuro 12).
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada nuevo.
- **Sigue:** Fase 0 del `ROADMAP.md`.

### 2026-08-31 — Cierre de huecos de especificación (tarea)
- **Listo:** `docs/API-CONTRACTS.md` nuevo: convenciones (envelope, cursor, ISO), formas
  exactas de UserPublic/Me/Post/Comment/Notification/MarketItem/Conversation/Message,
  contratos finos (reorder, feedSettings, likes, follows, search) y el **algoritmo determinista
  del home feed** (streams S/D, boost 12 h a favoritos, mezcla 4:1, cursor doble). ROADMAP,
  DATA-MODEL y AGENTS.md enlazados a él.
- **Falta:** nada de esta tarea; el desarrollo sigue sin empezar (Fase 0).
- **Necesito:** nada; las preguntas abiertas de `PRODUCT.md` siguen sin bloquear Fases 0–8.
- **Sigue:** Fase 0 del `ROADMAP.md`. Todo endpoint nuevo debe implementar la forma exacta de
  `API-CONTRACTS.md`.

### 2026-08-31 — Documentación y decisiones de producto (cierre de preparación)
- **Listo:** `AGENTS.md` raíz y por módulo; `docs/PRODUCT.md` (canónico, con decisiones del
  dueño), `docs/DATA-MODEL.md` (modelo actual + objetivo por fases), `docs/PROCESSES.md`
  (flujos existentes), `docs/ARCHITECTURE.md` (monolito modular + eventos + notificaciones
  extraíbles), `docs/ROADMAP.md` (Fases 0–11 detalladas).
- **Falta:** todo el desarrollo desde la Fase 0; no hay código nuevo, solo documentación.
- **Necesito:** respuestas a las "Preguntas abiertas" de `PRODUCT.md` (límites de video/audio,
  comentarios anidados, chats grupales, alcance admin/soporte) — no bloquean las Fases 0–2.
- **Sigue:** Fase 0 del `ROADMAP.md`: ampliar `User` (cédula, username, rol, isPublic) en
  `prisma/schema.prisma` + DTO de registro, guard de roles y `src/events/`.
