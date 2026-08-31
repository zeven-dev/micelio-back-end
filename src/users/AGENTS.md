# Módulo `users`

**Responsabilidad:** acceso a datos de usuario. Único punto por el que otros módulos leen o
escriben usuarios (nunca consultar la tabla `users` con Prisma desde otro módulo).

## Piezas
- `users.service.ts` — búsqueda por id/email y creación (usado por `auth`).

## Pendiente (ver `docs/ROADMAP.md` Fase 0)
- Campos de perfil: `username`, `cedula`, `role`, `bio`, `avatarKey`.
- Endpoints `GET/PATCH /api/users/me` y `GET /api/users/:username` (perfil público).

## Reglas del módulo
- Nunca exponer `passwordHash` ni `cedula` en respuestas públicas; la cédula es dato sensible de
  registro, no de perfil.
- Todo campo nuevo de usuario se documenta en `docs/DATA-MODEL.md`.
