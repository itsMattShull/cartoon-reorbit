/*
  Warnings:

  - You are about to drop the `EmailLoginCode` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `discordId` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "discordId" SET NOT NULL;

-- DropTable
DROP TABLE "EmailLoginCode";
