-- CreateTable
CREATE TABLE "CMoonAffinityLevelRewardAvatar" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "avatarId" TEXT NOT NULL,

    CONSTRAINT "CMoonAffinityLevelRewardAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CMoonAffinityLevelRewardAvatar_levelId_avatarId_key" ON "CMoonAffinityLevelRewardAvatar"("levelId", "avatarId");

-- CreateIndex
CREATE INDEX "CMoonAffinityLevelRewardAvatar_avatarId_idx" ON "CMoonAffinityLevelRewardAvatar"("avatarId");

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevelRewardAvatar" ADD CONSTRAINT "CMoonAffinityLevelRewardAvatar_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "CMoonAffinityLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CMoonAffinityLevelRewardAvatar" ADD CONSTRAINT "CMoonAffinityLevelRewardAvatar_avatarId_fkey" FOREIGN KEY ("avatarId") REFERENCES "Avatar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry forward each level's existing single reward avatar into the new many-to-many join
-- table before the old column is dropped below — no existing admin-configured reward is lost.
INSERT INTO "CMoonAffinityLevelRewardAvatar" ("id", "levelId", "avatarId")
SELECT gen_random_uuid()::text, "id", "rewardAvatarId"
FROM "CMoonAffinityLevel"
WHERE "rewardAvatarId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "CMoonAffinityLevel" DROP CONSTRAINT "CMoonAffinityLevel_rewardAvatarId_fkey";

-- AlterTable
ALTER TABLE "CMoonAffinityLevel" DROP COLUMN "rewardAvatarId";
