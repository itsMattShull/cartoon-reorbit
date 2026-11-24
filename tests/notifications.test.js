import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  NOTIFICATION_TYPES,
  createNotification,
  notifyOutbid,
  notifyAuctionBid,
  notifyAuctionWon,
  notifyTradeOfferReceived,
  notifyTradeOfferAccepted,
  notifyCMoonRaidBossStarted,
  notifyCMoonRaidPreviewStarted,
  notifyPvpPackWon,
  notifyCMoonRaidKickedAfk,
  notifyWishlistAuctionListed,
  notifyFollowedUserOnline
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
    notifyAuctionWon, notifyTradeOfferReceived, notifyTradeOfferAccepted, notifyCMoonRaidBossStarted,
    notifyCMoonRaidPreviewStarted, notifyPvpPackWon, notifyCMoonRaidKickedAfk, notifyWishlistAuctionListed,
    notifyFollowedUserOnline]) {
    assert.equal(typeof fn, 'function')
  }
})

test('the type set is closed and frozen', () => {
  assert.ok(Object.isFrozen(NOTIFICATION_TYPES))
  assert.deepEqual(Object.keys(NOTIFICATION_TYPES).sort(), [
    'AUCTION_NEW_BID',
    'AUCTION_OUTBID',
    'AUCTION_WON',
    'CMOON_RAID_BOSS_STARTED',
    'CMOON_RAID_KICKED_AFK',
    'CMOON_RAID_PREVIEW_STARTED',
    'FOLLOWED_USER_ONLINE',
    'PVP_PACK_WON',
    'TRADE_OFFER_ACCEPTED',
    'TRADE_OFFER_RECEIVED',
    'WISHLIST_AUCTION_LISTED'
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
  // anyway — every trade notification opens /trade.
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

test('raid boss notifications carry the raid id as contextId and no contextType', async () => {
  // No contextType: LockedContextType is AUCTION/TRADE-specific (see notifications.js's own
  // comment) — routing for this type is driven entirely by `type` in notificationRoute().
  const db = fakeDb()
  await notifyCMoonRaidBossStarted(db, {
    userId: 'u1', raidId: 'raid-9', enemyName: 'Grim Sentinel', cMoonName: 'Solar Flares',
  })
  const { values } = db.calls.writes[0]
  assert.ok(values.includes('raid-9'))
  assert.ok(values.includes('CMOON_RAID_BOSS_STARTED'))
  assert.match(values.join(' | '), /Grim Sentinel/)
  assert.match(values.join(' | '), /Solar Flares/)
})

test('raid boss notifications are suppressed for a player who muted them', async () => {
  const db = fakeDb({ user: { username: 'alice', banned: false, muteRaidNotifications: true } })
  const ok = await notifyCMoonRaidBossStarted(db, {
    userId: 'u1', raidId: 'raid-9', enemyName: 'Grim Sentinel', cMoonName: 'Solar Flares',
  })
  assert.equal(ok, false)
  assert.equal(db.calls.writes.length, 0)
})

test('raid preview notifications carry the preview raid id as contextId and no contextType', async () => {
  const db = fakeDb()
  await notifyCMoonRaidPreviewStarted(db, {
    userId: 'u1', raidId: 'preview-9', enemyName: 'Grim Sentinel', startedByUsername: 'admin_bob',
  })
  const { values } = db.calls.writes[0]
  assert.ok(values.includes('preview-9'))
  assert.ok(values.includes('CMOON_RAID_PREVIEW_STARTED'))
  assert.match(values.join(' | '), /Grim Sentinel/)
  assert.match(values.join(' | '), /admin_bob/)
})

test('raid preview notifications are suppressed for a player who muted them', async () => {
  const db = fakeDb({ user: { username: 'alice', banned: false, muteRaidNotifications: true } })
  const ok = await notifyCMoonRaidPreviewStarted(db, {
    userId: 'u1', raidId: 'preview-9', enemyName: 'Grim Sentinel', startedByUsername: 'admin_bob',
  })
  assert.equal(ok, false)
  assert.equal(db.calls.writes.length, 0)
})

test('AFK-kicked notification writes with no contextId and is NOT gated by muteRaidNotifications', async () => {
  const db = fakeDb({ user: { username: 'alice', banned: false, muteRaidNotifications: true } })
  const ok = await notifyCMoonRaidKickedAfk(db, { userId: 'u1', enemyName: 'Grim Sentinel' })
  assert.equal(ok, true)
  const { values } = db.calls.writes[0]
  assert.ok(values.includes('CMOON_RAID_KICKED_AFK'))
  assert.match(values.join(' | '), /Grim Sentinel/)
  assert.equal(values[values.length - 1], null) // contextId
})

test('AFK-kicked notification is still suppressed for a banned/official account', async () => {
  const db = fakeDb({ user: { username: 'CartoonReOrbitOfficial', banned: false } })
  const ok = await notifyCMoonRaidKickedAfk(db, { userId: 'u1', enemyName: 'Grim Sentinel' })
  assert.equal(ok, false)
  assert.equal(db.calls.writes.length, 0)
})

// ── Raid Boss Lobby broadcast (cross-cMoon raids) ──────────────────────────────────────────────
import { notifyCMoonRaidLobbyOpened, RAID_LOBBY_CONTEXT_ID } from '../server/utils/notifications.js'

function batchDb ({ throwOnQuery = false } = {}) {
  const calls = []
  return {
    calls,
    async $queryRaw (strings, ...values) {
      if (throwOnQuery) throw new Error('db exploded')
      calls.push({ sql: strings.join('?'), values })
      const userIds = values.find(v => Array.isArray(v) && v.some(x => String(x).startsWith('u')))
      return (userIds || []).map(userId => ({ userId }))
    }
  }
}

test('raid lobby broadcast is one batched upsert on a fixed collapse key, deduped', async () => {
  const db = batchDb()
  const written = await notifyCMoonRaidLobbyOpened(db, {
    userIds: ['u1', 'u2', 'u1', '', null], enemyName: 'Grim Sentinel', initiatorUsername: 'JanGloopManx', cMoonName: 'Cartoon Netmoon'
  })
  assert.equal(db.calls.length, 1)
  assert.deepEqual(written, ['u1', 'u2'])
  const { sql, values } = db.calls[0]
  assert.ok(values.includes(RAID_LOBBY_CONTEXT_ID))
  assert.ok(values.includes('CMOON_RAID_BOSS_STARTED'))
  assert.match(values.join(' | '), /Grim Sentinel/)
  assert.match(values.join(' | '), /JanGloopManx \(Cartoon Netmoon\)/)
  assert.match(sql, /ON CONFLICT/)
  // Banned users, the official account, and muted players are filtered in SQL, like
  // isRaidNotifiable.
  assert.match(sql, /banned/)
  assert.match(sql, /muteRaidNotifications/)
  assert.ok(values.includes('CartoonReOrbitOfficial'))
  // Prisma 7 sends raw params untyped: every one in the SELECT list is cast.
  assert.match(sql, /\?::text\[\], \?::text\[\]/)
})

test('raid lobby broadcast does nothing for no recipients and never throws', async () => {
  const db = batchDb()
  assert.deepEqual(await notifyCMoonRaidLobbyOpened(db, { userIds: [] }), [])
  assert.equal(db.calls.length, 0)
  const orig = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await notifyCMoonRaidLobbyOpened(batchDb({ throwOnQuery: true }), { userIds: ['u1'] }), [])
  } finally {
    console.error = orig
  }
})

// ── Wishlist auction-listed broadcast ──────────────────────────────────────────────────────────
// Unlike the raid lobby broadcast above, the caller never already has the recipient set in hand:
// this looks wishlisters up itself from WishlistItem, then runs the same batched upsert shape.
function wishlistDb ({ wishlisters = [], throwOnLookup = false, throwOnQuery = false } = {}) {
  const calls = { lookups: [], writes: [] }
  return {
    calls,
    wishlistItem: {
      async findMany (args) {
        calls.lookups.push(args)
        if (throwOnLookup) throw new Error('db exploded')
        return wishlisters
      }
    },
    async $queryRaw (strings, ...values) {
      if (throwOnQuery) throw new Error('db exploded')
      calls.writes.push({ sql: strings.join('?'), values })
      const userIds = values.find(v => Array.isArray(v) && v.some(x => String(x).startsWith('u')))
      return (userIds || []).map(userId => ({ userId }))
    }
  }
}

test('wishlist auction broadcast looks up wishlisters by ctoonId, excluding the seller', async () => {
  const db = wishlistDb({ wishlisters: [{ userId: 'u1' }, { userId: 'u2' }] })
  const written = await notifyWishlistAuctionListed(db, {
    auctionId: 'auction-5', ctoonId: 'ctoon-1', ctoonName: 'Dexter', sellerUserId: 'seller-1'
  })
  assert.equal(db.calls.lookups.length, 1)
  assert.deepEqual(db.calls.lookups[0].where, { ctoonId: 'ctoon-1', userId: { not: 'seller-1' } })
  assert.deepEqual(written, ['u1', 'u2'])
  const { sql, values } = db.calls.writes[0]
  assert.ok(values.includes('auction-5'))
  assert.match(sql, /'AUCTION'::"LockedContextType"/) // same contextType for every row, so it's a literal, not a bound param
  assert.ok(values.includes('WISHLIST_AUCTION_LISTED'))
  assert.match(values.join(' | '), /Dexter/)
  assert.match(sql, /ON CONFLICT/)
  // Same eligibility rules as isNotifiable, plus the wishlist-specific opt-out — all filtered in
  // SQL, same as the raid lobby broadcast.
  assert.match(sql, /banned/)
  assert.match(sql, /allowWishlistAuctionNotifications/)
  assert.ok(values.includes('CartoonReOrbitOfficial'))
})

test('wishlist auction broadcast does not filter by seller when none is given', async () => {
  const db = wishlistDb({ wishlisters: [{ userId: 'u1' }] })
  await notifyWishlistAuctionListed(db, { auctionId: 'a1', ctoonId: 'c1' })
  assert.deepEqual(db.calls.lookups[0].where, { ctoonId: 'c1' })
})

test('wishlist auction broadcast dedupes repeated userIds from the lookup', async () => {
  const db = wishlistDb({ wishlisters: [{ userId: 'u1' }, { userId: 'u1' }, { userId: 'u2' }] })
  await notifyWishlistAuctionListed(db, { auctionId: 'a1', ctoonId: 'c1' })
  const { values } = db.calls.writes[0]
  const idsArg = values.find(v => Array.isArray(v) && v.includes('u1'))
  assert.equal(idsArg.length, 2)
})

test('wishlist auction broadcast does nothing when nobody has the cToon wishlisted', async () => {
  const db = wishlistDb({ wishlisters: [] })
  const written = await notifyWishlistAuctionListed(db, { auctionId: 'a1', ctoonId: 'c1' })
  assert.deepEqual(written, [])
  assert.equal(db.calls.writes.length, 0)
})

test('wishlist auction broadcast requires an auctionId and a ctoonId, and never throws', async () => {
  const db = wishlistDb({ wishlisters: [{ userId: 'u1' }] })
  assert.deepEqual(await notifyWishlistAuctionListed(db, { ctoonId: 'c1' }), [])
  assert.deepEqual(await notifyWishlistAuctionListed(db, { auctionId: 'a1' }), [])
  assert.equal(db.calls.lookups.length, 0)

  const orig = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await notifyWishlistAuctionListed(wishlistDb({ throwOnLookup: true }), { auctionId: 'a1', ctoonId: 'c1' }), [])
    assert.deepEqual(await notifyWishlistAuctionListed(wishlistDb({ wishlisters: [{ userId: 'u1' }], throwOnQuery: true }), { auctionId: 'a1', ctoonId: 'c1' }), [])
  } finally {
    console.error = orig
  }
})

