-- CreateTable
CREATE TABLE "CtoonImageHash" (
    "id" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "phash" TEXT NOT NULL,
    "dhash" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CtoonImageHash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CtoonImageHash_ctoonId_key" ON "CtoonImageHash"("ctoonId");

-- CreateIndex
CREATE INDEX "CtoonImageHash_bucket_idx" ON "CtoonImageHash"("bucket");

-- CreateIndex
CREATE INDEX "CtoonImageHash_phash_idx" ON "CtoonImageHash"("phash");

-- CreateIndex
CREATE INDEX "CtoonImageHash_dhash_idx" ON "CtoonImageHash"("dhash");

-- AddForeignKey
ALTER TABLE "CtoonImageHash" ADD CONSTRAINT "CtoonImageHash_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
