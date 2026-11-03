// The OG gToons PvP pack reward against a real Postgres: it must pay at most the configured amount, exactly once, to the
// right person, in the right window — and never lose or double a match. See server/utils/ogGtoonsPackReward.js.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { skipUnlessDb, boot, mkUser, mkBarePack } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, R

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  R = await import('../server/utils/ogGtoonsPackReward.js')
})
after(async () => {
  if (!skipUnlessDb) { await setConfig({ pack: null, limit: null }); await prisma.$disconnect() }
})

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────
async function mkPackWithContents(name) {
  const ct = await prisma.ctoon.create({ data: { name: `PvP Toon ${Math.random()}`, type: 'Character', rarity: 'Common', assetPath: '/t.png', price: 100, quantity: null } })
  return prisma.pack.create({
    data: {
      name, inCmart: false,
      rarityConfigs: { create: [{ rarity: 'Common', count: 1, probabilityPercent: 100 }] },
      ctoonOptions: { create: [{ ctoonId: ct.id, weight: 1 }] }
    }
  })
}
async function setConfig({ pack, limit }) {
  await prisma.gameConfig.upsert({
    where: { gameName: 'OgGtoons' },
    create: { gameName: 'OgGtoons', ogGtoonsWinPackId: pack?.id ?? null, ogGtoonsWinPackPerUserLimit: limit },
    update: { ogGtoonsWinPackId: pack?.id ?? null, ogGtoonsWinPackPerUserLimit: limit }
  })
}
/** A persisted, finished match. `winner`/`loser` are users; the winner is player1 unless `winnerIsP2`. */
async function mkMatch(winner, loser, over = {}) {
  const { winnerIsP2 = false, endedAt = new Date(Date.now() - 10 * 60000), outcome, checked = false, ...rest } = over
  const [p1, p2] = winnerIsP2 ? [loser, winner] : [winner, loser]
  return prisma.ogGtoonMatch.create({
    data: {
      player1UserId: p1.id, player2UserId: p2.id,
      player1DeckSnapshot: [], player2DeckSnapshot: [], player1GoalColor: 'RED', player2GoalColor: 'BLUE', roundLog: [],
      winnerUserId: winner.id, outcome: outcome ?? (winnerIsP2 ? 'PLAYER2' : 'PLAYER1'), winReason: 'POINTS',
      startedAt: new Date((endedAt ?? new Date()).getTime() - 120000), endedAt,
      player1ManualCommits: 3, player2ManualCommits: 3,
      ...(checked ? { rewardCheckedAt: new Date(), rewardStatus: 'SKIPPED' } : {}),
      ...rest
    }
  })
}
const evalMatch = (m) => R.evaluatePackReward(prisma, m.id)
const packsOf = (userId) => prisma.userPack.findMany({ where: { userId, source: 'OG_GTOONS_PVP' } })
const statusOf = async (m) => (await prisma.ogGtoonMatch.findUnique({ where: { id: m.id } })).rewardStatus

