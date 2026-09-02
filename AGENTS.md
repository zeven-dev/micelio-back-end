# Micelio — Back-end (AGENTS.md)

Este documento es la puerta de entrada para cualquier agente que trabaje en este repositorio.
Léelo completo antes de tocar código. Aquí están las reglas del proyecto, el mapa de módulos y
los enlaces a la documentación que **debes** mantener actualizada.

Micelio es una red social de arte y elementos audiovisuales (tipo Instagram/Tumblr) pensada como
repositorio y comunidad digital para que artistas compartan sus procesos. Este repo es la API
(NestJS + Prisma + PostgreSQL + S3). La visión completa del producto está en
[`docs/PRODUCT.md`](docs/PRODUCT.md) — **este repositorio es la copia canónica** de ese
documento; los repos `micelio-front-end` y `micelio-app` llevan copias que deben mantenerse
sincronizadas.

## Documentación obligatoria

| Documento | Qué contiene | Cuándo actualizarlo |
| --- | --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Visión del producto, tipos de usuario, funcionalidades y decisiones | Cuando cambie el alcance funcional |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura decidida: capas, eventos, módulos extraíbles | Solo con acuerdo del dueño del producto |
| [`docs/STATUS.md`](docs/STATUS.md) | Bitácora: descarga de conocimiento por tarea/fase | **Al terminar cada tarea y cada fase** |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Todas las entidades: actuales y objetivo, con relaciones y razones | **Siempre** que se toque `prisma/schema.prisma` |
| [`docs/PROCESSES.md`](docs/PROCESSES.md) | Registro de procesos: qué hacen, dónde viven, por qué existen | **Siempre** que se cree, modifique o elimine un proceso/flujo |
| [`docs/API-CONTRACTS.md`](docs/API-CONTRACTS.md) | Formas exactas de peticiones/respuestas y algoritmo del feed | **Siempre** que se cree o cambie un contrato de endpoint |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Lista de tareas por fases: qué hacer, cómo, por qué y dónde | Al completar o replantear una tarea |
| [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) | Protocolo jefe+hijos entre los tres repos: orden de fase, verificación, cuándo pausar | Solo con acuerdo del dueño del producto |
| `src/<módulo>/AGENTS.md` | Contrato y lineamientos del módulo | Al terminar cualquier tarea que toque el módulo |

## Reglas para agentes (obligatorias, sin excepción)

1. **Commits cortos y concretos.** Una sola línea imperativa, específica, idealmente ≤ 72
   caracteres (ej. `Add role enum to User`). Prohibidos los cuerpos largos, las listas de
   archivos tocados y las descripciones extensas de "qué se hizo". Si el commit necesita mucha
   explicación, la explicación va en la documentación, no en el commit.
2. **Nada queda "al aire".** Una tarea no está terminada hasta que la documentación de la tabla
   anterior refleje el cambio: qué se hizo, dónde está, por qué existe y cómo encontrarlo.
3. **Descarga de conocimiento.** Al terminar cada tarea y al cerrar cada fase, se agrega una
   entrada en `docs/STATUS.md`: qué quedó **listo**, qué **falta**, qué se **necesita** y qué
   **sigue**. Es la foto del estado del proyecto para el siguiente agente.
4. **Respeta `docs/ARCHITECTURE.md`.** Capas por módulo, cruce de dominios solo por servicios
   públicos o eventos, `notifications` aislado y extraíble. Si una tarea la contradice, se
   consulta antes de romperla.
5. **Entidades siempre trazables.** Cualquier cambio en `prisma/schema.prisma` exige actualizar
   `docs/DATA-MODEL.md` en el mismo commit o en la misma tarea: campo nuevo, relación nueva,
   enum nuevo — todo con su porqué. Toda migración se genera con `npm run prisma:migrate`
   con un nombre descriptivo corto; nunca se editan migraciones ya aplicadas.
6. **Procesos siempre documentados.** Si creas, ajustas o eliminas un flujo (un endpoint nuevo,
   un job, un listener de sockets, un interceptor), regístralo en `docs/PROCESSES.md` para que
   el siguiente agente sepa dónde buscar, qué buscar y por qué.
7. **Respeta la arquitectura por módulos.** Cada dominio vive en su carpeta bajo `src/` con su
   propio `AGENTS.md`. No mezcles dominios: el acceso a datos de un dominio se hace a través de
   su servicio, no consultando Prisma desde otro módulo.
8. **Seguridad y permisos primero.** Todo endpoint es privado por defecto (guard JWT global);
   lo público se marca con `@Public()`. Todo endpoint declara explícitamente qué roles pueden
   usarlo con `@Roles(...)` — y esto **no depende de tu memoria**: `RolesGuard` es fail-closed y
   rechaza cualquier ruta que no sea `@Public()` y no declare roles. Para un endpoint abierto a
   cualquier sesión, `@Roles(...ALL_ROLES)`.
