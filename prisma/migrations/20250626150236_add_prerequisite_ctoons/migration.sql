-- CreateTable
CREATE TABLE "ClaimCodePrerequisite" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,

    CONSTRAINT "ClaimCodePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCodePrerequisite_codeId_ctoonId_key" ON "ClaimCodePrerequisite"("codeId", "ctoonId");

-- AddForeignKey
ALTER TABLE "ClaimCodePrerequisite" ADD CONSTRAINT "ClaimCodePrerequisite_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "ClaimCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCodePrerequisite" ADD CONSTRAINT "ClaimCodePrerequisite_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
