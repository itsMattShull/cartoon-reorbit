// server/utils/edRpsAiMatch.js
//
// "Play the Eds" — a server-authoritative single-player match against a bot opponent, paid from
// the same combat pool as PvP Ed, Edd n Eddy RPS. Replaces the old client-only CPU mode, which
// never reached the server at all and could never pay points by construction.
//
// ── Why this is not a branch inside server/utils/duelRuntime.js ───────────────────────────────
// That factory is shared with Pokemon Battle, and its rooms/lobby/reconnect-grace/pair-limit
// machinery all assume two real players on two real sockets. Threading an "opponentIsAi" branch
// through persistAndAward, armRound and the room/join handlers would put bot-match logic inside
// the one file both games trust for PvP, for a feature only this game wants — the opposite of
// why that file is a shared factory in the first place (see its own header comment). This module
// reuses what's genuinely game logic rather than match lifecycle — lib/edRps.js's rules, and
// gamePoints.js's award primitive directly, the same way server/api/tko/event.post.js and
// gToons Clash's PvE path already call it without going through duelRuntime.
//
// A bot match also never touches duelRuntime's `rooms`/`matches` maps or its createRoom/joinRoom
// handlers at all — every event here is namespaced edrps:ai:* on its own in-memory state. A
// "vsBot" flag bolted onto the shared room-join flow was considered and rejected: joinRoom has
// no notion of an AI seat, so a second real socket could attach to what was supposed to be a bot
// match and inherit whichever checks assume "no second device exists for an AI match" — turning
// this feature into a same-device PvP-farming path with none of PvP's anti-collusion protections.
// Keeping this entirely separate from joinRoom removes that path structurally rather than by
// convention.
//
// ── Anti-abuse, since an AI opponent removes the one throttle PvP always had for free ─────────
// A human opponent has to show up, so PvP farming needs a second real, differently-fingerprinted
// account. A bot always says yes, so nothing here stops one account grinding it all day — that's
// bounded by the daily combat-pool cap alone. What the cap does NOT bound is a *cluster* of
// alt accounts sharing one device each hitting that cap once: PvP's same-device check suppresses
// exactly that when the two colluding accounts play each other, but there's no "other player" in
// an AI match to compare against. Instead, persistAndAwardAiMatch sums points already paid to AI
// matches from the same IP or device fingerprint within the daily window and clamps THIS award to
// whatever headroom remains under one player's normal cap — so a five-alt cluster earns what one
// honest player would, not five times that. See clusterPointsUsed() below and the two partial
// indexes the migration adds for it.
import { randomInt, randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { encryptIp } from './ip-encrypt.js'
import { getDailyWindowStart } from './centralTime.js'
import { awardCappedGamePoints, COMBAT_POOL_GAME_NAMES } from './gamePoints.js'
import { hasLiveEdRpsMatch } from './edRpsRuntime.js'
// `#lib/...` (package.json "imports", not a relative path) — same Nitro
// dev-bundler relative-depth bug as server/utils/asteroidEngine.js's import
// of lib/asteroidSim.js; see the comment there for the full explanation.
import { compareHands, isHand, isCharacterId, clampConfig, characterById, CHARACTER_IDS, ROUND_BREAK_MS } from '#lib/edRps.js'

const EV = (name) => `edrps:ai:${name}`
const NS = { userId: 'edRpsAiUserId' }

// Bot reply pacing. An instant reply is the one thing a bot can do that a human opponent never
// can — this game already tracks per-round response time as a bot/collusion signal for PvP, so
// an AI opponent that always resolves in ~0ms with zero variance would be the textbook version of
// what that signal exists to catch. The delay is cosmetic (the bot's hand is already chosen by
// the time it's scheduled — see scheduleBotReply), not a security boundary.
const BOT_REPLY_MIN_MS = 400
const BOT_REPLY_JITTER_MS = 700

// Belt-and-suspenders only. Every match state here always has exactly one live timer driving it
// forward (the round deadline, or the scheduled bot reply) regardless of whether the human is
// still connected, so a match reaches endMatch on its own within a couple of minutes even if the
// player walks away — unlike PvP, nothing here can stall waiting on a second socket. This sweep
// exists only to reap a match that a future bug left stuck with no live timer.
const SAFETY_SWEEP_MS = 60_000
const SAFETY_MAX_AGE_MS = 20 * 60 * 1000

// A short cooldown between finishing one AI match and starting the next, independent of the
// per-socket event bucket below (which resets on every reconnect and was never a match-creation
// throttle). The one-live-match-per-user check is the main brake; this just stops a script from
// immediately re-queuing the instant a match ends.
const START_COOLDOWN_MS = 2_000

const BUCKET_CAPACITY = 24
const BUCKET_REFILL_MS = 10_000

const matches = new Map()       // userId -> match
const cooldownUntil = new Map() // userId -> ms epoch

let configCache = null
let configCachedAt = 0
const CONFIG_TTL_MS = 60_000

async function loadConfig() {
  const now = Date.now()
  if (configCache && now - configCachedAt < CONFIG_TTL_MS) return configCache
  const [game, global] = await Promise.all([
    db.gameConfig.findUnique({
      where: { gameName: 'EdRps' },
      select: { pointsPerWin: true, edRpsRoundSeconds: true, edRpsWinsNeeded: true, edRpsMaxRounds: true }
    }).catch(() => null),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { tkoDailyPointLimit: true } }).catch(() => null)
  ])
  const clamped = clampConfig({
    roundSeconds: game?.edRpsRoundSeconds,
    winsNeeded: game?.edRpsWinsNeeded,
    maxRounds: game?.edRpsMaxRounds
  })
  configCache = {
    pointsPerWin: Math.max(0, Number(game?.pointsPerWin ?? 0)),
    dailyCap: Math.max(0, Number(global?.tkoDailyPointLimit ?? 250)),
    roundSeconds: clamped.roundSeconds,
    winsNeeded: clamped.winsNeeded,
    maxRounds: clamped.maxRounds
  }
  configCachedAt = now
  return configCache
}