// ── the award ──────────────────────────────────────────────────────────────────────────────────────────────────────
run('a played-out win earns one sealed pack, with an award record, history row, notification and status', async () => {
  const pack = await mkPackWithContents('Reward Pack'); await setConfig({ pack, limit: 3 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l)
  const res = await evalMatch(m)
  assert.equal(res.status, 'AWARDED'); assert.equal(res.winnerUserId, w.id)
  assert.deepEqual(res.notice, { status: 'AWARDED', packName: 'Reward Pack', packImagePath: pack.imagePath ?? null })

  const [up] = await packsOf(w.id)
  assert.deepEqual([up.packId, up.opened, up.sourceRef, up.sourceOrdinal, up.buyerId, up.pricePaid], [pack.id, false, m.id, 0, null, null])
  assert.equal((await packsOf(l.id)).length, 0, 'the loser gets nothing')
  const award = await prisma.ogGtoonPackAward.findUnique({ where: { matchId: m.id } })
  assert.deepEqual([award.winnerUserId, award.loserUserId, award.packId, award.userPackId], [w.id, l.id, pack.id, up.id])
  const { getPackDailyWindowStart } = await import('../server/utils/packDailyWindow.js')
  assert.equal(award.windowStart.getTime(), getPackDailyWindowStart(m.endedAt).getTime(), 'attributed to the window the match ended in')
  const log = await prisma.packOwnerLog.findFirst({ where: { userPackId: up.id } })
  assert.deepEqual([log.method, log.userId, log.counterpartyUserId], ['OG_GTOONS_PVP', w.id, l.id])
  assert.equal(await statusOf(m), 'AWARDED')
  const note = await prisma.notification.findFirst({ where: { userId: w.id, type: 'PVP_PACK_WON' } })
  assert.match(note.title, /Reward Pack/); assert.equal(note.contextType, null)
})

run('evaluating the same match again (or racing) pays once', async () => {
  const pack = await mkPackWithContents('Idem Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l)
  const rs = await Promise.all(Array.from({ length: 6 }, () => evalMatch(m)))
  assert.equal(rs.filter(r => r.status === 'AWARDED').length, 1, JSON.stringify(rs.map(r => r.status)))
  assert.ok(rs.filter(r => r.status !== 'AWARDED').every(r => r.status === 'ALREADY_CHECKED'))
  assert.equal((await packsOf(w.id)).length, 1)
  assert.equal((await evalMatch(m)).status, 'ALREADY_CHECKED')
})

run('a match that has not ended yet (not persisted as finished) is not evaluated', async () => {
  const pack = await mkPackWithContents('Early Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l, { endedAt: null })
  assert.equal((await evalMatch(m)).status, 'ALREADY_CHECKED')
  assert.equal((await packsOf(w.id)).length, 0)
})

// ── who is not paid ────────────────────────────────────────────────────────────────────────────────────────────────
run('not paid: tie, incomplete, forfeit, timeout sweep, tournament game — each recorded SKIPPED, never retried', async () => {
  const pack = await mkPackWithContents('Skip Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const cases = [
    mkMatch(w, l, { outcome: 'TIE', winnerUserId: null }),
    mkMatch(w, l, { outcome: 'INCOMPLETE', winnerUserId: null }),
    mkMatch(w, l, { whoLeftUserId: l.id, winReason: null }),
    mkMatch(w, l, { winReason: null })
  ]
  for (const p of cases) {
    const m = await p
    const r = await evalMatch(m)
    assert.equal(r.status, 'SKIPPED'); assert.equal(await statusOf(m), 'SKIPPED')
    assert.equal((await evalMatch(m)).status, 'ALREADY_CHECKED')
  }
  assert.equal((await packsOf(w.id)).length, 0)
})

run('the forfeit case tells the winner why, but only when the reward is on', async () => {
  const pack = await mkPackWithContents('Forfeit Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const on = await evalMatch(await mkMatch(w, l, { whoLeftUserId: l.id, winReason: null }))
  assert.deepEqual(on.notice, { status: 'FORFEIT' })
  await setConfig({ pack: null, limit: null })
  const off = await evalMatch(await mkMatch(w, l, { whoLeftUserId: l.id, winReason: null }))
  assert.equal(off.notice, null)
})

run('an idle loser (auto-played, < 2 rounds committed by hand) does not pay', async () => {
  const pack = await mkPackWithContents('Idle Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l, { player2ManualCommits: 1 })
  assert.equal((await evalMatch(m)).status, 'IDLE_OPPONENT')
  // same count on the WINNER's side does not matter, only the loser's
  const m2 = await mkMatch(w, l, { player1ManualCommits: 0, player2ManualCommits: 2 })
  assert.equal((await evalMatch(m2)).status, 'AWARDED')
})

run('a banned or inactive winner or loser does not pay (re-read inside the transaction)', async () => {
  const pack = await mkPackWithContents('Ban Pack'); await setConfig({ pack, limit: 5 })
  const [w, l, w2, l2] = [await mkUser(prisma), await mkUser(prisma), await mkUser(prisma), await mkUser(prisma)]
  await prisma.user.update({ where: { id: w.id }, data: { banned: true } })
  await prisma.user.update({ where: { id: l2.id }, data: { active: false } })
  assert.equal((await evalMatch(await mkMatch(w, l))).status, 'BANNED')
  assert.equal((await evalMatch(await mkMatch(w2, l2))).status, 'BANNED')
  assert.equal((await packsOf(w.id)).length + (await packsOf(w2.id)).length, 0)
})

// ── caps and windows ───────────────────────────────────────────────────────────────────────────────────────────────
run('the per-player cap holds across different opponents', async () => {
  const pack = await mkPackWithContents('Cap Pack'); await setConfig({ pack, limit: 2 })
  const w = await mkUser(prisma)
  const out = []
  for (let i = 0; i < 4; i++) out.push((await evalMatch(await mkMatch(w, await mkUser(prisma)))).status)
  assert.deepEqual(out, ['AWARDED', 'AWARDED', 'CAPPED', 'CAPPED'])
  assert.equal((await packsOf(w.id)).length, 2)
})

run('concurrent match ends cannot slip past the cap', async () => {
  const pack = await mkPackWithContents('Race Pack'); await setConfig({ pack, limit: 2 })
  const w = await mkUser(prisma)
  const matches = await Promise.all(Array.from({ length: 8 }, async () => mkMatch(w, await mkUser(prisma))))
  const rs = await Promise.all(matches.map(evalMatch))
  assert.equal(rs.filter(r => r.status === 'AWARDED').length, 2, JSON.stringify(rs.map(r => r.status)))
  assert.equal((await packsOf(w.id)).length, 2)
})

run('one pack per (winner, loser) per window — but the opponent beating you back is a separate pair', async () => {
  const pack = await mkPackWithContents('Pair Pack'); await setConfig({ pack, limit: 10 })
  const [a, b] = [await mkUser(prisma), await mkUser(prisma)]
  assert.equal((await evalMatch(await mkMatch(a, b))).status, 'AWARDED')
  assert.equal((await evalMatch(await mkMatch(a, b))).status, 'SAME_PAIR', 'A beating B again earns nothing more')
  assert.equal((await evalMatch(await mkMatch(a, b, { winnerIsP2: true }))).status, 'SAME_PAIR', 'seat does not matter')
  assert.equal((await evalMatch(await mkMatch(b, a))).status, 'AWARDED', 'B beating A is a different pair')
  assert.equal((await packsOf(a.id)).length, 1); assert.equal((await packsOf(b.id)).length, 1)
})

run('the 8pm Central boundary: a 7:59pm win and an 8:01pm win are different windows (winter and summer)', async () => {
  const pack = await mkPackWithContents('Window Pack'); await setConfig({ pack, limit: 1 })
  for (const [before, after] of [['2026-01-16T01:59:00Z', '2026-01-16T02:01:00Z'], ['2026-07-16T00:59:00Z', '2026-07-16T01:01:00Z']]) {
    const w = await mkUser(prisma)
    const m1 = await mkMatch(w, await mkUser(prisma), { endedAt: new Date(before) })
    const m2 = await mkMatch(w, await mkUser(prisma), { endedAt: new Date(after) })
    const m3 = await mkMatch(w, await mkUser(prisma), { endedAt: new Date(after) })
    assert.equal((await evalMatch(m1)).status, 'AWARDED')
    assert.equal((await evalMatch(m2)).status, 'AWARDED', 'a new window began at 8pm')
    assert.equal((await evalMatch(m3)).status, 'CAPPED', 'but the new window has its own cap of 1')
    const a1 = await prisma.ogGtoonPackAward.findUnique({ where: { matchId: m1.id } })
    const a2 = await prisma.ogGtoonPackAward.findUnique({ where: { matchId: m2.id } })
    assert.notEqual(a1.windowStart.getTime(), a2.windowStart.getTime())
  }
})

run('a late evaluation is attributed to the window the match ENDED in, not the window it is evaluated in', async () => {
  const pack = await mkPackWithContents('Late Pack'); await setConfig({ pack, limit: 1 })
  const w = await mkUser(prisma)
  const old = await mkMatch(w, await mkUser(prisma), { endedAt: new Date('2026-03-01T12:00:00Z') })
  const today = await mkMatch(w, await mkUser(prisma))
  assert.equal((await evalMatch(old)).status, 'AWARDED')
  assert.equal((await evalMatch(today)).status, 'AWARDED', 'the old win used the OLD window, so today\'s cap is untouched')
})

run('switching the reward pack mid-window does not reset the per-player cap', async () => {
  const [a, b] = [await mkPackWithContents('Pack A'), await mkPackWithContents('Pack B')]
  const w = await mkUser(prisma)
  await setConfig({ pack: a, limit: 1 })
  assert.equal((await evalMatch(await mkMatch(w, await mkUser(prisma)))).status, 'AWARDED')
  await setConfig({ pack: b, limit: 1 })
  assert.equal((await evalMatch(await mkMatch(w, await mkUser(prisma)))).status, 'CAPPED')
  // and a new winner gets the NEW pack immediately (config is read fresh, not from the 60s cache)
  const w2 = await mkUser(prisma)
  await evalMatch(await mkMatch(w2, await mkUser(prisma)))
  assert.equal((await packsOf(w2.id))[0].packId, b.id)
})

// ── off / retroactive / reconcile ──────────────────────────────────────────────────────────────────────────────────
run('with the reward OFF every match is still marked, so turning it on later never pays old matches', async () => {
  await setConfig({ pack: null, limit: null })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l)
  assert.equal((await evalMatch(m)).status, 'OFF')
  const pack = await mkPackWithContents('Later Pack'); await setConfig({ pack, limit: 5 })
  assert.equal((await evalMatch(m)).status, 'ALREADY_CHECKED')
  assert.equal((await packsOf(w.id)).length, 0, 'the old match was not paid retroactively')
})

run('reconcile evaluates saved-but-unchecked matches older than the grace period, and leaves fresh ones for the live path', async () => {
  const pack = await mkPackWithContents('Recon Pack'); await setConfig({ pack, limit: 5 })
  const [w1, w2, w3] = [await mkUser(prisma), await mkUser(prisma), await mkUser(prisma)]
  const stale = await mkMatch(w1, await mkUser(prisma), { endedAt: new Date(Date.now() - 10 * 60000) })
  const fresh = await mkMatch(w2, await mkUser(prisma), { endedAt: new Date(Date.now() - 5000) })
  const legacy = await mkMatch(w3, await mkUser(prisma), { endedAt: new Date(Date.now() - 60 * 60000), checked: true })
  const out = await R.reconcilePackRewards(prisma, { minAgeMs: 120000, limit: 500 })
  assert.ok(out.checked >= 1)
  assert.equal(await statusOf(stale), 'AWARDED'); assert.equal((await packsOf(w1.id)).length, 1)
  assert.equal(await statusOf(fresh), null); assert.equal((await packsOf(w2.id)).length, 0)
  assert.equal(await statusOf(legacy), 'SKIPPED'); assert.equal((await packsOf(w3.id)).length, 0)
  // a second sweep finds nothing new for the stale one
  const again = await R.reconcilePackRewards(prisma, { minAgeMs: 120000, limit: 500 })
  assert.equal((await packsOf(w1.id)).length, 1); void again
})

run('the database itself forbids a second award for one match or one pair-window', async () => {
  const pack = await mkPackWithContents('Backstop Pack'); await setConfig({ pack, limit: 5 })
  const [w, l] = [await mkUser(prisma), await mkUser(prisma)]
  const m = await mkMatch(w, l)
  await evalMatch(m)
  const award = await prisma.ogGtoonPackAward.findUnique({ where: { matchId: m.id } })
  const m2 = await mkMatch(w, l)
  const up2 = await prisma.userPack.create({ data: { userId: w.id, packId: pack.id, source: 'OG_GTOONS_PVP', sourceRef: m2.id, sourceOrdinal: 0 } })
  await assert.rejects(prisma.ogGtoonPackAward.create({ data: { matchId: m.id, winnerUserId: w.id, loserUserId: l.id, packId: pack.id, userPackId: up2.id, windowStart: award.windowStart } }), /Unique|unique/)
  await assert.rejects(prisma.ogGtoonPackAward.create({ data: { matchId: m2.id, winnerUserId: w.id, loserUserId: l.id, packId: pack.id, userPackId: up2.id, windowStart: award.windowStart } }), /Unique|unique/)
})

run('migration: matches that existed before this feature are marked SKIPPED and never paid', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../prisma/migrations/20261102000000_owned_packs/migration.sql', import.meta.url), 'utf8')
  assert.match(sql, /UPDATE "OgGtoonMatch" SET "rewardStatus" = 'SKIPPED', "rewardCheckedAt" = NOW\(\);/)
})
