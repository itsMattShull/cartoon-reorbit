-- CreateEnum
CREATE TYPE "CMoonChangeRequestStatus" AS ENUM ('IN_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "CMoonChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentCMoonId" TEXT,
    "requestedCMoonId" TEXT NOT NULL,
    "status" "CMoonChangeRequestStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonChangeRequest_status_createdAt_idx" ON "CMoonChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CMoonChangeRequest_userId_status_idx" ON "CMoonChangeRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "CMoonChangeRequest" ADD CONSTRAINT "CMoonChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonChangeRequest" ADD CONSTRAINT "CMoonChangeRequest_currentCMoonId_fkey" FOREIGN KEY ("currentCMoonId") REFERENCES "CMoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonChangeRequest" ADD CONSTRAINT "CMoonChangeRequest_requestedCMoonId_fkey" FOREIGN KEY ("requestedCMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
