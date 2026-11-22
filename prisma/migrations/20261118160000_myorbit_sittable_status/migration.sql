-- AlterTable
ALTER TABLE "MyOrbitFurniture" ADD COLUMN     "sittable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "myOrbitStatus" TEXT;
