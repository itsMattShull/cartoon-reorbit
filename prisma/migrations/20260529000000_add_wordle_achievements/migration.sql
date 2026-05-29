-- Add Wordle achievement criteria columns to Achievement
ALTER TABLE "Achievement" ADD COLUMN "wordleWinsGte" INTEGER;
ALTER TABLE "Achievement" ADD COLUMN "wordleCurrentStreakGte" INTEGER;

-- Create WordleResult table
CREATE TABLE "WordleResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "score" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordleResult_pkey" PRIMARY KEY ("id")
);

-- Unique constraint and indexes
CREATE UNIQUE INDEX "WordleResult_userId_date_key" ON "WordleResult"("userId", "date");
CREATE INDEX "WordleResult_userId_isWinner_idx" ON "WordleResult"("userId", "isWinner");
CREATE INDEX "WordleResult_date_idx" ON "WordleResult"("date");

-- Foreign key to User
ALTER TABLE "WordleResult" ADD CONSTRAINT "WordleResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
