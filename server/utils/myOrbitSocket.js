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
// into Redis.
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
import { prisma as db } from '../prisma.js'
import { buildWalkableSet, findPath, firstWalkableCell } from './myOrbitPathfinding.js'

const EV = (name) => `myorbit:${name}`
const roomChannel = (roomId) => `myorbit:room:${roomId}`

const STEP_MS = 350 // ms per tile step while walking a path
// A closed tab (one of several open) or a quick reconnect shouldn't instantly drop someone from
// the room roster — same spirit as ogGtoonsSocket.js's RECONNECT_GRACE_MS, just shorter: nothing
// here is "forfeited" by leaving, so there's no reason to hold the door open as long.
const RECONNECT_GRACE_MS = 15_000

const rooms = new Map()      // roomId -> room
const roomByUser = new Map() // userId -> roomId (which room, if any, this user is currently in)

async function loadRoomDefinition(roomId) {
  const room = await db.myOrbitRoom.findUnique({
    where: { id: roomId },
    include: {
      tiles: { include: { tile: true } },
      furniture: { include: { furniture: true } }
    }
  })
  if (!room || !room.active) return null
  const tiles = room.tiles.map(t => ({ x: t.x, y: t.y, walkable: t.tile.walkable, tileId: t.tileId, assetPath: t.tile.assetPath }))
  const furniture = room.furniture.map(f => ({
    x: f.x, y: f.y, rotation: f.rotation, furnitureId: f.furnitureId,
    footprintW: f.furniture.footprintW, footprintH: f.furniture.footprintH,
    blocksWalk: f.furniture.blocksWalk, zOffset: f.furniture.zOffset, assetPath: f.furniture.assetPath
  }))
  return {
    id: room.id, name: room.name, gridWidth: room.gridWidth, gridHeight: room.gridHeight, capacity: room.capacity,
    tiles, furniture, walkable: buildWalkableSet(tiles, furniture)
  }
}

function publicParticipant(p) {
  return { userId: p.userId, username: p.username, ctoonAssetPath: p.ctoonAssetPath, x: p.x, y: p.y }
}

function publicRoomState(room) {
  return {
    id: room.id, name: room.name, gridWidth: room.gridWidth, gridHeight: room.gridHeight, capacity: room.capacity,
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
        sockets: new Set([socket.id]), graceTimer: null
      }
      room.participants.set(me.id, participant)

      // Best-effort convenience only (remembers their last avatar pick) — never blocks the join.
      db.user.update({ where: { id: me.id }, data: { myOrbitLastUserCtoonId: userCtoonId } }).catch(() => {})
    }

    roomByUser.set(me.id, roomId)
    socket.join(roomChannel(roomId))
    socket.data.myOrbitRoomId = roomId

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

  socket.on(EV('leave'), safe(socket, async () => {
    const me = await resolveSocketUser(socket)
    if (!me) return
    const roomId = roomByUser.get(me.id)
    if (!roomId) return
    socket.leave(roomChannel(roomId))
    removeParticipant(io, roomId, me.id)
  }))

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
      if (room.participants.size === 0) rooms.delete(roomId)
    }
  }, 60_000)
  interval.unref?.()
  return interval
}
