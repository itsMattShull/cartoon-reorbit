-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'REFLECT_DAMAGE';
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'SIPHON_HEALTH';

-- AlterTable
ALTER TABLE "CMoonSpecialAttack" ADD COLUMN     "reflectPercent" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "siphonPercent" INTEGER NOT NULL DEFAULT 50;
