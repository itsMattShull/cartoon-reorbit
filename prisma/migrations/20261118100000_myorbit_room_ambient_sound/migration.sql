-- AlterTable: MyOrbit room ambience track
ALTER TABLE "MyOrbitRoom"
  ADD COLUMN IF NOT EXISTS "ambientSoundPath" TEXT;
