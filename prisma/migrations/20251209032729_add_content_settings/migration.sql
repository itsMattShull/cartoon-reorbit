-- CreateTable
CREATE TABLE "ContentSettings" (
    "id" TEXT NOT NULL,
    "baseOdds" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "incrementRate" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "countPerDay" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSettings_pkey" PRIMARY KEY ("id")
);
