-- CreateEnum
CREATE TYPE "CMoonEffectType" AS ENUM ('GLITCH', 'SLIME');

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN     "effectType" "CMoonEffectType";
