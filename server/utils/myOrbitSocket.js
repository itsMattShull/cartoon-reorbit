// server/utils/myOrbitSocket.js
//
// Real-time runtime for MyOrbit (live avatar chat rooms): presence and click-to-move within an
// admin-built isometric room (see server/utils/myOrbitPathfinding.js for the movement engine
// itself). Registered per-connection from socket-server.js exactly like
// registerCMoonRaid/registerOgGtoons:
//
//   import { registerMyOrbit, startMyOrbitSweep } from './utils/myOrbitSocket.js'
//   ...
//   io.on('connection', socket => {
//     ...
//     registerMyOrbit(io, socket, resolveSocketUser)
//   })
//   startMyOrbitSweep(io)
//
// ── Why no Redis persistence (unlike cmoonRaidSocket.js/ogGtoonsSocket.js) ─────────────────────
// Raid/match state there survives a restart because it's consequential: HP, whose turn it is,
// staked points. A MyOrbit room's live presence is cosmetic — which room someone's in and where
// they're standing has no points, no history, no "who wins" to protect. Every socket drops
// across a process restart regardless (TCP connections don't survive it), so every client of
// EVERY feature has to reconnect; for MyOrbit, "please rejoin the room" after a restart is a
// correct, low-cost outcome, not a gap — continuing to report a now-disconnected client as still
// present would be actively misleading. So room/participant state here is purely in-memory, the
// same instance-local Map raids use for coordination, but deliberately with nothing mirrored
// into Redis. The one exception is myOrbitPresence.js's tiny `userId -> {roomId, username}`
// pointer — not room state at all, just a cross-process bridge so the separate Nitro/REST
// process can answer "who's online and in which room" (see that file's own header).
//
// ── Room layout is reloaded on every join, never cached indefinitely ──────────────────────────
// Unlike a raid's enemy/map definition (fixed for that raid's lifetime), an admin can be
// actively iterating on a room's layout in AdminMyOrbitRoomBuilder.vue while players are inside
// it. Reloading on every join (not every move — that would be wasteful) keeps new arrivals
// seeing a reasonably fresh layout without needing a cache-invalidation channel. An admin edit
// mid-session can leave an already-present player standing on a cell the new layout doesn't
// consider walkable anymore; findPath's own "the start cell itself must be walkable" check
// already turns that into a clean "can't move" rather than a crash — nobody gets kicked, they
// just can't path out of a now-invalid tile until they rejoin and get placed on a valid one.
import { randomUUID } from 'crypto'
import { prisma as db } from '../prisma.js'
import { buildWalkableSet, findPath, firstWalkableCell, isAdjacent } from './myOrbitPathfinding.js'
import { parseMyOrbitChatMessage, containsBannedWord, parseMyOrbitStatus } from './myOrbitChatFilter.js'
import { getGlobalConfig } from './cmoon.js'
import { isValidMyOrbitEmote } from '../../utils/myOrbitEmotes.js'
import { getActiveRaidForUser } from './cmoonRaidSocket.js'
import { getActivePvpMatchForUser } from './cmoonPvpSocket.js'
import { setUserPresence, clearUserPresence } from './myOrbitPresence.js'

const EV = (name) => `myorbit:${name}`
const roomChannel = (roomId) => `myorbit:room:${roomId}`

const STEP_MS = 350 // ms per tile step while walking a path
// A closed tab (one of several open) or a quick reconnect shouldn't instantly drop someone from
// the room roster — same spirit as ogGtoonsSocket.js's RECONNECT_GRACE_MS, just shorter: nothing
// here is "forfeited" by leaving, so there's no reason to hold the door open as long.
const RECONNECT_GRACE_MS = 15_000
const CHAT_RATE_LIMIT_MS = 1200 // minimum gap between one user's own chat messages
const EMOTE_RATE_LIMIT_MS = 1500 // minimum gap between one user's own emotes
const INVITE_RATE_LIMIT_MS = 5000 // minimum gap between one user's own raid invites

const rooms = new Map()      // roomId -> room
const roomByUser = new Map() // userId -> roomId (which room, if any, this user is currently in)

// Admin-managed banned-word list, cached rather than queried on every single chat message — a
// banned word added just now taking up to BANNED_WORDS_TTL_MS to actually apply is an acceptable
// staleness window for a chat filter, and far cheaper than a DB round trip per message.
const BANNED_WORDS_TTL_MS = 30_000
let bannedWordsCache = { words: [], loadedAt: 0 }

