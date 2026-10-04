-- AlterTable
ALTER TABLE "CMoonEnemyFaction" ADD COLUMN     "defaultAppearSoundPath" TEXT,
ADD COLUMN     "defaultAttackingSoundPath" TEXT,
ADD COLUMN     "defaultDamageAvoidedSoundPath" TEXT,
ADD COLUMN     "defaultDamageTakenSoundPath" TEXT,
ADD COLUMN     "defaultDefeatSoundPath" TEXT,
ADD COLUMN     "defaultVictorySoundPath" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "occurrencePercent" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnemyHigherTierFirst" BOOLEAN NOT NULL DEFAULT false;