// ── Followed-user-online broadcast ──────────────────────────────────────────────────────────────
// Same shape as the wishlist broadcast above: the caller never already has the recipient set in
// hand, so this looks followers up itself from MyOrbitFollow, then runs the same batched upsert.
function followDb ({ followers = [], throwOnLookup = false, throwOnQuery = false } = {}) {
  const calls = { lookups: [], writes: [] }
  return {
    calls,
    myOrbitFollow: {
      async findMany (args) {
        calls.lookups.push(args)
        if (throwOnLookup) throw new Error('db exploded')
        return followers
      }
    },
    async $queryRaw (strings, ...values) {
      if (throwOnQuery) throw new Error('db exploded')
      calls.writes.push({ sql: strings.join('?'), values })
      const userIds = values.find(v => Array.isArray(v) && v.some(x => String(x).startsWith('u')))
      return (userIds || []).map(userId => ({ userId }))
    }
  }
}

test('followed-user-online broadcast looks up followers by followedId', async () => {
  const db = followDb({ followers: [{ followerId: 'u1' }, { followerId: 'u2' }] })
  const written = await notifyFollowedUserOnline(db, { followedUserId: 'followed-1', followedUsername: 'Gloop' })
  assert.equal(db.calls.lookups.length, 1)
  assert.deepEqual(db.calls.lookups[0].where, { followedId: 'followed-1' })
  assert.deepEqual(written, ['u1', 'u2'])
  const { sql, values } = db.calls.writes[0]
  assert.ok(values.includes('FOLLOWED_USER_ONLINE'))
  assert.match(values.join(' | '), /Gloop/)
  // contextId is the followed player's USERNAME, not an id - see the function's own comment.
  assert.ok(values.includes('Gloop'))
  assert.match(sql, /ON CONFLICT/)
  assert.match(sql, /banned/)
  assert.ok(values.includes('CartoonReOrbitOfficial'))
  // No per-type opt-out column is referenced - following IS the opt-in.
  assert.doesNotMatch(sql, /allowWishlistAuctionNotifications/)
  assert.doesNotMatch(sql, /muteRaidNotifications/)
})

