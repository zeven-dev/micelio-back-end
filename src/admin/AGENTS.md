# Módulo `admin`

**Responsabilidad hoy (Fase 0):** germen del módulo de administración — un único endpoint para
que un ADMIN otorgue roles. La visualización global (usuarios, recursos, chats) y la delegación
a SUPPORT llegan en la Fase 11 (`docs/ROADMAP.md`); no se implementa nada de eso aquí todavía.

## Contrato actual
- `PATCH /api/admin/users/:id/role` — body `{ "role": "USER|TEACHER|ADMIN|SUPPORT" }`,
  protegido con `@Roles(Role.ADMIN)`. Devuelve `{ id, username, role }`. `404` si el usuario no
  existe, `403` si el caller no es ADMIN (vía `RolesGuard`, ver `src/common/AGENTS.md`).

## Piezas
- `admin.controller.ts` — el único controlador; delega en `UsersService.updateRole`
  (no hay `admin.service.ts` propio todavía: no hay lógica de negocio que no sea la de
  `users`).

## Reglas del módulo
- No consultar la tabla `users` con Prisma directamente: siempre a través de
  `UsersService` (frontera entre módulos, ver `docs/ARCHITECTURE.md`).
- Al ampliar este módulo en la Fase 11 (visualización global, `SupportGrant`), documentar aquí
  el contrato y en `docs/PROCESSES.md`.
