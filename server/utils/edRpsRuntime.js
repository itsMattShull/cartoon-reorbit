// Ed, Edd n Eddy Rock Paper Scissors — authoritative PvP runtime.
//
// Registered onto the socket server by registerEdRps() at the bottom of this file. Everything
// that can pay points happens here; the CPU practice mode is played entirely in the browser
// and never touches this module.
//
// ── Why this does not look like the gToons Clash room code ────────────────────────────────
// Clash is the other PvP game and the obvious thing to copy, but three of its choices are
// wrong for a match that lasts under a minute:
//
//   * Clash trusts a client-supplied `userId` on its socket payloads. Every handler here
//     resolves identity from the session cookie instead, and no `edrps:*` payload carries a
//     user id at all. Identity is namespaced onto socket.data.edRps* rather than the shared
//     socket.data.userId, which Clash's `disconnecting` handler consumes.
//   * Clash lets the client choose the room id and `Map.set`s it unconditionally. Room ids
//     here are server-generated UUIDs, validated before they ever reach socket.join().
//   * Clash runs a 1-second setInterval per match that calls fetchSockets() — a Redis
//     round-trip per tick, per match — to stream a countdown. A round here arms a single
//     setTimeout and ships an absolute deadline the client counts down against itself.
//
// State is in-memory and deliberately not mirrored to Redis: the socket server runs as a
// single fork'd process (ecosystem.config.cjs), and a 30-second match is not worth a
// serializer, a boot-restore branch and a shutdown-save branch. On a reload, matches are lost
// and no points are paid, which is the safe direction to fail.

import { randomInt, randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { getRedis } from './redis.js'
import { encryptIp } from './ip-encrypt.js'
import { getDailyWindowStart } from './centralTime.js'
import { awardCappedGamePoints, COMBAT_POOL_GAME_NAMES } from './gamePoints.js'
import { compareHands, isHand, isCharacterId, clampConfig, HANDS, ROUND_BREAK_MS } from '../../lib/edRps.js'

const GAME_NAME = 'EdRps'
const POINTS_METHOD = 'Game - Ed, Edd n Eddy RPS'
const LOBBY_ROOM = 'edrps-lobby'

// An open room nobody joins is reaped this fast. Clash uses 10 minutes; at this game's churn
// that would leave a lobby full of ghosts.
const ROOM_IDLE_MS = 2 * 60 * 1000
// Absolute ceiling on a match, independent of socket presence. The per-round timer already
// bounds a *played* match, but a player who leaves an idle tab open keeps a socket in the room
// forever, and Clash's `roomSize === 0` sweep gate never fires for them.
const MATCH_MAX_AGE_MS = 15 * 60 * 1000
// A disconnect is not instantly fatal — phones drop sockets constantly, and the whole match
// fits inside a lift-tunnel outage. Forfeits pay nothing, so a grace window costs us nothing.
const RECONNECT_GRACE_MS = 20 * 1000

const ROOM_ID_RE = /^edrps:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/* ────────────────────────────────────────────────────────────────────────────────────────
 * In-memory state. Single-process only — see the header note. If socket-server is ever
 * moved to cluster mode these Maps must become shared state first, or throws will land on a
 * process that has never heard of the match.
 * ──────────────────────────────────────────────────────────────────────────────────────── */
const rooms = new Map()   // roomId -> { id, ownerId, ownerName, createdAt, lastActivity }
const matches = new Map() // roomId -> match (see startMatch)
const roomByUser = new Map()  // userId -> roomId (open room; one per user)
const matchByUser = new Map() // userId -> roomId (live match; one per user)

/* ── Config, cached ──────────────────────────────────────────────────────────────────────
 * Clash refetches GameConfig and GlobalGameConfig on every single match end. Two hot
 * single-row reads per match is pure waste on the busiest game on the site. */
let configCache = null
let configCachedAt = 0
const CONFIG_TTL_MS = 60_000

async function loadConfig() {
  const now = Date.now()
  if (configCache && now - configCachedAt < CONFIG_TTL_MS) return configCache
  const [game, global] = await Promise.all([
    db.gameConfig.findUnique({
      where: { gameName: GAME_NAME },
      select: {
        pointsPerWin: true,
        edRpsRoundSeconds: true,
        edRpsWinsNeeded: true,
        edRpsMaxRounds: true,
        edRpsPairDailyAwardLimit: true
      }
    }).catch(() => null),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { tkoDailyPointLimit: true }
    }).catch(() => null)
  ])
  configCache = {
    pointsPerWin: Math.max(0, Number(game?.pointsPerWin ?? 0)),
    dailyCap: Math.max(0, Number(global?.tkoDailyPointLimit ?? 250)),
    ...clampConfig({
      roundSeconds: game?.edRpsRoundSeconds,
      winsNeeded: game?.edRpsWinsNeeded,
      maxRounds: game?.edRpsMaxRounds,
      pairDailyAwardLimit: game?.edRpsPairDailyAwardLimit
    })
  }
  configCachedAt = now
  return configCache
}

