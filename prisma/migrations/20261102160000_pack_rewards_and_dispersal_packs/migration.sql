-- AlterEnum
ALTER TYPE "CMoonEnemyRewardType" ADD VALUE 'PACK';

-- AlterTable
ALTER TABLE "CMoonDispersalClaim" ADD COLUMN     "packId" TEXT,
ALTER COLUMN "ctoonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CMoonDispersalOption" ADD COLUMN     "packId" TEXT,
ALTER COLUMN "ctoonId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CMoonEnemyReward" ADD COLUMN     "packId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CMoonDispersalOption_offerId_packId_key" ON "CMoonDispersalOption"("offerId", "packId");

-- AddForeignKey
ALTER TABLE "CMoonDispersalOption" ADD CONSTRAINT "CMoonDispersalOption_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonEnemyReward" ADD CONSTRAINT "CMoonEnemyReward_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (not expressible in the Prisma schema language, hand-added here — see
-- CMoonDispersalOption/CMoonDispersalClaim's own schema comments): each option/claim must be
-- exactly one of a cToon or a Pack, never both and never neither.
ALTER TABLE "CMoonDispersalOption" ADD CONSTRAINT "CMoonDispersalOption_ctoon_xor_pack"
  CHECK ((("ctoonId" IS NOT NULL)::int + ("packId" IS NOT NULL)::int) = 1);

ALTER TABLE "CMoonDispersalClaim" ADD CONSTRAINT "CMoonDispersalClaim_ctoon_xor_pack"
  CHECK ((("ctoonId" IS NOT NULL)::int + ("packId" IS NOT NULL)::int) = 1);

