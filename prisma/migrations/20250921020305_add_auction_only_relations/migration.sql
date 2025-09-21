-- CreateTable
CREATE TABLE "AuctionOnly" (
    "id" TEXT NOT NULL,
    "userCtoonId" TEXT NOT NULL,
    "pricePoints" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AuctionOnly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuctionOnly_startsAt_idx" ON "AuctionOnly"("startsAt");

-- CreateIndex
CREATE INDEX "AuctionOnly_endsAt_idx" ON "AuctionOnly"("endsAt");

-- AddForeignKey
ALTER TABLE "AuctionOnly" ADD CONSTRAINT "AuctionOnly_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionOnly" ADD CONSTRAINT "AuctionOnly_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