/* ── Rate limiting ───────────────────────────────────────────────────────────────────────
 * Nothing else in this repo rate-limits a socket event. The bucket is per-socket and in
 * memory on purpose: a Redis round-trip per event is exactly the amplification a flooder
 * wants. Throws are additionally idempotent below, so spamming them costs one Map lookup. */
const BUCKET_CAPACITY = 24
const BUCKET_REFILL_MS = 10_000

function allowEvent(socket) {
  const now = Date.now()
  const b = socket.data.edRpsBucket || (socket.data.edRpsBucket = { tokens: BUCKET_CAPACITY, at: now })
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.at) / BUCKET_REFILL_MS) * BUCKET_CAPACITY)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

/* ── Discord announce ────────────────────────────────────────────────────────────────────
 * Clash re-fetches the guild's entire channel list on every room creation and posts with an
 * unprefixed Authorization header. At this game's churn that would 429 the bot globally and
 * take the auction and achievement announcements down with it. */
let cachedChannelId = null

async function resolveGtoonsChannelId() {
  if (cachedChannelId) return cachedChannelId
  const botToken = process.env.BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  if (!botToken || !guildId) return null
  const auth = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: auth }
    })
    if (!res.ok) return null
    const channels = await res.json()
    cachedChannelId = channels.find(c => c.type === 0 && c.name === 'gtoons')?.id || null
    return cachedChannelId
  } catch {
    return null
  }
}

async function announceRoom(username, discordId) {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) return
  try {
    const redis = getRedis()
    // Two cooldowns: one so a single player can't spam the channel, one so a crowd can't.
    const perUser = await redis.set(`edrps:announce:${username}`, '1', 'EX', 600, 'NX')
    if (!perUser) return
    const global = await redis.set('edrps:announce:global', '1', 'EX', 60, 'NX')
    if (!global) return

    const channelId = await resolveGtoonsChannelId()
    if (!channelId) return
    const auth = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`
    // Usernames are user-controlled and land in a Discord message body, so mentions are
    // disabled wholesale and markdown is escaped.
    const safe = String(username || 'Someone').replace(/[\\`*_~|<>@#:]/g, '\\$&')
    const display = discordId ? `<@${discordId}>` : safe
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `✊✋✌️ ${display} is looking for an **Ed, Edd n Eddy RPS** match! https://www.cartoonreorbit.com/newsite/edrps`,
        allowed_mentions: discordId ? { users: [discordId] } : { parse: [] }
      })
    })
  } catch (err) {
    console.error('[edrps] Discord announce failed:', err)
  }
}

/* ── Views ───────────────────────────────────────────────────────────────────────────────
 * Every payload a client receives is built here, as a fresh literal.
 *
 * This is the simultaneous-reveal boundary and it is built by allowlist, never by spreading
 * or mutating the match. Clash hides the opponent's hand by assigning `undefined` and relying
 * on JSON.stringify dropping the key — one `null`, one clone before the assignment, and the
 * hand ships. `match.round.hands` must never be reachable from anything returned here. */
