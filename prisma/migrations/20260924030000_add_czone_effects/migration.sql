-- CreateEnum
CREATE TYPE "CZoneEffectKind" AS ENUM ('BORDER', 'GLOW');

-- CreateTable
CREATE TABLE "CZoneEffect" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CZoneEffectKind" NOT NULL,
    "color" TEXT NOT NULL,
    "thickness" INTEGER NOT NULL DEFAULT 6,
    "glowRadius" INTEGER NOT NULL DEFAULT 18,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 2.4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CZoneEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CZoneEffect_name_key" ON "CZoneEffect"("name");

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" DROP COLUMN "grantsBorder",
    DROP COLUMN "grantsGlow",
    ADD COLUMN     "borderEffectId" TEXT,
    ADD COLUMN     "glowEffectId" TEXT;

-- AlterTable
ALTER TABLE "UserCMoonBorder" ADD COLUMN     "effectId" TEXT;

-- AlterTable
ALTER TABLE "UserCMoonGlow" ADD COLUMN     "effectId" TEXT;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_borderEffectId_fkey" FOREIGN KEY ("borderEffectId") REFERENCES "CZoneEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_glowEffectId_fkey" FOREIGN KEY ("glowEffectId") REFERENCES "CZoneEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonBorder" ADD CONSTRAINT "UserCMoonBorder_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;
