-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "activeSiteThemeId" TEXT,
ADD COLUMN     "activeUiSoundPresetId" TEXT,
ADD COLUMN     "useDefaultSiteTheme" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "UiSoundPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uiClickSoundPath" TEXT,
    "uiNavButtonSounds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiSoundPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orbitDarkBlue" TEXT NOT NULL,
    "orbitLightBlue" TEXT NOT NULL,
    "orbitGreen" TEXT NOT NULL,
    "bgColor" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UiSoundPreset_name_key" ON "UiSoundPreset"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SiteTheme_name_key" ON "SiteTheme"("name");

-- Data migration: preserve whatever sound assignment is currently live (if any) as a "Default"
-- preset, so shipping this feature never loses an admin's existing button-sound setup — see
-- UiSoundPreset's own schema comment. No-ops cleanly if the GlobalGameConfig singleton row
-- doesn't exist yet (a fresh install with no config saved at all).
INSERT INTO "UiSoundPreset" (id, name, "uiClickSoundPath", "uiNavButtonSounds", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Default', g."uiClickSoundPath", g."uiNavButtonSounds", now(), now()
FROM "GlobalGameConfig" g
WHERE g.id = 'singleton';

UPDATE "GlobalGameConfig"
SET "activeUiSoundPresetId" = (SELECT id FROM "UiSoundPreset" WHERE name = 'Default')
WHERE id = 'singleton';
