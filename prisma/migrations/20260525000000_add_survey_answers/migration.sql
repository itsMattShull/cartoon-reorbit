-- CreateTable
CREATE TABLE "SurveyAnswers" (
    "userId" TEXT NOT NULL,
    "whyJoin" TEXT NOT NULL,
    "howFound" TEXT NOT NULL,
    "favoriteShows" TEXT NOT NULL,
    "whyJoinLen" INTEGER NOT NULL,
    "howFoundLen" INTEGER NOT NULL,
    "favoriteShowsLen" INTEGER NOT NULL,
    "whyJoinVec" JSONB,
    "howFoundVec" JSONB,
    "favoriteShowsVec" JSONB,
    "stylometric" JSONB,
    "minhashSig" BYTEA,
    "aiScoreWhy" DOUBLE PRECISION,
    "aiScoreFound" DOUBLE PRECISION,
    "aiScoreShows" DOUBLE PRECISION,
    "pointsAwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyAnswers_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "SurveyAnswers_createdAt_idx" ON "SurveyAnswers"("createdAt");

-- AddForeignKey
ALTER TABLE "SurveyAnswers" ADD CONSTRAINT "SurveyAnswers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
