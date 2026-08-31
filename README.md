# Micelio API
> **Antes de trabajar en este repo:** lee [`AGENTS.md`](AGENTS.md) (reglas y mapa) y la
> documentación en [`docs/`](docs/) — producto, hoja de ruta y bitácora de estado.

Backend de Micelio construido con [NestJS](https://nestjs.com/). Expone autenticación por
correo/contraseña y un módulo de carpetas donde los usuarios pueden subir imágenes, videos y
archivos de texto, almacenados en **Amazon S3** (o cualquier servicio compatible con S3, como
MinIO en desarrollo local).

## Stack

- **NestJS 10** + TypeScript
- **PostgreSQL** vía **Prisma ORM**
- **JWT** (access token corto + refresh token en cookie httpOnly)
- **AWS SDK v3** (`@aws-sdk/client-s3`) para almacenamiento de archivos
- **Swagger** para documentación de la API (`/api/docs`)
- **Jest** para pruebas unitarias y e2e

## Estructura

```
src/
  auth/        # registro, login, refresh, guards y estrategias JWT
  users/       # acceso a datos de usuario
  folders/     # CRUD de carpetas por usuario
  files/       # subida/listado/borrado de archivos dentro de una carpeta
  storage/     # abstracción de almacenamiento (interfaz + implementación S3)
  prisma/      # cliente Prisma como módulo global
  common/      # filtros, interceptores y decoradores compartidos
  config/      # configuración tipada + validación de variables de entorno
prisma/
  schema.prisma
```

## Requisitos

- Node.js 20+
- Docker (para levantar Postgres y MinIO localmente)

## Puesta en marcha local

```bash
cp .env.example .env
npm install

# Levanta PostgreSQL y MinIO (S3-compatible) para desarrollo
docker compose up -d

npm run prisma:migrate
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api`, y la documentación Swagger en
`http://localhost:3000/api/docs`.

## Almacenamiento de archivos (S3)

El módulo `storage` define una interfaz `StorageService` (`upload`, `getSignedDownloadUrl`,
`delete`) con una única implementación basada en el SDK de AWS S3. Los archivos **nunca se
guardan en disco local**: se reciben en memoria (Multer) y se suben directamente al bucket.

- **Desarrollo local**: `docker-compose.yml` levanta un contenedor de **MinIO** (S3-compatible)
  y crea automáticamente el bucket `micelio-files`. Las variables `AWS_S3_ENDPOINT` y
  `AWS_S3_FORCE_PATH_STYLE=true` en `.env.example` apuntan la app a ese MinIO local.
- **Producción**: crea un bucket real en Amazon S3, genera credenciales de un usuario/rol IAM con
  permisos `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre ese bucket, y configura:
  ```
  AWS_REGION=us-east-1
  AWS_S3_BUCKET=tu-bucket
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  AWS_S3_ENDPOINT=        # vacío -> usa el endpoint real de AWS
  AWS_S3_FORCE_PATH_STYLE=false
  ```
  No se requiere ningún otro cambio de código para pasar de MinIO a S3 real.

Las URLs de descarga/preview que devuelve la API son **URLs firmadas** (expiran a los
`AWS_S3_SIGNED_URL_EXPIRES_IN` segundos configurados), por lo que el bucket puede permanecer
privado.

## Autenticación desde clientes móviles

El navegador recibe el refresh token únicamente en una cookie `httpOnly` (no accesible desde JS,
para mitigar robo por XSS). React Native no tiene un cookie jar persistente equivalente, así que
un cliente que envíe el header `X-Client-Type: mobile` en `/auth/register`, `/auth/login` y
`/auth/refresh` recibe además el `refreshToken` en el cuerpo de la respuesta JSON, para que la
app lo guarde en almacenamiento seguro (Keychain/Keystore) y lo reenvíe como
`Authorization: Bearer <refreshToken>` al llamar a `/auth/refresh`. Sin ese header, el
comportamiento es el mismo de siempre (solo cookie).

## Modelo de datos

- `User` — email + hash de contraseña (bcrypt).
- `Folder` — carpeta de un usuario (nombre único por usuario, sin anidamiento en esta versión).
- `FileAsset` — archivo (imagen, video o texto) dentro de una carpeta, con su `key` de S3.

## Scripts

| Comando                  | Descripción                                   |
| ------------------------- | ---------------------------------------------- |
| `npm run start:dev`       | Levanta la API en modo watch                   |
| `npm run build`           | Compila a `dist/`                              |
| `npm run test`            | Pruebas unitarias                              |
| `npm run test:e2e`        | Pruebas e2e (requiere Postgres levantado)      |
| `npm run prisma:migrate`  | Crea/aplica migraciones en desarrollo          |
| `npm run prisma:studio`   | Explorador visual de la base de datos          |

## API principal

| Método | Ruta                        | Descripción                              |
| ------ | --------------------------- | ----------------------------------------- |
| POST   | `/api/auth/register`        | Crea una cuenta                           |
| POST   | `/api/auth/login`           | Inicia sesión                             |
| POST   | `/api/auth/refresh`         | Renueva el access token (cookie refresh)  |
| POST   | `/api/auth/logout`          | Cierra sesión                             |
| GET    | `/api/users/me`             | Perfil propio (`Me`: `UserPublic` + email + rol) |
| PATCH  | `/api/users/me`             | Edita nombre, bio y visibilidad del perfil |
| PATCH  | `/api/users/me/avatar`      | Sube el avatar (multipart)                |
| GET    | `/api/users/:username`      | Perfil público (limitado si es privado)   |
| PATCH  | `/api/admin/users/:id/role` | Asigna un rol (solo ADMIN)                |
| GET    | `/api/health`               | Health check (público)                    |
| GET    | `/api/folders`              | Lista carpetas del usuario                |
| POST   | `/api/folders`              | Crea una carpeta                          |
| PATCH  | `/api/folders/:id`          | Renombra una carpeta                      |
| DELETE | `/api/folders/:id`          | Elimina una carpeta (y sus archivos)      |
| GET    | `/api/folders/:id/files`    | Lista archivos de una carpeta             |
| POST   | `/api/folders/:id/files`    | Sube un archivo a la carpeta (multipart)  |
| DELETE | `/api/files/:id`            | Elimina un archivo                        |
