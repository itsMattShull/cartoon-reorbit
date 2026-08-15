// In-app notification writer.
//
// ── Import rules (please read before editing) ────────────────────────────────
// This module is imported from BOTH runtimes:
//   • Nuxt API handlers, as '@/server/utils/notifications'
//   • server/socket-server.js, as './utils/notifications.js' — a plain
//     `node server/socket-server.js` process (see package.json "socket")
//
// The `@/` alias and `#imports` are Nuxt/Vite-only. A plain Node process cannot
// resolve them: `import('@/server/prisma')` fails with ERR_MODULE_NOT_FOUND.
// That is why this file takes the Prisma client as a parameter instead of
// importing it, and imports nothing else at all. Do not "tidy" these signatures
// into an `import { prisma } from '@/server/prisma'` — it would break auction
// close, in a process with no test coverage, at whatever hour the auction ends.
//
// The same rule rules out importing server/utils/autoBid.js (imports `#imports`)
// and server/utils/systemAccounts.js (imports `@/server/prisma`) from here.
//
// ── Content rules ────────────────────────────────────────────────────────────
// Every title and body is built here from a fixed set of fields per type.
// Callers pass values, never prose. This is what keeps a private auto-bid
// maximum — the one genuinely non-public number in the auction system, see
// server/api/auction/[id]/autobid.get.js — out of text shown to someone else.
// Only amounts that were written as real Bid rows (and are therefore already
// public via /api/auction/[id]) may appear in an auction notification.
//
// There is no `link` field. Routes are derived on the client from `type`; see
// the note on the Notification model in prisma/schema.prisma.

// node:crypto, not the `uuid` package and not Postgres' gen_random_uuid(): a core
// module is the only import that is guaranteed to resolve identically in both
// runtimes described above, and it does not assume a Postgres version or an
// installed extension.
import { randomUUID } from 'node:crypto'

export const NOTIFICATION_TYPES = Object.freeze({
  AUCTION_OUTBID: 'AUCTION_OUTBID',
  AUCTION_NEW_BID: 'AUCTION_NEW_BID',
  AUCTION_WON: 'AUCTION_WON',
  TRADE_OFFER_RECEIVED: 'TRADE_OFFER_RECEIVED',
  TRADE_OFFER_ACCEPTED: 'TRADE_OFFER_ACCEPTED'
})

// Mirrors the guard in server/utils/discord.js — the official account is a
// system actor that holds auction-only stock and dissolved users' listings. It
// has no player behind it to read a notification.
const OFFICIAL_USERNAME = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'

const fmt = (n) => Number(n || 0).toLocaleString('en-US')

/**
 * Upsert one notification, collapsing onto the recipient's existing unread row
 * for the same (type, contextId) if there is one.
 *
 * Raw SQL because the collapse key is a partial unique index — Prisma's `upsert`
 * can only infer conflicts from constraints it knows about, and partial indexes
 * are not expressible in its schema language. `ON CONFLICT (cols) WHERE pred`
 * lets Postgres infer the partial index directly.
 *
 * Never throws. Every caller is on a path where the real work (the bid, the
 * trade, the payout) has already committed; failing to write a notification must
 * not turn a successful action into an error response.
 */
export async function createNotification (db, {
  userId,
  type,
  title,
  body = null,
  contextType = null,
  contextId = null
}) {
  if (!db || !userId || !type || !title) return false
  if (!NOTIFICATION_TYPES[type]) return false

  try {
    await db.$executeRaw`
      INSERT INTO "Notification" (
        "id", "userId", "type", "title", "body", "contextType", "contextId",
        "count", "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${userId},
        ${type}::"NotificationType",
        ${title},
        ${body},
        ${contextType}::"LockedContextType",
        ${contextId},
        1, NOW(), NOW()
      )
      ON CONFLICT ("userId", "type", "contextId") WHERE "readAt" IS NULL
      DO UPDATE SET
        "count"     = "Notification"."count" + 1,
        "title"     = EXCLUDED."title",
        "body"      = EXCLUDED."body",
        "createdAt" = NOW(),
        "updatedAt" = NOW()
    `
    return true
  } catch (err) {
    console.error('[notifications] write failed:', err?.message || err)
    return false
  }
}

