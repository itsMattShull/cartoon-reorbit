-- CreateTable
CREATE TABLE "ClashGame" (
    "id" TEXT NOT NULL,
    "player1UserId" TEXT NOT NULL,
    "player2UserId" TEXT,
    "winnerUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ClashGame_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClashGame" ADD CONSTRAINT "ClashGame_player1UserId_fkey" FOREIGN KEY ("player1UserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashGame" ADD CONSTRAINT "ClashGame_player2UserId_fkey" FOREIGN KEY ("player2UserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashGame" ADD CONSTRAINT "ClashGame_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
