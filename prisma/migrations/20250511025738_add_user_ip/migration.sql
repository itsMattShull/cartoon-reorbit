/*
  Warnings:

  - You are about to drop the column `createdAt` on the `UserIP` table. All the data in the column will be lost.
  - You are about to drop the column `ipAddress` on the `UserIP` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,ip]` on the table `UserIP` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `ip` to the `UserIP` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserIP" DROP COLUMN "createdAt",
DROP COLUMN "ipAddress",
ADD COLUMN     "ip" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserIP_userId_ip_key" ON "UserIP"("userId", "ip");
