// Handicap Redeems: an admin-only, player-invisible tool that holds a flagged player's code
// redemptions when the code awards a cToon, until enough OTHER players have claimed the same
// code. The guarantees that matter:
//  * a flagged player redeeming a cToon-awarding code gets {redeeming:true} and NO claim/mint —
//    resubmitting the same still-pending code is idempotent, never an error;
//  * a points/background-only code is never held (nothing could ever release it);
//  * the hold releases automatically once enough OTHER players claim the code, with the exact
//    same reward shape a normal on-time redemption would have produced;
//  * a non-flagged player's redemption is completely unaffected (see also tests/redeemPacks.db.test.js,
//    which exercises the same endpoint with no flag involved at all);
//  * the admin flag/unflag/force-release endpoints work and are audited.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { skipUnlessDb, boot, mkUser, mkCtoon, startApi, pointsOf } from './helpers/dbKit.js'

const run = skipUnlessDb ? test.skip : test
let prisma, api, mintQueue, worker

before(async () => {
  if (skipUnlessDb) return
  ;({ prisma } = await boot())
  ;({ mintQueue } = await import('../server/utils/queues.js'))
  const { processMintJob } = await import('../server/utils/mintCtoon.js')
  const { Worker } = await import('bullmq')
  // The real worker, as in production: redeem (and a hold's own release) waits on mint jobs to finish.
  worker = new Worker(mintQueue.name, job => processMintJob(job, prisma), {
    connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) }
  })
  const h = async (p) => (await import(p)).default
  api = await startApi([
    { method: 'post', path: '/api/redeem', handler: await h('../server/api/redeem.post.js') },
    { method: 'get', path: '/api/redeem/status', handler: await h('../server/api/redeem/status.get.js') },
    { method: 'get', path: '/api/redeem/pending', handler: await h('../server/api/redeem/pending.get.js') },
    { method: 'get', path: '/api/admin/handicap-redeems', handler: await h('../server/api/admin/handicap-redeems/index.get.js') },
    { method: 'post', path: '/api/admin/handicap-redeems', handler: await h('../server/api/admin/handicap-redeems/index.post.js') },
    { method: 'delete', path: '/api/admin/handicap-redeems/:userId', handler: await h('../server/api/admin/handicap-redeems/[userId].delete.js') },
    { method: 'post', path: '/api/admin/handicap-redeems/holds/:id/release', handler: await h('../server/api/admin/handicap-redeems/holds/[id]/release.post.js') }
  ])
})
after(async () => {
  await api?.close()
  await worker?.close()
  if (!skipUnlessDb) { await mintQueue.obliterate({ force: true }); await mintQueue.close(); await prisma.$disconnect() }
})

const redeem = (code, userId) => api.call('post', '/api/redeem', { userId, body: { code } })
const status = (code, userId) => api.call('get', `/api/redeem/status?code=${encodeURIComponent(code)}`, { userId })
const pending = (userId) => api.call('get', '/api/redeem/pending', { userId })
const flag = (adminId, username, reason) => api.call('post', '/api/admin/handicap-redeems', { userId: adminId, body: { username, reason } })
const unflag = (adminId, targetUserId) => api.call('delete', `/api/admin/handicap-redeems/${targetUserId}`, { userId: adminId })
const listHandicaps = (adminId) => api.call('get', '/api/admin/handicap-redeems', { userId: adminId })
const forceRelease = (adminId, holdId) => api.call('post', `/api/admin/handicap-redeems/holds/${holdId}/release`, { userId: adminId })
const rand = () => randomUUID().slice(0, 8)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// A release is deliberately fire-and-forget from the triggering redeemer's own request (see
// codeRedemption.js's own comment on why it must never slow that request down) — so the moment
// `redeem()`/`status()` returns for the claim that CROSSED the threshold is not the moment the
// release itself has actually finished running in the background. Poll briefly instead of
// asserting on it immediately.
async function waitForRelease(code, userId, { timeoutMs = 4000, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await status(code, userId)
    if (last.body?.redeeming === false) return last
    await sleep(intervalMs)
  }
  return last
}

async function mkAdmin() {
  const u = await mkUser(prisma)
  await prisma.user.update({ where: { id: u.id }, data: { isAdmin: true } })
  return u
}
async function mkCode({ maxClaims = 100, points = 0, ctoonId, quantity = 1 } = {}) {
  const code = `T${rand()}`
  await prisma.claimCode.create({
    data: {
      code, maxClaims,
      rewards: { create: [{ points, ...(ctoonId ? { ctoons: { create: [{ ctoonId, quantity }] } } : {}) }] }
    }
  })
  return code
}

run('a flagged player redeeming a cToon-awarding code gets held, not minted', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })

  const res = await redeem(code, player.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual(res.body, { redeeming: true })
  assert.equal(await prisma.claim.count({ where: { userId: player.id } }), 0, 'no claim was created')
  assert.equal(await prisma.userCtoon.count({ where: { userId: player.id, ctoonId: ct.id } }), 0, 'nothing was minted')

  const hold = await prisma.handicapRedeemHold.findFirst({ where: { userId: player.id } })
  assert.ok(hold, 'a hold row exists')
  assert.equal(hold.status, 'PENDING')
})

