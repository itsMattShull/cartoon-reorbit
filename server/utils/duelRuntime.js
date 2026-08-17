// Authoritative PvP runtime for the site's first-to-N simultaneous-reveal duel games.
//
// This is a factory: createDuelRuntime(spec) returns { register, startSweep } for ONE game,
// with its own rooms, matches and config cache. Two games use it today --
// server/utils/edRpsRuntime.js (Ed, Edd n Eddy Rock Paper Scissors) and
// server/utils/pokemonBattleRuntime.js (Pokemon: Fire, Water, Grass!) -- and each is a short
// spec object rather than a copy of this file.
//
// ── Why a factory and not a second copy ───────────────────────────────────────────────────
// Everything below is theme-independent: identity, room lifecycle, round arming and
// resolution, reconnect grace, the sweep, and the award path. The only rock-paper-scissors
// left in it is `spec.compare`. Copying it for a second game would duplicate SEVEN references
// to the match table -- six Prisma delegates and one raw-SQL table name -- and every one of
// them fails SILENTLY when a copy misses it:
//
//   * miss the raw UPDATE's table name and the claim matches zero rows, so the winner is
//     never paid and nothing is logged;
//   * miss the pair-limit count and one game's win-trading cap is computed from the other
//     game's history;
//   * miss an .update and suppressReason is stamped onto a row that does not exist.
//
// None of those surface as an error anyone can act on. They surface as "why am I not getting
// points". persistAndAward is also precisely the code that gets patched when a farm is
// discovered, so two copies guarantees a window where only one is fixed -- opening at the
// moment a new game invites new abuse.
//
// ── Why this does not look like the gToons Clash room code ────────────────────────────────
// Clash is the other PvP game and the obvious thing to copy, but three of its choices are
// wrong for a match that lasts under a minute:
//
//   * Clash trusts a client-supplied `userId` on its socket payloads. Every handler here
//     resolves identity from the session cookie instead, and no payload carries a user id at
//     all. Identity is namespaced onto socket.data[spec.dataNs + 'UserId'] rather than the
//     shared socket.data.userId, which Clash's `disconnecting` handler consumes -- so two duel
//     games on one socket cannot cross-wire each other's disconnect cleanup.
//   * Clash lets the client choose the room id and `Map.set`s it unconditionally. Room ids
//     here are server-generated UUIDs, validated against an anchored regex before they ever
//     reach socket.join().
//   * Clash runs a 1-second setInterval per match that calls fetchSockets() — a Redis
//     round-trip per tick, per match — to stream a countdown. A round here arms a single
//     setTimeout and ships an absolute deadline the client counts down against itself.
//
// Emits go through io.local: socket-server.js installs the Redis adapter, so a plain io.to()
// PUBLISHes every payload to Redis and reads it straight back to discard it -- roughly 48
// wasted round-trips per best-of-7 match. State here is single-process by design (below), so
// the local path is not merely an optimisation, it is the correct one.
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

/**
 * @param {object} spec
 *   key            wire prefix: events, room ids, lobby room, redis keys  (e.g. 'edrps')
 *   dataNs         socket.data namespace                                  (e.g. 'edRps')
 *   gameName       GameConfig.gameName / GamePointLog.gameName            (e.g. 'EdRps')
 *   pointsMethod   PointsLog.method
 *   matchDelegate  Prisma delegate NAME on the client (e.g. 'edRpsMatch')
 *   matchTable     the same table's SQL name (e.g. 'EdRpsMatch') for the one raw claim
 *   pairScopeTables  every duel match TABLE sharing ONE per-pair daily award budget. Must
 *                  include this game's own table. Per-game budgets would let one colluding
 *                  pair trade its quota once per game. SQL names, not delegates -- see
 *                  server/utils/duelPairScope.js for why.
 *   configSelect   { column: true } for this game's tuning columns
 *   readConfig     (row) => raw config object for clampConfig
 *   clampConfig    (raw) => { roundSeconds, winsNeeded, maxRounds, pairDailyAwardLimit }
 *   choiceCount    how many moves (3)
 *   compare        (a, b) => 1 | 0 | -1
 *   isChoice       (v) => boolean
 *   isAvatarId     async (v) => boolean   -- may hit a cached DB roster
 *   breakMs        (cmp) => ms to pause after a round with this result
 *   isEnabled      optional async () => boolean. False takes the game offline: no new rooms
 *                  and no joins, so nothing can be played for points while it is off. Live
 *                  matches are left alone -- yanking a match out from under two players who
 *                  are mid-round would be a worse outcome than letting it finish.
 *   announce       { emoji, label, url }
 */