async function getBannedWords() {
  if (Date.now() - bannedWordsCache.loadedAt < BANNED_WORDS_TTL_MS) return bannedWordsCache.words
  const rows = await db.myOrbitBannedWord.findMany({ select: { phrase: true } })
  bannedWordsCache = { words: rows.map(r => r.phrase), loadedAt: Date.now() }
  return bannedWordsCache.words
}

async function loadRoomDefinition(roomId) {
  const room = await db.myOrbitRoom.findUnique({
    where: { id: roomId },
    include: {
      tiles: { include: { tile: true } },
      furniture: { include: { furniture: true } },
      theme: { select: { id: true, name: true, color: true, avatarPath: true } }
    }
  })
  if (!room || !room.active) return null
  const tiles = room.tiles.map(t => ({ x: t.x, y: t.y, walkable: t.tile.walkable, tileId: t.tileId, assetPath: t.tile.assetPath }))
  const furniture = room.furniture.map(f => ({
    x: f.x, y: f.y, rotation: f.rotation, furnitureId: f.furnitureId,
    footprintW: f.furniture.footprintW, footprintH: f.furniture.footprintH,
    blocksWalk: f.furniture.blocksWalk, zOffset: f.furniture.zOffset, assetPath: f.furniture.assetPath,
    sittable: f.furniture.sittable
  }))
  return {
    id: room.id, name: room.name, gridWidth: room.gridWidth, gridHeight: room.gridHeight, capacity: room.capacity,
    ambientSoundPath: room.ambientSoundPath,
    // Faction theming + the raid-den flag (see the "war rooms"/"Raid Den" features) — both purely
    // cosmetic/informational for the client, same "null/false = nothing special" convention
    // ambientSoundPath already follows.
    theme: room.theme ? { id: room.theme.id, name: room.theme.name, color: room.theme.color, iconPath: room.theme.avatarPath } : null,
    isRaidDen: room.isRaidDen,
    tiles, furniture, walkable: buildWalkableSet(tiles, furniture)
  }
}

// Fresh on every call, never cached — unlike the banned-word list, a mute/ban needs to take
// effect on the very next chat/emote attempt, not up to BANNED_WORDS_TTL_MS later. Shared by the
// 'chat' and 'emote' handlers so the exact same check never drifts between the two.
async function loadModerationStatus(userId) {
  return db.user.findUnique({ where: { id: userId }, select: { myOrbitBannedAt: true, myOrbitMutedUntil: true } })
}

function publicParticipant(p) {
  return {
    userId: p.userId, username: p.username, ctoonAssetPath: p.ctoonAssetPath, x: p.x, y: p.y,
    // Status flair (see the 'join' handler, where these are snapshotted once from the DB) — cmoon
    // is null for a player with no current faction. Neither is re-queried on move/reconnect, same
    // as ctoonAssetPath never is: a mid-session faction change simply shows on their next join.
    cmoon: p.cmoon, isAdmin: p.isAdmin, seated: !!p.seated, status: p.status || ''
  }
}

function publicRoomState(room) {
  return {
    id: room.id, name: room.name, gridWidth: room.gridWidth, gridHeight: room.gridHeight, capacity: room.capacity,
    ambientSoundPath: room.ambientSoundPath,
    theme: room.theme, isRaidDen: room.isRaidDen,
    tiles: room.tiles, furniture: room.furniture,
    participants: [...room.participants.values()].map(publicParticipant)
  }
}

function broadcastParticipants(io, room, event) {
  io.local.to(roomChannel(room.id)).emit(EV(event), { participants: [...room.participants.values()].map(publicParticipant) })
}

function clearMovement(p) {
  if (p.moveTimer) { clearInterval(p.moveTimer); p.moveTimer = null }
  p.path = null
  p.pathIndex = 0
}

function removeParticipant(io, roomId, userId) {
  const room = rooms.get(roomId)
  if (!room) return
  const p = room.participants.get(userId)
  if (!p) return
  clearMovement(p)
  if (p.graceTimer) { clearTimeout(p.graceTimer); p.graceTimer = null }
  room.participants.delete(userId)
  if (roomByUser.get(userId) === roomId) roomByUser.delete(userId)
  // Best-effort, fire-and-forget: this player's live presence (see myOrbitPresence.js's own
  // header on why it's a separate Redis mirror, not this file's in-memory Maps) must not block
  // or fail the actual room departure, which every caller of this function needs synchronously.
  clearUserPresence(userId).catch(e => console.error('[myOrbitPresence] clearUserPresence:', e))
  broadcastParticipants(io, room, 'participantLeft')
  if (room.participants.size === 0) rooms.delete(roomId)
}

