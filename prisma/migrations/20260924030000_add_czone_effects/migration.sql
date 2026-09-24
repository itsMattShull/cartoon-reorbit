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

-- AlterTable — effectId columns added up front so the backfill UPDATEs below (which also touch
-- UserCMoonBorder/UserCMoonGlow, not just CMoonAffinityLevel) have somewhere to write.
ALTER TABLE "UserCMoonBorder" ADD COLUMN     "effectId" TEXT;

-- AlterTable
ALTER TABLE "UserCMoonGlow" ADD COLUMN     "effectId" TEXT;

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" ADD COLUMN     "borderEffectId" TEXT,
    ADD COLUMN     "glowEffectId" TEXT;

-- Seed one BORDER and/or one GLOW "legacy" CZoneEffect per cMoon that has at least one
-- CMoonAffinityLevel still granting the old flat-color cosmetic (grantsBorder/grantsGlow, dropped
-- below), colored with that cMoon's own live color and sized to match the exact pre-CZoneEffect
-- hardcoded look (10px solid border; 6px ring / 16px radius / 2.4s pulse glow — see
-- server/utils/czoneEffect.js's LEGACY_* constants). Without this, every affinity level that
-- currently grants a border/glow would silently stop granting anything the moment its boolean
-- columns are dropped, and any member crossing one of those levels after this migration (but
-- before an admin manually recreates and reassigns effects) would lose a reward they're entitled
-- to — currentLevelId only ever moves forward, so a level skipped this way can never be
-- re-evaluated later.
--
-- LEFT(..., 60) guards CZoneEffect.name's 60-char limit (validated app-side by
-- isValidCZoneEffectName, not DB-enforced, but this seed bypasses the app layer) against a
-- CMoon.name long enough to push the concatenated string past it — used identically in every
-- UPDATE below so each join still finds this exact row.
INSERT INTO "CZoneEffect" ("id", "name", "kind", "color", "thickness", "glowRadius", "opacity", "speed", "updatedAt")
SELECT gen_random_uuid()::text, LEFT('Legacy Border — ' || c."name", 60), 'BORDER', c."color", 10, 18, 1, 2.4, CURRENT_TIMESTAMP
FROM "CMoon" c
WHERE EXISTS (SELECT 1 FROM "CMoonAffinityLevel" l WHERE l."cMoonId" = c."id" AND l."grantsBorder" = true);

INSERT INTO "CZoneEffect" ("id", "name", "kind", "color", "thickness", "glowRadius", "opacity", "speed", "updatedAt")
SELECT gen_random_uuid()::text, LEFT('Legacy Glow — ' || c."name", 60), 'GLOW', c."color", 6, 16, 1, 2.4, CURRENT_TIMESTAMP
FROM "CMoon" c
WHERE EXISTS (SELECT 1 FROM "CMoonAffinityLevel" l WHERE l."cMoonId" = c."id" AND l."grantsGlow" = true);

-- Point every currently-granting level at its cMoon's freshly-seeded legacy effect, before the
-- booleans that used to drive this are dropped.
UPDATE "CMoonAffinityLevel" l
SET "borderEffectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE l."cMoonId" = c."id"
  AND fx."name" = LEFT('Legacy Border — ' || c."name", 60)
  AND fx."kind" = 'BORDER'
  AND l."grantsBorder" = true;

UPDATE "CMoonAffinityLevel" l
SET "glowEffectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE l."cMoonId" = c."id"
  AND fx."name" = LEFT('Legacy Glow — ' || c."name", 60)
  AND fx."kind" = 'GLOW'
  AND l."grantsGlow" = true;

-- Point every EXISTING grant at the same seeded legacy effect too — not just future ones. A
-- member who already owns a border/glow for a cMoon keeps the exact look they have today (the
-- seed's color/size matches the old hardcoded rendering exactly), but from this point on they're
-- on the SAME live-reference path as everyone granted after this migration: if an admin later
-- customizes "Legacy Border — <cMoon>" (or replaces it with a purpose-made effect on the level and
-- the member re-crosses/gets backfilled), every current holder sees that change together, rather
-- than already-granted rows being stuck on a parallel hardcoded-fallback rendering path forever
-- while only new grants pick up admin customization. Every UserCMoonBorder/UserCMoonGlow row for a
-- cMoon that has a seeded legacy effect is updated here, regardless of which level originally
-- granted it — ownership is per-(user, cMoon), not per-level, so there's no finer-grained mapping
-- to preserve.
UPDATE "UserCMoonBorder" ub
SET "effectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE ub."cMoonId" = c."id"
  AND fx."name" = LEFT('Legacy Border — ' || c."name", 60)
  AND fx."kind" = 'BORDER';

UPDATE "UserCMoonGlow" ug
SET "effectId" = fx."id"
FROM "CZoneEffect" fx, "CMoon" c
WHERE ug."cMoonId" = c."id"
  AND fx."name" = LEFT('Legacy Glow — ' || c."name", 60)
  AND fx."kind" = 'GLOW';

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" DROP COLUMN "grantsBorder",
    DROP COLUMN "grantsGlow";

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_borderEffectId_fkey" FOREIGN KEY ("borderEffectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevel" ADD CONSTRAINT "CMoonAffinityLevel_glowEffectId_fkey" FOREIGN KEY ("glowEffectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonBorder" ADD CONSTRAINT "UserCMoonBorder_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCMoonGlow" ADD CONSTRAINT "UserCMoonGlow_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "CZoneEffect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
