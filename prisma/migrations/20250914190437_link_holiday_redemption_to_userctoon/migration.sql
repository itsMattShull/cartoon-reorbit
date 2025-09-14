-- AlterTable
ALTER TABLE "UserCtoon" ADD COLUMN     "burnedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HolidayEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "minRevealAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HolidayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayEventItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,

    CONSTRAINT "HolidayEventItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayEventPool" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "probabilityPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HolidayEventPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayRedemption" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemCtoonId" TEXT NOT NULL,
    "sourceUserCtoonId" TEXT,
    "resultCtoonId" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolidayEvent_name_key" ON "HolidayEvent"("name");

-- CreateIndex
CREATE INDEX "HolidayEvent_isActive_startsAt_endsAt_idx" ON "HolidayEvent"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "HolidayEvent_startsAt_endsAt_idx" ON "HolidayEvent"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "HolidayEventItem_ctoonId_idx" ON "HolidayEventItem"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayEventItem_eventId_ctoonId_key" ON "HolidayEventItem"("eventId", "ctoonId");

-- CreateIndex
CREATE INDEX "HolidayEventPool_eventId_idx" ON "HolidayEventPool"("eventId");

-- CreateIndex
CREATE INDEX "HolidayEventPool_ctoonId_idx" ON "HolidayEventPool"("ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayEventPool_eventId_ctoonId_key" ON "HolidayEventPool"("eventId", "ctoonId");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayRedemption_sourceUserCtoonId_key" ON "HolidayRedemption"("sourceUserCtoonId");

-- CreateIndex
CREATE INDEX "HolidayRedemption_eventId_redeemedAt_idx" ON "HolidayRedemption"("eventId", "redeemedAt");

-- CreateIndex
CREATE INDEX "HolidayRedemption_userId_redeemedAt_idx" ON "HolidayRedemption"("userId", "redeemedAt");

-- CreateIndex
CREATE INDEX "HolidayRedemption_itemCtoonId_idx" ON "HolidayRedemption"("itemCtoonId");

-- CreateIndex
CREATE INDEX "HolidayRedemption_resultCtoonId_idx" ON "HolidayRedemption"("resultCtoonId");

-- AddForeignKey
ALTER TABLE "HolidayEventItem" ADD CONSTRAINT "HolidayEventItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HolidayEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayEventItem" ADD CONSTRAINT "HolidayEventItem_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayEventPool" ADD CONSTRAINT "HolidayEventPool_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HolidayEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayEventPool" ADD CONSTRAINT "HolidayEventPool_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRedemption" ADD CONSTRAINT "HolidayRedemption_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "HolidayEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRedemption" ADD CONSTRAINT "HolidayRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRedemption" ADD CONSTRAINT "HolidayRedemption_itemCtoonId_fkey" FOREIGN KEY ("itemCtoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRedemption" ADD CONSTRAINT "HolidayRedemption_resultCtoonId_fkey" FOREIGN KEY ("resultCtoonId") REFERENCES "Ctoon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRedemption" ADD CONSTRAINT "HolidayRedemption_sourceUserCtoonId_fkey" FOREIGN KEY ("sourceUserCtoonId") REFERENCES "UserCtoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
