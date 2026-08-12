// ReOrbit Chess — authoritative PvP runtime.
//
// Registered onto the socket server by registerReOrbitChess() at the bottom of this file.
// Everything that can pay points happens here; the three AI opponents are played entirely in
// the browser and never touch this module.
//
// This is a close sibling of server/utils/edRpsRuntime.js and inherits its rules: identity
// comes from the session cookie on every event and never from a payload, room ids are
// server-generated UUIDs validated before they reach socket.join(), state is namespaced onto
// socket.data.reorbitChess* so it cannot collide with the Clash cleanup that reads the shared
// socket.data.roomId, and a per-socket token bucket bounds event floods.
//
// ── Where it deliberately differs from the RPS runtime ──────────────────────────────────
// An RPS match is over in 30 seconds. A chess game runs for ten minutes or more, and that
// single fact invalidates three of the RPS constants and one of its assumptions:
//
//   * ROOM_IDLE_MS / MATCH_MAX_AGE_MS / RECONNECT_GRACE_MS are all far too short. Copied
//     verbatim they would sweep live games mid-play and pay nobody. See lib/reorbitChess.js.
//   * A game can be thrown in two moves, which is faster than any RPS match can be lost.
//     That makes a minimum-length rule load-bearing rather than decorative — see the
//     suppression ladder in persistAndAward().
//   * The clock is the game. Every ms of it is computed here from server timestamps; the
//     client is handed absolute values and interpolates for display only.
//
// State is in-memory and deliberately not mirrored to Redis, for the same reason the RPS
// runtime gives: the socket server runs as a single fork'd process (ecosystem.config.cjs). On
// a reload live games are lost and no points are paid, which is the safe direction to fail.
// The cost is higher here than for RPS — a ten-minute game is a real loss to a player — so
// endMatch() is called for every live match on shutdown, which at least tells both players
// what happened instead of silently dropping them.

import { randomUUID } from 'crypto'
import { Chess } from 'chess.js'
import { prisma as db } from '../prisma.js'
import { getRedis } from './redis.js'
import { encryptIp } from './ip-encrypt.js'
import { getDailyWindowStart } from './centralTime.js'
import { awardCappedGamePoints, COMBAT_POOL_GAME_NAMES } from './gamePoints.js'
import {
  clampConfig, isSquare, isPromotionPiece, liveClocks, chargeClock,
  MATCH_MAX_AGE_MS, ROOM_IDLE_MS, DRAW_OFFER_TTL_MS
} from '../../lib/reorbitChess.js'

const GAME_NAME = 'ReOrbitChess'
const POINTS_METHOD = 'Game - ReOrbit Chess'
const LOBBY_ROOM = 'reorbitchess-lobby'

const ROOM_ID_RE = /^chess:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/* ────────────────────────────────────────────────────────────────────────────────────────
 * In-memory state. Single-process only — see the header note.
 * ──────────────────────────────────────────────────────────────────────────────────────── */
const rooms = new Map()   // roomId -> open room awaiting an opponent
const matches = new Map() // roomId -> match
const roomByUser = new Map()  // userId -> roomId (open room; one per user)
const matchByUser = new Map() // userId -> roomId (live game; one per user)

/* ── Config, cached ─────────────────────────────────────────────────────────────────── */
let configCache = null
let configCachedAt = 0
const CONFIG_TTL_MS = 60_000

async function loadConfig () {
  const now = Date.now()
  if (configCache && now - configCachedAt < CONFIG_TTL_MS) return configCache
  const [game, global] = await Promise.all([
    db.gameConfig.findUnique({
      where: { gameName: GAME_NAME },
      select: {
        pointsPerWin: true,
        reorbitChessInitialSeconds: true,
        reorbitChessIncrementSeconds: true,
        reorbitChessPairDailyAwardLimit: true,
        reorbitChessMinPliesForAward: true,
        reorbitChessGraceSeconds: true
      }
    }).catch(() => null),
    db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { tkoDailyPointLimit: true }
    }).catch(() => null)
  ])
  configCache = {
    pointsPerWin: Math.max(0, Number(game?.pointsPerWin ?? 0)),
    // The combat pool's cap, shared with TKO, Clash and RPS. Not a new field: the pool is
    // shared by design, so a second cap would silently double the site's daily budget.
    dailyCap: Math.max(0, Number(global?.tkoDailyPointLimit ?? 250)),
    ...clampConfig({
      initialSeconds: game?.reorbitChessInitialSeconds,
      incrementSeconds: game?.reorbitChessIncrementSeconds,
      pairDailyAwardLimit: game?.reorbitChessPairDailyAwardLimit,
      minPliesForAward: game?.reorbitChessMinPliesForAward,
      graceSeconds: game?.reorbitChessGraceSeconds
    })
  }
  configCachedAt = now
  return configCache
}

