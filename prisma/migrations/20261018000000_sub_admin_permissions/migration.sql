-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "adminRestricted" BOOLEAN NOT NULL DEFAULT false;
