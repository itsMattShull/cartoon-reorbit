-- AlterTable
ALTER TABLE "User" ADD COLUMN "vpnDetected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "VpnLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVpn" BOOLEAN NOT NULL,
    "proxyType" TEXT,
    "isp" TEXT,
    "org" TEXT,
    "asn" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "reason" TEXT,

    CONSTRAINT "VpnLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VpnLog_userId_idx" ON "VpnLog"("userId");

-- CreateIndex
CREATE INDEX "VpnLog_ip_idx" ON "VpnLog"("ip");

-- AddForeignKey
ALTER TABLE "VpnLog" ADD CONSTRAINT "VpnLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
