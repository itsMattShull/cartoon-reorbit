// Sealed-pack state against a REAL Postgres: the row lock is what stops a pack being opened, traded and auctioned
// at the same time (the state is derived from other tables, so check-then-write races without it), and the schema
// constraints are what back that up for writers that forget. See server/utils/userPackState.js.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkUserPack } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, S

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  S = await import('../server/utils/userPackState.js')
})
after(async () => { if (!skipUnlessDb) await prisma?.$disconnect() })

const inHours = (h) => new Date(Date.now() + h * 3600 * 1000)

// The three writers, each doing exactly what the real endpoints must: lock+assert FIRST, then write.
const writers = () => ({
  trade: (ownerId, otherId, packId) => prisma.$transaction(async (tx) => {
    await S.lockAndAssertPacks(tx, [packId], { ownerId })
    const offer = await tx.tradeOffer.create({ data: { initiatorId: ownerId, recipientId: otherId, status: 'PENDING' } })
    await tx.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: packId, role: 'OFFERED' } })
    return 'trade'
  }),
  auction: (ownerId, _o, packId) => prisma.$transaction(async (tx) => {
    await S.lockAndAssertPacks(tx, [packId], { ownerId })
    await tx.auction.create({ data: { kind: 'PACK', userPackId: packId, initialBet: 10, duration: 1, endAt: inHours(24), creatorId: ownerId } })
    return 'auction'
  }),
  open: (ownerId, _o, packId) => prisma.$transaction(async (tx) => {
    await S.lockAndAssertPacks(tx, [packId], { ownerId })
    await tx.userPack.update({ where: { id: packId }, data: { opened: true, openedAt: new Date() } })
    return 'open'
  })
})

const settle = (ps) => Promise.allSettled(ps)
const won = (rs) => rs.filter(r => r.status === 'fulfilled').map(r => r.value)

for (const [a, b] of [['trade', 'auction'], ['trade', 'open'], ['auction', 'open'], ['trade', 'trade'], ['auction', 'auction'], ['open', 'open']]) {
  run(`concurrent ${a} + ${b} on the same pack: exactly one wins, the pack is never in two places`, async () => {
    const w = writers()
    for (let i = 0; i < 6; i++) {
      const [owner, other] = [await mkUser(prisma), await mkUser(prisma)]
      const up = await mkUserPack(prisma, owner.id)
      const rs = await settle([w[a](owner.id, other.id, up.id), w[b](owner.id, other.id, up.id)])
      assert.equal(won(rs).length, 1, `round ${i}: ${JSON.stringify(rs.map(r => r.status === 'fulfilled' ? r.value : r.reason?.statusMessage || r.reason?.message))}`)
      const [offers, auctions, row] = await Promise.all([
        prisma.tradeOfferPack.count({ where: { userPackId: up.id, tradeOffer: { status: 'PENDING' } } }),
        prisma.auction.count({ where: { userPackId: up.id, status: 'ACTIVE' } }),
        prisma.userPack.findUnique({ where: { id: up.id } })
      ])
      assert.equal(offers + auctions + (row.opened ? 1 : 0), 1, `round ${i}: pack ended up in ${offers} trades, ${auctions} auctions, opened=${row.opened}`)
    }
  })
}

run('lock state reports pending trades and active auctions, and ignores settled ones', async () => {
  const [owner, other] = [await mkUser(prisma), await mkUser(prisma)]
  const [inTrade, inAuction, closed, plain] = await Promise.all([1, 2, 3, 4].map(() => mkUserPack(prisma, owner.id)))
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: owner.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: inTrade.id, role: 'OFFERED' } })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: inAuction.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: owner.id } })
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: closed.id, initialBet: 5, duration: 1, endAt: inHours(-1), creatorId: owner.id, status: 'CLOSED' } })
  const ids = [inTrade.id, inAuction.id, closed.id, plain.id]
  const st = await S.getPackLockState(prisma, ids)
  assert.equal(st.get(inTrade.id).inPendingTrade, true)
  assert.equal(st.get(inAuction.id).inActiveAuction, true)
  assert.deepEqual([st.get(closed.id).inActiveAuction, st.get(closed.id).inPendingTrade], [false, false])
  assert.deepEqual([st.get(plain.id).inActiveAuction, st.get(plain.id).inPendingTrade], [false, false])
  // A counter ignores the offer it replaces, by OFFER id.
  const ex = await S.getPackLockState(prisma, ids, { excludeOfferIds: [offer.id] })
  assert.equal(ex.get(inTrade.id).inPendingTrade, false)
  // A settled offer no longer holds the pack.
  await prisma.tradeOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } })
  assert.equal((await S.getPackLockState(prisma, [inTrade.id])).get(inTrade.id).inPendingTrade, false)
})

