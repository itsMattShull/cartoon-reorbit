-- AlterTable
ALTER TABLE "User" ADD COLUMN     "equippedGlowCMoonId" TEXT;

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" ADD COLUMN     "grantsGlow" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserCMoonGlow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCMoonGlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCMoonGlow_userId_cMoonId_key" ON "UserCMoonGlow"("userId", "cMoonId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_equippedGlowCMoonId_fkey" FOREIGN KEY ("equippedGlowCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
