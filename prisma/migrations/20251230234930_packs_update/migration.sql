-- AlterTable
ALTER TABLE "Pack" ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "scheduledOffAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);