function allowEvent(socket) {
  const now = Date.now()
  const key = 'edRpsAiBucket'
  const b = socket.data[key] || (socket.data[key] = { tokens: BUCKET_CAPACITY, at: now })
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.at) / BUCKET_REFILL_MS) * BUCKET_CAPACITY)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

async function collectHumanSignals(userId, socket) {
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

function publicView(match) {
  const r = match.round
  return {
    matchId: match.id,
    you: { userId: match.userId, username: match.username, character: match.character, score: match.score },
    opponent: { username: match.botName, character: match.botCharacter, score: match.botScore },
    winsNeeded: match.config.winsNeeded,
    maxRounds: match.config.maxRounds,
    round: r ? r.number : match.currentRound,
    deadlineAt: r ? r.deadlineAt : null,
    youThrew: r ? r.humanHand !== null : false,
    // True as soon as the bot's reply is scheduled — see the header note on BOT_REPLY_*: the
    // bot has already "decided", the delay before edrps:ai:reveal is purely cosmetic pacing.
    opponentThrew: r ? r.botCommitted : false,
    history: match.history.map(h => ({
      n: h.n,
      you: h.p1,
      opponent: h.p2,
      result: h.w === 0 ? 'tie' : (h.w === 1 ? 'win' : 'loss')
    }))
  }
}

function emitToMatch(io, match, event, payload) {
  for (const sid of match.sockets) io.local.to(sid).emit(event, payload)
}

function clearMatchTimer(match) {
  if (match.timer) { clearTimeout(match.timer); match.timer = null }
}
function clearBotTimer(match) {
  if (match.round?.botTimer) { clearTimeout(match.round.botTimer); match.round.botTimer = null }
}

function destroyMatch(userId) {
  const match = matches.get(userId)
  if (!match) return
  clearMatchTimer(match)
  clearBotTimer(match)
  matches.delete(userId)
}

function newRound(n) {
  return {
    number: n,
    humanHand: null,
    humanAuto: false,
    humanReceivedAt: null,
    botHand: null,
    botCommitted: false,
    startedAt: 0,
    deadlineAt: 0,
    resolving: false,
    resolved: false,
    botTimer: null
  }
}

function armRound(io, match) {
  const r = match.round
  r.deadlineAt = Date.now() + match.config.roundSeconds * 1000
  r.startedAt = Date.now()
  clearMatchTimer(match)
  match.timer = setTimeout(() => {
    const round = match.round
    if (!round || round.number !== r.number) return
    if (round.humanHand === null) {
      round.humanHand = randomInt(3)
      round.humanAuto = true
      round.humanReceivedAt = Date.now()
    }
    resolveRound(io, match, r.number)
  }, match.config.roundSeconds * 1000 + 250)

  emitToMatch(io, match, EV('round'), publicView(match))
}

function scheduleBotReply(io, match) {
  const r = match.round
  clearMatchTimer(match) // the human already threw; the timeout auto-fill no longer applies
  r.botCommitted = true
  emitToMatch(io, match, EV('opponentThrew'), { round: r.number })
  const delay = BOT_REPLY_MIN_MS + randomInt(BOT_REPLY_JITTER_MS)
  r.botTimer = setTimeout(() => resolveRound(io, match, r.number), delay)
}

/**
 * Resolves one round. Single-shot: both the throw-then-delayed-bot-reply path and the round-
 * timeout path funnel through here, and `resolving` is set synchronously before anything else —
 * including before the bot's hand is drawn — so the two paths can never interleave or double-pay
 * a round. This mirrors duelRuntime.js's resolveRound for the same reason.
 */
function resolveRound(io, match, roundNumber) {
  const r = match.round
  if (!r || r.number !== roundNumber || r.resolving || r.resolved) return
  if (match.ending) return
  if (r.humanHand === null) return

  r.resolving = true
  clearMatchTimer(match)
  clearBotTimer(match)

  const botHand = randomInt(3)
  r.botHand = botHand
  const cmp = compareHands(r.humanHand, botHand)
  const w = cmp === 0 ? 0 : (cmp > 0 ? 1 : 2)
  if (w === 1) match.score++
  else if (w === 2) match.botScore++

  // Field names (p1/p2/p1Auto/p1Ms) match duelRuntime.js's PvP history shape on purpose, not
  // human/bot: server/utils/duelMatchLog.js's admin log — shared with PvP EdRps and Pokemon
  // Battle — computes medianResponseMs and autoThrows straight off p1Ms/p1Auto/p2Auto. p2Ms is
  // left out entirely rather than logging the bot's artificial reply delay under it: that delay
  // is cosmetic pacing (see BOT_REPLY_* above), not a response time, and mixing it into the same
  // median as the human's real p1Ms would make the one signal that view exists for meaningless.
  match.history.push({
    n: r.number,
    p1: r.humanHand,
    p2: botHand,
    p1Auto: r.humanAuto,
    p2Auto: false,
    p1Ms: r.humanReceivedAt ? r.humanReceivedAt - r.startedAt : null,
    w
  })
  r.resolved = true
  match.lastActivity = Date.now()

  const breakMs = ROUND_BREAK_MS
  const nextRoundAt = Date.now() + breakMs
  const last = match.history[match.history.length - 1]
  emitToMatch(io, match, EV('reveal'), {
    ...publicView(match),
    nextRoundAt,
    reveal: {
      n: last.n,
      you: last.p1,
      opponent: last.p2,
      youAuto: last.p1Auto,
      opponentAuto: false,
      result: last.w === 0 ? 'tie' : (last.w === 1 ? 'win' : 'loss')
    }
  })

  const winsNeeded = match.config.winsNeeded
  const decided = match.score >= winsNeeded || match.botScore >= winsNeeded
  const exhausted = match.history.length >= match.config.maxRounds && match.score !== match.botScore

  if (decided || exhausted) {
    endMatch(io, match, { endReason: 'natural', humanWon: match.score > match.botScore })
      .catch(err => console.error('[edrps:ai] failed to end match:', err))
    return
  }

  match.timer = setTimeout(() => {
    if (match.ending) return
    match.currentRound = r.number + 1
    match.round = newRound(match.currentRound)
    armRound(io, match)
  }, breakMs)
}

/**
 * Sums points already paid to AI matches sharing this IP or device fingerprint, in the current
 * daily window. Runs inside the award transaction, against the two partial indexes the migration
 * adds — see the module header for why this exists instead of a same-device suppression.
 */
async function clusterPointsUsed(tx, { ip, visitorId, windowStart }) {
  const conds = []
  const params = [windowStart]
  if (ip) { params.push(ip); conds.push(`"player1Ip" = $${params.length}`) }
  if (visitorId) { params.push(visitorId); conds.push(`"player1VisitorId" = $${params.length}`) }
  if (!conds.length) return 0
  const sql = `
    SELECT COALESCE(SUM("pointsAwarded"), 0)::int AS used
      FROM "EdRpsMatch"
     WHERE "player2IsAi" = true
       AND "pointsAwardedAt" >= $1
       AND (${conds.join(' OR ')})`
  const rows = await tx.$queryRawUnsafe(sql, ...params)
  return Number(rows?.[0]?.used || 0)
}

/**
 * Writes the match row and, if the human won naturally, awards them — in one transaction, same
 * shape as duelRuntime.js's persistAndAward. A loss, forfeit, or bot win is never a "won but
 * suppressed" case (there was no win to suppress), so those persist with suppressReason left
 * null; only a natural human win can end up with a non-null suppressReason.
 */
async function persistAndAwardAiMatch(match, { endReason, humanWon }) {
  const cfg = match.config
  const row = {
    id: randomUUID(),
    roomId: match.id,
    player1UserId: match.userId,
    player2UserId: null,
    player2IsAi: true,
    player1Character: match.character,
    player2Character: match.botCharacter,
    player1Score: match.score,
    player2Score: match.botScore,
    winnerUserId: humanWon ? match.userId : null,
    winnerIsAi: endReason === 'natural' && !humanWon,
    whoLeftUserId: null,
    endReason,
    rounds: match.history,
    player1Ip: match.ip,
    player2Ip: null,
    player1VisitorId: match.visitorId,
    player2VisitorId: null,
    sameIp: false,
    sameVisitorId: false,
    startedAt: new Date(match.startedAt),
    endedAt: new Date()
  }

  if (!humanWon) {
    await db.edRpsMatch.create({ data: { ...row, pointsAwarded: 0 } })
    return { awarded: 0, suppressReason: null }
  }

  if (cfg.pointsPerWin <= 0 || cfg.dailyCap <= 0) {
    await db.edRpsMatch.create({ data: { ...row, pointsAwarded: 0, suppressReason: 'cap_exhausted' } })
    return { awarded: 0, suppressReason: 'cap_exhausted' }
  }

  const windowStart = getDailyWindowStart()
  let awarded = 0
  let suppressReason = null

  await db.$transaction(async (tx) => {
    await tx.edRpsMatch.create({ data: { ...row, pointsAwarded: 0 } })

    const winner = await tx.user.findUnique({
      where: { id: match.userId },
      select: { banned: true, active: true }
    })
    if (!winner || winner.banned || winner.active === false) {
      suppressReason = 'banned'
      await tx.edRpsMatch.update({ where: { id: row.id }, data: { suppressReason } })
      return
    }

    let effectivePointsPerWin = cfg.pointsPerWin
    if (match.ip || match.visitorId) {
      const clusterUsed = await clusterPointsUsed(tx, { ip: match.ip, visitorId: match.visitorId, windowStart })
      const clusterRemaining = Math.max(0, cfg.dailyCap - clusterUsed)
      effectivePointsPerWin = Math.min(effectivePointsPerWin, clusterRemaining)
    }

    // Compare-and-set claim, same idempotency guard duelRuntime.js uses: GamePointLog has no
    // unique constraint, so this is what stops a race paying the same match twice.
    const claim = await tx.edRpsMatch.updateMany({
      where: { id: row.id, pointsAwardedAt: null },
      data: { pointsAwardedAt: new Date(), awardedUserId: match.userId }
    })
    if (claim.count !== 1) return

    awarded = await awardCappedGamePoints(tx, {
      userId: match.userId,
      gameName: 'EdRps',
      poolGameNames: COMBAT_POOL_GAME_NAMES,
      pointsPerWin: effectivePointsPerWin,
      cap: cfg.dailyCap,
      method: 'Game - Ed, Edd n Eddy RPS (AI)'
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

async function endMatch(io, match, { endReason, humanWon }) {
  if (match.ending) return
  match.ending = true
  clearMatchTimer(match)
  clearBotTimer(match)

  let awarded = 0
  let suppressReason = null
  try {
    const result = await persistAndAwardAiMatch(match, { endReason, humanWon })
    awarded = result.awarded
    suppressReason = result.suppressReason
  } catch (err) {
    console.error('[edrps:ai] failed to persist match:', err)
  }

  cooldownUntil.set(match.userId, Date.now() + START_COOLDOWN_MS)

  emitToMatch(io, match, EV('matchEnd'), {
    ...publicView(match),
    over: true,
    won: !!humanWon,
    endReason,
    pointsAwarded: humanWon ? awarded : 0,
    suppressReason: humanWon ? suppressReason : null
  })

  destroyMatch(match.userId)
}

function safetySweep() {
  const now = Date.now()
  for (const [userId, match] of matches.entries()) {
    // A reservation placeholder (see the start() handler) has no startedAt yet — it only ever
    // lives for the few synchronous+microtask steps before the real match replaces it or the
    // start attempt's catch block deletes it, never long enough for this to matter, but
    // `now - undefined` is NaN and NaN < SAFETY_MAX_AGE_MS is false, which would otherwise reap
    // it immediately.
    if (match.reserving || match.ending) continue
    if (now - match.startedAt < SAFETY_MAX_AGE_MS) continue
    console.error('[edrps:ai] safety sweep reaped a stuck match — this should not happen', { userId })
    destroyMatch(userId)
  }
}

let sweepTimer = null
export function startEdRpsAiSweep() {
  if (sweepTimer) return
  sweepTimer = setInterval(safetySweep, SAFETY_SWEEP_MS)
  sweepTimer.unref?.()
}

export function registerEdRpsAi(io, socket, resolveSocketUser) {
  const auth = async () => {
    if (!allowEvent(socket)) return null
    const user = await resolveSocketUser(socket)
    if (!user) {
      socket.emit(EV('error'), { code: 'unauth', message: 'Please sign in to play.' })
      return null
    }
    socket.data[NS.userId] = user.id
    const match = matches.get(user.id)
    // `reserving` is a placeholder start() puts in the map before it has awaited anything else
    // (see below) — it holds the slot, not a resumable match, so it has no round/config to build
    // a view from yet.
    if (match && !match.reserving && !match.ending && !match.sockets.has(socket.id)) {
      match.sockets.add(socket.id)
      socket.emit(EV('matchStart'), publicView(match))
    }
    return user
  }

  socket.on(EV('subscribe'), async () => { await auth() })

  socket.on(EV('start'), async ({ character } = {}) => {
    const user = await auth()
    if (!user) return
    if (!isCharacterId(character)) {
      return socket.emit(EV('error'), { code: 'badCharacter', message: 'Pick a character first.' })
    }
    if (matches.has(user.id)) {
      return socket.emit(EV('error'), { code: 'inMatch', message: 'You are already in a match.' })
    }
    if (hasLiveEdRpsMatch(user.id)) {
      return socket.emit(EV('error'), { code: 'inMatch', message: 'Finish your head-to-head match first.' })
    }
    const until = cooldownUntil.get(user.id) || 0
    if (Date.now() < until) {
      return socket.emit(EV('error'), { code: 'cooldown', message: 'Give it a second before the next match.' })
    }

    // Reserved synchronously — before the first await below — so a second edrps:ai:start for
    // this same user (a double-tap, two tabs, a script) sees matches.has(user.id) as true and
    // bails at the check above instead of racing to build a second, independently payable match.
    // Everything between here and the real match object landing in the map is a single
    // uninterrupted synchronous stretch: no await sits between the `matches.has` check above and
    // this line.
    matches.set(user.id, { reserving: true, ending: false, sockets: new Set() })

    try {
      const config = await loadConfig()
      const opponents = CHARACTER_IDS.filter(id => id !== character)
      const botCharacter = opponents[randomInt(opponents.length)]
      const { ip, visitorId } = await collectHumanSignals(user.id, socket)

      const match = {
        id: randomUUID(),
        userId: user.id,
        username: user.username,
        character,
        botCharacter,
        botName: characterById(botCharacter).name,
        sockets: new Set([socket.id]),
        score: 0,
        botScore: 0,
        config,
        currentRound: 1,
        round: newRound(1),
        history: [],
        ip,
        visitorId,
        ending: false,
        timer: null,
        startedAt: Date.now(),
        lastActivity: Date.now()
      }

      matches.set(user.id, match)
      socket.emit(EV('matchStart'), publicView(match))
      armRound(io, match)
    } catch (err) {
      matches.delete(user.id)
      console.error('[edrps:ai] failed to start match:', err)
      socket.emit(EV('error'), { code: 'startFailed', message: 'Could not start the match.' })
    }
  })

  socket.on(EV('throw'), async ({ round, hand } = {}) => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    if (!isHand(hand)) return

    const r = match.round
    if (!r) return
    if (Number(round) !== r.number) return
    if (r.resolving || r.resolved) return
    if (r.humanHand !== null) return
    if (Date.now() > r.deadlineAt + 250) return

    r.humanHand = hand
    r.humanReceivedAt = Date.now()
    match.lastActivity = Date.now()
    match.sockets.add(socket.id)

    socket.emit(EV('throwAccepted'), { round: r.number })
    scheduleBotReply(io, match)
  })

  socket.on(EV('leave'), async () => {
    const user = await auth()
    if (!user) return
    const match = matches.get(user.id)
    if (!match || match.ending) return
    endMatch(io, match, { endReason: 'forfeit', humanWon: false })
      .catch(err => console.error('[edrps:ai] leave failed:', err))
  })

  // Namespaced so it never collides with duelRuntime's own edRpsUserId / edRpsRoomId keys, or
  // Clash's shared socket.data.userId.
  socket.on('disconnecting', () => {
    const userId = socket.data[NS.userId]
    if (!userId) return
    const match = matches.get(userId)
    if (!match) return
    // Deliberately not a forfeit: there is no second human whose time this wastes, so unlike PvP
    // a dropped connection just leaves the match's own timers to keep driving it forward (or, if
    // the player never returns, to run it to a natural close on auto-throws alone). See the
    // module header on why no reconnect-grace timer is needed here at all.
    match.sockets.delete(socket.id)
  })
}