/**
 * Wraps an async socket.io listener so a thrown/rejected error can never escape unhandled. An
 * `async` listener that rejects is NOT caught by socket.io or by Node's own EventEmitter — it
 * becomes an unhandled promise rejection, which crashes the whole process (confirmed: Node 22
 * exits an async EventEmitter listener's uncaught rejection with code 1). socket-server.js runs
 * as a single pm2 fork instance (ecosystem.config.cjs: instances: 1), so one bad DB round-trip
 * during a MyOrbit join would otherwise disconnect every player from every real-time feature
 * site-wide — raids, PvP, matchmaking, trading — not just MyOrbit.
 */
function safe(socket, fn) {
  return async (...args) => {
    try {
      await fn(...args)
    } catch (err) {
      console.error('[myOrbit] handler error:', err?.message || err)
      try { socket.emit(EV('error'), { message: 'Something went wrong — please try again.' }) } catch {}
    }
  }
}

export function registerMyOrbit(io, socket, resolveSocketUser) {
  socket.on(EV('join'), safe(socket, async ({ roomId, userCtoonId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (typeof roomId !== 'string' || !roomId) return socket.emit(EV('error'), { message: 'A roomId is required' })

    // Master on/off switch (GlobalGameConfig.myOrbitEnabled) — same gate shape as
    // cmoonPvpSocket.js's own 'start' handler. Only blocks a NEW join; someone already standing
    // in a room when an admin flips this off is left alone rather than kicked.
    const config = await getGlobalConfig()
    if (!config?.myOrbitEnabled) return socket.emit(EV('error'), { message: 'MyOrbit is currently disabled' })

    // MyOrbit-scoped ban (User.myOrbitBannedAt), deliberately separate from the site-wide ban
    // checked by resolveSocketUser itself — see that field's own schema comment. isAdmin/cMoon
    // are fetched in this same query (rather than a second one) purely for status flair — see
    // where they're snapshotted onto the new participant object below.
    const moderation = await db.user.findUnique({
      where: { id: me.id },
      select: { myOrbitBannedAt: true, isAdmin: true, myOrbitStatus: true, cMoon: { select: { id: true, name: true, color: true, avatarPath: true } } }
    })
    // resolveSocketUser caches its {id, username} result for the life of the connection (see
    // socket-server.js), so a socket can still pass the `me` check above after its account row
    // was deleted mid-session — null here means exactly that, not "no ban on record", so it's
    // treated as an auth failure rather than falling through to dereference isAdmin/cMoon below.
    if (!moderation) return socket.emit(EV('error'), { message: 'Not authenticated' })
    if (moderation.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })

    // Room-hopping: leave whatever room this user was previously in first. Never double-membership.
    const previousRoomId = roomByUser.get(me.id)
    if (previousRoomId && previousRoomId !== roomId) {
      socket.leave(roomChannel(previousRoomId))
      removeParticipant(io, previousRoomId, me.id)
    }

    const definition = await loadRoomDefinition(roomId)
    if (!definition) return socket.emit(EV('error'), { message: 'This room is not available' })

    let room = rooms.get(roomId)
    if (!room) {
      room = { ...definition, participants: new Map() }
      rooms.set(roomId, room)
    } else {
      room.name = definition.name
      room.gridWidth = definition.gridWidth
      room.gridHeight = definition.gridHeight
      room.capacity = definition.capacity
      room.ambientSoundPath = definition.ambientSoundPath
      room.theme = definition.theme
      room.isRaidDen = definition.isRaidDen
      room.tiles = definition.tiles
      room.furniture = definition.furniture
      room.walkable = definition.walkable
    }

    let participant = room.participants.get(me.id)
    if (participant) {
      // Reconnect, or another tab joining a room this user is already in.
      participant.sockets.add(socket.id)
      if (participant.graceTimer) { clearTimeout(participant.graceTimer); participant.graceTimer = null }
    } else {
      if (room.participants.size >= room.capacity) {
        return socket.emit(EV('error'), { message: 'This room is full' })
      }

      const userCtoon = typeof userCtoonId === 'string' && userCtoonId
        ? await db.userCtoon.findUnique({
            where: { id: userCtoonId },
            select: { userId: true, burnedAt: true, ctoon: { select: { assetPath: true } } }
          })
        : null
      if (!userCtoon || userCtoon.userId !== me.id || userCtoon.burnedAt) {
        return socket.emit(EV('error'), { message: 'Pick a cToon from your own collection first' })
      }

      // Re-checked here, not just above: the await just above (the cToon ownership lookup) is a
      // window another concurrent join can slip through before either has called
      // room.participants.set below — same TOCTOU re-check cmoonPvpSocket.js's own join handler
      // does for its team-size cap, with the same reasoning ("the awaits above may have let the
      // window close").
      if (room.participants.size >= room.capacity) {
        return socket.emit(EV('error'), { message: 'This room is full' })
      }

      const spawn = firstWalkableCell(room.walkable, room.gridWidth, room.gridHeight)
      if (!spawn) return socket.emit(EV('error'), { message: 'This room has no walkable floor yet' })

      participant = {
        userId: me.id, username: me.username,
        userCtoonId, ctoonAssetPath: userCtoon.ctoon.assetPath,
        x: spawn.x, y: spawn.y,
        path: null, pathIndex: 0, moveTimer: null,
        sockets: new Set([socket.id]), graceTimer: null, lastMessageAt: null, lastEmoteAt: null, lastInviteAt: null,
        isAdmin: !!moderation.isAdmin,
        cmoon: moderation.cMoon ? { id: moderation.cMoon.id, name: moderation.cMoon.name, color: moderation.cMoon.color, iconPath: moderation.cMoon.avatarPath } : null,
        status: moderation.myOrbitStatus || ''
      }
      room.participants.set(me.id, participant)

      // Best-effort convenience only (remembers their last avatar pick) — never blocks the join.
      db.user.update({ where: { id: me.id }, data: { myOrbitLastUserCtoonId: userCtoonId } }).catch(() => {})
    }

    roomByUser.set(me.id, roomId)
    socket.join(roomChannel(roomId))
    socket.data.myOrbitRoomId = roomId
    // Best-effort, fire-and-forget — see myOrbitPresence.js's own header. Covers a fresh join, a
    // reconnect, and a room switch (the previous room's own removeParticipant call above already
    // cleared the old key; this one overwrites it with the new roomId).
    setUserPresence(me.id, { roomId, username: me.username }).catch(e => console.error('[myOrbitPresence] setUserPresence:', e))

    socket.emit(EV('state'), publicRoomState(room))
    broadcastParticipants(io, room, 'participantJoined')
  }))

  socket.on(EV('getState'), safe(socket, async ({ roomId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const room = rooms.get(roomId)
    if (!room || !room.participants.has(me.id)) {
      // Distinct from EV('error'): a dropped connection that outlasted RECONNECT_GRACE_MS (or a
      // room that's gone) means this client's local roomState is now stale, not just that
      // something went wrong — it must clear its state and prompt the user to rejoin, which a
      // generic error message alone wouldn't tell it to do (see useMyOrbitSocket.js's listener).
      return socket.emit(EV('removed'), { roomId })
    }
    socket.join(roomChannel(roomId))
    socket.emit(EV('state'), publicRoomState(room))
  }))

  socket.on(EV('move'), safe(socket, async ({ x, y } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })

    const destX = Number(x)
    const destY = Number(y)
    if (!Number.isInteger(destX) || !Number.isInteger(destY)) return

    const path = findPath(room.walkable, room.gridWidth, room.gridHeight, { x: participant.x, y: participant.y }, { x: destX, y: destY })
    if (!path) return socket.emit(EV('moveRejected'), { x: destX, y: destY })

    // Walking away always stands a seated player back up (see myorbit:sit) - broadcast it even
    // on a same-cell click (path.length<=1 below returns before the timer's own broadcasts would
    // ever fire), so the room sees them stand immediately rather than staying "seated" forever.
    if (participant.seated) {
      participant.seated = false
      broadcastParticipants(io, room, 'participantMoved')
    }

    clearMovement(participant)
    if (path.length <= 1) return // already there - nothing to animate or broadcast

    participant.path = path
    participant.pathIndex = 0
    participant.moveTimer = setInterval(() => {
      try {
        participant.pathIndex++
        if (participant.pathIndex >= participant.path.length) {
          clearMovement(participant)
          broadcastParticipants(io, room, 'participantMoved')
          return
        }
        const step = participant.path[participant.pathIndex]
        participant.x = step.x
        participant.y = step.y
        broadcastParticipants(io, room, 'participantMoved')
      } catch (err) {
        console.error('[myOrbit] movement tick error:', err?.message || err)
        clearMovement(participant)
      }
    }, STEP_MS)
  }))

  // "Sit on furniture" — a pose/vibe flag only. Deliberately does NOT move the participant onto
  // the furniture's own cell (which stays unwalkable per blocksWalk): they just need to be
  // standing right next to a sittable piece already, exactly like any other interaction in this
  // room would require. Standing back up happens via the 'move' handler above, the instant they
  // walk anywhere (even back onto their own cell).
  socket.on(EV('sit'), safe(socket, async ({ x, y } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })

    const seatX = Number(x)
    const seatY = Number(y)
    if (!Number.isInteger(seatX) || !Number.isInteger(seatY)) return
    const seat = room.furniture.find(f => f.x === seatX && f.y === seatY && f.sittable)
    if (!seat) return socket.emit(EV('error'), { message: 'Nothing to sit on there' })
    if (!isAdjacent({ x: participant.x, y: participant.y }, { x: seatX, y: seatY })) {
      return socket.emit(EV('error'), { message: 'Walk closer to sit there' })
    }

    participant.seated = true
    broadcastParticipants(io, room, 'participantMoved')
  }))

  // Custom status line — a short, persisted blurb shown near the player's name (see
  // User.myOrbitStatus's own schema comment). Same moderation discipline as chat: banned/muted
  // players can't set one, and it's filtered through the same admin banned-word list before
  // either the DB write or the live broadcast. Persisted (not just broadcast) so it survives a
  // reconnect and the next time this player joins any room.
  socket.on(EV('setStatus'), safe(socket, async ({ status } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })
    if (moderation?.myOrbitMutedUntil && moderation.myOrbitMutedUntil > new Date()) {
      return socket.emit(EV('error'), { message: 'You are muted' })
    }

    const parsed = parseMyOrbitStatus(status)
    if (!parsed.ok) return socket.emit(EV('error'), { message: 'That status is too long' })

    const bannedWords = await getBannedWords()
    if (containsBannedWord(parsed.status, bannedWords)) {
      return socket.emit(EV('error'), { message: 'That status was blocked' })
    }

    participant.status = parsed.status
    await db.user.update({ where: { id: me.id }, data: { myOrbitStatus: parsed.status || null } })
    broadcastParticipants(io, room, 'participantMoved')
  }))

  socket.on(EV('leave'), safe(socket, async () => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    if (!roomId) return
    socket.leave(roomChannel(roomId))
    removeParticipant(io, roomId, me.id)
  }))

  // Live-only chat (never persisted — see MyOrbitModerationLog's own schema comment on why
  // deleting one still gets audited even though the message itself is never otherwise stored).
  // Identity always comes from resolveSocketUser, never the payload. Checked in this order: must
  // actually be in a room, must not be banned/muted (MyOrbit-scoped, separate from the site-wide
  // ban resolveSocketUser itself already rejects), must not be rate-limited, must parse (non-
  // empty, within length), must not contain an admin-banned phrase.
  socket.on(EV('chat'), safe(socket, async ({ message } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })
    if (moderation?.myOrbitMutedUntil && moderation.myOrbitMutedUntil > new Date()) {
      return socket.emit(EV('error'), { message: 'You are muted' })
    }

    const now = Date.now()
    if (participant.lastMessageAt && now - participant.lastMessageAt < CHAT_RATE_LIMIT_MS) {
      return socket.emit(EV('error'), { message: 'Slow down a little' })
    }

    const parsed = parseMyOrbitChatMessage(message)
    if (!parsed.ok) {
      return socket.emit(EV('error'), { message: parsed.reason === 'too_long' ? 'That message is too long' : 'Say something first' })
    }

    const bannedWords = await getBannedWords()
    if (containsBannedWord(parsed.message, bannedWords)) {
      return socket.emit(EV('error'), { message: 'That message was blocked' })
    }

    participant.lastMessageAt = now
    // roomId is included so a listener that can be subscribed to more than one room's channel
    // at once (AdminMyOrbitModeration.vue's spectate view) can tell which room a message
    // belongs to — an ordinary player is only ever in one room's channel, so this is a no-op
    // for them.
    const chatMessage = { id: randomUUID(), roomId, userId: me.id, username: me.username, message: parsed.message, createdAt: now }
    io.local.to(roomChannel(roomId)).emit(EV('chatMessage'), chatMessage)
  }))

  // A fixed, admin-independent set of emotes (utils/myOrbitEmotes.js) — purely cosmetic, never
  // persisted, same ban/mute/rate-limit discipline as chat even though there's no free text here
  // to filter: a muted player being quiet should mean quiet, not just "can't type," and a banned
  // player obviously still can't interact with a room at all.
  socket.on(EV('emote'), safe(socket, async ({ emoteKey } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })
    if (moderation?.myOrbitMutedUntil && moderation.myOrbitMutedUntil > new Date()) {
      return socket.emit(EV('error'), { message: 'You are muted' })
    }

    const now = Date.now()
    if (participant.lastEmoteAt && now - participant.lastEmoteAt < EMOTE_RATE_LIMIT_MS) return
    if (!isValidMyOrbitEmote(emoteKey)) return

    participant.lastEmoteAt = now
    io.local.to(roomChannel(roomId)).emit(EV('emote'), { id: randomUUID(), roomId, userId: me.id, emoteKey, createdAt: now })
  }))

  // "Squad up in-room" — invite another player standing in the SAME room straight into the
  // inviter's own currently-forming raid, without either of them leaving MyOrbit first. The raid
  // itself is validated against cmoonRaidSocket.js's own live state (see getActiveRaidForUser),
  // never trusted from anything the client claims — a stale/forged raidId would otherwise let
  // someone spam invite links to a raid they aren't even in. Delivered via the same `user:<id>`
  // room every other targeted push in this codebase uses (adminKick above, cmoonraid:kicked),
  // so it reaches the target wherever they're connected, not only inside this room/socket.
  socket.on(EV('inviteToRaid'), safe(socket, async ({ targetUserId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    if (typeof targetUserId !== 'string' || !targetUserId || targetUserId === me.id) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })
    if (!room.participants.has(targetUserId)) {
      return socket.emit(EV('error'), { message: 'That player is no longer in this room' })
    }

    // Checked AND claimed before the moderation await below, not after: this participant object
    // is now shared by three invite types (raid/PvP/OG gToons), so a check that only reads here
    // and writes after an await lets two of them, fired back-to-back, both read the stale
    // pre-write value and both pass — see this handler's sibling invitePvp/challengeOgGtoons for
    // the same fix. Claiming the slot even when a later check (ban, no active raid) rejects the
    // attempt is an intentional, conservative tradeoff: a rejected attempt still costs a cooldown
    // rather than leaving the race open for correctness's sake.
    const now = Date.now()
    if (participant.lastInviteAt && now - participant.lastInviteAt < INVITE_RATE_LIMIT_MS) return
    participant.lastInviteAt = now

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })

    const raid = getActiveRaidForUser(me.id)
    if (!raid) return socket.emit(EV('error'), { message: 'You are not in an active raid' })
    if (raid.status !== 'FORMING') return socket.emit(EV('error'), { message: 'That raid is no longer accepting new joiners' })

    io.local.to(`user:${targetUserId}`).emit('cmoonraid:invite', {
      raidId: raid.id, enemyName: raid.enemyName, fromUserId: me.id, fromUsername: participant.username,
    })
  }))

  // "Invite to PvP" — same shape as inviteToRaid above, mirroring cMoon PvP's own join cutoff
  // (FORMING only — see getActivePvpMatchForUser's own comment in cmoonPvpSocket.js). Delivered
  // through THIS module's own `user:<id>` emit, not cmoonPvpSocket.js's — useCMoonPvpSocket.js is
  // only connected while a player is actually on a PvP page, so a notification sent through ITS
  // channel would silently vanish for a target who's sitting in MyOrbit and hasn't opened one.
  // MyOrbit's own socket is always live wherever this feature is (see MyOrbitWindow.vue's layout
  // mount), so that's the channel every MyOrbit-sourced social invite below uses instead.
  socket.on(EV('invitePvp'), safe(socket, async ({ targetUserId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    if (typeof targetUserId !== 'string' || !targetUserId || targetUserId === me.id) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })
    if (!room.participants.has(targetUserId)) {
      return socket.emit(EV('error'), { message: 'That player is no longer in this room' })
    }

    // See inviteToRaid's own comment above on why this is checked AND claimed before the
    // moderation await, not after.
    const now = Date.now()
    if (participant.lastInviteAt && now - participant.lastInviteAt < INVITE_RATE_LIMIT_MS) return
    participant.lastInviteAt = now

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })

    const match = getActivePvpMatchForUser(me.id)
    if (!match) return socket.emit(EV('error'), { message: 'You are not in an active PvP match' })
    if (match.status !== 'FORMING') return socket.emit(EV('error'), { message: 'That match is no longer accepting new joiners' })

    io.local.to(`user:${targetUserId}`).emit('myorbit:pvpInvite', {
      matchId: match.id, fromUserId: me.id, fromUsername: participant.username,
    })
  }))

  // "Challenge to OG gToons" — unlike the raid/PvP invites above, this never requires the sender
  // to already be in anything: OG gToons' own direct-challenge system (challengeSend) only lists
  // players who have independently joined its Matchmaking tab (see that component's own comment),
  // so there's no "already-open match" to pull someone into from here. This is purely a social
  // nudge with a deep link — same "always-live MyOrbit channel" delivery as invitePvp above.
  socket.on(EV('challengeOgGtoons'), safe(socket, async ({ targetUserId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    if (typeof targetUserId !== 'string' || !targetUserId || targetUserId === me.id) return
    const roomId = roomByUser.get(me.id)
    const room = roomId ? rooms.get(roomId) : null
    const participant = room?.participants.get(me.id)
    if (!room || !participant) return socket.emit(EV('error'), { message: 'Join a room first' })
    if (!room.participants.has(targetUserId)) {
      return socket.emit(EV('error'), { message: 'That player is no longer in this room' })
    }

    // See inviteToRaid's own comment above on why this is checked AND claimed before the
    // moderation await, not after.
    const now = Date.now()
    if (participant.lastInviteAt && now - participant.lastInviteAt < INVITE_RATE_LIMIT_MS) return
    participant.lastInviteAt = now

    const moderation = await loadModerationStatus(me.id)
    if (moderation?.myOrbitBannedAt) return socket.emit(EV('error'), { message: 'You are banned from MyOrbit' })

    io.local.to(`user:${targetUserId}`).emit('myorbit:ogGtoonsNudge', {
      fromUserId: me.id, fromUsername: participant.username,
    })
  }))

  // Read-only admin "spectate" — joins the room's broadcast channel (live chat, movement) WITHOUT
  // becoming a walking participant: never added to room.participants, so it never counts against
  // capacity or appears in anyone else's roster. This is how AdminMyOrbitModeration.vue actually
  // sees message ids/senders to act on, since chat is never otherwise persisted anywhere to query.
  socket.on(EV('adminSpectate'), safe(socket, async ({ roomId } = {}) => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    if (typeof roomId !== 'string' || !roomId) return
    // Re-checked fresh here, not from resolveSocketUser's cached {id, username} shape, which
    // carries neither isAdmin nor the sub-admin permission scope. A sub-admin only gets this if
    // granted the myOrbitModeration key (utils/adminPermissions.js — this file is plain node so
    // it can't import that module) — same requireAdminUser pattern as
    // cmoonRaidPreviewSocket.js:105, since without it a restricted sub-admin missing that grant
    // could still spectate every room's live chat.
    const admin = await db.user.findUnique({
      where: { id: me.id },
      select: { isAdmin: true, banned: true, active: true, adminRestricted: true, adminPermissions: true }
    })
    if (!admin?.isAdmin || admin.banned || admin.active === false) {
      return socket.emit(EV('error'), { message: 'Admins only' })
    }
    if (admin.adminRestricted && !(admin.adminPermissions || []).includes('myOrbitModeration')) {
      return socket.emit(EV('error'), { message: 'Admins only' })
    }
    // Leave whatever room this socket was previously spectating — otherwise switching rooms in
    // AdminMyOrbitModeration.vue leaves it subscribed to BOTH channels, mixing two rooms' chat
    // into one feed. Never leaves socket.data.myOrbitRoomId though: that's the room this same
    // connection is actually PLAYING in (if the admin also has a cToon avatar out walking around),
    // which this read-only spectate join must never interfere with.
    const previousSpectateRoomId = socket.data.myOrbitSpectateRoomId
    if (previousSpectateRoomId && previousSpectateRoomId !== roomId && previousSpectateRoomId !== socket.data.myOrbitRoomId) {
      socket.leave(roomChannel(previousSpectateRoomId))
    }
    socket.data.myOrbitSpectateRoomId = roomId
    socket.join(roomChannel(roomId))
  }))

  // ── Bridge-only admin actions ──────────────────────────────────────────────────────────────
  // Triggered from server/api/admin/myorbit/*.post.js via server/utils/socketBridge.js, never by
  // an ordinary browser socket — same `if (!socket.data?.isBridge) return` gate socket-server.js's
  // own 'new-bid' handler already uses, so a regular player can never spoof a kick/retraction.
  // Neither handler has an `await`, so neither is wrapped with `safe` (that helper catches a
  // rejected promise) — a plain try/catch instead, same reasoning as the `disconnecting` handler
  // below: an uncaught throw here would otherwise crash this single-instance process for every
  // feature, not just MyOrbit.
  socket.on(EV('adminKick'), ({ userId, reason } = {}) => {
    try {
      if (!socket.data?.isBridge) return
      if (typeof userId !== 'string' || !userId) return
      const roomId = roomByUser.get(userId)
      if (!roomId) return
      io.local.to(`user:${userId}`).emit(EV('kicked'), { reason: reason || 'Removed by an admin' })
      removeParticipant(io, roomId, userId)
      // Without this, a kicked user's still-open tab stays subscribed to the room's broadcast
      // channel (the `kicked` emit above tells the CLIENT to clear its own state, but does
      // nothing server-side) and keeps silently receiving its chat/movement events forever —
      // same socketsLeave call cmoonPvpSocket.js:485 and cmoonRaidSocket.js:830 make for the
      // identical situation.
      io.in(`user:${userId}`).socketsLeave(roomChannel(roomId))
    } catch (err) {
      console.error('[myOrbit] adminKick error:', err?.message || err)
    }
  })

  socket.on(EV('adminDeleteMessage'), ({ roomId, messageId } = {}) => {
    try {
      if (!socket.data?.isBridge) return
      if (typeof roomId !== 'string' || !roomId || typeof messageId !== 'string' || !messageId) return
      io.local.to(roomChannel(roomId)).emit(EV('messageDeleted'), { messageId })
    } catch (err) {
      console.error('[myOrbit] adminDeleteMessage error:', err?.message || err)
    }
  })

  // Not wrapped with `safe` (that helper catches a rejected PROMISE; this listener has no
  // `await` at all) — wrapped in a plain try/catch instead, same reasoning as `safe` itself: an
  // uncaught synchronous throw inside any socket.io listener crashes this single-instance
  // process for every feature, not just MyOrbit.
  socket.on('disconnecting', () => {
    try {
      disconnectCleanup()
    } catch (err) {
      console.error('[myOrbit] disconnect cleanup error:', err?.message || err)
    }
  })

  function disconnectCleanup() {
    const userId = socket.data?.authUser?.id
    const roomId = userId ? roomByUser.get(userId) : null
    if (!roomId || !userId) return
    const room = rooms.get(roomId)
    const participant = room?.participants.get(userId)
    if (!participant) return

    participant.sockets.delete(socket.id)
    if (participant.sockets.size > 0) return // another tab is still here

    if (participant.graceTimer) clearTimeout(participant.graceTimer)
    participant.graceTimer = setTimeout(() => {
      try {
        const stillThere = room.participants.get(userId)
        if (stillThere && stillThere.sockets.size === 0) removeParticipant(io, roomId, userId)
      } catch (err) {
        console.error('[myOrbit] grace-timeout cleanup error:', err?.message || err)
      }
    }, RECONNECT_GRACE_MS)
  }
}

/** Periodic hygiene sweep — a room is already deleted the moment its last participant leaves
 * (removeParticipant above), so in normal operation this finds nothing; it only exists to catch
 * a pathological edge case (e.g. a crashed handler leaving a zero-participant room entry
 * behind) rather than doing any real work on a normal run. */
export function startMyOrbitSweep() {
  const interval = setInterval(() => {
    for (const [roomId, room] of rooms) {
      if (room.participants.size === 0) { rooms.delete(roomId); continue }
      // Keeps every still-present player's presence key (myOrbitPresence.js, TTL 120s) from
      // expiring during a long, quiet stay — join/getState are the only other writers, and a
      // player who neither reconnects nor re-fetches state for 2+ minutes would otherwise look
      // "offline" to the who's-online panel/room counts while still genuinely in the room.
      for (const participant of room.participants.values()) {
        setUserPresence(participant.userId, { roomId, username: participant.username })
          .catch(e => console.error('[myOrbitPresence] sweep refresh:', e))
      }
    }
  }, 60_000)
  interval.unref?.()
  return interval
}
