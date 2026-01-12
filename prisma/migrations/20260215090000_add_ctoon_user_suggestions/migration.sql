-- CreateEnum
CREATE TYPE "CtoonSuggestionStatus" AS ENUM ('IN_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "CtoonUserSuggestion" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CtoonSuggestionStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "oldValues" JSONB NOT NULL,
    "newValues" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtoonUserSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CtoonUserSuggestion_status_createdAt_idx" ON "CtoonUserSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CtoonUserSuggestion_ctoonId_idx" ON "CtoonUserSuggestion"("ctoonId");

-- CreateIndex
CREATE INDEX "CtoonUserSuggestion_userId_createdAt_idx" ON "CtoonUserSuggestion"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CtoonUserSuggestion" ADD CONSTRAINT "CtoonUserSuggestion_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtoonUserSuggestion" ADD CONSTRAINT "CtoonUserSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
