-- CreateTable
CREATE TABLE "DissolveAuctionQueue" (
    "id" TEXT NOT NULL,
    "userCtoonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DissolveAuctionQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DissolveAuctionQueue_userCtoonId_key" ON "DissolveAuctionQueue"("userCtoonId");

-- CreateIndex
CREATE INDEX "DissolveAuctionQueue_createdAt_idx" ON "DissolveAuctionQueue"("createdAt");

-- AddForeignKey
ALTER TABLE "DissolveAuctionQueue" ADD CONSTRAINT "DissolveAuctionQueue_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
