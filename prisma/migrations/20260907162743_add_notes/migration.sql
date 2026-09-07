-- CreateEnum
CREATE TYPE "PostKind" AS ENUM ('MEDIA', 'NOTE');

-- CreateEnum
CREATE TYPE "PostBlockType" AS ENUM ('PARAGRAPH', 'HEADING', 'QUOTE', 'IMAGE');

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "coverFileAssetId" TEXT,
ADD COLUMN     "kind" "PostKind" NOT NULL DEFAULT 'MEDIA',
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "post_blocks" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "PostBlockType" NOT NULL,
    "text" TEXT,
    "fileAssetId" TEXT,
    "caption" TEXT,

    CONSTRAINT "post_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_blocks_fileAssetId_idx" ON "post_blocks"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "post_blocks_postId_position_key" ON "post_blocks"("postId", "position");

-- CreateIndex
CREATE INDEX "posts_authorId_kind_createdAt_idx" ON "posts"("authorId", "kind", "createdAt");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_coverFileAssetId_fkey" FOREIGN KEY ("coverFileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_blocks" ADD CONSTRAINT "post_blocks_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_blocks" ADD CONSTRAINT "post_blocks_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