function publicMatchView(match, uid) {
  const meIdx = match.players.indexOf(uid)
  const oppIdx = meIdx === 0 ? 1 : 0
  const r = match.round
  return {
    roomId: match.roomId,
    you: {
      userId: uid,
      username: match.usernames[meIdx],
      character: match.characters[meIdx],
      score: match.scores[meIdx]
    },
    opponent: {
      username: match.usernames[oppIdx],
      character: match.characters[oppIdx],
      score: match.scores[oppIdx]
    },
    winsNeeded: match.config.winsNeeded,
    maxRounds: match.config.maxRounds,
    round: r ? r.number : match.currentRound,
    // Absolute epoch ms, so a client with a skewed or backgrounded clock still lands on the
    // same deadline the server is enforcing, and a reconnect can't extend it.
    deadlineAt: r ? r.deadlineAt : null,
    youThrew: r ? r.hands[meIdx] !== null : false,
    // Safe: that an opponent has committed reveals nothing about *what* they committed, and
    // without it the UI can't distinguish "thinking" from "disconnected".
    opponentThrew: r ? r.hands[oppIdx] !== null : false,
    history: match.history.map(h => ({
      n: h.n,
      you: meIdx === 0 ? h.p1 : h.p2,
      opponent: meIdx === 0 ? h.p2 : h.p1,
      result: h.w === 0 ? 'tie' : (h.w === meIdx + 1 ? 'win' : 'loss')
    }))
  }
}

