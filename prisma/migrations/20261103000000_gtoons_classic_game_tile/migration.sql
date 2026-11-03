-- Games-page tile image for the original gToons game (slot "gtoonsclassic").
ALTER TABLE "GlobalGameConfig" ADD COLUMN IF NOT EXISTS "gameTileGtoonsclassicImagePath" TEXT;