export function createDuelRuntime(spec) {
  assertSpec(spec)

  const GAME_NAME = spec.gameName
    const POINTS_METHOD = spec.pointsMethod
    const LOBBY_ROOM = `${spec.key}-lobby`

    // Event names, socket.data keys and the Prisma delegate all derive from the spec, so a game
    // cannot half-rename itself. EV() is the single place an event string is built.
    const EV = (name) => `${spec.key}:${name}`
    const NS = {
      bucket: `${spec.dataNs}Bucket`,
      userId: `${spec.dataNs}UserId`,
      roomId: `${spec.dataNs}RoomId`
    }
    // The match table is reached ONLY through here. Seven call sites used to name the delegate
    // literally; every one of them failed silently if a copy missed it -- a wrong delegate pays
    // the wrong game's pair limit, and a wrong raw-SQL table name claims zero rows so the winner
    // is simply never paid, with no error anywhere.
    const MATCH = (tx) => (tx || db)[spec.matchDelegate]

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

  // Anchored, with the full uuid shape spelled out. A loosened /^key:/ would let a caller join
    // socket.io rooms belonging to other features, which is the Clash defect this guards against.
    const ROOM_ID_RE = new RegExp(
      `^${spec.key}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
    )

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
        select: { pointsPerWin: true, ...spec.configSelect }
      }).catch(() => null),
      db.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { tkoDailyPointLimit: true }
      }).catch(() => null)
    ])
    configCache = {
      pointsPerWin: Math.max(0, Number(game?.pointsPerWin ?? 0)),
      dailyCap: Math.max(0, Number(global?.tkoDailyPointLimit ?? 250)),
      ...spec.clampConfig(spec.readConfig(game || {}))
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
    const b = socket.data[NS.bucket] || (socket.data[NS.bucket] = { tokens: BUCKET_CAPACITY, at: now })
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
      const perUser = await redis.set(`${spec.key}:announce:${username}`, '1', 'EX', 600, 'NX')
      if (!perUser) return
      const global = await redis.set('duel:announce:global', '1', 'EX', 60, 'NX')
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
          content: `${spec.announce.emoji} ${display} is looking for an **${spec.announce.label}** match! ${spec.announce.url}`,
          allowed_mentions: discordId ? { users: [discordId] } : { parse: [] }
        })
      })
    } catch (err) {
      console.error(`[${spec.key}] Discord announce failed:`, err)
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
    io.local.to(LOBBY_ROOM).emit(EV('roomRemoved'), { id: roomId })
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
        console.error(`[${spec.key}] round timeout resolve failed:`, err))
    }, match.config.roundSeconds * 1000 + 250) // small grace for in-flight throws

    emitToPlayers(io, match, EV('round'))
  }

  // Each player gets their own view, so this cannot be a single room-wide emit.
  function emitToPlayers(io, match, event) {
    for (const [i, uid] of match.players.entries()) {
      for (const sid of match.sockets[i]) {
        io.local.to(sid).emit(event, publicMatchView(match, uid))
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
          r.hands[i] = randomInt(spec.choiceCount)
          r.auto[i] = true
          r.receivedAt[i] = Date.now()
        }
      }
    }
    if (r.hands[0] === null || r.hands[1] === null) return

    r.resolving = true
    if (match.timer) { clearTimeout(match.timer); match.timer = null }

    const cmp = spec.compare(r.hands[0], r.hands[1])
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

    // How long the result stays up before the next round is armed. Variable, because a game
    // that narrates a round ("Charizard used Flamethrower! It's super effective!") needs longer
    // to read than one that flashes a banner, and a tie shows fewer lines than a decisive
    // round. The client is told the absolute instant rather than the duration, for the same
    // reason it is told an absolute deadlineAt: a backgrounded or skewed clock still lands on
    // the moment the server is actually enforcing.
    const breakMs = spec.breakMs(cmp)
    const nextRoundAt = Date.now() + breakMs

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
        nextRoundAt,
        reveal: {
          n: last.n,
          you: i === 0 ? last.p1 : last.p2,
          opponent: i === 0 ? last.p2 : last.p1,
          youAuto: i === 0 ? last.p1Auto : last.p2Auto,
          opponentAuto: i === 0 ? last.p2Auto : last.p1Auto,
          result: last.w === 0 ? 'tie' : (last.w === i + 1 ? 'win' : 'loss')
        }
      }
      for (const sid of match.sockets[i]) io.local.to(sid).emit(EV('reveal'), payload)
    }

    const winsNeeded = match.config.winsNeeded
    const decided = match.scores[0] >= winsNeeded || match.scores[1] >= winsNeeded
    const exhausted = match.history.length >= match.config.maxRounds &&
      match.scores[0] !== match.scores[1]

    if (decided || exhausted) {
      const winnerIdx = match.scores[0] > match.scores[1] ? 0 : 1
      // Ended immediately so the points are awarded and the row written without waiting on a
      // timer that a disconnect could orphan. The client holds the match-over panel back until
      // nextRoundAt so the final round's result is still readable underneath it.
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
    }, breakMs)
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
      console.error(`[${spec.key}] failed to persist match:`, err)
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
      for (const sid of match.sockets[i]) io.local.to(sid).emit(EV('matchEnd'), payload)
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
    // A match against yourself pays nothing. The join handler already refuses your own room,
    // so this is unreachable today — it is here because it is the ONLY structural barrier if a
    // future "play the AI for points" or bot-seat feature ever reaches this path, and because
    // without it such a match falls through to `same_device`, which is one config flag away
    // from not applying at all.
    else if (p1 === p2) suppressReason = 'self_match'
    else if (match.sameIp || match.sameVisitorId) suppressReason = 'same_device'
    else if (cfg.pointsPerWin <= 0 || cfg.dailyCap <= 0) suppressReason = 'cap_exhausted'

    if (suppressReason) {
      await MATCH().create({ data: { ...row, pointsAwarded: 0, suppressReason } })
      return { awarded: 0, suppressReason }
    }

    const windowStart = getDailyWindowStart()
    let awarded = 0

    await db.$transaction(async (tx) => {
      await MATCH(tx).create({ data: { ...row, pointsAwarded: 0 } })

      // resolveSocketUser caches the authenticated user for the socket's whole life and the
      // session JWT lives 30 days, so a ban landing mid-session is only visible here.
      const winner = await tx.user.findUnique({
        where: { id: winnerUserId },
        select: { banned: true, active: true }
      })
      if (!winner || winner.banned || winner.active === false) {
        suppressReason = 'banned'
        await MATCH(tx).update({ where: { id: row.id }, data: { suppressReason } })
        return
      }

      // Win-trading between two accounts is the obvious farm for a game this fast. Cap how much
      // one pair can pay each other per daily window; rotating alts defeats this, which is what
      // the IP/visitorId columns and the suspicious-activity metrics are for.
      //
      // The count spans EVERY duel game, not just this one. The shared daily cap already limits
      // a player's total points, but the pair limit does a different job: it forces a farmer to
      // find distinct partners, so that Sybil cost rather than patience is the binding
      // constraint. A per-game limit defeats exactly that — the same two accounts would simply
      // trade their quota in RPS, then trade it again in Pokemon, doubling the yield of one
      // pair. spec.pairScopeDelegates lists every table that counts toward one shared budget.
      if (cfg.pairDailyAwardLimit > 0) {
        const [a, b] = [p1, p2].sort()
        // Written in the LEAST/GREATEST form the pair index is built for. The equivalent
        // Prisma `OR: [{p1:a,p2:b},{p1:b,p2:a}]` cannot use an expression index — EXPLAIN
        // shows it scanning the partial index on pointsAwardedAt alone and filtering the rest
        // — and this runs inside the award transaction on every paying match.
        //
        // Table names come from spec.pairScopeTables, a literal list in
        // server/utils/duelPairScope.js that assertSpec resolves against real Prisma delegates
        // at boot. Nothing from the request reaches the SQL text; a, b and the window start are
        // all bound.
        const union = spec.pairScopeTables.map(t => `
          SELECT count(*)::int AS n FROM "${t}"
           WHERE "pointsAwardedAt" >= $1
             AND LEAST("player1UserId", "player2UserId") = $2
             AND GREATEST("player1UserId", "player2UserId") = $3`).join(' UNION ALL ')
        const rows = await tx.$queryRawUnsafe(union, windowStart, a, b)
        const paidBetweenPair = rows.reduce((sum, r) => sum + Number(r.n || 0), 0)
        if (paidBetweenPair >= cfg.pairDailyAwardLimit) {
          suppressReason = 'pair_limit'
          await MATCH(tx).update({ where: { id: row.id }, data: { suppressReason } })
          return
        }
      }

      // Claim the award before paying it. Nothing else makes awardCappedGamePoints idempotent —
      // GamePointLog has no unique constraint — so if a forfeit ever raced a natural end, the
      // winner would be paid twice.
      //
      // This was a tagged-template $executeRaw naming the table literally. It cannot stay raw
      // now the table comes from the spec: Prisma's tagged template treats every `${}` as a
      // BIND PARAMETER, so a table name interpolated that way compiles to `UPDATE $1` and the
      // statement dies on a syntax error — which endMatch catches and logs, leaving the match
      // to finish looking completely normal while paying nothing. $executeRawUnsafe would fix
      // the syntax by reintroducing an injection surface for a value that no longer needs to
      // be raw at all.
      //
      // updateMany with `pointsAwardedAt: null` in the WHERE is the same compare-and-set: the
      // UPDATE takes a row lock and re-checks the predicate, so exactly one of two racing
      // callers sees count === 1.
      const claim = await MATCH(tx).updateMany({
        where: { id: row.id, pointsAwardedAt: null },
        data: { pointsAwardedAt: new Date(), awardedUserId: winnerUserId }
      })
      if (claim.count !== 1) return

      awarded = await awardCappedGamePoints(tx, {
        userId: winnerUserId,
        gameName: GAME_NAME,
        poolGameNames: COMBAT_POOL_GAME_NAMES,
        pointsPerWin: cfg.pointsPerWin,
        cap: cfg.dailyCap,
        method: POINTS_METHOD
      })

      if (awarded > 0) {
        await MATCH(tx).update({ where: { id: row.id }, data: { pointsAwarded: awarded } })
      } else {
        suppressReason = 'cap_exhausted'
        await MATCH(tx).update({
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

    emitToPlayers(io, match, EV('matchStart'))
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
      }).catch(err => console.error(`[${spec.key}] forfeit failed:`, err))
    }

    if (immediate) { forfeit(); return }

    if (match.graceTimers[idx]) clearTimeout(match.graceTimers[idx])
    match.graceTimers[idx] = setTimeout(() => {
      if (match.sockets[idx].size === 0) forfeit()
    }, RECONNECT_GRACE_MS)

    const opp = idx === 0 ? 1 : 0
    for (const sid of match.sockets[opp]) {
      io.local.to(sid).emit(EV('opponentDropped'), { graceMs: RECONNECT_GRACE_MS })
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
        .catch(err => console.error(`[${spec.key}] sweep end failed:`, err))
    }
  }

  /* ── Handlers ────────────────────────────────────────────────────────────────────────── */

  function register(io, socket, resolveSocketUser) {
    // Every handler starts here. No edrps:* payload carries a user id, so there is nothing to
    // forge; and identity is never copied onto the shared socket.data.userId.
    const auth = async () => {
      if (!allowEvent(socket)) return null
      const user = await resolveSocketUser(socket)
      if (!user) {
        socket.emit(EV('error'), { code: 'unauth', message: 'Please sign in to play.' })
        return null
      }
      socket.data[NS.userId] = user.id
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
      socket.data[NS.roomId] = roomId
      if (match.graceTimers[idx]) {
        clearTimeout(match.graceTimers[idx])
        match.graceTimers[idx] = null
      }
      socket.emit(EV('matchStart'), publicMatchView(match, userId))
      const opp = idx === 0 ? 1 : 0
      for (const sid of match.sockets[opp]) io.local.to(sid).emit(EV('opponentReturned'))
    }

    socket.on(EV('subscribe'), async () => {
      const user = await auth()
      if (!user) return
      socket.join(LOBBY_ROOM)
      socket.emit(EV('rooms'), lobbyRoomList())
      // Config rides the socket rather than a separate HTTP round-trip; it's cached in-process
      // for a minute, so this costs nothing per lobby visit.
      const cfg = await loadConfig()
      socket.emit(EV('config'), {
        pointsPerWin: cfg.pointsPerWin,
        winsNeeded: cfg.winsNeeded,
        maxRounds: cfg.maxRounds,
        roundSeconds: cfg.roundSeconds
      })
    })

    socket.on(EV('unsubscribe'), () => {
      socket.leave(LOBBY_ROOM)
    })

    socket.on(EV('listRooms'), async () => {
      const user = await auth()
      if (!user) return
      // Served from memory. Clash's equivalent issues a db.user.findMany per call, which is an
      // unauthenticated DB amplification primitive.
      socket.emit(EV('rooms'), lobbyRoomList())
    })

    // Checked on both entry points, not just one: a room created before the game was taken
    // offline is still joinable otherwise.
    const offline = async () => {
      if (!spec.isEnabled) return false
      try { return !(await spec.isEnabled()) } catch { return false }
    }

    socket.on(EV('createRoom'), async ({ character } = {}) => {
      const user = await auth()
      if (!user) return
      if (await offline()) {
        return socket.emit(EV('error'), { code: 'offline', message: 'This game is currently unavailable.' })
      }
      if (!(await spec.isAvatarId(character))) {
        return socket.emit(EV('error'), { code: 'badCharacter', message: 'Pick a character first.' })
      }
      if (matchByUser.has(user.id)) {
        return socket.emit(EV('error'), { code: 'inMatch', message: 'You are already in a match.' })
      }
      const existing = roomByUser.get(user.id)
      if (existing && rooms.has(existing)) {
        return socket.emit(EV('error'), { code: 'roomOpen', message: 'You already have a room open.' })
      }

      // Server-generated, never client-supplied: a client-chosen id lets a caller overwrite
      // someone else's lobby entry and join socket.io rooms belonging to other features.
      const roomId = `${spec.key}:${randomUUID()}`
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
      socket.data[NS.roomId] = roomId

      socket.emit(EV('roomCreated'), { id: roomId })
      // Scoped to the lobby, not io.emit: Clash broadcasts its room list churn to every socket
      // on the site, on every page.
      io.local.to(LOBBY_ROOM).emit(EV('roomAdded'), { id: roomId, owner: user.username, createdAt: room.createdAt })

      db.user.findUnique({ where: { id: user.id }, select: { discordId: true } })
        .then(u => announceRoom(user.username, u?.discordId))
        .catch(() => {})
    })

    socket.on(EV('joinRoom'), async ({ roomId, character } = {}) => {
      const user = await auth()
      if (!user) return
      if (await offline()) {
        return socket.emit(EV('error'), { code: 'offline', message: 'This game is currently unavailable.' })
      }
      if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) {
        return socket.emit(EV('error'), { code: 'badRoom', message: 'That room is no longer available.' })
      }
      if (!(await spec.isAvatarId(character))) {
        return socket.emit(EV('error'), { code: 'badCharacter', message: 'Pick a character first.' })
      }
      if (matchByUser.has(user.id)) {
        return socket.emit(EV('error'), { code: 'inMatch', message: 'You are already in a match.' })
      }
      const room = rooms.get(roomId)
      if (!room) {
        return socket.emit(EV('error'), { code: 'gone', message: 'That room is no longer available.' })
      }
      if (room.ownerId === user.id) {
        return socket.emit(EV('error'), { code: 'ownRoom', message: "That's your own room." })
      }

      // Claim the room before any await, so two joiners racing can't both start a match.
      rooms.delete(roomId)
      roomByUser.delete(room.ownerId)
      io.local.to(LOBBY_ROOM).emit(EV('roomRemoved'), { id: roomId })

      socket.join(roomId)
      socket.data[NS.roomId] = roomId

      try {
        await startMatch(io, room, { userId: user.id, username: user.username, character, socket })
      } catch (err) {
        console.error(`[${spec.key}] failed to start match:`, err)
        socket.emit(EV('error'), { code: 'startFailed', message: 'Could not start the match.' })
      }
    })

    socket.on(EV('throw'), async ({ round, hand } = {}) => {
      const user = await auth()
      if (!user) return
      const roomId = matchByUser.get(user.id)
      if (!roomId) return
      const match = matches.get(roomId)
      if (!match || match.ending) return

      const idx = match.players.indexOf(user.id)
      if (idx === -1) return
      if (!spec.isChoice(hand)) return

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
      socket.emit(EV('throwAccepted'), { round: r.number })
      const oppIdx = idx === 0 ? 1 : 0
      for (const sid of match.sockets[oppIdx]) {
        io.local.to(sid).emit(EV('opponentThrew'), { round: r.number })
      }

      await resolveRound(io, match, r.number, false)
    })

    socket.on(EV('leave'), async () => {
      const user = await auth()
      if (!user) return
      const roomId = socket.data[NS.roomId] || matchByUser.get(user.id) || roomByUser.get(user.id)
      if (!roomId) return
      socket.leave(roomId)
      socket.data[NS.roomId] = null
      handleLeave(io, { roomId, userId: user.id, socketId: socket.id, immediate: true })
    })

    // Namespaced so it can be called from socket-server's own `disconnecting` handler without
    // entangling with Clash's socket.data.roomId.
    socket.on('disconnecting', () => {
      const userId = socket.data[NS.userId]
      const roomId = socket.data[NS.roomId]
      if (!userId || !roomId) return
      handleLeave(io, { roomId, userId, socketId: socket.id, immediate: false })
    })
  }

  let sweepTimer = null

    function startSweep(io) {
    if (sweepTimer) return
    sweepTimer = setInterval(() => {
      try { sweep(io) } catch (err) { console.error(`[${spec.key}] sweep failed:`, err) }
    }, 60_000)
    sweepTimer.unref?.()
  }

    // Exposed for tests.
    const __testing = { rooms, matches, publicMatchView, resolveRound }

    return { register, startSweep, __testing }
  }

function assertSpec(spec) {
  // The delegate name and the SQL table name are the one pair nothing else can check, and they
  // are exactly where the silent money bugs live. Prisma delegates are the model name with a
  // lowercased first letter, so a mismatch is caught here at boot rather than at payout.
  const expected = spec.matchTable.charAt(0).toLowerCase() + spec.matchTable.slice(1)
  if (spec.matchDelegate !== expected) {
    throw new Error(
      `[duelRuntime] spec.matchDelegate "${spec.matchDelegate}" does not match ` +
      `spec.matchTable "${spec.matchTable}" (expected "${expected}")`
    )
  }
  if (typeof db[spec.matchDelegate]?.create !== 'function') {
    throw new Error(`[duelRuntime] no Prisma delegate named "${spec.matchDelegate}"`)
  }
  if (!spec.pairScopeTables?.includes(spec.matchTable)) {
    // A game whose own table is missing from its pair scope does not count its own paid
    // matches, so its per-pair limit never trips at all.
    throw new Error(
      `[duelRuntime] ${spec.gameName} pairScopeTables must include its own table ` +
      `"${spec.matchTable}"`
    )
  }
  for (const t of spec.pairScopeTables) {
    // These names are interpolated into SQL, so each one is checked against a real Prisma
    // delegate at boot rather than trusted because it is "a literal".
    const d = t.charAt(0).toLowerCase() + t.slice(1)
    if (typeof db[d]?.count !== 'function') {
      throw new Error(`[duelRuntime] pairScopeTables names an unknown table "${t}"`)
    }
  }
  if (!COMBAT_POOL_GAME_NAMES.includes(spec.gameName)) {
    // Omitting a combat game from that constant charges its wins to BOTH daily pools: the full
    // combat cap stays available AND the arcade games silently lose that much of their budget.
    throw new Error(`[duelRuntime] ${spec.gameName} is missing from COMBAT_POOL_GAME_NAMES`)
  }
}
