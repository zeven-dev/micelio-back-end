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
   `user.followed`, `folder.deleted`…) definido en `src/events/` (contratos compartidos, sin
   lógica). *Por qué:* desacopla productores de consumidores y hace posibles los módulos que
   solo consumen eventos (`notifications`, `ranking`).
   *(`folder.deleted` se agregó el 2026-09-02, con acuerdo del dueño, para que `files` limpie
   los binarios de S3 al borrarse una carpeta sin que `folders` tenga que conocer sus tablas:
   es el primer caso donde un evento resuelve una dependencia que sería circular.)*
4. **Infraestructura detrás de interfaces.** Todo servicio externo se abstrae como el actual
   `StorageService` (interfaz + implementación): futuro proveedor de pagos, futura validación
   contra la base de datos de la Universidad de Antioquia. Cambiar de proveedor no debe tocar
   dominios.
5. **Módulos extraíbles se marcan y se aíslan.** Un módulo diseñado para volverse microservicio
   (hoy: `notifications`) cumple reglas extra — ver siguiente sección.

### Desviaciones documentadas (a revisar por el dueño)

1. **`GET /api/feed` vive en `posts`, no en `social`** (Fase 3, 2026-09-02). El home necesita
   leer publicaciones y `posts` necesita la regla de visibilidad de `social`: ponerlo en `social`
   habría creado una dependencia circular entre dos módulos de dominio. El resto de lo que
   anuncia `AGENTS.md` para `social` (follows, favoritos, visibilidad) sí vive ahí. **Nota
   histórica:** durante la Fase 4 (2026-09-03), like/guardar/comentar se implementaron en
   `social` y necesitaban el post, así que la dirección única que esta decisión buscaba dejó de
   sostenerse por un rato (`social` terminó dependiendo también de `posts`). El refactor del
   mismo día (entrada 3, abajo) movió esa lógica a `posts` y la dirección única volvió a
   sostenerse.
2. **`users` y `social` se inyectan con `forwardRef`** (Fase 3). Es un ciclo real del dominio, no
   un descuido: el perfil muestra conteos del grafo y el grafo resuelve usernames y arma vistas
   de usuario. Se mantiene la regla de oro —el cruce es por **servicio público**, nunca por las
   tablas del otro módulo—; `forwardRef` es solo cómo NestJS resuelve ese ciclo. Sigue siendo el
   único ciclo real que queda en el proyecto tras la entrada 3.
3. **El ciclo de tres módulos (`users` ↔ `social` ↔ `posts`) de la Fase 4 se deshizo el mismo
   día** (2026-09-03). La entrada anterior de este documento dejó pendiente decidirlo con el
   dueño; la decisión fue mover like/guardar/comentar de `social` a `posts` (donde ya vive el
   resto del contenido), en vez de aceptar el ciclo de tres como arquitectura estable. Detalle
   completo del refactor en `docs/PROCESSES.md` ("Ciclo `posts` ↔ `social`"); en corto: `social`
   ya no importa `PostsModule` en absoluto, así que el borde `posts → social` (grafo del home)
   volvió a ser de una sola dirección, sin `forwardRef`, y el `forwardRef` que `posts` tenía
   sobre `UsersModule` desde la Fase 4 (necesario solo por compartir camino de carga con el ciclo
   de tres) tampoco hizo falta más — se confirmó arrancando el `AppModule` real
   (`npm run api:export`) sin él. El único ciclo real que queda es el de la entrada 2
   (`users` ↔ `social`), sin cambios.

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
