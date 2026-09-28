-- AlterTable
ALTER TABLE "CMoonEnemyFaction" ADD COLUMN     "appearEffectId" TEXT;

-- AlterTable
ALTER TABLE "CMoonEnemyMember" ADD COLUMN     "appearSoundPath" TEXT,
ADD COLUMN     "attackingSoundPath" TEXT,
ADD COLUMN     "damageAvoidedSoundPath" TEXT,
ADD COLUMN     "damageTakenSoundPath" TEXT,
ADD COLUMN     "defeatSoundPath" TEXT,
ADD COLUMN     "victorySoundPath" TEXT;

-- AddForeignKey
ALTER TABLE "CMoonEnemyFaction" ADD CONSTRAINT "CMoonEnemyFaction_appearEffectId_fkey" FOREIGN KEY ("appearEffectId") REFERENCES "CMoonJoinEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
