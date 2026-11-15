// The REAL client composable (composables/useOgGtoonsSocket.js) against a REAL Socket.IO server running the async runtime and a
// REAL Postgres: open a game, play live, leave, come back later and replay what was missed. The board is simulated by
// acknowledging each reveal the way OgGtoonMatchBoard.vue does when its animation ends.
//
// Skipped unless OG_TOURNAMENT_TEST_DB is set:
//   OG_TOURNAMENT_TEST_DB=postgresql://... REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
//     node --test --test-concurrency=1 --test-force-exit tests/ogGtoonAsyncClient.db.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createServer } from 'node:http'

const URL_DB = process.env.OG_TOURNAMENT_TEST_DB
const run = URL_DB ? test : test.skip
const COLORS = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE']
let seq = 0

let db, T, Live, G, Config, Server, httpServer, port
const users = new Map()

async function setup() {
  if (db) return
  process.env.DATABASE_URL = URL_DB
  process.env.MINT_QUEUE_KEY = process.env.MINT_QUEUE_KEY || 'testMintQueue'
  process.env.REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379'
  register('./helpers/clientLoader.mjs', import.meta.url)
  ;({ prisma: db } = await import('../server/prisma.js'))
  T = await import('../server/utils/ogGtoonTournament.js')
  Live = await import('../server/utils/ogGtoonTournamentLive.js')
  G = await import('../server/utils/ogGtoonTournamentGames.js')
  Config = await import('../server/utils/ogGtoonsConfig.js')
  ;({ Server } = await import('socket.io'))
  const { registerOgGtoonsAsync } = await import('../server/utils/ogGtoonsAsyncSocket.js')

  httpServer = createServer()
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } })
  io.on('connection', (socket) => {
    registerOgGtoonsAsync(io, socket, {
      resolveSocketUser: async (s) => users.get(s.handshake.auth?.uid) || null,
      EV: (n) => `oggtoons:${n}`, userRoom: (uid) => `oggtoons:user:${uid}`
    })
  })
  await new Promise(r => httpServer.listen(0, r))
  port = httpServer.address().port
  globalThis.__TEST_PORT = port
}

async function mkUsers(n) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    seq += 1
    const u = await db.user.create({ data: { discordId: `cd${Date.now()}${seq}`, username: `ctester${Date.now()}_${seq}` } })
    users.set(u.id, { id: u.id, username: u.username })
    out.push(u)
  }
  return out
}

async function mkDeckFor(user, tag) {
  const ctoons = []
  for (let i = 0; i < 12; i += 1) {
    ctoons.push(await db.ctoon.create({
      data: { name: `${tag}-c${i}`, type: 'gtoon', rarity: 'Common', assetPath: `/x/${tag}${i}.png`, isOgGtoon: true, gtoonColor: COLORS[i % COLORS.length], gtoonValue: 3 + (i % 7) }
    }))
  }
  for (const c of ctoons) await db.userCtoon.create({ data: { userId: user.id, ctoonId: c.id } })
  return db.ogGtoonDeck.create({ data: { userId: user.id, name: `${tag} deck`, cards: { create: ctoons.map((c, i) => ({ ctoonId: c.id, position: i })) } } })
}

async function mkGame() {
  await setup()
  await db.gameConfig.upsert({
    where: { gameName: 'OgGtoons' },
    create: { gameName: 'OgGtoons', ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true },
    update: { ogGtoonsGameEnabled: true, ogGtoonsTournamentsEnabled: true }
  })
  Config.invalidateOgGtoonsConfigCache()
  const pair = await mkUsers(2)
  const t = await db.ogGtoonTournament.create({
    data: { name: `Client Cup ${seq++}`, status: 'OPT_IN_OPEN', optInStartAt: new Date(Date.now() - 86400000), optInEndAt: new Date(Date.now() - 1000), announcementChannelId: '', roundWindowHours: 24 }
  })
  for (const [i, u] of pair.entries()) {
    const deck = await mkDeckFor(u, `cl${seq}${i}`)
    const { snapshot } = await Live.lockTournamentDeck(u.id, deck.id)
    await db.ogGtoonTournamentOptIn.create({ data: { tournamentId: t.id, userId: u.id, deckSnapshotJson: snapshot } })
  }
  await T.startTournament(db, t.id)
  const pairing = await db.ogGtoonTournamentMatch.findFirst({ where: { tournamentId: t.id, status: 'PENDING' } })
  const [a, b] = [pair.find(u => u.id === pairing.playerAUserId), pair.find(u => u.id === pairing.playerBUserId)]
  await G.pressStart({ tournamentMatchId: pairing.id, userId: a.id })
  const { game } = await G.pressStart({ tournamentMatchId: pairing.id, userId: b.id })
  return { pairing, a, b, gameId: game.gameId }
}

