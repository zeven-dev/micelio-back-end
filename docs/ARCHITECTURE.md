# Micelio — Arquitectura del back-end

Decisión tomada el 2026-08-31 con el dueño del producto. Todo agente debe respetarla; si una
tarea la contradice, se detiene y se consulta antes de romperla.

## Decisión: monolito modular con principios de Clean Architecture

Se evaluó adoptar Clean Architecture "de libro" (entidades de dominio separadas de Prisma,
casos de uso, puertos y adaptadores en todas partes). **Decisión: no adoptar el ceremonial
completo**, sino un monolito modular NestJS con las reglas de dependencia de Clean Architecture
aplicadas con pragmatismo.

**Por qué:** el equipo son agentes construyendo por fases; NestJS ya aporta inyección de
dependencias, módulos y testabilidad. Duplicar cada modelo (entidad de dominio + modelo Prisma
+ mappers) multiplica la superficie de código y el margen de error sin beneficio a esta escala.
Lo que sí importa de Clean Architecture — dependencias apuntando hacia el dominio, dominios
aislados, infraestructura intercambiable — se logra con las reglas de abajo.

## Reglas de arquitectura (obligatorias)

1. **Capas dentro de cada módulo.** `controller (HTTP + DTOs) → service (lógica de negocio) →
   Prisma (datos)`. Nada salta capas: los controladores no tocan Prisma; la lógica no vive en
   controladores.
2. **Frontera entre módulos.** Un módulo NUNCA consulta las tablas de otro dominio con Prisma.
   Cruce de dominios solo por: (a) el servicio público exportado del otro módulo, o (b) eventos
   de dominio.
3. **Eventos de dominio como columna vertebral.** Se usa `@nestjs/event-emitter`. Toda acción
   relevante emite un evento tipado (`post.liked`, `post.unliked`, `comment.created`,
   `post.saved`, `post.unsaved`, `post.shared`, `message.sent`, `post.created`,
   `user.followed`…) definido en `src/events/` (contratos compartidos, sin lógica). *Por qué:*
   desacopla productores de consumidores y hace posibles los módulos que solo consumen eventos
   (`notifications`, `ranking`).
4. **Infraestructura detrás de interfaces.** Todo servicio externo se abstrae como el actual
   `StorageService` (interfaz + implementación): futuro proveedor de pagos, futura validación
   contra la base de datos de la Universidad de Antioquia. Cambiar de proveedor no debe tocar
   dominios.
5. **Módulos extraíbles se marcan y se aíslan.** Un módulo diseñado para volverse microservicio
   (hoy: `notifications`) cumple reglas extra — ver siguiente sección.

## `notifications`: módulo aislado y extraíble

Decisión del dueño del producto: empieza dentro del monolito, pero organizado y documentado
para extraerse a microservicio con mínimo esfuerzo.

Reglas específicas:
- Vive en `src/notifications/` con estructura de servicio autónomo y su propio `AGENTS.md`.
- **Solo consume eventos** (`@OnEvent`) y expone su API de lectura (`GET /api/notifications`,
  marcar leídas) y su emisión en tiempo real (namespace de socket propio). Ningún otro módulo
  importa nada de `notifications`, y `notifications` no importa servicios de otros dominios:
  todo lo que necesita viaja en el payload del evento (denormalizado a propósito).
- Tablas propias (prefijo `notification_`), sin FKs hacia tablas de otros dominios — guarda ids
  "en frío". *Por qué:* al extraerlo, sus tablas se van con él sin romper integridad.
- **Plan de extracción documentado** en `src/notifications/AGENTS.md` cuando se implemente:
  sustituir EventEmitter por un broker (p. ej. Redis/RabbitMQ), mover carpeta + tablas al nuevo
  repo (lo crea el dueño del producto), apuntar el gateway de sockets. Nada más debería cambiar.

## Estructura de carpetas resultante

```
src/
  events/          # contratos de eventos de dominio (tipos + nombres), sin lógica
  auth/ users/ folders/ files/ posts/ social/ chat/ market/ search/ groups/ admin/
  ranking/         # afinidad y ranking: escribe sus tablas SOLO desde listeners de eventos;
                   # expone RankingService de lectura (effA/effT) para feed/explore/búsqueda
  notifications/   # módulo extraíble (reglas especiales arriba)
  storage/ prisma/ common/ config/
```

## Qué NO hacer

- No crear capas `domain/`, `use-cases/`, `infrastructure/` genéricas "por si acaso".
- No introducir un broker de mensajes todavía: EventEmitter interno hasta que la extracción sea
  real.
- No compartir DTOs/tipos entre módulos por conveniencia: cada módulo declara los suyos; lo
  compartido de verdad va a `src/events/` o `src/common`.

Cualquier evolución de estas reglas se documenta aquí con fecha y motivo.
