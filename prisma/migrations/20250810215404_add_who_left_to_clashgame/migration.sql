-- AlterTable
ALTER TABLE "ClashGame" ADD COLUMN     "whoLeftUserId" TEXT;

-- AddForeignKey
ALTER TABLE "ClashGame" ADD CONSTRAINT "ClashGame_whoLeftUserId_fkey" FOREIGN KEY ("whoLeftUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
