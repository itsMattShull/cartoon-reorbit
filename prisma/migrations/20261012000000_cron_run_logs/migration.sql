-- CreateTable
CREATE TABLE "CronRunLog" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "detail" TEXT,
    "error" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobState" (
    "job" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastDurationMs" INTEGER,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CronJobState_pkey" PRIMARY KEY ("job")
);

-- CreateIndex
CREATE INDEX "CronRunLog_startedAt_idx" ON "CronRunLog"("startedAt");

-- CreateIndex
CREATE INDEX "CronRunLog_job_startedAt_idx" ON "CronRunLog"("job", "startedAt");

-- CreateIndex
CREATE INDEX "CronRunLog_status_startedAt_idx" ON "CronRunLog"("status", "startedAt");
