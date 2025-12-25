/*
  Warnings:

  - Added the required column `maxHealth` to the `UserMonster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserMonster" ADD COLUMN     "maxHealth" INTEGER NOT NULL;
