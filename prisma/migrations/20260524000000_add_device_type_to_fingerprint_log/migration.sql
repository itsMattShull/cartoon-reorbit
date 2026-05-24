-- Clear all existing rows before the schema change.
-- Old data pre-dates the deviceType column and the daily-dedup logic,
-- so it's cleaner to start fresh than to carry forward incomplete records.
TRUNCATE TABLE "DeviceFingerprintLog";

-- AlterTable
ALTER TABLE "DeviceFingerprintLog" ADD COLUMN "deviceType" TEXT;
