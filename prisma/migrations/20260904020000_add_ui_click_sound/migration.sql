-- Site-wide "haptic sound" (button click blip), admin-configurable from
-- Manage Homepage > Sounds. Null means "use the bundled default".
ALTER TABLE "GlobalGameConfig" ADD COLUMN "uiClickSoundPath" TEXT;
