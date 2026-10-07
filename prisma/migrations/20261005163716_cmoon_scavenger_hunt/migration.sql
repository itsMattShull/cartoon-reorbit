-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonHuntPoints" INTEGER NOT NULL DEFAULT 75;

-- CreateTable
CREATE TABLE "CMoonHunt" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "finalAnswer" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonHunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonHuntClue" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonHuntClue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonHuntAssignment" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "clueId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonHuntAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonHuntCompletion" (
    "id" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonHuntCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonHuntClue_huntId_sortOrder_idx" ON "CMoonHuntClue"("huntId", "sortOrder");

-- CreateIndex
CREATE INDEX "CMoonHuntAssignment_huntId_cMoonId_idx" ON "CMoonHuntAssignment"("huntId", "cMoonId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonHuntAssignment_huntId_userId_key" ON "CMoonHuntAssignment"("huntId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonHuntCompletion_huntId_cMoonId_key" ON "CMoonHuntCompletion"("huntId", "cMoonId");

-- AddForeignKey
ALTER TABLE "CMoonHuntClue" ADD CONSTRAINT "CMoonHuntClue_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "CMoonHunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonHuntAssignment" ADD CONSTRAINT "CMoonHuntAssignment_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "CMoonHunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonHuntAssignment" ADD CONSTRAINT "CMoonHuntAssignment_clueId_fkey" FOREIGN KEY ("clueId") REFERENCES "CMoonHuntClue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonHuntAssignment" ADD CONSTRAINT "CMoonHuntAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonHuntCompletion" ADD CONSTRAINT "CMoonHuntCompletion_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "CMoonHunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