function lobbyRoomList() {
  const out = []
  for (const room of rooms.values()) {
    out.push({ id: room.id, owner: room.ownerName, createdAt: room.createdAt })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
}

/* ── Lifecycle ─────────────────────────────────────────────────────────────────────────── */

function destroyRoom(io, roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  rooms.delete(roomId)
  if (roomByUser.get(room.ownerId) === roomId) roomByUser.delete(room.ownerId)
  io.to(LOBBY_ROOM).emit('edrps:roomRemoved', { id: roomId })
}

/**
 * The ONLY place a match is removed. Four paths end a match (natural end, leave, sweep,
 * shutdown) and each must clear the round timer: deleting from the Map does not free a match
 * a live setTimeout still closes over, and that timer would later fire against a match that
 * no longer exists.
 */
function destroyMatch(roomId) {
  const match = matches.get(roomId)
  if (!match) return
  if (match.timer) { clearTimeout(match.timer); match.timer = null }
  for (const t of Object.values(match.graceTimers)) if (t) clearTimeout(t)
  match.graceTimers = {}
  for (const uid of match.players) {
    if (matchByUser.get(uid) === roomId) matchByUser.delete(uid)
  }
  matches.delete(roomId)
}

function armRound(io, match) {
  const r = match.round
  r.deadlineAt = Date.now() + match.config.roundSeconds * 1000
  r.startedAt = Date.now()
  if (match.timer) clearTimeout(match.timer)
  // One timeout per round, not a per-second tick. The client renders its own countdown from
  // the absolute deadline it was just handed.
  match.timer = setTimeout(() => {
    resolveRound(io, match, r.number, true).catch(err =>
      console.error('[edrps] round timeout resolve failed:', err))
  }, match.config.roundSeconds * 1000 + 250) // small grace for in-flight throws

  emitToPlayers(io, match, 'edrps:round')
}

// Each player gets their own view, so this cannot be a single room-wide emit.
function emitToPlayers(io, match, event) {
  for (const [i, uid] of match.players.entries()) {
    for (const sid of match.sockets[i]) {
      io.to(sid).emit(event, publicMatchView(match, uid))
    }
  }
}

/**
 * Resolves one round. Single-shot: both the "both hands are in" path and the timer path
 * funnel through here, and `resolving` is set synchronously before the first await so they
 * cannot interleave. Clash has the equivalent race and survives it only because its leave
 * path pays nothing.
 */
async function resolveRound(io, match, roundNumber, fromTimer) {
  const r = match.round
  if (!r || r.number !== roundNumber || r.resolving || r.resolved) return
  if (match.ending) return

  // On the timer path, fill whatever is missing. crypto.randomInt, not Math.random: the
  // player chooses when to trigger this by stalling, and V8's PRNG state is recoverable from
  // a handful of observed outputs.
  if (fromTimer) {
    for (let i = 0; i < 2; i++) {
      if (r.hands[i] === null) {
        r.hands[i] = randomInt(3)
        r.auto[i] = true
        r.receivedAt[i] = Date.now()
      }
    }
  }
  if (r.hands[0] === null || r.hands[1] === null) return

  r.resolving = true
  if (match.timer) { clearTimeout(match.timer); match.timer = null }

  const cmp = compareHands(r.hands[0], r.hands[1])
  const w = cmp === 0 ? 0 : (cmp > 0 ? 1 : 2)
  if (w === 1) match.scores[0]++
  else if (w === 2) match.scores[1]++

  match.history.push({
    n: r.number,
    p1: r.hands[0],
    p2: r.hands[1],
    p1Auto: r.auto[0],
    p2Auto: r.auto[1],
    // Response times are the one collusion signal a VPN and a fresh fingerprint cannot
    // launder: scripted win-trading throws in tens of milliseconds with almost no variance.
    p1Ms: r.receivedAt[0] ? r.receivedAt[0] - r.startedAt : null,
    p2Ms: r.receivedAt[1] ? r.receivedAt[1] - r.startedAt : null,
    w
  })
  r.resolved = true
  match.lastActivity = Date.now()

  // Emit the resolved round to both players from one build, with no await in between, so
  // neither side learns the result measurably earlier than the other.
  const reveal = []
  for (const [i, uid] of match.players.entries()) {
    const view = publicMatchView(match, uid)
    reveal.push({ i, uid, view })
  }
  for (const { i, view } of reveal) {
    const last = match.history[match.history.length - 1]
    const payload = {
      ...view,
      reveal: {
        n: last.n,
        you: i === 0 ? last.p1 : last.p2,
        opponent: i === 0 ? last.p2 : last.p1,
        youAuto: i === 0 ? last.p1Auto : last.p2Auto,
        opponentAuto: i === 0 ? last.p2Auto : last.p1Auto,
        result: last.w === 0 ? 'tie' : (last.w === i + 1 ? 'win' : 'loss')
      }
    }
    for (const sid of match.sockets[i]) io.to(sid).emit('edrps:reveal', payload)
  }

  const winsNeeded = match.config.winsNeeded
  const decided = match.scores[0] >= winsNeeded || match.scores[1] >= winsNeeded
  const exhausted = match.history.length >= match.config.maxRounds &&
    match.scores[0] !== match.scores[1]

  if (decided || exhausted) {
    const winnerIdx = match.scores[0] > match.scores[1] ? 0 : 1
    // Ended immediately so the points are awarded and the row written without waiting on a
    // timer that a disconnect could orphan. The client holds the match-over panel back for
    // ROUND_BREAK_MS so the final round's result is still readable underneath it.
    await endMatch(io, match, { winnerIdx, endReason: 'natural' })
    return
  }

  // A beat before the next round is armed, so the round result is something you read rather
  // than something you catch. Without it the next round's timer starts on the same tick as
  // the reveal, and the result is gone before the losing player has looked up.
  //
  // A tie at the round ceiling replays rather than ending in a draw: the match has to produce
  // a winner, and best-of-7 can only be level here if ties consumed rounds.
  match.intermission = true
  match.timer = setTimeout(() => {
    if (match.ending) return
    match.intermission = false
    match.currentRound = r.number + 1
    match.round = newRound(match.currentRound)
    armRound(io, match)
  }, ROUND_BREAK_MS)
}

function newRound(n) {
  return {
    number: n,
    // Server-only. Never serialized to a client — see publicMatchView.
    hands: [null, null],
    auto: [false, false],
    receivedAt: [null, null],
    startedAt: 0,
    deadlineAt: 0,
    resolving: false,
    resolved: false
  }
}

/* ── Match end + points ──────────────────────────────────────────────────────────────── */

async function endMatch(io, match, { winnerIdx, endReason, whoLeftUserId = null }) {
  if (match.ending) return
  match.ending = true
  if (match.timer) { clearTimeout(match.timer); match.timer = null }

  const winnerUserId = winnerIdx === null ? null : match.players[winnerIdx]
  let awarded = 0
  let suppressReason = null

  try {
    const result = await persistAndAward(match, { winnerUserId, endReason, whoLeftUserId })
    awarded = result.awarded
    suppressReason = result.suppressReason
  } catch (err) {
    console.error('[edrps] failed to persist match:', err)
  }

  for (const [i, uid] of match.players.entries()) {
    const won = winnerUserId === uid
    const payload = {
      ...publicMatchView(match, uid),
      over: true,
      won,
      endReason,
      pointsAwarded: won ? awarded : 0,
      suppressReason: won ? suppressReason : null
    }
    for (const sid of match.sockets[i]) io.to(sid).emit('edrps:matchEnd', payload)
  }

  destroyMatch(match.roomId)
}

/**
 * Writes the match row and awards the winner, in ONE transaction.
 *
 * The row is created here rather than at match start because there is no stake to escrow, so
 * nothing needs a durable record mid-match — and doing both in one transaction means we can
 * never end up with points and no match record, or the reverse, after a crash.
 */
async function persistAndAward(match, { winnerUserId, endReason, whoLeftUserId }) {
  const cfg = match.config
  const [p1, p2] = match.players

  const row = {
    id: randomUUID(),
    roomId: match.roomId,
    player1UserId: p1,
    player2UserId: p2,
    player1Character: match.characters[0],
    player2Character: match.characters[1],
    player1Score: match.scores[0],
    player2Score: match.scores[1],
    winnerUserId,
    whoLeftUserId,
    endReason,
    rounds: match.history,
    player1Ip: match.ips[0],
    player2Ip: match.ips[1],
    player1VisitorId: match.visitorIds[0],
    player2VisitorId: match.visitorIds[1],
    sameIp: match.sameIp,
    sameVisitorId: match.sameVisitorId,
    startedAt: new Date(match.startedAt),
    endedAt: new Date()
  }

  // Decide suppression outside the transaction where we can, so the common "no award" case
  // never opens one.
  let suppressReason = null
  if (!winnerUserId || endReason === 'sweep') suppressReason = 'abandoned'
  else if (endReason !== 'natural') suppressReason = 'forfeit'
  else if (match.sameIp || match.sameVisitorId) suppressReason = 'same_device'
  else if (cfg.pointsPerWin <= 0 || cfg.dailyCap <= 0) suppressReason = 'cap_exhausted'

  if (suppressReason) {
    await db.edRpsMatch.create({ data: { ...row, pointsAwarded: 0, suppressReason } })
    return { awarded: 0, suppressReason }
  }

  const windowStart = getDailyWindowStart()
  let awarded = 0

  await db.$transaction(async (tx) => {
    await tx.edRpsMatch.create({ data: { ...row, pointsAwarded: 0 } })

    // resolveSocketUser caches the authenticated user for the socket's whole life and the
    // session JWT lives 30 days, so a ban landing mid-session is only visible here.
    const winner = await tx.user.findUnique({
      where: { id: winnerUserId },
      select: { banned: true, active: true }
    })
    if (!winner || winner.banned || winner.active === false) {
      suppressReason = 'banned'
      await tx.edRpsMatch.update({ where: { id: row.id }, data: { suppressReason } })
      return
    }

    // Win-trading between two accounts is the obvious farm for a game this fast. Cap how much
    // one pair can pay each other per daily window; rotating alts defeats this, which is what
    // the IP/visitorId columns and the suspicious-activity metrics are for.
    if (cfg.pairDailyAwardLimit > 0) {
      const [a, b] = [p1, p2].sort()
      const paidBetweenPair = await tx.edRpsMatch.count({
        where: {
          pointsAwardedAt: { gte: windowStart },
          OR: [
            { player1UserId: a, player2UserId: b },
            { player1UserId: b, player2UserId: a }
          ]
        }
      })
      if (paidBetweenPair >= cfg.pairDailyAwardLimit) {
        suppressReason = 'pair_limit'
        await tx.edRpsMatch.update({ where: { id: row.id }, data: { suppressReason } })
        return
      }
    }

    // Claim the award before paying it. Nothing else makes awardCappedGamePoints idempotent —
    // GamePointLog has no unique constraint — so if a forfeit ever raced a natural end, the
    // winner would be paid twice.
    const claimed = await tx.$executeRaw`
      UPDATE "EdRpsMatch"
         SET "pointsAwardedAt" = now(), "awardedUserId" = ${winnerUserId}
       WHERE "id" = ${row.id} AND "pointsAwardedAt" IS NULL`
    if (claimed !== 1) return

    awarded = await awardCappedGamePoints(tx, {
      userId: winnerUserId,
      gameName: GAME_NAME,
      poolGameNames: COMBAT_POOL_GAME_NAMES,
      pointsPerWin: cfg.pointsPerWin,
      cap: cfg.dailyCap,
      method: POINTS_METHOD
    })

    if (awarded > 0) {
      await tx.edRpsMatch.update({ where: { id: row.id }, data: { pointsAwarded: awarded } })
    } else {
      suppressReason = 'cap_exhausted'
      await tx.edRpsMatch.update({
        where: { id: row.id },
        data: { pointsAwardedAt: null, awardedUserId: null, suppressReason }
      })
    }
  })

  return { awarded, suppressReason }
}

/* ── Starting a match ───────────────────────────────────────────────────────────────── */

async function collectSignals(userId, socket) {
  // x-forwarded-for first: the socket server sits behind a proxy, so handshake.address is the
  // proxy on every connection in production.
  const fwd = socket.handshake?.headers?.['x-forwarded-for']
  const raw = (typeof fwd === 'string' ? fwd.split(',')[0] : null)?.trim() ||
    socket.handshake?.address || null
  let ip = null
  try { ip = raw ? encryptIp(raw) : null } catch { ip = null }

  let visitorId = null
  try {
    const fp = await db.deviceFingerprintLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { visitorId: true }
    })
    visitorId = fp?.visitorId || null
  } catch { /* fingerprinting is best-effort; never block a match on it */ }

  return { ip, visitorId }
}

