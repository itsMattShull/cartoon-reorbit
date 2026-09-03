-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "deletedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ChatTimeout" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "liftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatTimeout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatTimeout_room_userId_expiresAt_idx" ON "ChatTimeout"("room", "userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "ChatTimeout" ADD CONSTRAINT "ChatTimeout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTimeout" ADD CONSTRAINT "ChatTimeout_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
