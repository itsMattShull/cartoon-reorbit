-- CreateEnum
CREATE TYPE "LottoOutcome" AS ENUM ('NOTHING', 'POINTS', 'CTOON');

-- CreateTable
CREATE TABLE "LottoLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "LottoOutcome" NOT NULL,
    "oddsBefore" DOUBLE PRECISION NOT NULL,
    "oddsAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LottoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LottoLog_createdAt_idx" ON "LottoLog"("createdAt");

-- CreateIndex
CREATE INDEX "LottoLog_userId_createdAt_idx" ON "LottoLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LottoLog_outcome_createdAt_idx" ON "LottoLog"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "LottoLog" ADD CONSTRAINT "LottoLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
