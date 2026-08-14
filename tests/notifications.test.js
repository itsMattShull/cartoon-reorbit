import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  NOTIFICATION_TYPES,
  createNotification,
  notifyOutbid,
  notifyAuctionBid,
  notifyAuctionWon,
  notifyTradeOfferReceived,
  notifyTradeOfferAccepted
} from '../server/utils/notifications.js'

// A stand-in for the Prisma client that records what it was asked to do. The
// writer takes `db` as a parameter precisely so it can be driven like this from
// both runtimes — see the import-rules header on the module under test.
function fakeDb ({ user = { username: 'alice', banned: false }, throwOnWrite = false } = {}) {
  const calls = { writes: [], userLookups: 0 }
  return {
    calls,
    async $executeRaw (strings, ...values) {
      if (throwOnWrite) throw new Error('db exploded')
      calls.writes.push({ sql: strings.join('?'), values })
      return 1
    },
    user: {
      async findUnique () {
        calls.userLookups++
        return user
      }
    }
  }
}

// ── The import contract ───────────────────────────────────────────
// The socket server is a plain `node server/socket-server.js` process, so it
// cannot resolve Nuxt's `@/` alias or `#imports`. That this test file imports
// the module at all is the assertion: a bare `node --test` run would fail on any
// aliased import added to it. Keep it that way.

test('every helper is exported and callable', () => {
  for (const fn of [createNotification, notifyOutbid, notifyAuctionBid,
    notifyAuctionWon, notifyTradeOfferReceived, notifyTradeOfferAccepted]) {
    assert.equal(typeof fn, 'function')
  }
})

test('the type set is closed and frozen', () => {
  assert.ok(Object.isFrozen(NOTIFICATION_TYPES))
  assert.deepEqual(Object.keys(NOTIFICATION_TYPES).sort(), [
    'AUCTION_NEW_BID',
    'AUCTION_OUTBID',
    'AUCTION_WON',
    'TRADE_OFFER_ACCEPTED',
    'TRADE_OFFER_RECEIVED'
  ])
})

// ── createNotification ────────────────────────────────────────────

test('createNotification rejects an unknown type rather than writing it', async () => {
  const db = fakeDb()
  const ok = await createNotification(db, {
    userId: 'u1', type: 'TOTALLY_MADE_UP', title: 'hi'
  })
  assert.equal(ok, false)
  assert.equal(db.calls.writes.length, 0)
})

test('createNotification requires a recipient and a title', async () => {
  const db = fakeDb()
  assert.equal(await createNotification(db, { type: 'AUCTION_WON', title: 't' }), false)
  assert.equal(await createNotification(db, { userId: 'u1', type: 'AUCTION_WON' }), false)
  assert.equal(db.calls.writes.length, 0)
})

test('createNotification upserts on the collapse key instead of inserting blindly', async () => {
  const db = fakeDb()
  await createNotification(db, {
    userId: 'u1',
    type: 'AUCTION_NEW_BID',
    title: 'New bid',
    contextType: 'AUCTION',
    contextId: 'auction-1'
  })
  const { sql } = db.calls.writes[0]
  // The collapse is what stops one proxy-bid cascade writing a notification per
  // Bid row, and what caps trade-offer spam at one row per sender.
  assert.match(sql, /ON CONFLICT/)
  assert.match(sql, /"readAt" IS NULL/)
  assert.match(sql, /"count"\s*=\s*"Notification"\."count"\s*\+\s*1/)
})

test('createNotification swallows database failures', async () => {
  // Every call site sits after work that has already committed — a bid, a trade,
  // a payout. A failed notification must never turn that into an error response.
  const db = fakeDb({ throwOnWrite: true })
  assert.equal(await createNotification(db, {
    userId: 'u1', type: 'AUCTION_WON', title: 'You won'
  }), false)
})

// ── Recipient eligibility ─────────────────────────────────────────

test('banned users are not notified', async () => {
  const db = fakeDb({ user: { username: 'alice', banned: true } })
  await notifyOutbid(db, { userId: 'u1', auctionId: 'a1', ctoonName: 'Dexter', amount: 100 })
  assert.equal(db.calls.writes.length, 0)
})