/* ── Rate limiting ──────────────────────────────────────────────────────────────────────
 * Per-socket and in memory: a Redis round-trip per event is exactly the amplification a
 * flooder wants. Sized larger than the RPS bucket because a chess game legitimately sends far
 * more events (a move every few seconds for ten minutes, plus board redraws on reconnect). */
const BUCKET_CAPACITY = 40
const BUCKET_REFILL_MS = 10_000

function allowEvent (socket) {
  const now = Date.now()
  const b = socket.data.chessBucket || (socket.data.chessBucket = { tokens: BUCKET_CAPACITY, at: now })
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.at) / BUCKET_REFILL_MS) * BUCKET_CAPACITY)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

/* ── Discord announce ───────────────────────────────────────────────────────────────────
 * Same shape as the RPS announce: a cached channel id, two Redis NX cooldowns (one per user,
 * one global) and mentions disabled wholesale because usernames are user-controlled text
 * landing in a message body. */
let cachedChannelId = null

async function resolveGtoonsChannelId () {
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

async function announceRoom (username, discordId) {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) return
  try {
    const redis = getRedis()
    const perUser = await redis.set(`chess:announce:${username}`, '1', 'EX', 600, 'NX')
    if (!perUser) return
    const global = await redis.set('chess:announce:global', '1', 'EX', 60, 'NX')
    if (!global) return

    const channelId = await resolveGtoonsChannelId()
    if (!channelId) return
    const auth = botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`
    const safe = String(username || 'Someone').replace(/[\\`*_~|<>@#:]/g, '\\$&')
    const display = discordId ? `<@${discordId}>` : safe
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `♟️ ${display} is looking for a **ReOrbit Chess!** game! https://www.cartoonreorbit.com/newsite/reorbitchess`,
        allowed_mentions: discordId ? { users: [discordId] } : { parse: [] }
      })
    })
  } catch (err) {
    console.error('[chess] Discord announce failed:', err)
  }
}

/* ── Clocks ──────────────────────────────────────────────────────────────────────────────
 * The one piece of arithmetic in this file that has to be exactly right.
 *
 * Every clock value is derived from server timestamps. `turnStartedAt` is set when a position
 * is broadcast; the mover's remaining time is decremented by the wall time that elapsed before
 * their move arrived, and the increment is added only if they did not flag.
 *
 * Network latency is charged to the MOVER, which is how every online chess server does it, and
 * is why lib/reorbitChess.js documents an increment as mandatory below a 3-minute base — the
 * increment is the lag compensation. No separate allowance is granted: a per-move allowance is
 * a per-move gift of free time (100ms x 60 moves is a whole minute) and it is trivially farmed
 * by a client that delays every move to just inside it.
 *
 * The clock KEEPS RUNNING while a player is disconnected. Pausing it would make pulling the
 * network cable a free timeout, which is the oldest trick in online chess.
 */
function elapsedMsFor (match) {
  return Math.max(0, Date.now() - match.turnStartedAt)
}

/** Remaining ms for each side right now, without mutating the match. */
function matchClocks (match) {
  return liveClocks({
    clocks: match.clocks,
    turnIdx: match.chess.turn() === 'w' ? 0 : 1,
    turnStartedAt: match.turnStartedAt
  })
}

/**
 * Charges the mover and writes the result back onto the match. Returns false if they flagged.
 *
 * The mover's index is passed in rather than read from chess.turn(): this is called AFTER the
 * move has been applied (so an illegal move is never charged), by which point turn() has
 * already flipped to the opponent, and inferring it here would bill the wrong player.
 */
function chargeMatchClock (match, idx) {
  const { ms, flagged } = chargeClock({
    clockMs: match.clocks[idx],
    turnStartedAt: match.turnStartedAt,
    incrementSeconds: match.config.incrementSeconds
  })
  match.clocks[idx] = ms
  return !flagged
}

/**
 * Arms a single timeout for the side to move. One timer per match, re-armed on every move —
 * never a per-second interval, which at N live games is N Redis round-trips a second for
 * information the client can compute itself from an absolute deadline.
 */
