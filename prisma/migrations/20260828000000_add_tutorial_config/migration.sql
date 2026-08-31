-- CreateTable
CREATE TABLE "TutorialConfig" (
    "id" TEXT NOT NULL,
    "heroImagePath" TEXT,
    "sections" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TutorialConfig_pkey" PRIMARY KEY ("id")
);
