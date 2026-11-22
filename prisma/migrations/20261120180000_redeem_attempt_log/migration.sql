-- CreateTable
CREATE TABLE "RedeemAttemptLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeText" TEXT NOT NULL,
    "codeId" TEXT,
    "reason" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "message" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "origin" TEXT,
    "referer" TEXT,
    "secFetchSite" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedeemAttemptLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedeemAttemptLog_createdAt_idx" ON "RedeemAttemptLog"("createdAt");

-- CreateIndex
CREATE INDEX "RedeemAttemptLog_userId_createdAt_idx" ON "RedeemAttemptLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RedeemAttemptLog_codeId_createdAt_idx" ON "RedeemAttemptLog"("codeId", "createdAt");

-- CreateIndex
CREATE INDEX "RedeemAttemptLog_reason_createdAt_idx" ON "RedeemAttemptLog"("reason", "createdAt");

-- AddForeignKey
ALTER TABLE "RedeemAttemptLog" ADD CONSTRAINT "RedeemAttemptLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedeemAttemptLog" ADD CONSTRAINT "RedeemAttemptLog_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ClaimCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

