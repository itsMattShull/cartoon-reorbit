/*
  Warnings:

  - You are about to drop the column `quantity` on the `UserCtoon` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "UserCtoon_userId_ctoonId_key";

-- AlterTable
ALTER TABLE "UserCtoon" DROP COLUMN "quantity";
