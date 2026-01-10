-- CreateTable
CREATE TABLE "AdImage" (
    "id" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AdImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdImage_imagePath_key" ON "AdImage"("imagePath");

-- CreateIndex
CREATE UNIQUE INDEX "AdImage_filename_key" ON "AdImage"("filename");

-- CreateIndex
CREATE INDEX "AdImage_createdAt_idx" ON "AdImage"("createdAt");

-- AddForeignKey
ALTER TABLE "AdImage" ADD CONSTRAINT "AdImage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
