-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'TEACHER', 'ADMIN', 'SUPPORT');

-- AlterTable
-- `cedula` y `username` son NOT NULL + UNIQUE en el modelo final, pero se agregan
-- nullable para poder rellenar las filas que ya existían antes de la Fase 0. Sin este
-- paso, la migración falla ("column contains null values") en cualquier base que ya
-- tenga usuarios (la creada por 20260826000000_init).
ALTER TABLE "users" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "cedula" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'USER',
ADD COLUMN     "username" TEXT;

-- Relleno determinista y único a partir del id (uuid), solo para usuarios anteriores:
--   username -> `u_` + 28 hex, que cumple el formato `^[a-z0-9_.]{3,30}$` del registro.
UPDATE "users"
SET "username" = 'u_' || substr(replace("id", '-', ''), 1, 28)
WHERE "username" IS NULL;

--   cedula   -> marcador con letras, imposible de confundir con una cédula real
--               (el registro exige `^[0-9]{6,10}$`). Estos usuarios deben volver a
--               capturarla; ver docs/DATA-MODEL.md.
UPDATE "users"
SET "cedula" = 'PENDIENTE-' || replace("id", '-', '')
WHERE "cedula" IS NULL;

-- Ya sin nulos: se aplican las restricciones definitivas del modelo.
ALTER TABLE "users" ALTER COLUMN "cedula" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_cedula_key" ON "users"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
