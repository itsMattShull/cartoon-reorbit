-- CreateTable
CREATE TABLE "ClaimCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "maxClaims" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimCodeReward" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ClaimCodeReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCode_code_key" ON "ClaimCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_userId_codeId_key" ON "Claim"("userId", "codeId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ClaimCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCodeReward" ADD CONSTRAINT "ClaimCodeReward_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ClaimCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCodeReward" ADD CONSTRAINT "ClaimCodeReward_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