function armFlag (io, match) {
  if (match.flagTimer) { clearTimeout(match.flagTimer); match.flagTimer = null }
  const idx = match.chess.turn() === 'w' ? 0 : 1
  const ms = Math.max(0, match.clocks[idx]) + 250 // small grace for a move already in flight
  match.flagTimer = setTimeout(() => {
    // Never trust the timer alone: recompute from the clock before ending a game on time.
    // A timer that fired late (event loop lag, a long GC pause) must not flag a player who
    // still has time on a freshly-armed clock.
    if (match.ending) return
    const clocks = matchClocks(match)
    const side = match.chess.turn() === 'w' ? 0 : 1
    if (clocks[side] > 0) { armFlag(io, match); return }
    match.clocks[side] = 0
    endMatch(io, match, { winnerIdx: side === 0 ? 1 : 0, endReason: 'flag' })
      .catch(err => console.error('[chess] flag end failed:', err))
  }, ms)
}

/* ── Views ───────────────────────────────────────────────────────────────────────────────
 * Every payload a client receives is built here as a fresh literal, by allowlist.
 *
 * Chess is a perfect-information game, so unlike the RPS runtime there is no hidden state to
 * leak — but the match object holds IPs, visitor ids and the opponent's socket ids, none of
 * which may ever reach a client. Building by allowlist rather than by spreading the match is
 * what guarantees that. */
function publicMatchView (match, uid) {
  const meIdx = match.players.indexOf(uid)
  const oppIdx = meIdx === 0 ? 1 : 0
  const clocks = matchClocks(match)
  return {
    roomId: match.roomId,
    // 0 = white, 1 = black.
    youAreWhite: meIdx === 0,
    you: { username: match.usernames[meIdx], ms: clocks[meIdx] },
    opponent: { username: match.usernames[oppIdx], ms: clocks[oppIdx] },
    fen: match.chess.fen(),
    turn: match.chess.turn(),
    ply: match.ply,
    lastMove: match.lastMove,
    inCheck: match.chess.inCheck(),
    // Absolute epoch ms so a client with a skewed or backgrounded clock still counts down
    // against the same instant the server is enforcing, and a reconnect cannot extend it.
    turnStartedAt: match.turnStartedAt,
    serverNow: Date.now(),
    initialSeconds: match.config.initialSeconds,
    incrementSeconds: match.config.incrementSeconds,
    // Whether a draw offer from the opponent is standing.
    drawOfferFrom: match.drawOffer && match.drawOffer.by !== uid ? 'opponent'
      : match.drawOffer ? 'you' : null,
    history: match.sanHistory
  }
}

function lobbyRoomList () {
  const out = []
  for (const room of rooms.values()) {
    out.push({ id: room.id, owner: room.ownerName, createdAt: room.createdAt })
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50)
}

function emitToPlayers (io, match, event) {
  for (const [i, uid] of match.players.entries()) {
    for (const sid of match.sockets[i]) io.to(sid).emit(event, publicMatchView(match, uid))
  }
}

/* ── Lifecycle ──────────────────────────────────────────────────────────────────────── */

function destroyRoom (io, roomId) {
  const room = rooms.get(roomId)
  if (!room) return
  rooms.delete(roomId)
  if (roomByUser.get(room.ownerId) === roomId) roomByUser.delete(room.ownerId)
  io.to(LOBBY_ROOM).emit('reorbitchess:roomRemoved', { id: roomId })
}

/**
 * The ONLY place a match is removed. Every path that ends a game funnels through here, and
 * each must clear the flag timer: deleting from the Map does not free a match that a live
 * setTimeout still closes over, and that timer would later fire against a match that no
 * longer exists.
 */
function destroyMatch (roomId) {
  const match = matches.get(roomId)
  if (!match) return
  if (match.flagTimer) { clearTimeout(match.flagTimer); match.flagTimer = null }
  for (const t of Object.values(match.graceTimers)) if (t) clearTimeout(t)
  match.graceTimers = {}
  for (const uid of match.players) {
    if (matchByUser.get(uid) === roomId) matchByUser.delete(uid)
  }
  matches.delete(roomId)
}

/* ── Match end + points ─────────────────────────────────────────────────────────────── */