/** One simulated browser tab: its own module instance of the composable, its own socket. */
let tabSeq = 0
async function tab(user, { autoAck = true } = {}) {
  globalThis.__TEST_UID = user.id
  const { watch, nextTick } = await import('vue')
  const mod = await import(new URL(`../composables/useOgGtoonsSocket.js?tab=${tabSeq++}`, import.meta.url).href)
  const s = mod.useOgGtoonsSocket()
  const log = []
  // The board: when a reveal is handed over, "animate" it and acknowledge it (OgGtoonMatchBoard.vue does exactly this).
  watch(s.lastReveal, (rev) => { if (rev) { log.push(rev.seq); if (autoAck) setTimeout(() => s.ackReveal(rev), 5) } })
  const until = async (fn, what, ms = 4000) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) { if (fn()) return; await new Promise(r => setTimeout(r, 15)); await nextTick() }
    throw new Error(`timed out waiting for ${what}`)
  }
  await until(() => s.isConnected.value, 'the socket to connect')
  return { ...s, log, until, close: () => s.socket.close() }
}

/** The legal "fill every open slot" commit, through the composable like the board does. */
async function commitRound(t) {
  await t.until(() => t.matchState.value?.phase === 'play' && !t.matchState.value.you.ready, 'a round to play')
  const v = t.matchState.value
  const n = Math.min(v.roundSlots.length, v.you.hand.length)
  for (let i = 0; i < n; i += 1) t.place(v.you.hand[i].idx, v.roundSlots[i])
  await t.until(() => t.matchState.value.you.placements.length === n, 'placements to show')
  t.commit(v.round)
}

run('live: both on the board, a round reveals for both and each acknowledges it; the server records what each has watched', async () => {
  const { a, b, gameId } = await mkGame()
  const ta = await tab(a)
  const tb = await tab(b)
  ta.openAsyncGame(gameId)
  tb.openAsyncGame(gameId)
  await ta.until(() => ta.matchState.value?.gameId === gameId, 'A to see the game')
  await tb.until(() => tb.matchState.value?.gameId === gameId, 'B to see the game')
  await ta.until(() => ta.asyncPresence.value.opponentOnBoard, 'presence')
  assert.equal(ta.matchState.value.async, true)
  assert.equal(ta.matchState.value.phaseEndsAt, null, 'no clock')

  await commitRound(ta)
  await ta.until(() => ta.matchState.value.you.ready, 'A to have committed')
  await tb.until(() => tb.matchState.value.opponent.committedSlots.length > 0, 'B to see that A committed')
  assert.equal(tb.matchState.value.waitingOn, 'you')
  assert.equal(tb.lastReveal.value, null, 'nothing reveals until both commit')
  await commitRound(tb)

  await ta.until(() => ta.log.length === 1, 'A to be shown the reveal')
  await tb.until(() => tb.log.length === 1, 'B to be shown the reveal')
  await ta.until(async () => (await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })).seenA === 1, 'A\'s ack to be recorded').catch(() => {})
  await new Promise(r => setTimeout(r, 150))
  const g = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  assert.deepEqual([g.seenA, g.seenB], [1, 1], 'both watched it live')
  assert.equal(ta.replayInfo.value, null, 'a live reveal is not a replay')
  ta.close(); tb.close()
})

