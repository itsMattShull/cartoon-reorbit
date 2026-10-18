-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "adminRestricted" BOOLEAN NOT NULL DEFAULT false;

-- The earlier fixed sub-admin role (User.isSubAdmin) is replaced by per-tool access. Carry every
-- existing sub-admin over with the tools that role allowed (the 'Standard sub-admin' preset in
-- utils/adminPermissions.js; tests/adminPermissions.test.js keeps the two in step), then drop it.
UPDATE "User"
SET "adminRestricted" = true,
    "adminPermissions" = ARRAY['analytics', 'collectionAnalytics', 'setAnalytics', 'packAnalytics', 'checkUserMints', 'manageCollection', 'cheatFinder', 'suspiciousActivity', 'deviceFingerprints', 'vpn-queue', 'ctoons', 'ctoonsBulkUpload', 'submittedCtoons', 'ctoonSuggestions', 'starterSets', 'packs', 'backgrounds', 'czoneSearch', 'czoneContest', 'homepage', 'announcements', 'ads', 'tutorial', 'certificate', 'encyclopedia', 'siteTheme', 'manageSales', 'games', 'cMoon', 'cMoonJoinEffects', 'czoneEffects', 'cmoonChangeRequests', 'manageNavigation', 'cMoonEnemies', 'cMoonRiddles', 'cMoonHunts', 'lotto', 'clashTournaments', 'monsters', 'scavenger', 'achievements', 'holidayEvents', 'errorLogs', 'cronRunLogs', 'queueMonitor', 'authLogs', 'tradeLogs', 'auctionLogs', 'ctoonOwnerLogs', 'czoneSearchLogs', 'pointLogs', 'cmoonPointLogs', 'cMoonBattleLogs', 'achievementLogs', 'gtoonsClashLogs', 'edRpsLogs', 'pokemonBattleLogs', 'monsterBattleLogs', 'lottoLogs', 'winWheelLogs', 'scavengerLogs', 'adminChanges']::TEXT[]
WHERE "isSubAdmin" = true AND "isAdmin" = true;

ALTER TABLE "User" DROP COLUMN "isSubAdmin";