async function endMatch (io, match, { winnerIdx, endReason, whoLeftUserId = null }) {
  if (match.ending) return
  match.ending = true
  if (match.flagTimer) { clearTimeout(match.flagTimer); match.flagTimer = null }

  const winnerUserId = winnerIdx === null ? null : match.players[winnerIdx]
  let awarded = 0
  let suppressReason = null

  try {
    const result = await persistAndAward(match, { winnerUserId, endReason, whoLeftUserId })
    awarded = result.awarded
    suppressReason = result.suppressReason
  } catch (err) {
    console.error('[chess] failed to persist match:', err)
  }

  for (const [i, uid] of match.players.entries()) {
    const won = winnerUserId === uid
    const payload = {
      ...publicMatchView(match, uid),
      over: true,
      won,
      drawn: winnerUserId === null && endReason !== 'sweep',
      endReason,
      pointsAwarded: won ? awarded : 0,
      suppressReason: won ? suppressReason : null
    }
    for (const sid of match.sockets[i]) io.to(sid).emit('reorbitchess:gameEnd', payload)
  }

  destroyMatch(match.roomId)
}

/**
 * Writes the match row and awards the winner in ONE transaction.
 *
 * The row is created here rather than at game start because there is no stake to escrow, so
 * nothing needs a durable record mid-game — and one transaction means we can never end up
 * with points and no match record, or the reverse, after a crash.
 */
