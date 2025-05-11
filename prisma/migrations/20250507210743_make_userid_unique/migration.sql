/*
  Warnings:

  - You are about to drop the column `isPublic` on the `CZone` table. All the data in the column will be lost.
  - You are about to drop the column `lastEdited` on the `CZone` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId]` on the table `CZone` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `CZone` table without a default value. This is not possible if the table is not empty.
  - Made the column `background` on table `CZone` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CZone" DROP COLUMN "isPublic",
DROP COLUMN "lastEdited",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "background" SET NOT NULL,
ALTER COLUMN "layoutData" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "CZone_userId_key" ON "CZone"("userId");
