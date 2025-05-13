-- AlterTable
ALTER TABLE "Ctoon" ADD COLUMN     "initialQuantity" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserCtoon" ADD COLUMN     "isFirstEdition" BOOLEAN NOT NULL DEFAULT false;
