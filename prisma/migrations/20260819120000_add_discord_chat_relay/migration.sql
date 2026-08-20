-- Discord chat relay: config on GlobalGameConfig, chat timeout on User.
-- Nullable/defaulted ADD COLUMNs are catalog-only, but lock_timeout still
-- protects "User" (read on nearly every request) from a queued lock wait.
SET lock_timeout = '3s';

-- No webhook id/token here — that's a bearer credential and this row is
-- returned wholesale by the admin config endpoints. It lives in env instead.
ALTER TABLE "GlobalGameConfig"
  ADD COLUMN IF NOT EXISTS "discordChatEnabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "discordChatChannelId"       TEXT,
  ADD COLUMN IF NOT EXISTS "discordChatSlowmodeSeconds" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "discordChatMaxLength"       INTEGER NOT NULL DEFAULT 400,
  ADD COLUMN IF NOT EXISTS "discordChatShowAttachments" BOOLEAN NOT NULL DEFAULT false;

-- Null/past = not muted. Narrower than "banned" — see chat-mute.post.js.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "chatMutedUntil" TIMESTAMP(3);

RESET lock_timeout;
