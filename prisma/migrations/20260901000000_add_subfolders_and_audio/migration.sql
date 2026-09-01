-- AlterEnum
ALTER TYPE "FileType" ADD VALUE 'AUDIO';

-- DropIndex
DROP INDEX "folders_userId_name_key";

-- AlterTable
ALTER TABLE "folders" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "folders_userId_parentId_idx" ON "folders"("userId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "folders_userId_parentId_name_key" ON "folders"("userId", "parentId", "name");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
-- En Postgres dos NULL son distintos, así que `folders_userId_parentId_name_key` no impide
-- dos carpetas raíz con el mismo nombre. Este índice parcial cubre justo ese caso; Prisma no
-- sabe expresarlo en el schema, por eso va escrito a mano aquí (ver comentario en `Folder`).
CREATE UNIQUE INDEX "folders_userId_name_root_key" ON "folders"("userId", "name") WHERE "parentId" IS NULL;
