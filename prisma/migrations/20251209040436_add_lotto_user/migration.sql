-- CreateTable
CREATE TABLE "LottoUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "odds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purchasesToday" INTEGER NOT NULL DEFAULT 0,
    "lastPurchaseAt" TIMESTAMP(3),
    "lastReset" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LottoUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LottoUser_userId_key" ON "LottoUser"("userId");

-- CreateIndex
CREATE INDEX "LottoUser_userId_idx" ON "LottoUser"("userId");

-- AddForeignKey
ALTER TABLE "LottoUser" ADD CONSTRAINT "LottoUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
