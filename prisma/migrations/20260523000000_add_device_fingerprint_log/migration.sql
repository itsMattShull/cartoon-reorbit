-- CreateTable
CREATE TABLE "DeviceFingerprintLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceFingerprintLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceFingerprintLog_userId_idx" ON "DeviceFingerprintLog"("userId");

-- CreateIndex
CREATE INDEX "DeviceFingerprintLog_visitorId_idx" ON "DeviceFingerprintLog"("visitorId");

-- CreateIndex
CREATE INDEX "DeviceFingerprintLog_ip_idx" ON "DeviceFingerprintLog"("ip");

-- CreateIndex
CREATE INDEX "DeviceFingerprintLog_createdAt_idx" ON "DeviceFingerprintLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DeviceFingerprintLog" ADD CONSTRAINT "DeviceFingerprintLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
