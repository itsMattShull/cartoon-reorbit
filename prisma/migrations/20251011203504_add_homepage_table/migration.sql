-- CreateTable
CREATE TABLE "HomepageConfig" (
    "id" TEXT NOT NULL DEFAULT 'homepage',
    "topLeftImagePath" TEXT,
    "bottomLeftImagePath" TEXT,
    "topRightImagePath" TEXT,
    "bottomRightImagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageConfig_pkey" PRIMARY KEY ("id")
);