test('the official account is not notified', async () => {
  // It is a system actor: it holds auction-only stock and dissolved users'
  // listings, with no player behind it. Mirrors the guard in utils/discord.js.
  const db = fakeDb({ user: { username: 'CartoonReOrbitOfficial', banned: false } })
  await notifyAuctionBid(db, { userId: 'official', auctionId: 'a1', ctoonName: 'Dexter', amount: 100 })
  assert.equal(db.calls.writes.length, 0)
})

test('a deleted recipient is not notified', async () => {
  const db = fakeDb({ user: null })
  await notifyTradeOfferReceived(db, { userId: 'gone', fromUserId: 'u2', fromUsername: 'bob' })
  assert.equal(db.calls.writes.length, 0)
})

// ── Content ───────────────────────────────────────────────────────

test('outbid text carries the public bid amount and nothing else', async () => {
  const db = fakeDb()
  await notifyOutbid(db, { userId: 'u1', auctionId: 'a1', ctoonName: 'Dexter', amount: 1500 })
  const { values } = db.calls.writes[0]
  const text = values.join(' | ')
  assert.match(text, /Dexter/)
  assert.match(text, /1,500/)
  // The one genuinely private number in the auction system is another user's
  // AuctionAutoBid.maxAmount. Callers pass values, never prose, so there is no
  // path for it to reach this text — this asserts the shape that keeps it so.
  assert.equal(values.filter(v => typeof v === 'number').length, 0)
})

test('auction notifications carry the auction id as their context', async () => {
  const db = fakeDb()
  await notifyAuctionWon(db, { userId: 'u1', auctionId: 'auction-7', ctoonName: 'Dee Dee', amount: 90 })
  const { values } = db.calls.writes[0]
  assert.ok(values.includes('AUCTION'))
  assert.ok(values.includes('auction-7'))
})

test('auction-won skips the eligibility lookup', async () => {
  // It is written inside the auction-close transaction, which already holds row
  // locks that every concurrent bidder serialises behind. The winner is by
  // definition a real actor who just paid, so the extra query is not worth
  // widening that window.
  const db = fakeDb()
  await notifyAuctionWon(db, { userId: 'u1', auctionId: 'a1', ctoonName: 'X', amount: 1 })
  assert.equal(db.calls.userLookups, 0)
  assert.equal(db.calls.writes.length, 1)
})

test('received-offer notifications collapse on the sender, not the offer', async () => {
  // Nothing rate-limits trade offers and a 1-point offer is free to send, so
  // keying on the offer id would let one hostile account mint unbounded
  // permanent rows in a victim's hub. There is no per-offer page to link to
  // anyway — every trade notification opens /newsite/trade.
  const db = fakeDb()
  await notifyTradeOfferReceived(db, {
    userId: 'victim', fromUserId: 'attacker-id', fromUsername: 'mallory'
  })
  const { values } = db.calls.writes[0]
  assert.ok(values.includes('attacker-id'))
  assert.ok(values.includes('TRADE'))
})

test('counter offers read as counters, not as fresh offers', async () => {
  const db = fakeDb()
  await notifyTradeOfferReceived(db, {
    userId: 'u1', fromUserId: 'u2', fromUsername: 'bob', isCounter: true
  })
  assert.match(db.calls.writes[0].values.join(' | '), /countered/i)
})

test('accepted-offer notifications name the accepting user', async () => {
  const db = fakeDb()
  await notifyTradeOfferAccepted(db, { userId: 'u1', offerId: 'offer-3', byUsername: 'bob' })
  const { values } = db.calls.writes[0]
  assert.match(values.join(' | '), /bob/)
  assert.ok(values.includes('offer-3'))
})

test('missing names degrade to neutral copy rather than "undefined"', async () => {
  const db = fakeDb()
  await notifyTradeOfferAccepted(db, { userId: 'u1', offerId: 'o1', byUsername: null })
  await notifyOutbid(db, { userId: 'u1', auctionId: 'a1', ctoonName: null, amount: null })
  for (const w of db.calls.writes) {
    assert.doesNotMatch(w.values.join(' | '), /undefined|null/)
  }
})
