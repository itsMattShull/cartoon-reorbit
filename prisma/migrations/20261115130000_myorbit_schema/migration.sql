-- AlterTable: MyOrbit moderation + avatar-preference fields on User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "myOrbitMutedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "myOrbitBannedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "myOrbitBannedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "myOrbitLastUserCtoonId" TEXT;

-- AlterTable: MyOrbit master switch
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "myOrbitEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "MyOrbitModerationAction" AS ENUM ('MUTE', 'UNMUTE', 'BAN', 'UNBAN', 'DELETE_MESSAGE');

-- CreateTable
CREATE TABLE "MyOrbitTile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "walkable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MyOrbitTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitTile_name_key" ON "MyOrbitTile"("name");

-- CreateTable
CREATE TABLE "MyOrbitFurniture" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "footprintW" INTEGER NOT NULL DEFAULT 1,
    "footprintH" INTEGER NOT NULL DEFAULT 1,
    "blocksWalk" BOOLEAN NOT NULL DEFAULT true,
    "zOffset" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MyOrbitFurniture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitFurniture_name_key" ON "MyOrbitFurniture"("name");

-- CreateTable
CREATE TABLE "MyOrbitRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gridWidth" INTEGER NOT NULL DEFAULT 10,
    "gridHeight" INTEGER NOT NULL DEFAULT 10,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MyOrbitRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitRoom_name_key" ON "MyOrbitRoom"("name");

-- CreateTable
CREATE TABLE "MyOrbitRoomTile" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "tileId" TEXT NOT NULL,

    CONSTRAINT "MyOrbitRoomTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitRoomTile_roomId_x_y_key" ON "MyOrbitRoomTile"("roomId", "x", "y");

-- CreateIndex
CREATE INDEX "MyOrbitRoomTile_tileId_idx" ON "MyOrbitRoomTile"("tileId");

-- CreateTable
CREATE TABLE "MyOrbitRoomFurniture" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "furnitureId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MyOrbitRoomFurniture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MyOrbitRoomFurniture_roomId_idx" ON "MyOrbitRoomFurniture"("roomId");

-- CreateIndex
CREATE INDEX "MyOrbitRoomFurniture_furnitureId_idx" ON "MyOrbitRoomFurniture"("furnitureId");

-- CreateTable
CREATE TABLE "MyOrbitBannedWord" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyOrbitBannedWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MyOrbitBannedWord_phrase_key" ON "MyOrbitBannedWord"("phrase");

-- CreateTable
CREATE TABLE "MyOrbitModerationLog" (
    "id" TEXT NOT NULL,
    "roomId" TEXT,
    "targetUserId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "MyOrbitModerationAction" NOT NULL,
    "reason" TEXT,
    "messageSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyOrbitModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MyOrbitModerationLog_targetUserId_createdAt_idx" ON "MyOrbitModerationLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MyOrbitModerationLog_roomId_createdAt_idx" ON "MyOrbitModerationLog"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "MyOrbitRoomTile" ADD CONSTRAINT "MyOrbitRoomTile_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MyOrbitRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitRoomTile" ADD CONSTRAINT "MyOrbitRoomTile_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "MyOrbitTile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitRoomFurniture" ADD CONSTRAINT "MyOrbitRoomFurniture_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MyOrbitRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitRoomFurniture" ADD CONSTRAINT "MyOrbitRoomFurniture_furnitureId_fkey" FOREIGN KEY ("furnitureId") REFERENCES "MyOrbitFurniture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitModerationLog" ADD CONSTRAINT "MyOrbitModerationLog_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MyOrbitRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitModerationLog" ADD CONSTRAINT "MyOrbitModerationLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyOrbitModerationLog" ADD CONSTRAINT "MyOrbitModerationLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
