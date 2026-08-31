# Módulo `auth`

**Responsabilidad:** registro, login, refresh y logout; emisión y verificación de JWT.

## Contrato actual
- `POST /api/auth/register` (público) — `email, password, name, username, cedula`. Verifica que
  email, username y cedula estén libres antes de crear el usuario (`409` con el mensaje del
  campo). Esa verificación previa es solo para el mensaje: la garantía real es el índice único,
  cuyo `P2002` se traduce al mismo `409` (`createUserOrConflict`), de modo que dos registros
  simultáneos con el mismo dato dan `409` y no `500`.
- `POST /api/auth/login` (público) — devuelve `accessToken` + refresh (cookie httpOnly para web
  **y** en el body para móvil).
- `POST /api/auth/refresh` — acepta cookie o refresh token en body (`jwt-refresh.strategy`).
- `POST /api/auth/logout` — limpia la cookie.

`auth` solo maneja el ciclo de vida de los tokens. El perfil de la sesión es `GET /api/users/me`
(módulo `users`); el antiguo `GET /api/auth/me` se eliminó en la revisión de la Fase 0 por
devolver una forma anterior al contrato — ver "Procesos eliminados" en `docs/PROCESSES.md`.

## Piezas
- `strategies/jwt-access.strategy.ts` — valida el access token (guard global).
- `strategies/jwt-refresh.strategy.ts` — valida el refresh (cookie o body).
- `guards/` — `JwtAuthGuard` (global, respeta `@Public()`), `JwtRefreshAuthGuard`.
- `auth.service.ts` — lógica de credenciales y emisión de tokens (bcrypt + `@nestjs/jwt`).

## Reglas del módulo
- El access token vive poco y nunca se persiste en el servidor; el refresh nunca viaja en
  respuestas JSON para la web (solo cookie httpOnly) pero sí para móvil.
- El `JwtPayload`/`AuthenticatedUser` incluye `role` desde la Fase 0 (para que `RolesGuard` no
  necesite consultar la base de datos por request). Un cambio de rol se ve reflejado en el
  siguiente refresh, no de forma instantánea.
- `RolesGuard` se registra en `auth.module.ts` como segundo `APP_GUARD`, justo después de
  `JwtAuthGuard` (ver `src/common/AGENTS.md`).
- Todo cambio de contrato aquí afecta a los DOS clientes (web y app): anotar en
  `docs/PROCESSES.md` y avisar en la descripción de la tarea.
- Cambios de credenciales/campos de registro exigen actualizar `docs/DATA-MODEL.md`.