/**
 * Should this user get in-app notifications at all?
 *
 * Deliberately does NOT consult `allowAuctionNotifications`. That flag's only
 * consumer is the Discord DM path (server/utils/discord.js), and the settings
 * copy describes it as such — turning it off means "stop DMing me", not "blind
 * me inside the site I am looking at". Reusing it here would silently break the
 * hub for everyone who already opted out, with nothing to explain why.
 *
 * The official account is skipped: it is a system actor, not a player.
 */
async function isNotifiable (db, userId) {
  if (!userId) return false
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, banned: true }
    })
    if (!u) return false
    if (u.banned) return false
    if (u.username === OFFICIAL_USERNAME) return false
    return true
  } catch {
    return false
  }
}

/** You were outbid on an auction you had the lead on. */
export async function notifyOutbid (db, { userId, auctionId, ctoonName, amount }) {
  if (!(await isNotifiable(db, userId))) return false
  return createNotification(db, {
    userId,
    type: NOTIFICATION_TYPES.AUCTION_OUTBID,
    title: `You were outbid on ${ctoonName || 'an auction'}`,
    // `amount` is the winning Bid row's amount, already public in the auction's
    // bid history. Never the outbidder's auto-bid maximum.
    body: amount ? `The bid to beat is now ${fmt(amount)} pts.` : null,
    contextType: 'AUCTION',
    contextId: auctionId
  })
}

/** Someone bid on an auction you listed. Collapses across a proxy-bid cascade. */
export async function notifyAuctionBid (db, { userId, auctionId, ctoonName, amount }) {
  if (!(await isNotifiable(db, userId))) return false
  return createNotification(db, {
    userId,
    type: NOTIFICATION_TYPES.AUCTION_NEW_BID,
    title: `New bid on your ${ctoonName || 'auction'}`,
    body: amount ? `The bid is now ${fmt(amount)} pts.` : null,
    contextType: 'AUCTION',
    contextId: auctionId
  })
}

/** You won an auction. Written in the same transaction as the payout. */
export async function notifyAuctionWon (db, { userId, auctionId, ctoonName, amount }) {
  return createNotification(db, {
    userId,
    type: NOTIFICATION_TYPES.AUCTION_WON,
    title: `You won ${ctoonName || 'an auction'}!`,
    body: amount ? `Winning bid: ${fmt(amount)} pts.` : null,
    contextType: 'AUCTION',
    contextId: auctionId
  })
}

/**
 * A trade offer landed in your incoming list.
 *
 * `contextId` is the SENDER's id, not the offer's. There is no per-offer page to
 * deep-link to — every trade notification opens /newsite/trade — so using the
 * sender collapses a flood of offers from one account into a single row instead
 * of one row per offer. Nothing rate-limits offer creation and a 1-point offer
 * is free to send, so without this the hub is an unbounded, attacker-writable
 * store in a victim's account.
 */
export async function notifyTradeOfferReceived (db, { userId, fromUserId, fromUsername, isCounter = false }) {
  if (!(await isNotifiable(db, userId))) return false
  return createNotification(db, {
    userId,
    type: NOTIFICATION_TYPES.TRADE_OFFER_RECEIVED,
    title: isCounter
      ? `${fromUsername || 'Someone'} countered your trade offer`
      : `New trade offer from ${fromUsername || 'someone'}`,
    body: 'Open Trades to review it.',
    contextType: 'TRADE',
    contextId: fromUserId
  })
}

/** A trade offer you sent was accepted. */
export async function notifyTradeOfferAccepted (db, { userId, offerId, byUsername }) {
  if (!(await isNotifiable(db, userId))) return false
  return createNotification(db, {
    userId,
    type: NOTIFICATION_TYPES.TRADE_OFFER_ACCEPTED,
    title: `${byUsername || 'Someone'} accepted your trade offer`,
    body: 'The cToons and points have been transferred.',
    contextType: 'TRADE',
    contextId: offerId
  })
}