run('resubmitting the same still-pending code is idempotent, never an error', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })

  const first = await redeem(code, player.id)
  const second = await redeem(code, player.id)
  assert.equal(first.status, 200); assert.equal(second.status, 200)
  assert.deepEqual(second.body, { redeeming: true })
  assert.equal(await prisma.handicapRedeemHold.count({ where: { userId: player.id } }), 1, 'no duplicate hold')
})

run('two truly concurrent first-time submissions both get {redeeming:true}, with only one hold row', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })

  // Unlike the sequential case above, both requests can race past "no existing hold" before
  // either insert commits — the loser must hit the hold's own unique-key race gracefully rather
  // than bubbling up as an uncaught 500.
  const [a, b] = await Promise.all([redeem(code, player.id), redeem(code, player.id)])
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.equal(b.status, 200, JSON.stringify(b.body))
  assert.deepEqual(a.body, { redeeming: true })
  assert.deepEqual(b.body, { redeeming: true })
  assert.equal(await prisma.handicapRedeemHold.count({ where: { userId: player.id } }), 1, 'no duplicate hold')
})

run('a points-only code is never held — it redeems instantly even for a flagged player', async () => {
  const admin = await mkAdmin()
  const player = await mkUser(prisma, { points: 0 })
  await flag(admin.id, player.username)
  const code = await mkCode({ points: 30 })

  const res = await redeem(code, player.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.points, 30)
  assert.equal(await pointsOf(prisma, player.id), 30)
  assert.equal(await prisma.handicapRedeemHold.count({ where: { userId: player.id } }), 0)
})

run('a non-flagged player redeeming the same kind of code is completely unaffected', async () => {
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  const code = await mkCode({ ctoonId: ct.id })

  const res = await redeem(code, player.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.ctoons.length, 1)
  assert.equal(await prisma.handicapRedeemHold.count({ where: { userId: player.id } }), 0)
})

run('the hold releases automatically once 3 other players have claimed the code, with the real reward', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma, { points: 0 })
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id, points: 10 })

  const held = await redeem(code, player.id)
  assert.deepEqual(held.body, { redeeming: true })

  const others = await Promise.all(Array.from({ length: 2 }, () => mkUser(prisma)))
  for (const o of others) {
    const r = await redeem(code, o.id)
    assert.equal(r.status, 200, JSON.stringify(r.body))
  }
  // Still only 2 others so far — not enough yet.
  const stillHeld = await status(code, player.id)
  assert.equal(stillHeld.body.redeeming, true, 'still held after only 2 other redemptions')
  assert.equal(await prisma.claim.count({ where: { userId: player.id } }), 0)

  // The 3rd other redemption should trigger the release of the held player's own redemption.
  const third = await mkUser(prisma)
  const thirdRes = await redeem(code, third.id)
  assert.equal(thirdRes.status, 200, JSON.stringify(thirdRes.body))

  const released = await waitForRelease(code, player.id)
  assert.equal(released.status, 200, JSON.stringify(released.body))
  assert.equal(released.body.redeeming, false, 'hold never released within the timeout')
  assert.equal(released.body.ctoons.length, 1)
  assert.equal(released.body.points, 10)
  assert.equal(await prisma.claim.count({ where: { userId: player.id } }), 1, 'a real claim now exists')
  assert.equal(await prisma.userCtoon.count({ where: { userId: player.id, ctoonId: ct.id } }), 1, 'the cToon was actually minted')
  assert.equal(await pointsOf(prisma, player.id), 10)

  const hold = await prisma.handicapRedeemHold.findFirst({ where: { userId: player.id } })
  assert.equal(hold.status, 'COMPLETED')
  assert.ok(hold.completedAt)

  // Resubmitting the code again now behaves exactly like any other player who already redeemed.
  const resubmit = await redeem(code, player.id)
  assert.equal(resubmit.status, 400)
  assert.equal(resubmit.body.statusMessage, 'Code already redeemed')
})

run('GET /api/redeem/pending resumes the held state across a reload, and reports nothing once released', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })

  await redeem(code, player.id)
  const whilePending = await pending(player.id)
  assert.deepEqual(whilePending.body, { pending: true, code })

  await forceRelease(admin.id, (await prisma.handicapRedeemHold.findFirst({ where: { userId: player.id } })).id)
  const afterRelease = await pending(player.id)
  assert.equal(afterRelease.body.pending, false)
})

run('an admin can force-release a hold immediately, ignoring the 3-redemption threshold', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })
  await redeem(code, player.id)

  const hold = await prisma.handicapRedeemHold.findFirst({ where: { userId: player.id } })
  const res = await forceRelease(admin.id, hold.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.result.ctoons.length, 1)
  assert.equal(await prisma.userCtoon.count({ where: { userId: player.id, ctoonId: ct.id } }), 1)

  const again = await forceRelease(admin.id, hold.id)
  assert.equal(again.status, 400, 'an already-released hold cannot be force-released again')
})

