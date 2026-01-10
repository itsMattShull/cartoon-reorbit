-- CreateEnum
CREATE TYPE "BanAction" AS ENUM ('BAN', 'UNBAN');

-- CreateTable
CREATE TABLE "UserBanNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "BanAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBanNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBanNote_userId_createdAt_idx" ON "UserBanNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserBanNote_adminId_createdAt_idx" ON "UserBanNote"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserBanNote" ADD CONSTRAINT "UserBanNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBanNote" ADD CONSTRAINT "UserBanNote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
