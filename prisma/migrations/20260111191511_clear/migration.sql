-- DropForeignKey
ALTER TABLE IF EXISTS "CtoonUserSuggestion" DROP CONSTRAINT IF EXISTS "CtoonUserSuggestion_ctoonId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CtoonUserSuggestion" DROP CONSTRAINT IF EXISTS "CtoonUserSuggestion_userId_fkey";

-- AddForeignKey
ALTER TABLE IF EXISTS "CtoonUserSuggestion" ADD CONSTRAINT "CtoonUserSuggestion_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CtoonUserSuggestion" ADD CONSTRAINT "CtoonUserSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
