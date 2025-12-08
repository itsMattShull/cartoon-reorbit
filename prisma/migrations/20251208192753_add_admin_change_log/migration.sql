-- CreateTable
CREATE TABLE "AdminChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prevValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminChangeLog_createdAt_idx" ON "AdminChangeLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminChangeLog_userId_createdAt_idx" ON "AdminChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminChangeLog_area_createdAt_idx" ON "AdminChangeLog"("area", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminChangeLog" ADD CONSTRAINT "AdminChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