run('lockAndAssertPacks rejects: not yours, opened, in auction, in pending trade, missing', async () => {
  const [owner, other] = [await mkUser(prisma), await mkUser(prisma)]
  const theirs = await mkUserPack(prisma, other.id)
  const opened = await mkUserPack(prisma, owner.id, { opened: true, openedAt: new Date() })
  const auctioned = await mkUserPack(prisma, owner.id)
  const traded = await mkUserPack(prisma, owner.id)
  await prisma.auction.create({ data: { kind: 'PACK', userPackId: auctioned.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: owner.id } })
  const offer = await prisma.tradeOffer.create({ data: { initiatorId: owner.id, recipientId: other.id, status: 'PENDING' } })
  await prisma.tradeOfferPack.create({ data: { tradeOfferId: offer.id, userPackId: traded.id, role: 'OFFERED' } })
  for (const id of [theirs.id, opened.id, auctioned.id, traded.id, '99999999-9999-4999-8999-999999999999']) {
    await assert.rejects(prisma.$transaction(tx => S.lockAndAssertPacks(tx, [id], { ownerId: owner.id })), (e) => e.statusCode >= 400)
  }
  // generic mode: identical message regardless of the reason
  const msgs = new Set()
  for (const id of [theirs.id, opened.id, auctioned.id, traded.id]) {
    await prisma.$transaction(tx => S.lockAndAssertPacks(tx, [id], { ownerId: owner.id, generic: true })).catch(e => msgs.add(e.statusMessage))
  }
  assert.equal(msgs.size, 1)
})

// ── schema constraints: the backstop for any writer that forgets the lock ──────────────────────────────────────────
run('only one ACTIVE auction per pack (partial unique index); a closed one does not block a new one', async () => {
  const owner = await mkUser(prisma)
  const up = await mkUserPack(prisma, owner.id)
  const mk = (status) => prisma.auction.create({ data: { kind: 'PACK', userPackId: up.id, initialBet: 5, duration: 1, endAt: inHours(1), creatorId: owner.id, status } })
  await mk('CLOSED')
  await mk('ACTIVE')
  await assert.rejects(mk('ACTIVE'), /Unique|unique/)
})

run('an auction must sell exactly one item, matching its kind (CHECK constraint)', async () => {
  const owner = await mkUser(prisma)
  const up = await mkUserPack(prisma, owner.id)
  const base = { initialBet: 5, duration: 1, endAt: inHours(1), creatorId: owner.id }
  await assert.rejects(prisma.auction.create({ data: { ...base, kind: 'PACK' } }), /check|constraint/i)
  await assert.rejects(prisma.auction.create({ data: { ...base, kind: 'CTOON', userPackId: up.id } }), /check|constraint/i)
  await assert.rejects(prisma.auction.create({ data: { ...base, kind: 'CTOON' } }), /check|constraint/i)
})

run('a grant is idempotent: the same (sourceRef, sourceOrdinal) cannot be inserted twice', async () => {
  const u = await mkUser(prisma)
  const sourceRef = `claim-${randomUUID()}` // random: the database persists across runs
  await mkUserPack(prisma, u.id, { sourceRef, sourceOrdinal: 0 })
  await mkUserPack(prisma, u.id, { sourceRef, sourceOrdinal: 1 })
  await assert.rejects(mkUserPack(prisma, u.id, { sourceRef, sourceOrdinal: 0 }), /Unique|unique/)
  // Plain purchases carry no sourceRef: NULLs never collide.
  await mkUserPack(prisma, u.id, { source: 'PURCHASE' }); await mkUserPack(prisma, u.id, { source: 'PURCHASE' })
})

run('migration backfill: legacy packs get buyerId = userId and a PURCHASE history row', async () => {
  const sql = readFileSync(new URL('../prisma/migrations/20261102000000_owned_packs/migration.sql', import.meta.url), 'utf8')
  const backfill = /UPDATE "UserPack" SET "buyerId" = "userId" WHERE "buyerId" IS NULL;/.exec(sql)?.[0]
  assert.ok(backfill, 'backfill statement present in the migration')
  const u = await mkUser(prisma)
  const legacy = await mkUserPack(prisma, u.id, { source: 'PURCHASE', buyerId: null })
  await prisma.$executeRawUnsafe(backfill)
  assert.equal((await prisma.userPack.findUnique({ where: { id: legacy.id } })).buyerId, u.id)
  assert.match(sql, /INSERT INTO "PackOwnerLog"[\s\S]*'PURCHASE'/)
  assert.match(sql, /UPDATE "OgGtoonMatch" SET "rewardStatus" = 'SKIPPED'/)
})