test('followed-user-online broadcast dedupes repeated followerIds from the lookup', async () => {
  const db = followDb({ followers: [{ followerId: 'u1' }, { followerId: 'u1' }, { followerId: 'u2' }] })
  await notifyFollowedUserOnline(db, { followedUserId: 'f1', followedUsername: 'Gloop' })
  const { values } = db.calls.writes[0]
  const idsArg = values.find(v => Array.isArray(v) && v.includes('u1'))
  assert.equal(idsArg.length, 2)
})

test('followed-user-online broadcast does nothing when nobody follows this player', async () => {
  const db = followDb({ followers: [] })
  const written = await notifyFollowedUserOnline(db, { followedUserId: 'f1', followedUsername: 'Gloop' })
  assert.deepEqual(written, [])
  assert.equal(db.calls.writes.length, 0)
})

test('followed-user-online broadcast requires a followedUserId and followedUsername, and never throws', async () => {
  const db = followDb({ followers: [{ followerId: 'u1' }] })
  assert.deepEqual(await notifyFollowedUserOnline(db, { followedUsername: 'Gloop' }), [])
  assert.deepEqual(await notifyFollowedUserOnline(db, { followedUserId: 'f1' }), [])
  assert.equal(db.calls.lookups.length, 0)

  const orig = console.error
  console.error = () => {}
  try {
    assert.deepEqual(await notifyFollowedUserOnline(followDb({ throwOnLookup: true }), { followedUserId: 'f1', followedUsername: 'Gloop' }), [])
    assert.deepEqual(await notifyFollowedUserOnline(followDb({ followers: [{ followerId: 'u1' }], throwOnQuery: true }), { followedUserId: 'f1', followedUsername: 'Gloop' }), [])
  } finally {
    console.error = orig
  }
})
