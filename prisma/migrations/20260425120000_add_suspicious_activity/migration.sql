-- CreateTable
CREATE TABLE "SuspiciousActivityRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timeWindowDays" INTEGER,
    "conditionLogic" TEXT NOT NULL DEFAULT 'AND',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SuspiciousActivityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousActivityCondition" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuspiciousActivityCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousActivityMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspiciousActivityMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuspiciousActivityRule_isActive_idx" ON "SuspiciousActivityRule"("isActive");

-- CreateIndex
CREATE INDEX "SuspiciousActivityRule_createdAt_idx" ON "SuspiciousActivityRule"("createdAt");

-- CreateIndex
CREATE INDEX "SuspiciousActivityCondition_ruleId_idx" ON "SuspiciousActivityCondition"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "SuspiciousActivityMute_userId_key" ON "SuspiciousActivityMute"("userId");

-- CreateIndex
CREATE INDEX "SuspiciousActivityMute_createdAt_idx" ON "SuspiciousActivityMute"("createdAt");

-- AddForeignKey
ALTER TABLE "SuspiciousActivityRule" ADD CONSTRAINT "SuspiciousActivityRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousActivityCondition" ADD CONSTRAINT "SuspiciousActivityCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SuspiciousActivityRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousActivityMute" ADD CONSTRAINT "SuspiciousActivityMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousActivityMute" ADD CONSTRAINT "SuspiciousActivityMute_mutedById_fkey" FOREIGN KEY ("mutedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
