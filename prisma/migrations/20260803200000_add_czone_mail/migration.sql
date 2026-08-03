-- cZone Mail ("cMail")
--
-- Players leave pre-made, admin-authored messages on each other's cZones, get a
-- Discord notification, and read them in a "cMail" module on My cWorld.
--
-- Written idempotently (IF NOT EXISTS / duplicate_object guards) to match the
-- house migration style — see 20260803100000_add_ed_edd_eddy_rps.

-- ── Templates: the admin-authored canned sentences ──────────────────────────
CREATE TABLE IF NOT EXISTS "CZoneMailTemplate" (
    "id"         TEXT NOT NULL,
    "text"       TEXT NOT NULL,
    "emoji"      TEXT,
    "category"   TEXT,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "active"     BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneMailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CZoneMailTemplate_active_sortOrder_idx"
    ON "CZoneMailTemplate"("active", "sortOrder");

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CZoneMail" (
    "id"             TEXT NOT NULL,
    "senderId"       TEXT NOT NULL,
    "recipientId"    TEXT NOT NULL,
    "templateId"     TEXT,
    "body"           TEXT NOT NULL,
    "emoji"          TEXT,
    "readAt"         TIMESTAMP(3),
    "deletedAt"      TIMESTAMP(3),
    "hiddenFromWall" TIMESTAMP(3),
    "notifiedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneMail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CZoneMail_recipientId_createdAt_idx"
    ON "CZoneMail"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "CZoneMail_senderId_createdAt_idx"
    ON "CZoneMail"("senderId", "createdAt");
CREATE INDEX IF NOT EXISTS "CZoneMail_createdAt_idx"
    ON "CZoneMail"("createdAt");
CREATE INDEX IF NOT EXISTS "CZoneMail_templateId_idx"
    ON "CZoneMail"("templateId");
CREATE INDEX IF NOT EXISTS "CZoneMail_recipientId_notifiedAt_idx"
    ON "CZoneMail"("recipientId", "notifiedAt");

-- Partial index backing the unread badge. Only unread rows are indexed, so the
-- index stays tiny and self-pruning (entries disappear as mail is read) instead
-- of carrying every row ever sent to answer a question about the few unread.
--
-- This has no equivalent in the Prisma schema language, so `prisma migrate dev`
-- will report it as drift and offer to drop it — keep it. Same caveat as the
-- partial unique index in 20260803000000_unique_active_auction_per_user_ctoon.
CREATE INDEX IF NOT EXISTS "CZoneMail_unread_recipient_idx"
    ON "CZoneMail"("recipientId") WHERE "readAt" IS NULL;

DO $$ BEGIN
    ALTER TABLE "CZoneMail"
        ADD CONSTRAINT "CZoneMail_senderId_fkey"
        FOREIGN KEY ("senderId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "CZoneMail"
        ADD CONSTRAINT "CZoneMail_recipientId_fkey"
        FOREIGN KEY ("recipientId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Player-level blocks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserBlock" (
    "id"        TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key"
    ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx"
    ON "UserBlock"("blockedId");

DO $$ BEGIN
    ALTER TABLE "UserBlock"
        ADD CONSTRAINT "UserBlock_blockerId_fkey"
        FOREIGN KEY ("blockerId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "UserBlock"
        ADD CONSTRAINT "UserBlock_blockedId_fkey"
        FOREIGN KEY ("blockedId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Discord notification thread cache ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CZoneMailThread" (
    "userId"        TEXT NOT NULL,
    "threadId"      TEXT NOT NULL,
    "channelId"     TEXT NOT NULL,
    "memberAddedAt" TIMESTAMP(3),
    "lastPostedAt"  TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneMailThread_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CZoneMailThread_threadId_key"
    ON "CZoneMailThread"("threadId");
CREATE INDEX IF NOT EXISTS "CZoneMailThread_channelId_idx"
    ON "CZoneMailThread"("channelId");

DO $$ BEGIN
    ALTER TABLE "CZoneMailThread"
        ADD CONSTRAINT "CZoneMailThread_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Burst-guard trips ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CZoneMailSpamLog" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "count"         INTEGER NOT NULL,
    "windowMinutes" INTEGER NOT NULL,
    "blockedUntil"  TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CZoneMailSpamLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CZoneMailSpamLog_createdAt_idx"
    ON "CZoneMailSpamLog"("createdAt");
CREATE INDEX IF NOT EXISTS "CZoneMailSpamLog_userId_createdAt_idx"
    ON "CZoneMailSpamLog"("userId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "CZoneMailSpamLog"
        ADD CONSTRAINT "CZoneMailSpamLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── User preferences + persisted block expiry ───────────────────────────────
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "allowCzoneMailNotifications" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "czoneMailWallEnabled"        BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "czoneMailBlockedUntil"       TIMESTAMP(3);

-- ── Global settings ─────────────────────────────────────────────────────────
ALTER TABLE "GlobalGameConfig"
    ADD COLUMN IF NOT EXISTS "czoneMailDiscordChannelId"    TEXT,
    ADD COLUMN IF NOT EXISTS "czoneMailCooldownSeconds"     INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS "czoneMailSpamWindowMinutes"   INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN IF NOT EXISTS "czoneMailSpamThreshold"       INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS "czoneMailSpamBlockHours"      INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS "czoneMailRetentionDays"       INTEGER NOT NULL DEFAULT 90,
    ADD COLUMN IF NOT EXISTS "czoneMailPairCooldownMinutes" INTEGER NOT NULL DEFAULT 60;

-- ── Seed a starter set of kid-friendly templates ────────────────────────────
-- Only when the table is empty, so re-running never duplicates them and never
-- resurrects sentences an admin deliberately removed.
INSERT INTO "CZoneMailTemplate" ("id", "text", "emoji", "category", "sortOrder", "active")
SELECT * FROM (VALUES
    (gen_random_uuid()::text, 'Nice cZone!',                    '😄', 'Compliments', 10, true),
    (gen_random_uuid()::text, 'Your cZone looks awesome!',      '🌟', 'Compliments', 20, true),
    (gen_random_uuid()::text, 'Cool cToons!',                   '🎉', 'Compliments', 30, true),
    (gen_random_uuid()::text, 'Love your setup!',               '💖', 'Compliments', 40, true),
    (gen_random_uuid()::text, 'Want to trade?',                 '🔁', 'Trading',     10, true),
    (gen_random_uuid()::text, 'Check out my trade list!',       '📋', 'Trading',     20, true),
    (gen_random_uuid()::text, 'I have a cToon on your wishlist!','🎁', 'Trading',    30, true),
    (gen_random_uuid()::text, 'Hi! Thanks for visiting!',       '👋', 'Greetings',   10, true),
    (gen_random_uuid()::text, 'Good luck out there!',           '🍀', 'Greetings',   20, true),
    (gen_random_uuid()::text, 'See you around ReOrbit!',        '🚀', 'Greetings',   30, true)
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM "CZoneMailTemplate");
