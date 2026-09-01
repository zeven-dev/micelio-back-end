-- CreateEnum
CREATE TYPE "FeedLayout" AS ENUM ('GRID', 'MASONRY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "feedColumns" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "feedGap" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "feedLayout" "FeedLayout" NOT NULL DEFAULT 'GRID';

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_authorId_position_idx" ON "posts"("authorId", "position");

-- CreateIndex
CREATE INDEX "posts_tags_idx" ON "posts" USING GIN ("tags" array_ops);

-- CreateIndex
CREATE INDEX "post_media_postId_order_idx" ON "post_media"("postId", "order");

-- CreateIndex
CREATE INDEX "post_media_fileAssetId_idx" ON "post_media"("fileAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_postId_fileAssetId_key" ON "post_media"("postId", "fileAssetId");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

