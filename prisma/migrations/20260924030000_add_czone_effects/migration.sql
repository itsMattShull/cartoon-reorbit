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

-- Seed one BORDER and/or one GLOW "legacy" CZoneEffect per cMoon that has at least one
-- CMoonAffinityLevel still granting the old flat-color cosmetic (grantsBorder/grantsGlow, dropped
-- below), colored with that cMoon's own live color and sized to match the exact pre-CZoneEffect
-- hardcoded look (10px solid border; 6px ring / 16px radius / 2.4s pulse glow — see
-- server/utils/czoneEffect.js's LEGACY_* constants, which every already-granted
-- UserCMoonBorder/UserCMoonGlow row with a NULL effectId falls back to identically). Without this,
-- every affinity level that currently grants a border/glow would silently stop granting anything
-- the moment its boolean columns are dropped, and any member crossing one of those levels after
-- this migration (but before an admin manually recreates and reassigns effects) would lose a
-- reward they're entitled to — currentLevelId only ever moves forward, so a level skipped this way
-- can never be re-evaluated later. Already-granted borders/glows are untouched by this migration
-- (their effectId stays NULL, which resolveBorderStyle/resolveGlowStyle already render exactly
-- like this seeded row), so nothing already earned changes appearance.
INSERT INTO "CZoneEffect" ("id", "name", "kind", "color", "thickness", "glowRadius", "opacity", "speed", "updatedAt")
SELECT gen_random_uuid()::text, 'Legacy Border — ' || c."name", 'BORDER', c."color", 10, 18, 1, 2.4, CURRENT_TIMESTAMP
FROM "CMoon" c
WHERE EXISTS (SELECT 1 FROM "CMoonAffinityLevel" l WHERE l."cMoonId" = c."id" AND l."grantsBorder" = true);

INSERT INTO "CZoneEffect" ("id", "name", "kind", "color", "thickness", "glowRadius", "opacity", "speed", "updatedAt")
SELECT gen_random_uuid()::text, 'Legacy Glow — ' || c."name", 'GLOW', c."color", 6, 16, 1, 2.4, CURRENT_TIMESTAMP
FROM "CMoon" c
WHERE EXISTS (SELECT 1 FROM "CMoonAffinityLevel" l WHERE l."cMoonId" = c."id" AND l."grantsGlow" = true);

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" ADD COLUMN     "borderEffectId" TEXT,
    ADD COLUMN     "glowEffectId" TEXT;

-- Point every currently-granting level at its cMoon's freshly-seeded legacy effect, before the
-- booleans that used to drive this are dropped.
UPDATE "CMoonAffinityLevel" l
SET "borderEffectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE l."cMoonId" = c."id"
  AND fx."name" = 'Legacy Border — ' || c."name"
  AND fx."kind" = 'BORDER'
  AND l."grantsBorder" = true;

UPDATE "CMoonAffinityLevel" l
SET "glowEffectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE l."cMoonId" = c."id"
  AND fx."name" = 'Legacy Glow — ' || c."name"
  AND fx."kind" = 'GLOW'
  AND l."grantsGlow" = true;

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" DROP COLUMN "grantsBorder",
    DROP COLUMN "grantsGlow";

-- AlterTable
ALTER TABLE "UserCMoonBorder" ADD COLUMN     "effectId" TEXT;

-- AlterTable
ALTER TABLE "UserCMoonGlow" ADD COLUMN     "effectId" TEXT;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_borderEffectId_fkey" FOREIGN KEY ("borderEffectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_glowEffectId_fkey" FOREIGN KEY ("glowEffectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonBorder" ADD CONSTRAINT "UserCMoonBorder_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
