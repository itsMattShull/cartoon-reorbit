/*
  Warnings:

  - You are about to drop the column `index` on the `ScavengerStep` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[storyId,layer,path]` on the table `ScavengerStep` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `layer` to the `ScavengerStep` table without a default value. This is not possible if the table is not empty.
  - Added the required column `path` to the `ScavengerStep` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ScavengerStep_storyId_index_key";

-- AlterTable
ALTER TABLE "ScavengerStep" DROP COLUMN "index",
ADD COLUMN     "layer" INTEGER NOT NULL,
ADD COLUMN     "path" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ScavengerStep_storyId_layer_path_key" ON "ScavengerStep"("storyId", "layer", "path");
