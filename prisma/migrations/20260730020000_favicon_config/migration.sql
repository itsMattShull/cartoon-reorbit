-- AlterTable: site favicon/meta-icon config, uploaded from Admin > Manage Homepage > Favicon
ALTER TABLE "GlobalGameConfig" ADD COLUMN "faviconVersion" BIGINT;
ALTER TABLE "GlobalGameConfig" ADD COLUMN "faviconSourcePath" TEXT;
