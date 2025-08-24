-- CreateTable
CREATE TABLE "StarterSet" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarterSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarterSetItem" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StarterSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarterSet_key_key" ON "StarterSet"("key");

-- CreateIndex
CREATE INDEX "StarterSetItem_setId_position_idx" ON "StarterSetItem"("setId", "position");

-- CreateIndex
CREATE INDEX "StarterSetItem_ctoonId_idx" ON "StarterSetItem"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "StarterSetItem_setId_ctoonId_key" ON "StarterSetItem"("setId", "ctoonId");

-- AddForeignKey
ALTER TABLE "StarterSetItem" ADD CONSTRAINT "StarterSetItem_setId_fkey" FOREIGN KEY ("setId") REFERENCES "StarterSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterSetItem" ADD CONSTRAINT "StarterSetItem_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
