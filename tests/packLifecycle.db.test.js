// What happens to sealed packs when an account goes away: the 270-day dormant-account job moves them to the official
// account (and unsticks anything holding them), and the admin delete-user script no longer trips over the new foreign keys.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { skipUnlessDb, boot, mkUser, mkBarePack, mkUserPack, pointsOf, DB_URL } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, JOB_HANDLERS, settleAuction, official

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  // The job looks the official account up by name.
  const name = process.env.OFFICIAL_USERNAME || 'CartoonReOrbitOfficial'
  official = await prisma.user.findUnique({ where: { username: name } }) || await mkUser(prisma, { username: name })
  ;({ JOB_HANDLERS } = await import('../server/cron/jobHandlers.js'))
  ;({ settleAuction } = await import('../server/utils/auctionSettle.js'))
})
after(async () => { if (!skipUnlessDb) await prisma.$disconnect() })

const HOUR = 3600 * 1000
const longAgo = () => new Date(Date.now() - 400 * 24 * HOUR)

run('dormant account: unopened packs move to the official account; offers holding them are rejected and points freed; a running pack auction keeps going', async () => {
  const [dormant, friend, bidder] = [await mkUser(prisma, { points: 500 }), await mkUser(prisma, { points: 500 }), await mkUser(prisma, { points: 1000 })]
  await prisma.user.update({ where: { id: dormant.id }, data: { lastActivity: longAgo() } })
  const pack = await mkBarePack(prisma)
  const free = await mkUserPack(prisma, dormant.id, { packId: pack.id })
  const opened = await mkUserPack(prisma, dormant.id, { packId: pack.id, opened: true, openedAt: new Date() })
  const inOffer = await mkUserPack(prisma, dormant.id, { packId: pack.id })
  const inAuction = await mkUserPack(prisma, dormant.id, { packId: pack.id })

  // dormant's pending offer (offering a pack + points), and someone else's offer REQUESTING a pack from dormant
  const mine = await prisma.tradeOffer.create({ data: { initiatorId: dormant.id, recipientId: friend.id, status: 'PENDING', pointsOffered: 50 } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: mine.id, userPackId: inOffer.id, role: 'OFFERED' } })
  await prisma.lockedPoints.create({ data: { userId: dormant.id, amount: 50, reason: 'TRADE_OFFER', status: 'ACTIVE', contextType: 'TRADE', contextId: mine.id } })
  const theirs = await prisma.tradeOffer.create({ data: { initiatorId: friend.id, recipientId: dormant.id, status: 'PENDING', pointsOffered: 30 } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: theirs.id, userPackId: free.id, role: 'REQUESTED' } })
  await prisma.lockedPoints.create({ data: { userId: friend.id, amount: 30, reason: 'TRADE_OFFER', status: 'ACTIVE', contextType: 'TRADE', contextId: theirs.id } })
  const auction = await prisma.auction.create({
    data: { kind: 'PACK', userPackId: inAuction.id, initialBet: 10, duration: 1, endAt: new Date(Date.now() + 2 * HOUR), creatorId: dormant.id }
  })

  await JOB_HANDLERS.enforceDormantAccounts()

  const holder = async (id) => (await prisma.userPack.findUnique({ where: { id } })).userId
  assert.equal(await holder(free.id), official.id); assert.equal(await holder(inOffer.id), official.id); assert.equal(await holder(inAuction.id), official.id)
  assert.equal(await holder(opened.id), dormant.id, 'an opened pack is already gone — nothing to move')
  assert.equal((await prisma.user.findUnique({ where: { id: dormant.id } })).active, false)
  for (const o of [mine, theirs]) assert.equal((await prisma.tradeOffer.findUnique({ where: { id: o.id } })).status, 'REJECTED')
  assert.equal(await prisma.lockedPoints.count({ where: { contextId: { in: [mine.id, theirs.id] }, status: 'ACTIVE' } }), 0, 'every held point released')
  const logs = await prisma.packOwnerLog.findMany({ where: { method: 'DISSOLVE_INACTIVE', userPackId: { in: [free.id, inOffer.id, inAuction.id] } } })
  assert.equal(logs.length, 3); assert.ok(logs.every(l => l.userId === official.id && l.counterpartyUserId === dormant.id))
  const a = await prisma.auction.findUnique({ where: { id: auction.id } })
  assert.deepEqual([a.status, a.creatorId], ['ACTIVE', official.id], 'still running, now sold for the official account')

  // …and it still SETTLES: the winner gets the pack, the official account is paid.
  await prisma.auction.update({ where: { id: auction.id }, data: { endAt: new Date(Date.now() - HOUR), createdAt: new Date(Date.now() - 24 * HOUR) } })
  await prisma.bid.create({ data: { auctionId: auction.id, userId: bidder.id, amount: 75, createdAt: new Date(Date.now() - 2 * HOUR) } })
  await prisma.lockedPoints.create({ data: { userId: bidder.id, amount: 75, reason: 'AUCTION_BID', status: 'ACTIVE', contextType: 'AUCTION', contextId: auction.id } })
  await prisma.auction.update({ where: { id: auction.id }, data: { highestBid: 75, highestBidderId: bidder.id } })
  const before = await pointsOf(prisma, official.id)
  const r = await settleAuction(auction.id, { db: prisma, scheduleAuctionClose: async () => {}, notifyAuctionWon: async () => {} })
  assert.deepEqual(r, { winnerId: bidder.id, winningBid: 75 })
  assert.equal(await holder(inAuction.id), bidder.id)
  assert.equal(await pointsOf(prisma, official.id), before + 75)
})

run('the admin delete-user script removes a user who holds packs, auctioned them and traded them', async () => {
  const name = 'MellowChargerPioneer' // the script's hard-coded target
  const script = new URL('../prisma/nuke-user.js', import.meta.url).pathname
  const runScript = () => execFileSync('node', [script], { env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'pipe', timeout: 120000 })
  if (await prisma.user.findUnique({ where: { username: name } })) runScript() // clear any leftover from an earlier run
  const user = await mkUser(prisma, { username: name })
  const other = await mkUser(prisma)
  const pack = await mkBarePack(prisma)
  const held = await mkUserPack(prisma, user.id, { packId: pack.id })
  const inAuction = await mkUserPack(prisma, user.id, { packId: pack.id })
  const inOffer = await mkUserPack(prisma, user.id, { packId: pack.id })
  // a pack the user now holds that sits in SOMEONE ELSE's already-accepted offer (history)
  const received = await mkUserPack(prisma, user.id, { packId: pack.id })
  const old = await prisma.tradeOffer.create({ data: { initiatorId: other.id, recipientId: other.id, status: 'ACCEPTED' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: old.id, userPackId: received.id, role: 'OFFERED' } })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: inAuction.id, initialBet: 5, duration: 1, endAt: new Date(Date.now() + HOUR), creatorId: user.id } })
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: user.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: inOffer.id, role: 'OFFERED' } })
  await prisma.packOwnerLog.create({ data: { userPackId: held.id, packId: pack.id, userId: user.id, method: 'CODE' } })

  runScript()

  assert.equal(await prisma.user.findUnique({ where: { username: name } }), null)
  assert.equal(await prisma.userPack.count({ where: { id: { in: [held.id, inAuction.id, inOffer.id, received.id] } } }), 0)
  assert.equal(await prisma.packOwnerLog.count({ where: { userPackId: held.id } }), 0, 'history rows go with the pack')
  assert.equal(await prisma.tradeOfferPack.count({ where: { userPackId: { in: [held.id, inAuction.id, inOffer.id, received.id] } } }), 0)
})
