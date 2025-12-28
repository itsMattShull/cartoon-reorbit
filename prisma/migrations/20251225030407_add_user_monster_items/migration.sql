-- AlterTable
ALTER TABLE "ItemDefinition" ADD COLUMN     "itemImage0Path" TEXT,
ADD COLUMN     "itemImage1Path" TEXT,
ADD COLUMN     "itemImage2Path" TEXT;

-- CreateTable
CREATE TABLE "UserMonsterItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMonsterItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserMonsterItem_userId_idx" ON "UserMonsterItem"("userId");

-- CreateIndex
CREATE INDEX "UserMonsterItem_itemId_idx" ON "UserMonsterItem"("itemId");

-- CreateIndex
CREATE INDEX "UserMonsterItem_configId_idx" ON "UserMonsterItem"("configId");

-- CreateIndex
CREATE INDEX "UserMonsterItem_userId_itemId_idx" ON "UserMonsterItem"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "UserMonsterItem" ADD CONSTRAINT "UserMonsterItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonsterItem" ADD CONSTRAINT "UserMonsterItem_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonsterItem" ADD CONSTRAINT "UserMonsterItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
