-- CreateTable
CREATE TABLE "UserTradeListItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userCtoonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTradeListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTradeListItem_userId_userCtoonId_key" ON "UserTradeListItem"("userId", "userCtoonId");

-- CreateIndex
CREATE INDEX "UserTradeListItem_userId_idx" ON "UserTradeListItem"("userId");

-- CreateIndex
CREATE INDEX "UserTradeListItem_userCtoonId_idx" ON "UserTradeListItem"("userCtoonId");

-- AddForeignKey
ALTER TABLE "UserTradeListItem" ADD CONSTRAINT "UserTradeListItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTradeListItem" ADD CONSTRAINT "UserTradeListItem_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
