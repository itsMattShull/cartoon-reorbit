-- AlterTable
ALTER TABLE "GlobalGameConfig" ADD COLUMN     "cMoonEnemySpawnCapCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cMoonEnemySpawnCapWindowHours" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowCMoonEnemyPopups" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CMoonEnemyPopupLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonEnemyPopupLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMoonEnemyPopupLog_userId_shownAt_idx" ON "CMoonEnemyPopupLog"("userId", "shownAt");

-- AddForeignKey
ALTER TABLE "CMoonEnemyPopupLog" ADD CONSTRAINT "CMoonEnemyPopupLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
