-- AlterTable
ALTER TABLE "UserCtoon" ADD COLUMN "userPackId" TEXT;

-- AddForeignKey
ALTER TABLE "UserCtoon" ADD CONSTRAINT "UserCtoon_userPackId_fkey" FOREIGN KEY ("userPackId") REFERENCES "UserPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
