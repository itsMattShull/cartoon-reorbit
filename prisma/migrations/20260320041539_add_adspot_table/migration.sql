-- CreateTable
CREATE TABLE "AdSpot" (
    "id" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdSpot_imagePath_key" ON "AdSpot"("imagePath");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpot_filename_key" ON "AdSpot"("filename");

-- CreateIndex
CREATE INDEX "AdSpot_createdAt_idx" ON "AdSpot"("createdAt");
