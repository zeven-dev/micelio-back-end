# Módulo `common`

**Responsabilidad:** piezas transversales sin dominio propio.

## Piezas
- `filters/http-exception.filter.ts` — formato uniforme de errores.
- `interceptors/transform.interceptor.ts` — envoltura uniforme de respuestas.
- `decorators/public.decorator.ts` — marca endpoints públicos (excepción al guard JWT global).
- `decorators/current-user.decorator.ts` — inyecta el usuario autenticado.
- `decorators/roles.decorator.ts` — `@Roles(...Role[])`, guarda metadata `ROLES_KEY`.
- `guards/roles.guard.ts` — `RolesGuard`: sin `@Roles` en el handler, permite el acceso; con
  `@Roles`, exige que `request.user.role` esté en la lista o responde `403`. Se registra como
  `APP_GUARD` en `src/auth/auth.module.ts`, **después** de `JwtAuthGuard` (necesita
  `request.user` ya poblado).

## Reglas del módulo
- Solo entra aquí lo verdaderamente transversal; si algo pertenece a un dominio, va a su módulo.
- Cambiar el formato de respuesta/errores rompe a los dos clientes: coordinar y registrar en
  `docs/PROCESSES.md`.
