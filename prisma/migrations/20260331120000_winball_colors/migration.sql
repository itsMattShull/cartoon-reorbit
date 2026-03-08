-- Add Winball color configuration fields to GameConfig
ALTER TABLE "GameConfig" ADD COLUMN "winballColorBackground" TEXT DEFAULT '#ffffff';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorBackboard" TEXT DEFAULT '#F0E6FF';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorWalls" TEXT DEFAULT '#4b4b4b';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorBall" TEXT DEFAULT '#ff0000';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorBumpers" TEXT DEFAULT '#8c8cff';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorLeftCup" TEXT DEFAULT '#8c8cff';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorRightCup" TEXT DEFAULT '#8c8cff';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorGoldCup" TEXT DEFAULT '#FFD700';
ALTER TABLE "GameConfig" ADD COLUMN "winballColorCap" TEXT DEFAULT '#ffd000';
