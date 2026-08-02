-- Generic error log for background cron/worker jobs, surfaced on the new admin "Error Logs"
-- page. Captures both errors raised while a scheduled job is running and the
-- uncaughtException/unhandledRejection handlers that used to crash the guild-checker
-- process silently.
CREATE TABLE "CronErrorLog" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CronErrorLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronErrorLog_createdAt_idx" ON "CronErrorLog"("createdAt");

CREATE INDEX "CronErrorLog_dismissed_idx" ON "CronErrorLog"("dismissed");