async function persistAndAward (match, { winnerUserId, endReason, whoLeftUserId }) {
  const cfg = match.config
  const [p1, p2] = match.players
  const clocks = matchClocks(match)

  const result = winnerUserId === null
    ? '1/2-1/2'
    : (winnerUserId === p1 ? '1-0' : '0-1')

  const row = {
    id: randomUUID(),
    roomId: match.roomId,
    whiteUserId: p1,
    blackUserId: p2,
    result,
    winnerUserId,
    whoLeftUserId,
    endReason,
    plies: match.ply,
    finalFen: match.chess.fen(),
    moves: match.moveLog,
    initialSeconds: cfg.initialSeconds,
    incrementSeconds: cfg.incrementSeconds,
    whiteMsLeft: Math.round(clocks[0]),
    blackMsLeft: Math.round(clocks[1]),
    whiteIp: match.ips[0],
    blackIp: match.ips[1],
    whiteVisitorId: match.visitorIds[0],
    blackVisitorId: match.visitorIds[1],
    sameIp: match.sameIp,
    sameVisitorId: match.sameVisitorId,
    startedAt: new Date(match.startedAt),
    endedAt: new Date()
  }

  // The suppression ladder. Decided outside the transaction where possible so the common
  // "no award" case never opens one.
  let suppressReason = null
  if (endReason === 'sweep') suppressReason = 'abandoned'
  else if (!winnerUserId) suppressReason = 'draw'
  else if (endReason === 'forfeit') suppressReason = 'forfeit'
  // A chess game can be thrown in two moves, which is far faster than any other head-to-head
  // game on the site can be lost. Without a floor, two accounts trade a win every fifteen
  // seconds. The pair limit below bounds the same attack per pair; this bounds it per game.
  else if (match.ply < cfg.minPliesForAward) suppressReason = 'too_short'
  else if (match.sameIp || match.sameVisitorId) suppressReason = 'same_device'
  else if (cfg.pointsPerWin <= 0 || cfg.dailyCap <= 0) suppressReason = 'cap_exhausted'

  if (suppressReason) {
    await db.reOrbitChessMatch.create({ data: { ...row, pointsAwarded: 0, suppressReason } })
    return { awarded: 0, suppressReason }
  }

  const windowStart = getDailyWindowStart()
  let awarded = 0

  await db.$transaction(async (tx) => {
    await tx.reOrbitChessMatch.create({ data: { ...row, pointsAwarded: 0 } })

    // resolveSocketUser caches the authenticated user for the socket's whole life and the
    // session JWT lives 30 days, so a ban landing mid-game is only visible here.
    const winner = await tx.user.findUnique({
      where: { id: winnerUserId },
      select: { banned: true, active: true }
    })
    if (!winner || winner.banned || winner.active === false) {
      suppressReason = 'banned'
      await tx.reOrbitChessMatch.update({ where: { id: row.id }, data: { suppressReason } })
      return
    }

    // Win-trading between two accounts. Rotating alts defeats this, which is what the
    // IP/visitorId columns and the admin log's flagged filter are for.
    if (cfg.pairDailyAwardLimit > 0) {
      const [a, b] = [p1, p2].sort()
      const paidBetweenPair = await tx.reOrbitChessMatch.count({
        where: {
          pointsAwardedAt: { gte: windowStart },
          OR: [
            { whiteUserId: a, blackUserId: b },
            { whiteUserId: b, blackUserId: a }
          ]
        }
      })
      if (paidBetweenPair >= cfg.pairDailyAwardLimit) {
        suppressReason = 'pair_limit'
        await tx.reOrbitChessMatch.update({ where: { id: row.id }, data: { suppressReason } })
        return
      }
    }

    // Claim the award before paying it. Nothing else makes awardCappedGamePoints idempotent —
    // GamePointLog has no unique constraint — so if a flag ever raced a resignation, the
    // winner would be paid twice.
    const claimed = await tx.$executeRaw`
      UPDATE "ReOrbitChessMatch"
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
      await tx.reOrbitChessMatch.update({ where: { id: row.id }, data: { pointsAwarded: awarded } })
    } else {
      suppressReason = 'cap_exhausted'
      await tx.reOrbitChessMatch.update({
        where: { id: row.id },
        data: { pointsAwardedAt: null, awardedUserId: null, suppressReason }
      })
    }
  })

  return { awarded, suppressReason }
}

/* ── Detecting the end of a game ─────────────────────────────────────────────────────────
 * chess.js owns every one of these determinations. Reimplementing "is this a draw by
 * insufficient material" is exactly the kind of subtle rule that would silently pay out on a
 * game that was actually drawn. */
function naturalResult (chess) {
  if (chess.isCheckmate()) {
    // The side to move is the one that has been mated.
    return { winnerIdx: chess.turn() === 'w' ? 1 : 0, endReason: 'checkmate' }
  }
  if (chess.isStalemate()) return { winnerIdx: null, endReason: 'stalemate' }
  if (chess.isInsufficientMaterial()) return { winnerIdx: null, endReason: 'insufficient' }
  if (chess.isThreefoldRepetition()) return { winnerIdx: null, endReason: 'threefold' }
  if (chess.isDraw()) return { winnerIdx: null, endReason: 'fiftymove' }
  return null
}

/* ── Starting a game ────────────────────────────────────────────────────────────────── */

async function collectSignals (userId, socket) {
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
  } catch { /* fingerprinting is best-effort; never block a game on it */ }

  return { ip, visitorId }
}

async function startMatch (io, room, joiner) {
  const config = await loadConfig()

  // Colours are assigned by the server, at random. Letting the room owner pick would hand
  // them white — and therefore the first move — in every game they host.
  const ownerIsWhite = Math.random() < 0.5
  const players = ownerIsWhite ? [room.ownerId, joiner.userId] : [joiner.userId, room.ownerId]
  const usernames = ownerIsWhite
    ? [room.ownerName, joiner.username]
    : [joiner.username, room.ownerName]
  const sockets = ownerIsWhite
    ? [new Set([room.ownerSocket.id]), new Set([joiner.socket.id])]
    : [new Set([joiner.socket.id]), new Set([room.ownerSocket.id])]

  const [sa, sb] = await Promise.all([
    collectSignals(players[0], ownerIsWhite ? room.ownerSocket : joiner.socket),
    collectSignals(players[1], ownerIsWhite ? joiner.socket : room.ownerSocket)
  ])

  const match = {
    roomId: room.id,
    players,
    usernames,
    sockets,
    chess: new Chess(),
    ply: 0,
    sanHistory: [],
    // [san, ms] per ply. Move times are the collusion signal a VPN and a fresh fingerprint
    // cannot launder: scripted win-trading moves with almost no variance.
    moveLog: [],
    clocks: [config.initialSeconds * 1000, config.initialSeconds * 1000],
    turnStartedAt: Date.now(),
    lastMove: null,
    drawOffer: null,
    ips: [sa.ip, sb.ip],
    visitorIds: [sa.visitorId, sb.visitorId],
    sameIp: Boolean(sa.ip && sb.ip && sa.ip === sb.ip),
    sameVisitorId: Boolean(sa.visitorId && sb.visitorId && sa.visitorId === sb.visitorId),
    config,
    ending: false,
    flagTimer: null,
    graceTimers: {},
    startedAt: Date.now(),
    lastActivity: Date.now()
  }

  matches.set(room.id, match)
  for (const uid of players) matchByUser.set(uid, room.id)
  destroyRoom(io, room.id)

  emitToPlayers(io, match, 'reorbitchess:gameStart')
  armFlag(io, match)
}

/* ── Leaving ────────────────────────────────────────────────────────────────────────── */

function handleLeave (io, { roomId, userId, socketId, immediate }) {
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
    }).catch(err => console.error('[chess] forfeit failed:', err))
  }

  if (immediate) { forfeit(); return }

  if (match.graceTimers[idx]) clearTimeout(match.graceTimers[idx])
  match.graceTimers[idx] = setTimeout(() => {
    if (match.sockets[idx].size === 0) forfeit()
  }, match.config.graceSeconds * 1000)

  const opp = idx === 0 ? 1 : 0
  for (const sid of match.sockets[opp]) {
    io.to(sid).emit('reorbitchess:opponentDropped', { graceMs: match.config.graceSeconds * 1000 })
  }
}

/* ── Sweep ──────────────────────────────────────────────────────────────────────────── */

function sweep (io) {
  const now = Date.now()
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_IDLE_MS) destroyRoom(io, roomId)
  }
  for (const [roomId, match] of matches.entries()) {
    if (match.ending) continue
    // Both clocks flagging is the normal bound on a game; this only catches one whose flag
    // timer was somehow orphaned.
    if (now - match.startedAt < MATCH_MAX_AGE_MS) continue
    endMatch(io, match, { winnerIdx: null, endReason: 'sweep' })
      .catch(err => console.error('[chess] sweep end failed:', err))
  }
}

/* ── Handlers ───────────────────────────────────────────────────────────────────────── */

export function registerReOrbitChess (io, socket, resolveSocketUser) {
  // Every handler starts here. No reorbitchess:* payload carries a user id, so there is
  // nothing to forge, and identity is never copied onto the shared socket.data.userId.
  const auth = async () => {
    if (!allowEvent(socket)) return null
    const user = await resolveSocketUser(socket)
    if (!user) {
      socket.emit('reorbitchess:error', { code: 'unauth', message: 'Please sign in to play.' })
      return null
    }
    socket.data.reorbitChessUserId = user.id
    reattach(user.id)
    return user
  }

  /**
   * Re-binds a reconnected socket to the caller's live game.
   *
   * socket.io reconnects with a NEW socket id, so after any network blip the player's seat
   * would point at a dead socket: they would see a frozen board and lose on time without ever
   * knowing the game was still running. Hanging this off the one auth choke point covers every
   * event. Note that the clock is NOT rewound — see the header note on why a disconnect must
   * never buy free time.
   */
  function reattach (userId) {
    const roomId = matchByUser.get(userId)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(userId)
    if (idx === -1) return
    if (match.sockets[idx].has(socket.id)) return

    match.sockets[idx].add(socket.id)
    socket.join(roomId)
    socket.data.reorbitChessRoomId = roomId
    if (match.graceTimers[idx]) {
      clearTimeout(match.graceTimers[idx])
      match.graceTimers[idx] = null
    }
    socket.emit('reorbitchess:gameStart', publicMatchView(match, userId))
    const opp = idx === 0 ? 1 : 0
    for (const sid of match.sockets[opp]) io.to(sid).emit('reorbitchess:opponentReturned')
  }

  socket.on('reorbitchess:subscribe', async () => {
    const user = await auth()
    if (!user) return
    socket.join(LOBBY_ROOM)
    socket.emit('reorbitchess:rooms', lobbyRoomList())
    const cfg = await loadConfig()
    socket.emit('reorbitchess:config', {
      pointsPerWin: cfg.pointsPerWin,
      initialSeconds: cfg.initialSeconds,
      incrementSeconds: cfg.incrementSeconds,
      minPliesForAward: cfg.minPliesForAward
    })
  })

  socket.on('reorbitchess:unsubscribe', () => {
    socket.leave(LOBBY_ROOM)
  })

  socket.on('reorbitchess:listRooms', async () => {
    const user = await auth()
    if (!user) return
    // Served from memory — never a db.user.findMany per call, which would be an
    // authenticated DB amplification primitive.
    socket.emit('reorbitchess:rooms', lobbyRoomList())
  })

  socket.on('reorbitchess:createRoom', async () => {
    const user = await auth()
    if (!user) return
    if (matchByUser.has(user.id)) {
      return socket.emit('reorbitchess:error', { code: 'inMatch', message: 'You are already in a game.' })
    }
    const existing = roomByUser.get(user.id)
    if (existing && rooms.has(existing)) {
      return socket.emit('reorbitchess:error', { code: 'roomOpen', message: 'You already have a room open.' })
    }

    // Server-generated, never client-supplied: a client-chosen id lets a caller overwrite
    // someone else's lobby entry and join socket.io rooms belonging to other features.
    const roomId = `chess:${randomUUID()}`
    const room = {
      id: roomId,
      ownerId: user.id,
      ownerName: user.username,
      ownerSocket: socket,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }
    rooms.set(roomId, room)
    roomByUser.set(user.id, roomId)
    socket.join(roomId)
    socket.data.reorbitChessRoomId = roomId

    socket.emit('reorbitchess:roomCreated', { id: roomId })
    io.to(LOBBY_ROOM).emit('reorbitchess:roomAdded', { id: roomId, owner: user.username, createdAt: room.createdAt })

    db.user.findUnique({ where: { id: user.id }, select: { discordId: true } })
      .then(u => announceRoom(user.username, u?.discordId))
      .catch(() => {})
  })

  socket.on('reorbitchess:joinRoom', async ({ roomId } = {}) => {
    const user = await auth()
    if (!user) return
    if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) {
      return socket.emit('reorbitchess:error', { code: 'badRoom', message: 'That room is no longer available.' })
    }
    if (matchByUser.has(user.id)) {
      return socket.emit('reorbitchess:error', { code: 'inMatch', message: 'You are already in a game.' })
    }
    const room = rooms.get(roomId)
    if (!room) {
      return socket.emit('reorbitchess:error', { code: 'gone', message: 'That room is no longer available.' })
    }
    if (room.ownerId === user.id) {
      return socket.emit('reorbitchess:error', { code: 'ownRoom', message: "That's your own room." })
    }

    // Claim the room before any await, so two joiners racing cannot both start a game.
    rooms.delete(roomId)
    roomByUser.delete(room.ownerId)
    io.to(LOBBY_ROOM).emit('reorbitchess:roomRemoved', { id: roomId })

    socket.join(roomId)
    socket.data.reorbitChessRoomId = roomId

    try {
      await startMatch(io, room, { userId: user.id, username: user.username, socket })
    } catch (err) {
      console.error('[chess] failed to start game:', err)
      socket.emit('reorbitchess:error', { code: 'startFailed', message: 'Could not start the game.' })
    }
  })

  socket.on('reorbitchess:move', async ({ ply, from, to, promotion } = {}) => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return

    const idx = match.players.indexOf(user.id)
    if (idx === -1) return

    // Strict validation at the boundary before anything reaches chess.js. chess.js is
    // defensive, but a malformed payload should be rejected rather than explored — and
    // `promotion` in particular is a string that would otherwise be handed straight to it.
    if (!isSquare(from) || !isSquare(to)) return
    if (promotion != null && !isPromotionPiece(promotion)) return

    // It has to be this player's turn. Without this check a player could move their
    // opponent's pieces, because chess.js only knows whose turn it is, not who is asking.
    const sideToMove = match.chess.turn() === 'w' ? 0 : 1
    if (sideToMove !== idx) return

    // Rejecting a stale ply is what stops a client pre-submitting a whole game in one burst,
    // and what makes a duplicated event (a retried emit on a flaky connection) a no-op rather
    // than a second move.
    if (Number(ply) !== match.ply) return

    // Legality is decided BEFORE the clock is touched, and this order is not cosmetic.
    //
    // Charging first means an ILLEGAL move also collects the increment: each rejected move
    // would add `incrementSeconds` to the sender's clock while leaving turnStartedAt where it
    // was, so a client spamming nonsense moves gains time without end. The per-socket rate
    // limit bounds the rate, not the exploit — 40 rejected moves per 10s at a 3s increment is
    // still two free minutes. So: apply, and only charge a move that actually happened.
    const spent = elapsedMsFor(match)
    let applied = null
    try {
      applied = match.chess.move({ from, to, promotion: promotion || undefined })
    } catch {
      applied = null
    }
    if (!applied) {
      // An illegal move costs nothing at all. Resync the client, which is far more likely to
      // be out of step with the server than cheating.
      socket.emit('reorbitchess:sync', publicMatchView(match, user.id))
      return
    }

    // Now charge for the time the move took. If it was already gone, the move is taken back:
    // a player who has flagged cannot also have moved.
    if (!chargeMatchClock(match, idx)) {
      match.chess.undo()
      match.clocks[idx] = 0
      await endMatch(io, match, { winnerIdx: idx === 0 ? 1 : 0, endReason: 'flag' })
      return
    }

    match.ply++
    match.lastMove = { from: applied.from, to: applied.to }
    match.sanHistory.push(applied.san)
    match.moveLog.push([applied.san, Math.round(spent)])
    match.turnStartedAt = Date.now()
    match.lastActivity = Date.now()
    // A draw offer stands only until the offerer moves, as in over-the-board chess.
    if (match.drawOffer && match.drawOffer.by === user.id) match.drawOffer = null

    const natural = naturalResult(match.chess)
    if (natural) {
      emitToPlayers(io, match, 'reorbitchess:position')
      await endMatch(io, match, natural)
      return
    }

    armFlag(io, match)
    emitToPlayers(io, match, 'reorbitchess:position')
  })

  socket.on('reorbitchess:resign', async () => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return
    await endMatch(io, match, { winnerIdx: idx === 0 ? 1 : 0, endReason: 'resign' })
  })

  socket.on('reorbitchess:offerDraw', async () => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return

    // An offer already standing from this player is a no-op rather than a second notification:
    // otherwise "offer draw" is a button that spams the opponent's screen mid-game.
    if (match.drawOffer && match.drawOffer.by === user.id) return
    if (match.drawOffer && match.drawOffer.by !== user.id) {
      // Offering into a standing offer is an acceptance.
      await endMatch(io, match, { winnerIdx: null, endReason: 'agreement' })
      return
    }
    match.drawOffer = { by: user.id, at: Date.now() }
    const opp = idx === 0 ? 1 : 0
    for (const sid of match.sockets[opp]) io.to(sid).emit('reorbitchess:drawOffered')
  })

  socket.on('reorbitchess:respondDraw', async ({ accept } = {}) => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    const idx = match.players.indexOf(user.id)
    if (idx === -1) return
    const offer = match.drawOffer
    // Only the player who did NOT make the offer can answer it, and only while it stands.
    if (!offer || offer.by === user.id) return
    if (Date.now() - offer.at > DRAW_OFFER_TTL_MS) { match.drawOffer = null; return }

    match.drawOffer = null
    if (accept) {
      await endMatch(io, match, { winnerIdx: null, endReason: 'agreement' })
    } else {
      for (const sid of match.sockets[idx === 0 ? 1 : 0]) {
        io.to(sid).emit('reorbitchess:drawDeclined')
      }
    }
  })

  // A client that has lost track (backgrounded tab, restored connection) asks for the truth
  // rather than guessing. Cheap: it is served entirely from memory.
  socket.on('reorbitchess:sync', async () => {
    const user = await auth()
    if (!user) return
    const roomId = matchByUser.get(user.id)
    if (!roomId) return
    const match = matches.get(roomId)
    if (!match || match.ending) return
    socket.emit('reorbitchess:sync', publicMatchView(match, user.id))
  })

  socket.on('reorbitchess:leave', async () => {
    const user = await auth()
    if (!user) return
    const roomId = socket.data.reorbitChessRoomId || matchByUser.get(user.id) || roomByUser.get(user.id)
    if (!roomId) return
    socket.leave(roomId)
    socket.data.reorbitChessRoomId = null
    handleLeave(io, { roomId, userId: user.id, socketId: socket.id, immediate: true })
  })

  // Namespaced so it can run alongside socket-server's own `disconnecting` handler without
  // entangling with Clash's socket.data.roomId.
  socket.on('disconnecting', () => {
    const userId = socket.data.reorbitChessUserId
    const roomId = socket.data.reorbitChessRoomId
    if (!userId || !roomId) return
    handleLeave(io, { roomId, userId, socketId: socket.id, immediate: false })
  })
}

let sweepTimer = null

export function startReOrbitChessSweep (io) {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    try { sweep(io) } catch (err) { console.error('[chess] sweep failed:', err) }
  }, 60_000)
  sweepTimer.unref?.()
}

// Exposed for tests. Deliberately NOT named `__testing`: Nuxt auto-imports everything under
// server/utils, so a second export of that name silently shadows the RPS runtime's in the
// auto-import registry and the build warns about it.
export const __chessTesting = { rooms, matches, publicMatchView, matchClocks, naturalResult }
