-- CreateIndex
-- Supports server/api/economy/ctoons/[id]/auctions.get.js: joins in from
-- UserCtoon on ctoonId, filters status + winnerId IS NOT NULL, orders by
-- winnerAt desc. Without winnerAt in the index Postgres sorts every matching
-- row before applying LIMIT.
CREATE INDEX "Auction_userCtoonId_status_winnerAt_idx" ON "Auction"("userCtoonId", "status", "winnerAt");

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_room_createdAt_idx" ON "ChatMessage"("room", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
