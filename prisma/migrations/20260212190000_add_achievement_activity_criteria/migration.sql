-- AlterTable
ALTER TABLE "Achievement" ADD COLUMN     "auctionsWonGte" INTEGER;
ALTER TABLE "Achievement" ADD COLUMN     "auctionsCreatedGte" INTEGER;
ALTER TABLE "Achievement" ADD COLUMN     "tradesAcceptedGte" INTEGER;
ALTER TABLE "Achievement" ADD COLUMN     "consecutiveActiveDaysGte" INTEGER;

-- CreateTable
CREATE TABLE "UserDailyActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDailyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyActivity_userId_day_key" ON "UserDailyActivity"("userId", "day");

-- CreateIndex
CREATE INDEX "UserDailyActivity_userId_day_idx" ON "UserDailyActivity"("userId", "day");

-- CreateIndex
CREATE INDEX "UserDailyActivity_day_idx" ON "UserDailyActivity"("day");

-- AddForeignKey
ALTER TABLE "UserDailyActivity" ADD CONSTRAINT "UserDailyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
