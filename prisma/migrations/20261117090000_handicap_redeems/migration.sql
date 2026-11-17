-- CreateEnum
CREATE TYPE "HandicapRedeemHoldStatus" AS ENUM ('PENDING', 'RELEASING', 'COMPLETED');

-- CreateTable
CREATE TABLE "HandicapRedeemer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "flaggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandicapRedeemer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandicapRedeemer_userId_key" ON "HandicapRedeemer"("userId");

-- CreateIndex
CREATE INDEX "HandicapRedeemer_createdAt_idx" ON "HandicapRedeemer"("createdAt");

-- CreateTable
CREATE TABLE "HandicapRedeemHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "HandicapRedeemHoldStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "resultJson" TEXT,

    CONSTRAINT "HandicapRedeemHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandicapRedeemHold_userId_codeId_key" ON "HandicapRedeemHold"("userId", "codeId");

-- CreateIndex
CREATE INDEX "HandicapRedeemHold_codeId_status_idx" ON "HandicapRedeemHold"("codeId", "status");

-- AddForeignKey
ALTER TABLE "HandicapRedeemer" ADD CONSTRAINT "HandicapRedeemer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandicapRedeemer" ADD CONSTRAINT "HandicapRedeemer_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandicapRedeemHold" ADD CONSTRAINT "HandicapRedeemHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandicapRedeemHold" ADD CONSTRAINT "HandicapRedeemHold_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ClaimCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
