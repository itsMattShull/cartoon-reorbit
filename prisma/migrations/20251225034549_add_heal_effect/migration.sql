-- CreateEnum
CREATE TYPE "ItemEffect" AS ENUM ('HEAL');

-- AlterTable
ALTER TABLE "ItemDefinition" ADD COLUMN     "effect" "ItemEffect" NOT NULL DEFAULT 'HEAL';