run('away: leaving the board is not a forfeit, and coming back replays the reveal that was missed, then shows the present', async () => {
  const { pairing, a, b, gameId } = await mkGame()
  const ta = await tab(a)
  const tb = await tab(b)
  ta.openAsyncGame(gameId)
  tb.openAsyncGame(gameId)
  await ta.until(() => ta.matchState.value?.gameId === gameId, 'A to see the game')
  await tb.until(() => tb.matchState.value?.gameId === gameId, 'B to see the game')

  // A commits round 1, then closes the page / loses the connection.
  await commitRound(ta)
  await ta.until(() => ta.matchState.value.you.ready, 'A to have committed')
  ta.closeAsyncGame()
  ta.close()
  await new Promise(r => setTimeout(r, 100))
  const mid = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  assert.equal(mid.status, 'ACTIVE', 'leaving is not a forfeit')
  assert.equal((await db.ogGtoonTournamentMatch.findUnique({ where: { id: pairing.id } })).lockedAt, null)

  // Hours later B plays; A is not there.
  await tb.until(() => tb.asyncPresence.value.opponentOnBoard === false, 'B to see A leave')
  await commitRound(tb)
  await tb.until(() => tb.log.length === 1, 'B to watch the reveal live')
  const before = await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })
  assert.equal(before.seenA, 0, 'A has not seen it')

  // A comes back on another device.
  const back = await tab(a)
  back.openAsyncGame(gameId)
  await back.until(() => back.matchState.value?.gameId === gameId, 'A to land on the game')
  await back.until(() => back.log.length === 1, 'the missed reveal to be replayed')
  assert.equal(back.log[0], 1)
  await back.until(() => back.replayInfo.value === null, 'the replay to finish')
  // The present is shown after the replay: round 2 (discard phase), with the cards of round 1 on the board.
  assert.equal(back.matchState.value.phase, 'discard')
  assert.ok(back.matchState.value.you.revealed.length > 0)
  await new Promise(r => setTimeout(r, 150))
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })).seenA, 1, 'and the server now knows A watched it')

  // Reopening again replays nothing.
  back.closeAsyncGame()
  back.openAsyncGame(gameId)
  await back.until(() => back.matchState.value?.gameId === gameId, 'A to reopen')
  await new Promise(r => setTimeout(r, 100))
  assert.equal(back.log.length, 1)
  assert.equal(back.replayInfo.value, null)
  back.close(); tb.close()
})

run('skipping the replay jumps to the present and still records everything as watched', async () => {
  const { a, b, gameId } = await mkGame()
  const ta = await tab(a)
  const tb = await tab(b)
  ta.openAsyncGame(gameId)
  tb.openAsyncGame(gameId)
  await ta.until(() => ta.matchState.value?.gameId === gameId, 'A in')
  await tb.until(() => tb.matchState.value?.gameId === gameId, 'B in')
  await commitRound(ta)
  await ta.until(() => ta.matchState.value.you.ready, 'A committed')
  ta.closeAsyncGame(); ta.close()
  await commitRound(tb)
  await tb.until(() => tb.log.length === 1, 'B to watch it')

  // A returns; the board is slow to acknowledge (it never does here), so the replay is still showing when A skips it.
  globalThis.__TEST_UID = a.id
  const back = await tab(a, { autoAck: false })
  back.openAsyncGame(gameId)
  await back.until(() => back.replayInfo.value !== null, 'the replay to start')
  assert.deepEqual(back.replayInfo.value, { index: 0, total: 1 })
  back.skipReplay()
  assert.equal(back.replayInfo.value, null)
  assert.equal(back.lastReveal.value, null)
  assert.equal(back.matchState.value.phase, 'discard', 'the present')
  await new Promise(r => setTimeout(r, 150))
  assert.equal((await db.ogGtoonTournamentGame.findUnique({ where: { id: gameId } })).seenA, 1)
  back.close(); tb.close()
})

run('an id that is not an async tournament game is not an error: the tab carries on as before', async () => {
  const { a } = await mkGame()
  const ta = await tab(a)
  ta.openAsyncGame('00000000-0000-0000-0000-000000000000')
  await ta.until(() => ta.asyncGameId.value === null, 'the tab to drop the unknown id')
  assert.equal(ta.lastError.value, null, 'no error is shown for it')
  ta.close()
})

run('while an async game is open, casual-match pushes cannot replace its board', async () => {
  const { a, gameId } = await mkGame()
  const ta = await tab(a)
  ta.openAsyncGame(gameId)
  await ta.until(() => ta.matchState.value?.gameId === gameId, 'A in')
  // The server may reattach this socket to a casual match; its events must be ignored while this game is open.
  ta.socket.listeners('oggtoons:matchStart').forEach(fn => fn({ matchId: 'casual-match', you: { username: 'x' }, opponent: {}, round: 1 }))
  ta.socket.listeners('oggtoons:state').forEach(fn => fn({ matchId: 'casual-match', you: {}, opponent: {} }))
  assert.equal(ta.matchState.value.gameId, gameId, 'still the async game')
  ta.close()
})

test.after(async () => {
  if (!db) return
  await db.gameConfig.deleteMany({ where: { gameName: 'OgGtoons' } })
  Config?.invalidateOgGtoonsConfigCache()
  httpServer?.close()
})
