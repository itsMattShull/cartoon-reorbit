-- CreateTable
CREATE TABLE "WheelSpinLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "points" INTEGER,
    "ctoonId" TEXT,
    "sliceIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WheelSpinLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WheelSpinLog_userId_createdAt_idx" ON "WheelSpinLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WheelSpinLog_ctoonId_idx" ON "WheelSpinLog"("ctoonId");

-- AddForeignKey
ALTER TABLE "WheelSpinLog" ADD CONSTRAINT "WheelSpinLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WheelSpinLog" ADD CONSTRAINT "WheelSpinLog_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
