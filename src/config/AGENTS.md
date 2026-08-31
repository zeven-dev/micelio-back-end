# Módulo `config`

**Responsabilidad:** configuración tipada (`configuration.ts`) y validación de variables de
entorno con Joi (`env.validation.ts`).

## Reglas del módulo
- Toda variable de entorno nueva se agrega en TRES sitios en la misma tarea:
  `env.validation.ts` (validación), `configuration.ts` (acceso tipado) y `.env.example`
  (documentación con valor de desarrollo).
- Ningún módulo lee `process.env` directamente: siempre `ConfigService`.
- Sin valores por defecto peligrosos: secretos sin default; la app debe negarse a arrancar si
  falta algo crítico.
