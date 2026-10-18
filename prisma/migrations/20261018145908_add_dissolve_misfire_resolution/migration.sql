-- AlterTable
ALTER TABLE "DissolveMisfireLog" ADD COLUMN     "resolutionBlockedReason" TEXT,
ADD COLUMN     "resolutionSummary" JSONB,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedByUserId" TEXT,
ADD COLUMN     "resolvedByUsername" TEXT;
