-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boosterSince" TIMESTAMP(3),
ADD COLUMN     "isBooster" BOOLEAN NOT NULL DEFAULT false;
