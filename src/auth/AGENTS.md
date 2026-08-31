# Módulo `auth`

**Responsabilidad:** registro, login, refresh y logout; emisión y verificación de JWT.

## Contrato actual
- `POST /api/auth/register` (público) — email, contraseña, nombre. Pendiente Fase 0: cédula y
  username obligatorios (ver `docs/ROADMAP.md`).
- `POST /api/auth/login` (público) — devuelve `accessToken` + refresh (cookie httpOnly para web
  **y** en el body para móvil).
- `POST /api/auth/refresh` — acepta cookie o refresh token en body (`jwt-refresh.strategy`).
- `POST /api/auth/logout` — limpia la cookie.

## Piezas
- `strategies/jwt-access.strategy.ts` — valida el access token (guard global).
- `strategies/jwt-refresh.strategy.ts` — valida el refresh (cookie o body).
- `guards/` — `JwtAuthGuard` (global, respeta `@Public()`), `JwtRefreshAuthGuard`.
- `auth.service.ts` — lógica de credenciales y emisión de tokens (bcrypt + `@nestjs/jwt`).

## Reglas del módulo
- El access token vive poco y nunca se persiste en el servidor; el refresh nunca viaja en
  respuestas JSON para la web (solo cookie httpOnly) pero sí para móvil.
- Todo cambio de contrato aquí afecta a los DOS clientes (web y app): anotar en
  `docs/PROCESSES.md` y avisar en la descripción de la tarea.
- Cambios de credenciales/campos de registro exigen actualizar `docs/DATA-MODEL.md`.
