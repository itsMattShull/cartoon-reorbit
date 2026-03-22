-- CreateEnum
CREATE TYPE "SubmittedCtoonStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "SubmittedCtoon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "perUserLimit" INTEGER,
    "inCmart" BOOLEAN NOT NULL DEFAULT false,
    "price" INTEGER NOT NULL DEFAULT 0,
    "totalQuantity" INTEGER,
    "initialQuantity" INTEGER,
    "characters" TEXT[],
    "status" "SubmittedCtoonStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,

    CONSTRAINT "SubmittedCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubmittedCtoon_userId_idx" ON "SubmittedCtoon"("userId");

-- CreateIndex
CREATE INDEX "SubmittedCtoon_status_idx" ON "SubmittedCtoon"("status");

-- CreateIndex
CREATE INDEX "SubmittedCtoon_submittedAt_idx" ON "SubmittedCtoon"("submittedAt");

-- AddForeignKey
ALTER TABLE "SubmittedCtoon" ADD CONSTRAINT "SubmittedCtoon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittedCtoon" ADD CONSTRAINT "SubmittedCtoon_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