async function startMatch(io, room, joiner) {
  const config = await loadConfig()
  const players = [room.ownerId, joiner.userId]

  const [s1, s2] = await Promise.all([
    collectSignals(players[0], room.ownerSocket),
    collectSignals(players[1], joiner.socket)
  ])

  const match = {
    roomId: room.id,
    players,
    usernames: [room.ownerName, joiner.username],
    characters: [room.ownerCharacter, joiner.character],
    sockets: [new Set([room.ownerSocket.id]), new Set([joiner.socket.id])],
    scores: [0, 0],
    ips: [s1.ip, s2.ip],
    visitorIds: [s1.visitorId, s2.visitorId],
    sameIp: Boolean(s1.ip && s2.ip && s1.ip === s2.ip),
    sameVisitorId: Boolean(s1.visitorId && s2.visitorId && s1.visitorId === s2.visitorId),
    config,
    currentRound: 1,
    round: newRound(1),
    history: [],
    ending: false,
    // True during the pause between a round resolving and the next one being armed.
    intermission: false,
    timer: null,
    graceTimers: {},
    startedAt: Date.now(),
    lastActivity: Date.now()
  }

  matches.set(room.id, match)
  for (const uid of players) matchByUser.set(uid, room.id)
  destroyRoom(io, room.id)

  emitToPlayers(io, match, 'edrps:matchStart')
  armRound(io, match)
}

