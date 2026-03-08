-- Add Winball bumper image paths to GameConfig
ALTER TABLE "GameConfig" ADD COLUMN "winballBumper1ImagePath" TEXT;
ALTER TABLE "GameConfig" ADD COLUMN "winballBumper2ImagePath" TEXT;
ALTER TABLE "GameConfig" ADD COLUMN "winballBumper3ImagePath" TEXT;