9. **Los archivos nunca tocan disco local.** Todo binario va a S3 vía `StorageService`
   (buffer en memoria). No introduzcas escritura a filesystem.
10. **Valida todo lo que entra.** DTOs con `class-validator` para cada endpoint; variables de
   entorno nuevas se agregan a `src/config/env.validation.ts`, `src/config/configuration.ts` y
   `.env.example`.
11. **Pruebas.** Los servicios con lógica de negocio llevan spec (`*.spec.ts`). `npm run lint`,
   `npm run build` y `npm test` deben pasar antes de cualquier push.
12. **Consistencia con los clientes.** Cambios de contrato (rutas, formas de respuesta) se
    documentan en Swagger (decoradores) y se anotan en `docs/PROCESSES.md`, porque hay dos
    clientes (web y app) consumiendo la misma API. Todo DTO de respuesta nuevo lleva
    `@ApiProperty`/`@ApiPropertyOptional` completos — no basta con que compile, tiene que
    aparecer bien formado en `npm run api:export` (`docs/openapi.json`), porque de ahí generan
    sus tipos `micelio-front-end` y `micelio-app` (`npm run sync:api`). Corre `api:export` antes
    de cerrar cualquier tarea que toque un contrato.

## Stack

- **NestJS 10** + TypeScript, prefijo global `/api`, Swagger en `/api/docs`
- **PostgreSQL** vía **Prisma ORM** (migraciones versionadas)
- **JWT**: access token corto en memoria del cliente + refresh token (cookie httpOnly para web,
  body para móvil)
- **AWS SDK v3** contra S3 (MinIO en desarrollo, ver `docker-compose.yml`)
- **Jest** para pruebas

## Mapa de módulos

| Módulo | Responsabilidad | Doc |
| --- | --- | --- |
| `src/auth` | Registro, login, refresh, logout; estrategias y guards JWT | [`src/auth/AGENTS.md`](src/auth/AGENTS.md) |
| `src/users` | Acceso a datos de usuario, perfil propio y público | [`src/users/AGENTS.md`](src/users/AGENTS.md) |
| `src/admin` | Germen de administración: asignación de roles | [`src/admin/AGENTS.md`](src/admin/AGENTS.md) |
| `src/events` | Contratos de eventos de dominio (tipos + nombres, sin lógica) | [`src/events/AGENTS.md`](src/events/AGENTS.md) |
| `src/folders` | CRUD de carpetas (proyectos) por usuario | [`src/folders/AGENTS.md`](src/folders/AGENTS.md) |
| `src/files` | Subida/listado/borrado de archivos dentro de carpetas | [`src/files/AGENTS.md`](src/files/AGENTS.md) |
| `src/posts` | Publicaciones, etiquetas, feed propio y home feed | [`src/posts/AGENTS.md`](src/posts/AGENTS.md) |
| `src/social` | Follows, favoritos y la regla de visibilidad | [`src/social/AGENTS.md`](src/social/AGENTS.md) |
| `src/storage` | Abstracción de almacenamiento (interfaz + S3) | [`src/storage/AGENTS.md`](src/storage/AGENTS.md) |
| `src/prisma` | Cliente Prisma como módulo global | [`src/prisma/AGENTS.md`](src/prisma/AGENTS.md) |
| `src/common` | Filtros, interceptores, guards y decoradores transversales | [`src/common/AGENTS.md`](src/common/AGENTS.md) |
| `src/config` | Configuración tipada y validación de entorno | [`src/config/AGENTS.md`](src/config/AGENTS.md) |

`social` se amplía en la Fase 4 con likes, guardados y comentarios. El **home feed** quedó en
`posts` y no en `social` (desviación documentada en `ARCHITECTURE.md`: ponerlo en `social`
habría hecho circular la dependencia con `posts`).

Módulos futuros planificados (ver `docs/ROADMAP.md` y `docs/ARCHITECTURE.md`):
`ranking` (afinidad y ranking personalizado, solo eventos), `chat` (WebSockets),
`notifications` (**extraíble**), `market`, `search`, `groups` (profesores). `admin` se amplía
en la Fase 11 (hoy solo tiene el endpoint de rol).

## Comandos

```bash
docker compose up -d        # Postgres + MinIO locales
npm run prisma:migrate      # migraciones
npm run start:dev           # API en http://localhost:3000/api
npm run lint && npm run build && npm test
npm run api:export          # regenera docs/openapi.json (fuente de tipos para web y app)
```
