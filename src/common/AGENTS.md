# Módulo `common`

**Responsabilidad:** piezas transversales sin dominio propio.

## Piezas
- `filters/http-exception.filter.ts` — formato uniforme de errores.
- `interceptors/transform.interceptor.ts` — envoltura uniforme de respuestas.
- `decorators/public.decorator.ts` — marca endpoints públicos (excepción al guard JWT global).
- `decorators/current-user.decorator.ts` — inyecta el usuario autenticado.

## Pendiente (Fase 0)
- `@Roles(...)` + `RolesGuard` para los 4 tipos de usuario.

## Reglas del módulo
- Solo entra aquí lo verdaderamente transversal; si algo pertenece a un dominio, va a su módulo.
- Cambiar el formato de respuesta/errores rompe a los dos clientes: coordinar y registrar en
  `docs/PROCESSES.md`.