run('unflagging a player does not touch an existing hold — it still releases normally', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id })
  await redeem(code, player.id)

  await unflag(admin.id, player.id)
  assert.equal(await prisma.handicapRedeemer.count({ where: { userId: player.id } }), 0)

  // Still held — unflagging only stops NEW redemptions from being held, it doesn't retroactively
  // release what's already pending.
  const stillHeld = await status(code, player.id)
  assert.equal(stillHeld.body.redeeming, true)

  const others = await Promise.all(Array.from({ length: 3 }, () => mkUser(prisma)))
  for (const o of others) assert.equal((await redeem(code, o.id)).status, 200)
  const released = await waitForRelease(code, player.id)
  assert.equal(released.body.redeeming, false, 'hold never released within the timeout')
})

run('unflagging a player, then having them resubmit the same still-pending code, redeems it for real and clears the stale hold', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma, { points: 0 })
  await flag(admin.id, player.username)
  const code = await mkCode({ ctoonId: ct.id, points: 15 })
  await redeem(code, player.id)
  await unflag(admin.id, player.id)

  // No longer flagged, and nobody else has redeemed this code yet — this resubmission should
  // succeed as an entirely ordinary redemption, not stay stuck on "Redeeming…" forever.
  const res = await redeem(code, player.id)
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.ctoons?.length, 1)
  assert.equal(res.body.points, 15)
  assert.equal(await prisma.claim.count({ where: { userId: player.id } }), 1)

  // The old hold must not be left behind — otherwise every future claim of this code wastes a
  // release attempt on a row that can only ever fail "already redeemed" from here on.
  assert.equal(await prisma.handicapRedeemHold.count({ where: { userId: player.id } }), 0, 'the stale hold was cleaned up')
})

run('admin flag/unflag endpoints: validation, duplicates, and auditing', async () => {
  const admin = await mkAdmin()
  const player = await mkUser(prisma)

  const unknownUser = await flag(admin.id, `nobody_${rand()}`)
  assert.equal(unknownUser.status, 404)

  const ok = await flag(admin.id, player.username, 'repeatedly sniped mint #1')
  assert.equal(ok.status, 200, JSON.stringify(ok.body))

  const dup = await flag(admin.id, player.username)
  assert.equal(dup.status, 409)

  const list = await listHandicaps(admin.id)
  assert.equal(list.status, 200)
  assert.ok(list.body.flagged.some(f => f.userId === player.id && f.reason === 'repeatedly sniped mint #1'))

  const nonAdmin = await mkUser(prisma)
  const refused = await flag(nonAdmin.id, player.username)
  assert.equal(refused.status, 403)

  const removed = await unflag(admin.id, player.id)
  assert.equal(removed.status, 200)
  assert.equal(await prisma.handicapRedeemer.count({ where: { userId: player.id } }), 0)

  const removedAgain = await unflag(admin.id, player.id)
  assert.equal(removedAgain.status, 404)

  const logCount = await prisma.adminChangeLog.count({ where: { area: 'HandicapRedeems', targetUserId: player.id } })
  assert.equal(logCount, 2, 'one log row for the flag, one for the unflag')
})

run('a code that hits maxClaims before release leaves the hold pending rather than crashing', async () => {
  const admin = await mkAdmin()
  const ct = await mkCtoon(prisma, { quantity: 100 })
  const player = await mkUser(prisma)
  await flag(admin.id, player.username)
  // maxClaims=3: the held player's own attempt doesn't count against it (no claim created), but
  // 3 OTHER players filling the code up means there is no room left for the release itself.
  const code = await mkCode({ ctoonId: ct.id, maxClaims: 3 })
  await redeem(code, player.id)

  const others = await Promise.all(Array.from({ length: 3 }, () => mkUser(prisma)))
  for (const o of others) assert.equal((await redeem(code, o.id)).status, 200)

  // The release attempt triggered by the 3rd claim would have hit "Code fully redeemed" inside
  // redeemClaimCode — confirm that failure was swallowed (logged, not thrown) and the hold ends
  // up reverted back to PENDING, not corrupted. The attempt-then-revert is itself async (fire-
  // and-forget from the 3rd claim's own request), so poll briefly rather than asserting on it
  // immediately.
  let hold
  const deadline = Date.now() + 4000
  do {
    hold = await prisma.handicapRedeemHold.findFirst({ where: { userId: player.id } })
    if (hold.status === 'PENDING') break
    await sleep(50)
  } while (Date.now() < deadline)
  assert.equal(hold.status, 'PENDING', 'the reverted-failed-release never settled back to PENDING')

  const stillHeld = await status(code, player.id)
  assert.equal(stillHeld.status, 200)
  assert.equal(stillHeld.body.redeeming, true)
})