/* ── Leaving ─────────────────────────────────────────────────────────────────────────── */

function handleLeave(io, { roomId, userId, socketId, immediate }) {
  const room = rooms.get(roomId)
  if (room && room.ownerId === userId) {
    destroyRoom(io, roomId)
    return
  }

  const match = matches.get(roomId)
  if (!match || match.ending) return
  const idx = match.players.indexOf(userId)
  if (idx === -1) return

  if (socketId) match.sockets[idx].delete(socketId)
  // Another tab or a reconnect already holds the seat.
  if (!immediate && match.sockets[idx].size > 0) return

  const forfeit = () => {
    if (match.ending) return
    endMatch(io, match, {
      winnerIdx: idx === 0 ? 1 : 0,
      endReason: 'forfeit',
      whoLeftUserId: userId
    }).catch(err => console.error('[edrps] forfeit failed:', err))
  }

  if (immediate) { forfeit(); return }

  if (match.graceTimers[idx]) clearTimeout(match.graceTimers[idx])
  match.graceTimers[idx] = setTimeout(() => {
    if (match.sockets[idx].size === 0) forfeit()
  }, RECONNECT_GRACE_MS)

  const opp = idx === 0 ? 1 : 0
  for (const sid of match.sockets[opp]) {
    io.to(sid).emit('edrps:opponentDropped', { graceMs: RECONNECT_GRACE_MS })
  }
}

/* ── Sweep ───────────────────────────────────────────────────────────────────────────── */

function sweep(io) {
  const now = Date.now()
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_IDLE_MS) destroyRoom(io, roomId)
  }
  for (const [roomId, match] of matches.entries()) {
    // Deliberately not gated on socket presence: a player who leaves an idle tab open keeps a
    // socket in the room forever, which is why Clash's equivalent sweep never fires.
    if (now - match.startedAt < MATCH_MAX_AGE_MS) continue
    if (match.ending) continue
    endMatch(io, match, { winnerIdx: null, endReason: 'sweep' })
      .catch(err => console.error('[edrps] sweep end failed:', err))
  }
}

