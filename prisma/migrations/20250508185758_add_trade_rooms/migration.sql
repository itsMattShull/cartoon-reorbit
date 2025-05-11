-- CreateTable
CREATE TABLE "TradeRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "traderAId" TEXT,
    "traderBId" TEXT,

    CONSTRAINT "TradeRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeCtoon" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "userCtoonId" TEXT NOT NULL,

    CONSTRAINT "TradeCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeSpectator" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TradeSpectator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradeRoom_name_key" ON "TradeRoom"("name");

-- AddForeignKey
ALTER TABLE "TradeRoom" ADD CONSTRAINT "TradeRoom_traderAId_fkey" FOREIGN KEY ("traderAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeRoom" ADD CONSTRAINT "TradeRoom_traderBId_fkey" FOREIGN KEY ("traderBId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TradeRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCtoon" ADD CONSTRAINT "TradeCtoon_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeCtoon" ADD CONSTRAINT "TradeCtoon_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSpectator" ADD CONSTRAINT "TradeSpectator_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TradeRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeSpectator" ADD CONSTRAINT "TradeSpectator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
