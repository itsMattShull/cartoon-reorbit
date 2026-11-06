-- CreateTable
CREATE TABLE "CMoonPrizeGrantLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPrizeGrantLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPrizeGrantLog_userId_cMoonId_key" ON "CMoonPrizeGrantLog"("userId", "cMoonId");

-- AddForeignKey
ALTER TABLE "CMoonPrizeGrantLog" ADD CONSTRAINT "CMoonPrizeGrantLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPrizeGrantLog" ADD CONSTRAINT "CMoonPrizeGrantLog_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

