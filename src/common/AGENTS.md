# Módulo `common`

**Responsabilidad:** piezas transversales sin dominio propio.

## Piezas
- `filters/http-exception.filter.ts` — formato uniforme de errores.
- `interceptors/transform.interceptor.ts` — envoltura uniforme de respuestas.
- `decorators/public.decorator.ts` — marca endpoints públicos (excepción al guard JWT global).
- `decorators/current-user.decorator.ts` — inyecta el usuario autenticado.
- `decorators/optional-auth.decorator.ts` — `@OptionalAuth()`: la ruta responde con o sin
  sesión. Sin cabecera `Authorization` pasa como anónimo; **con** cabecera, el token debe ser
  válido o es `401` (para no degradar en silencio a un usuario con el token expirado). Distinto
  de `@Public()`, que ignora el token aunque venga. Úsalo solo donde la respuesta dependa de si
  hay viewer; hoy solo `GET /api/users/:username`.
- `decorators/roles.decorator.ts` — `@Roles(...Role[])`, guarda metadata `ROLES_KEY`. Exporta
  también `ALL_ROLES` (los cuatro roles) para endpoints abiertos a cualquier sesión.
- `guards/roles.guard.ts` — `RolesGuard`, **fail-closed**: si la ruta es `@Public()` pasa; si no
  lo es y no declara `@Roles(...)`, responde `500` nombrando controlador y handler (es un error
  de programación, no una ruta abierta); si los declara, exige que `request.user.role` esté en
  la lista o responde `403`. Se registra como `APP_GUARD` en `src/auth/auth.module.ts`,
  **después** de `JwtAuthGuard` (necesita `request.user` ya poblado).

## Reglas del módulo
- **Todo endpoint nuevo declara `@Roles(...)` o `@Public()`.** No es una convención que haya que
  recordar: `RolesGuard` rechaza la ruta que no lo haga (regla 8 de `AGENTS.md` raíz). Para un
  endpoint abierto a cualquier sesión autenticada se usa `@Roles(...ALL_ROLES)`.
- Solo entra aquí lo verdaderamente transversal; si algo pertenece a un dominio, va a su módulo.
- Cambiar el formato de respuesta/errores rompe a los dos clientes: coordinar y registrar en
  `docs/PROCESSES.md`.
