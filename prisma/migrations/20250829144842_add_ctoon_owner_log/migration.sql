-- CreateTable
CREATE TABLE "CtoonOwnerLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ctoonId" TEXT,
    "userCtoonId" TEXT,
    "mintNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CtoonOwnerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CtoonOwnerLog_userCtoonId_createdAt_idx" ON "CtoonOwnerLog"("userCtoonId", "createdAt");

-- CreateIndex
CREATE INDEX "CtoonOwnerLog_ctoonId_createdAt_idx" ON "CtoonOwnerLog"("ctoonId", "createdAt");

-- CreateIndex
CREATE INDEX "CtoonOwnerLog_userId_createdAt_idx" ON "CtoonOwnerLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CtoonOwnerLog" ADD CONSTRAINT "CtoonOwnerLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtoonOwnerLog" ADD CONSTRAINT "CtoonOwnerLog_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtoonOwnerLog" ADD CONSTRAINT "CtoonOwnerLog_userCtoonId_fkey" FOREIGN KEY ("userCtoonId") REFERENCES "UserCtoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
