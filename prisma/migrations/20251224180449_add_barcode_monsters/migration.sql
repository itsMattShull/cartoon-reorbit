-- CreateEnum
CREATE TYPE "ScanOutcome" AS ENUM ('NOTHING', 'ITEM', 'MONSTER');

-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'RARE', 'CRAZY_RARE');

-- CreateEnum
CREATE TYPE "MonsterRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'VERY_RARE', 'CRAZY_RARE');

-- CreateTable
CREATE TABLE "BarcodeGameConfig" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "oddsNothing" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "oddsItem" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "oddsMonster" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "monsterRarityChances" JSONB NOT NULL,
    "monsterStatVariancePct" DOUBLE PRECISION NOT NULL DEFAULT 0.12,
    "barcodeCooldownDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarcodeGameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" "ItemRarity" NOT NULL,
    "power" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeciesBaseStats" (
    "configId" TEXT NOT NULL,
    "speciesIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rarity" "MonsterRarity" NOT NULL,
    "baseHp" INTEGER NOT NULL,
    "baseAtk" INTEGER NOT NULL,
    "baseDef" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeciesBaseStats_pkey" PRIMARY KEY ("configId","speciesIndex")
);

-- CreateTable
CREATE TABLE "BarcodeMapping" (
    "id" TEXT NOT NULL,
    "barcodeKey" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "outcome" "ScanOutcome" NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarcodeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMonster" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "speciesIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "monsterType" TEXT NOT NULL,
    "rarity" "MonsterRarity" NOT NULL,
    "seed" TEXT NOT NULL,
    "hp" INTEGER NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserMonster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBarcodeScan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextAvailableAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBarcodeScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeGameConfig_version_key" ON "BarcodeGameConfig"("version");

-- CreateIndex
CREATE INDEX "BarcodeGameConfig_isActive_idx" ON "BarcodeGameConfig"("isActive");

-- CreateIndex
CREATE INDEX "ItemDefinition_configId_idx" ON "ItemDefinition"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDefinition_configId_code_key" ON "ItemDefinition"("configId", "code");

-- CreateIndex
CREATE INDEX "SpeciesBaseStats_configId_rarity_idx" ON "SpeciesBaseStats"("configId", "rarity");

-- CreateIndex
CREATE INDEX "BarcodeMapping_barcodeKey_idx" ON "BarcodeMapping"("barcodeKey");

-- CreateIndex
CREATE INDEX "BarcodeMapping_configId_idx" ON "BarcodeMapping"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "BarcodeMapping_barcodeKey_configId_key" ON "BarcodeMapping"("barcodeKey", "configId");

-- CreateIndex
CREATE INDEX "UserMonster_userId_idx" ON "UserMonster"("userId");

-- CreateIndex
CREATE INDEX "UserMonster_mappingId_idx" ON "UserMonster"("mappingId");

-- CreateIndex
CREATE INDEX "UserMonster_userId_mappingId_idx" ON "UserMonster"("userId", "mappingId");

-- CreateIndex
CREATE INDEX "UserMonster_configId_idx" ON "UserMonster"("configId");

-- CreateIndex
CREATE INDEX "UserMonster_speciesIndex_idx" ON "UserMonster"("speciesIndex");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_userId_idx" ON "UserBarcodeScan"("userId");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_mappingId_idx" ON "UserBarcodeScan"("mappingId");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_userId_mappingId_idx" ON "UserBarcodeScan"("userId", "mappingId");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_configId_idx" ON "UserBarcodeScan"("configId");

-- CreateIndex
CREATE INDEX "UserBarcodeScan_nextAvailableAt_idx" ON "UserBarcodeScan"("nextAvailableAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserBarcodeScan_userId_mappingId_key" ON "UserBarcodeScan"("userId", "mappingId");

-- AddForeignKey
ALTER TABLE "ItemDefinition" ADD CONSTRAINT "ItemDefinition_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeciesBaseStats" ADD CONSTRAINT "SpeciesBaseStats_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarcodeMapping" ADD CONSTRAINT "BarcodeMapping_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonster" ADD CONSTRAINT "UserMonster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonster" ADD CONSTRAINT "UserMonster_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "BarcodeMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMonster" ADD CONSTRAINT "UserMonster_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBarcodeScan" ADD CONSTRAINT "UserBarcodeScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBarcodeScan" ADD CONSTRAINT "UserBarcodeScan_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "BarcodeMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBarcodeScan" ADD CONSTRAINT "UserBarcodeScan_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BarcodeGameConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