/* ── Handlers ────────────────────────────────────────────────────────────────────────── */

export function registerEdRps(io, socket, resolveSocketUser) {
  // Every handler starts here. No edrps:* payload carries a user id, so there is nothing to
  // forge; and identity is never copied onto the shared socket.data.userId.
  const auth = async () => {
    if (!allowEvent(socket)) return null
    const user = await resolveSocketUser(socket)
    if (!user) {
      socket.emit('edrps:error', { code: 'unauth', message: 'Please sign in to play.' })
      return null
    }
    socket.data.edRpsUserId = user.id
    reattach(user.id)
    return user
  }

  /**
   * Re-binds a reconnected socket to the caller's live match.
   *
   * socket.io reconnects with a NEW socket id, so after any network blip — which on a phone is
   * routine, and this whole match fits inside one — the player's seat would be pointing at a
   * dead socket. They would see nothing and lose to the grace timer without ever knowing the
   * match was still running. Hanging this off the one auth choke point covers every event,
   * including the `edrps:subscribe` the client sends on every reconnect.
   *
   * This is not the rejoin path we deliberately left out: nothing is restored from Redis and a
   * match still dies with the process. The view it sends back is the same allowlisted one
   * every other emit uses, so a reconnect cannot be used to peek at an unresolved hand.
   */
  function reattach(userId) {
    const roomId = matchByUser.get(userId)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(userId)
    if (idx === -1) return
    if (match.sockets[idx].has(socket.id)) return

    match.sockets[idx].add(socket.id)
    socket.join(roomId)
    socket.data.edRpsRoomId = roomId
    if (match.graceTimers[idx]) {
      clearTimeout(match.graceTimers[idx])
      match.graceTimers[idx] = null
    }
    socket.emit('edrps:matchStart', publicMatchView(match, userId))
    const opp = idx === 0 ? 1 : 0
    for (const sid of match.sockets[opp]) io.to(sid).emit('edrps:opponentReturned')
  }

  socket.on('edrps:subscribe', async () => {
    const user = await auth()
    if (!user) return
    socket.join(LOBBY_ROOM)
    socket.emit('edrps:rooms', lobbyRoomList())
    // Config rides the socket rather than a separate HTTP round-trip; it's cached in-process
    // for a minute, so this costs nothing per lobby visit.
    const cfg = await loadConfig()
    socket.emit('edrps:config', {
      pointsPerWin: cfg.pointsPerWin,
      winsNeeded: cfg.winsNeeded,
      maxRounds: cfg.maxRounds,
      roundSeconds: cfg.roundSeconds
    })
  })

  socket.on('edrps:unsubscribe', () => {
    socket.leave(LOBBY_ROOM)
  })

  socket.on('edrps:listRooms', async () => {
    const user = await auth()
    if (!user) return
    // Served from memory. Clash's equivalent issues a db.user.findMany per call, which is an
    // unauthenticated DB amplification primitive.
    socket.emit('edrps:rooms', lobbyRoomList())
  })

  socket.on('edrps:createRoom', async ({ character } = {}) => {
    const user = await auth()
    if (!user) return
    if (!isCharacterId(character)) {
      return socket.emit('edrps:error', { code: 'badCharacter', message: 'Pick a character first.' })
    }
    if (matchByUser.has(user.id)) {
      return socket.emit('edrps:error', { code: 'inMatch', message: 'You are already in a match.' })
    }
    const existing = roomByUser.get(user.id)
    if (existing && rooms.has(existing)) {
      return socket.emit('edrps:error', { code: 'roomOpen', message: 'You already have a room open.' })
    }

    // Server-generated, never client-supplied: a client-chosen id lets a caller overwrite
    // someone else's lobby entry and join socket.io rooms belonging to other features.
    const roomId = `edrps:${randomUUID()}`
    const room = {
      id: roomId,
      ownerId: user.id,
      ownerName: user.username,
      ownerCharacter: character,
      ownerSocket: socket,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }
    rooms.set(roomId, room)
    roomByUser.set(user.id, roomId)
    socket.join(roomId)
    socket.data.edRpsRoomId = roomId

    socket.emit('edrps:roomCreated', { id: roomId })
    // Scoped to the lobby, not io.emit: Clash broadcasts its room list churn to every socket
    // on the site, on every page.
    io.to(LOBBY_ROOM).emit('edrps:roomAdded', { id: roomId, owner: user.username, createdAt: room.createdAt })

    db.user.findUnique({ where: { id: user.id }, select: { discordId: true } })
      .then(u => announceRoom(user.username, u?.discordId))
      .catch(() => {})
  })

  socket.on('edrps:joinRoom', async ({ roomId, character } = {}) => {
    const user = await auth()
    if (!user) return
    if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) {
      return socket.emit('edrps:error', { code: 'badRoom', message: 'That room is no longer available.' })
    }
    if (!isCharacterId(character)) {
      return socket.emit('edrps:error', { code: 'badCharacter', message: 'Pick a character first.' })
    }
    if (matchByUser.has(user.id)) {
      return socket.emit('edrps:error', { code: 'inMatch', message: 'You are already in a match.' })
    }
    const room = rooms.get(roomId)
    if (!room) {
      return socket.emit('edrps:error', { code: 'gone', message: 'That room is no longer available.' })
    }
    if (room.ownerId === user.id) {
      return socket.emit('edrps:error', { code: 'ownRoom', message: "That's your own room." })
    }

    // Claim the room before any await, so two joiners racing can't both start a match.
    rooms.delete(roomId)
    roomByUser.delete(room.ownerId)
    io.to(LOBBY_ROOM).emit('edrps:roomRemoved', { id: roomId })

    socket.join(roomId)
    socket.data.edRpsRoomId = roomId

    try {
      await startMatch(io, room, { userId: user.id, username: user.username, character, socket })
    } catch (err) {
      console.error('[edrps] failed to start match:', err)
      socket.emit('edrps:error', { code: 'startFailed', message: 'Could not start the match.' })
    }
  })

  socket.on('edrps:throw', async ({ round, hand } = {}) => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return

    const idx = match.players.indexOf(user.id)
    if (idx === -1) return
    if (!isHand(hand)) return

    const r = match.round
    if (!r) return
    // Rejecting a stale round number is what stops a client pre-submitting rounds 2-7 in one
    // burst, and rejecting a second throw is what stops a player changing their hand after
    // edrps:reveal tells them the opponent has committed.
    if (Number(round) !== r.number) return
    if (r.resolving || r.resolved) return
    if (r.hands[idx] !== null) return
    if (Date.now() > r.deadlineAt + 250) return

    r.hands[idx] = hand
    r.receivedAt[idx] = Date.now()
    match.lastActivity = Date.now()
    match.sockets[idx].add(socket.id)

    // A constant ack, never an echo of the hand: 'rock'/'paper'/'scissors' are 4/5/8 bytes and
    // a hand-shaped payload during the pre-reveal window is observable.
    socket.emit('edrps:throwAccepted', { round: r.number })
    const oppIdx = idx === 0 ? 1 : 0
    for (const sid of match.sockets[oppIdx]) {
      io.to(sid).emit('edrps:opponentThrew', { round: r.number })
    }

    await resolveRound(io, match, r.number, false)
  })

  socket.on('edrps:leave', async () => {
    const user = await auth()
    if (!user) return
    const roomId = socket.data.edRpsRoomId || matchByUser.get(user.id) || roomByUser.get(user.id)
    if (!roomId) return
    socket.leave(roomId)
    socket.data.edRpsRoomId = null
    handleLeave(io, { roomId, userId: user.id, socketId: socket.id, immediate: true })
  })

  // Namespaced so it can be called from socket-server's own `disconnecting` handler without
  // entangling with Clash's socket.data.roomId.
  socket.on('disconnecting', () => {
    const userId = socket.data.edRpsUserId
    const roomId = socket.data.edRpsRoomId
    if (!userId || !roomId) return
    handleLeave(io, { roomId, userId, socketId: socket.id, immediate: false })
  })
}

let sweepTimer = null

export function startEdRpsSweep(io) {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[edrps] sweep failed:', err) }
  }, 60_000)
  sweepTimer.unref?.()
}

// Exposed for tests.
export const __testing = { rooms, matches, publicMatchView, resolveRound, HANDS }
