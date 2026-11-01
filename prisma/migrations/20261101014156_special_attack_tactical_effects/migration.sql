-- AlterEnum
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'POISON_OPPONENT';
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'CLEANSE_SELF';
ALTER TYPE "CMoonSpecialAttackEffectType" ADD VALUE 'SHIELD_PARTY';

-- AlterTable
ALTER TABLE "CMoonSpecialAttack" ADD COLUMN     "poisonDurationRounds" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "cleanseAlsoHeals" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredHitStreak" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "accuracyPercent" INTEGER NOT NULL DEFAULT 100;
