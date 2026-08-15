-- In-app notification hub.
--
-- Five events write here: outbid on an auction, a new bid on your auction, an
-- auction you won, an incoming trade offer, and an offer of yours being accepted.
-- Two of those fire on the hottest path in the app (every bid), so the indexes
-- below are chosen for the two queries that actually run, not for the shape of
-- the model.

CREATE TYPE "NotificationType" AS ENUM (
  'AUCTION_OUTBID',
  'AUCTION_NEW_BID',
  'AUCTION_WON',
  'TRADE_OFFER_RECEIVED',
  'TRADE_OFFER_ACCEPTED'
);

CREATE TABLE "Notification" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "type"        "NotificationType" NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT,
  "contextType" "LockedContextType",
  "contextId"   TEXT,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The drawer: newest N for one user.
--
-- Note the column order. An index of (userId, readAt, createdAt) — the obvious
-- one to reach for — cannot serve this at all: readAt sits between the equality
-- column and the sort column, so Postgres can only use the leading userId and
-- then has to sort the user's entire notification history to return 30 rows.
CREATE INDEX "Notification_userId_createdAt_idx"
    ON "Notification"("userId", "createdAt" DESC);

-- The badge: count unread for one user, on an interval, for every logged-in
-- user. Partial, so the index contains only unread rows and stays a few hundred
-- entries forever regardless of how deep the read history gets. This is the one
-- index that has to stay small, because it is the one that is hit constantly.
--
-- Not expressible in the Prisma schema language; `prisma migrate dev` will
-- report it as drift and offer to drop it — keep it.
CREATE INDEX "Notification_unread_idx"
    ON "Notification"("userId")
 WHERE "readAt" IS NULL;

-- Collapse key. Without this, one manual bid into a proxy auto-bid war writes a
-- notification per Bid row (server/utils/autoBid.js loops until the ladder
-- settles), so a seller gets ten cards for one human action and a badge of ten.
-- With it, the writer upserts: twelve bids on one auction become one row with
-- count = 12.
--
-- It also blunts notification spam. Nothing rate-limits trade offers, and an
-- offer of 1 point is free to send, so an attacker could otherwise mint
-- unbounded permanent rows in a victim's hub. Collapsing TRADE_OFFER_RECEIVED on
-- the sender's id caps that at one row per hostile account.
--
-- Scoped to unread rows so that clearing the badge starts a fresh row rather
-- than resurrecting an old one the user has already dealt with. Also partial,
-- also invisible to Prisma — keep it.
CREATE UNIQUE INDEX "Notification_collapse_key"
    ON "Notification"("userId", "type", "contextId")
 WHERE "readAt" IS NULL;

-- Locked points are now read on /api/auth/me, i.e. on every page load, to show
-- the "N locked" figure in the sidebar. That query sums `amount` over a user's
-- ACTIVE locks; the existing (userId, status) index finds the rows but does not
-- carry `amount`, so every matching row cost a heap fetch. INCLUDE makes the
-- aggregate index-only.
--
-- The table really is named "loackedPoints" — see the @@map in schema.prisma.
-- The typo is load-bearing in raw SQL.
CREATE INDEX "loackedPoints_userId_status_amount_idx"
    ON "loackedPoints"("userId", "status") INCLUDE ("amount");
