/*
  Warnings:

  - You are about to rename the column `bannerImagePath` on the `CMoon` table to
    `buttonImagePath`. Existing uploaded banners (800x200) are kept in place under their old
    /cmoon-banners/ path and old dimensions — admins re-upload in the new ~232x62 pill shape
    via the renamed admin endpoint; nothing is deleted here.

*/

-- AlterTable
ALTER TABLE "User" ADD COLUMN "cMoonOptedOut" BOOLEAN NOT NULL DEFAULT false;

-- RenameColumn: bannerImagePath (800x200 banner shown on cToon ID cards) becomes buttonImagePath
-- (small pill button, same on-page purpose, new resolution — see the renamed
-- server/api/admin/cmoons/[id]/button-image.post.js).
ALTER TABLE "CMoon" RENAME COLUMN "bannerImagePath" TO "buttonImagePath";

-- AlterTable
ALTER TABLE "CMoon" ADD COLUMN "showButtonOnPages" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pageBannerImagePath" TEXT;

-- CreateTable
CREATE TABLE "CMoonFeaturedCtoon" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "ctoonId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonFeaturedCtoon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPoll" (
    "id" TEXT NOT NULL,
    "cMoonId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMoonPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CMoonPollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CMoonPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMoonPollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonFeaturedCtoon_cMoonId_ctoonId_key" ON "CMoonFeaturedCtoon"("cMoonId", "ctoonId");

-- CreateIndex
CREATE INDEX "CMoonFeaturedCtoon_cMoonId_sortOrder_idx" ON "CMoonFeaturedCtoon"("cMoonId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPoll_cMoonId_key" ON "CMoonPoll"("cMoonId");

-- CreateIndex
CREATE INDEX "CMoonPollOption_pollId_sortOrder_idx" ON "CMoonPollOption"("pollId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CMoonPollVote_pollId_userId_key" ON "CMoonPollVote"("pollId", "userId");

-- CreateIndex
CREATE INDEX "CMoonPollVote_pollId_optionId_idx" ON "CMoonPollVote"("pollId", "optionId");

-- CreateIndex: powers the cMoon page's "Top Ranking Members" leaderboard view — filters to this
-- cMoon's ranked members before the join/sort, pruning the (usually majority) no-rank rows first.
CREATE INDEX "User_cMoonId_currentCMoonRankId_idx" ON "User"("cMoonId", "currentCMoonRankId");

-- AddForeignKey
ALTER TABLE "CMoonFeaturedCtoon" ADD CONSTRAINT "CMoonFeaturedCtoon_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonFeaturedCtoon" ADD CONSTRAINT "CMoonFeaturedCtoon_ctoonId_fkey" FOREIGN KEY ("ctoonId") REFERENCES "Ctoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPoll" ADD CONSTRAINT "CMoonPoll_cMoonId_fkey" FOREIGN KEY ("cMoonId") REFERENCES "CMoon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPollOption" ADD CONSTRAINT "CMoonPollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "CMoonPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPollVote" ADD CONSTRAINT "CMoonPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "CMoonPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPollVote" ADD CONSTRAINT "CMoonPollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CMoonPollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonPollVote" ADD CONSTRAINT "CMoonPollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: the join modal now shows 5 portrait slots instead of 4 — seed the 5th cMoon
-- so there's something for an admin to immediately upload art onto. Idempotent (ON CONFLICT on
-- the existing unique `name` constraint) so this never clobbers an admin who already created a
-- "Arcade Moon" cMoon by hand, and is a no-op on any environment that runs this migration twice.
INSERT INTO "CMoon" ("id", "name", "color", "memberCount", "teamScore", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Arcade Moon', '#4c1d95', 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
