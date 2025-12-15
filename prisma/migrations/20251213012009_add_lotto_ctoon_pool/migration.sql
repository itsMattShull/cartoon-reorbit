-- CreateTable
CREATE TABLE "LottoPoolCtoon" (
    "id" TEXT NOT NULL,
    "lottoSettingsId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LottoPoolCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LottoPoolCtoon_lottoSettingsId_ctoonId_key" ON "LottoPoolCtoon"("lottoSettingsId", "ctoonId");

-- AddForeignKey
ALTER TABLE "LottoPoolCtoon" ADD CONSTRAINT "LottoPoolCtoon_lottoSettingsId_fkey" FOREIGN KEY ("lottoSettingsId") REFERENCES "LottoSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LottoPoolCtoon" ADD CONSTRAINT "LottoPoolCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
