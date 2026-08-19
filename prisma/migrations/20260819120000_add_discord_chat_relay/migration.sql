-- Discord chat relay: admin-facing config on the singleton GlobalGameConfig row,
-- plus a per-user chat timeout on User.
--
-- Written idempotently to match the house style of the surrounding migrations.

-- ── Lock safety ──────────────────────────────────────────────────────────────
-- Every statement below takes ACCESS EXCLUSIVE on its table. All of them are
-- nullable-or-defaulted ADD COLUMNs, which are catalog-only on PG11+ (no table
-- rewrite), so each is instant *once it has the lock*. "User" in particular is
-- read by essentially every request, so failing fast and retrying beats queuing
-- the whole site behind a lock wait.
SET lock_timeout = '3s';

-- ── GlobalGameConfig: relay settings ─────────────────────────────────────────
-- Deliberately absent: the webhook id/token. Both admin config endpoints return
-- this row wholesale, so a secret stored here would be serialized into every
-- admin's browser on every settings page load. The webhook credential lives in
-- env (DISCORD_CHAT_WEBHOOK_ID / DISCORD_CHAT_WEBHOOK_TOKEN) alongside BOT_TOKEN.
--
-- Default false: switching this on republishes a Discord channel to the website
-- and opens an ingress from the website into Discord. That is a deliberate act,
-- not a side effect of deploying.
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "discordChatEnabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "discordChatChannelId"       TEXT,
  ADD COLUMN IF NOT EXISTS "discordChatSlowmodeSeconds" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "discordChatMaxLength"       INTEGER NOT NULL DEFAULT 400,
  -- Off by default: an attachment is an arbitrary image chosen by any guild
  -- member and rendered to every logged-in site user, and Discord's attachment
  -- CDN URLs are signed and expire after roughly a day.
  ADD COLUMN IF NOT EXISTS "discordChatShowAttachments" BOOLEAN NOT NULL DEFAULT false;

-- ── User: chat timeout ───────────────────────────────────────────────────────
-- Null or in the past = not muted. "banned" already stops chat entirely; this is
-- the narrower lever, because a relayed message reaches Discord as a single
-- webhook identity and so cannot be timed out with Discord's own moderation
-- tools.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatMutedUntil" TIMESTAMP(3);

RESET lock_timeout;
