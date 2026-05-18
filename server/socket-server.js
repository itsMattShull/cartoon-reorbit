import dotenv from 'dotenv'
dotenv.config()
import * as CANNON from 'cannon-es'

import { createServer }  from 'http'
import { Server }        from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { prisma as db }  from './prisma.js'
import { DateTime } from 'luxon'
import { attachSocketIoMetrics } from './diagnostics/metrics.mjs'
import { startDiagnostics } from './diagnostics/telemetry.mjs'
import { Worker } from 'bullmq'
import { redisConnection, scheduleAuctionClose, scheduleMintEnd } from './utils/queues.js'
import { getRedis } from './utils/redis.js'
import * as redisState from './utils/redisState.js'

import fs                 from 'node:fs'
import path               from 'node:path'
import { dirname }        from 'node:path'
import { fileURLToPath }  from 'node:url'
import { randomUUID }     from 'crypto'
import jwt                from 'jsonwebtoken'
import { clampVariancePct, rollInstanceStats } from './utils/monsterStats.js'

startDiagnostics().catch((err) => {
  console.error('[Diagnostics] failed to start (socket server):', err)
})

/* ── Clash engine & helpers ────────────────────────────────── */
import { createBattle }   from './utils/battleEngine.js'
import {
  applyForfeit,
  chooseAiAction,
  createInitialState,
  resolveTurn,
  validateAction
} from './utils/monsterBattleEngine.js'

/* ── Load Cartoon-Network lanes once at boot ──────────────── */
const __dirname = dirname(fileURLToPath(import.meta.url))
const lanesPath = path.join(__dirname, '../data/lanes.json')
const LANES     = JSON.parse(fs.readFileSync(lanesPath, 'utf-8'))

/* ────────────────────────────────────────────────────────────
 *  HTTP + Socket.IO bootstrap
 * ────────────────────────────────────────────────────────── */
const PORT = process.env.SOCKET_PORT || 3001
const SOCKET_PATH = process.env.SOCKET_PATH || '/socket.io'
const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: '*' } })
attachSocketIoMetrics(io)

// ── Redis adapter (pub/sub between instances) ──────────────────────────────
// Using duplicate() so pub and sub clients are independent connections.
const _redisPub = getRedis()
const _redisSub = _redisPub.duplicate()
io.adapter(createAdapter(_redisPub, _redisSub))

// ── Redis sync helpers (fire-and-forget) ───────────────────────────────────
// Write to Redis after every mutating Map operation so state survives restarts.
const syncBattle = (battleId, battle) =>
  redisState.setBattle(battleId, battle).catch(e => console.error('[redisState] setBattle:', e))
const syncBattleByUser = (userId, battleId) =>
  redisState.setBattleByUser(userId, battleId).catch(e => console.error('[redisState] setBattleByUser:', e))
const syncDeleteBattle = (battleId, userIds = []) =>
  redisState.delBattle(battleId, userIds).catch(e => console.error('[redisState] delBattle:', e))
const syncPvpRoom = (roomId, room) =>
  redisState.setPvpRoom(roomId, room).catch(e => console.error('[redisState] setPvpRoom:', e))
const syncDeletePvpRoom = (roomId) =>
  redisState.delPvpRoom(roomId).catch(e => console.error('[redisState] delPvpRoom:', e))
/* ────────────────────────────────────────────────────────────
 *  cZone visitors & chat (unchanged)
 * ────────────────────────────────────────────────────────── */
const zoneVisitors = {}        // zone → count
const zoneSockets  = {}        // zone → Set(socketId)

// near top, alongside pveMatches:
const pvpRooms   = new Map();    // roomId -> { players: [userId], decks: {userId: deck} }
const pvpMatches = new Map();    // roomId -> { battle, recordId }

/* ── Spin the Wheel (pure in-memory, no DB) ──────────────── */
const STW_ROOM = 'spin-the-wheel'
const spinWheelState = {
  participants: [],   // [{ username }]
  isOpen: false,
  sessionId: randomUUID(),
  spinning: false
}

function stwSnapshot() {
  return {
    participants: [...spinWheelState.participants],
    isOpen: spinWheelState.isOpen,
    sessionId: spinWheelState.sessionId,
    spinning: spinWheelState.spinning
  }
}

/* ── Marble Race ─────────────────────────────────────────── */
const MARBLES_ROOM = 'marbles-race'
const MARBLE_COLORS = [
  '#FF4444', '#44CCFF', '#44FF66', '#FFD700', '#FF44DD',
  '#00FFCC', '#FF8844', '#AA44FF', '#AAFFAA', '#FF88CC',
  '#88CCFF', '#FFCC44', '#CC44FF', '#44FFD0', '#FF6688',
  '#66FF44', '#FF4488', '#44AAFF', '#FFAA66', '#AA88FF',
]

const marblesState = {
  marbles: [],      // { id, username, color }
  isOpen: false,
  phase: 'waiting', // 'waiting' | 'racing' | 'finished'
  sessionId: randomUUID(),
  winner: null,
}

let marblesWorld = null
let marbleBodies = []     // parallel array to marblesState.marbles
let marblesFinished = new Set()
let marblesPhysInterval = null
let marblesBroadcastInterval = null

const MBL_RADIUS   = 0.8

// Curved course definition — Catmull-Rom spine control points [x, z]
const COURSE_SPINE = [
  [ 0,   90],
  [15,   72],
  [ 0,   54],
  [-15,  36],
  [ 0,   18],
  [15,    0],
  [ 0,  -18],
  [-15, -36],
  [ 0,  -54],
  [15,  -72],
  [ 0,  -90],
  [ -7, -108],
  [ 0,  -118],
]
const COURSE_HALF_W      = 5   // half-width of channel
const COURSE_N_SEGS      = 120 // number of approximation segments
const FUNNEL_OPEN_HALF_W = 14  // half-width at the funnel's open end
const FUNNEL_LENGTH      = 19  // distance from course start to funnel open end

// Finish-line detection plane — derived from the last COURSE_SPINE segment so detection
// matches the angled end-cap wall at every lane.  The wall is rotated to follow the
// course direction, so its world-Z spans from ≈-114 on one side to ≈-121 on the other.
// A raw z <= -118 threshold misses every marble that stops against the "high" side of the
// wall; the dot-product test fires correctly regardless of which lane the marble crosses.
{
  const _fs  = COURSE_SPINE[COURSE_SPINE.length - 1]   // [x, z] of finish centre
  const _fsp = COURSE_SPINE[COURSE_SPINE.length - 2]   // [x, z] one step before
  const _fdx = _fs[0] - _fsp[0], _fdz = _fs[1] - _fsp[1]
  const _fl  = Math.sqrt(_fdx * _fdx + _fdz * _fdz)
  var FINISH_NORM_X     = _fdx / _fl   // finish approach normal  X (unit)
  var FINISH_NORM_Z     = _fdz / _fl   // finish approach normal  Z (unit)
  // Threshold = projection of finish wall centre onto approach normal, minus (wall
  // half-thickness 0.3 + marble radius).  Fires when marble surface reaches wall face.
  var FINISH_DETECT_DOT = (_fs[0] * FINISH_NORM_X + _fs[1] * FINISH_NORM_Z) - (0.3 + MBL_RADIUS)
}

// Funnel approach direction — unit vector pointing from course start backward into the funnel,
// derived from the first spine segment so the funnel aligns with the track.
{
  const _dx = COURSE_SPINE[1][0] - COURSE_SPINE[0][0]  // 15
  const _dz = COURSE_SPINE[1][1] - COURSE_SPINE[0][1]  // -18
  const _l  = Math.sqrt(_dx * _dx + _dz * _dz)
  var FUNNEL_AP_DX = -_dx / _l   // approach X  (unit)
  var FUNNEL_AP_DZ = -_dz / _l   // approach Z  (unit)
  var FUNNEL_AP_LX = -FUNNEL_AP_DZ  // left-normal X of approach
  var FUNNEL_AP_LZ =  FUNNEL_AP_DX  // left-normal Z of approach
}

function crSample(pts, t) {
  const n   = pts.length - 1
  const seg = Math.min(Math.floor(t * n), n - 1)
  const lt  = t * n - seg
  const i0 = Math.max(0, seg - 1), i1 = seg
  const i2 = Math.min(n, seg + 1),  i3 = Math.min(n, seg + 2)
  const [p0, p1, p2, p3] = [pts[i0], pts[i1], pts[i2], pts[i3]]
  const t2 = lt * lt, t3 = t2 * lt
  return [
    0.5 * (2*p1[0] + (-p0[0]+p2[0])*lt + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * (2*p1[1] + (-p0[1]+p2[1])*lt + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ]
}

function buildCourseSamples() {
  return Array.from({ length: COURSE_N_SEGS }, (_, i) => crSample(COURSE_SPINE, i / (COURSE_N_SEGS - 1)))
}

function marblesSnapshot() {
  return {
    marbles:   marblesState.marbles.map(m => ({ ...m })),
    isOpen:    marblesState.isOpen,
    phase:     marblesState.phase,
    sessionId: marblesState.sessionId,
    winner:    marblesState.winner,
  }
}

// ─── Track segments ────────────────────────────────────────────────────────
// Each entry: [cx, cz, halfW, halfLen, rotY]  (floor boxes, Y=floor surface=0)
function buildMarblesWorld() {
  const world = new CANNON.World()
  world.gravity.set(0, -4, -10)
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = false

  const trackMat  = new CANNON.Material('mbl_track')
  const marbleMat = new CANNON.Material('mbl_marble')
  const pegMat    = new CANNON.Material('mbl_peg')
  world.addContactMaterial(new CANNON.ContactMaterial(trackMat, marbleMat, { friction: 0.4, restitution: 0.55 }))
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, marbleMat, { friction: 0.2, restitution: 0.6 }))
  world.addContactMaterial(new CANNON.ContactMaterial(pegMat, marbleMat,   { friction: 0.4, restitution: 0.95 }))

  const WALL_H  = 3    // wall half-height (total wall = 6 units tall)
  const WALL_T  = 0.3  // wall half-thickness
  const FLOOR_H = 0.5  // floor half-height

  const samples = buildCourseSamples()
  const nSegs = samples.length - 1

  // Pre-compute per-segment direction data for miter joint calculation
  const segData = []
  for (let i = 0; i < nSegs; i++) {
    const [x1, z1] = samples[i], [x2, z2] = samples[i + 1]
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.sqrt(dx * dx + dz * dz)
    segData.push({ dx, dz, len, angle: Math.atan2(dx, dz) })
  }

  // Unsigned miter — always extends segments to fill corner gaps; overlapping static bodies are harmless
  function miterExt(a, b) {
    if (a < 0 || b >= nSegs) return 0.1
    let delta = segData[b].angle - segData[a].angle
    if (delta >  Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    return Math.min(COURSE_HALF_W * Math.abs(Math.tan(delta / 2)), COURSE_HALF_W)
  }

  for (let i = 0; i < nSegs; i++) {
    const { dx, dz, len, angle } = segData[i]
    if (len < 0.001) continue
    const [x1, z1] = samples[i], [x2, z2] = samples[i + 1]
    const rawMidX = (x1 + x2) / 2, rawMidZ = (z1 + z2) / 2

    const bk = miterExt(i - 1, i), ft = miterExt(i, i + 1)
    const tot = len + bk + ft
    const sh  = (ft - bk) / 2

    const floor = new CANNON.Body({ mass: 0, material: trackMat })
    floor.addShape(new CANNON.Box(new CANNON.Vec3(COURSE_HALF_W, FLOOR_H, tot / 2)))
    floor.position.set(rawMidX + (dx / len) * sh, -FLOOR_H, rawMidZ + (dz / len) * sh)
    floor.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle)
    world.addBody(floor)

    const lw = new CANNON.Body({ mass: 0, material: trackMat })
    lw.addShape(new CANNON.Box(new CANNON.Vec3(WALL_T, WALL_H, tot / 2)))
    lw.position.set(
      rawMidX + (dx / len) * sh + (-dz / len) * (COURSE_HALF_W + WALL_T),
      WALL_H,
      rawMidZ + (dz / len) * sh + ( dx / len) * (COURSE_HALF_W + WALL_T)
    )
    lw.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle)
    world.addBody(lw)

    const rw = new CANNON.Body({ mass: 0, material: trackMat })
    rw.addShape(new CANNON.Box(new CANNON.Vec3(WALL_T, WALL_H, tot / 2)))
    rw.position.set(
      rawMidX + (dx / len) * sh + ( dz / len) * (COURSE_HALF_W + WALL_T),
      WALL_H,
      rawMidZ + (dz / len) * sh + (-dx / len) * (COURSE_HALF_W + WALL_T)
    )
    rw.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle)
    world.addBody(rw)
  }

  // Junction cylinder posts — one at each sample point along both wall edges.
  // A convex cylinder at the joint fills the wedge pocket that forms when two rotated
  // box segments meet at an angle, so marbles deflect smoothly instead of getting stuck.
  {
    const POST_R = WALL_T + 0.05
    for (let i = 0; i <= nSegs; i++) {
      const [px, pz] = samples[i]
      const si = Math.min(i, nSegs - 1)
      const { dx, dz, len } = segData[si]
      const nx = -dz / len, nz = dx / len  // left-side unit normal

      const lp = new CANNON.Body({ mass: 0, material: trackMat })
      lp.addShape(new CANNON.Cylinder(POST_R, POST_R, WALL_H * 2, 8))
      lp.position.set(px + nx * COURSE_HALF_W, WALL_H, pz + nz * COURSE_HALF_W)
      world.addBody(lp)

      const rp = new CANNON.Body({ mass: 0, material: trackMat })
      rp.addShape(new CANNON.Cylinder(POST_R, POST_R, WALL_H * 2, 8))
      rp.position.set(px - nx * COURSE_HALF_W, WALL_H, pz - nz * COURSE_HALF_W)
      world.addBody(rp)
    }
  }

  // Corner filler walls — at each concave inner junction a box oriented along the
  // angle bisector closes the triangular overlap pocket so marbles can't get trapped.
  for (let i = 1; i < nSegs; i++) {
    let delta = segData[i].angle - segData[i - 1].angle
    if (delta >  Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    if (Math.abs(delta) < 0.05) continue

    const pocketLen = Math.min(COURSE_HALF_W * Math.abs(Math.tan(delta / 2)), COURSE_HALF_W)
    if (pocketLen < 0.05) continue

    const [px, pz] = samples[i]
    const dx1 = segData[i - 1].dx / segData[i - 1].len, dz1 = segData[i - 1].dz / segData[i - 1].len
    const dx2 = segData[i].dx     / segData[i].len,     dz2 = segData[i].dz     / segData[i].len
    const bDx = dx1 + dx2, bDz = dz1 + dz2
    const bLen = Math.sqrt(bDx * bDx + bDz * bDz) || 1
    const bisAngle = Math.atan2(bDx / bLen, bDz / bLen)
    const bnx = -(bDz / bLen), bnz = bDx / bLen  // left normal of bisector

    // delta > 0 → left wall is concave inner; delta < 0 → right wall is concave inner
    const side = delta > 0 ? 1 : -1
    const cx = px + side * bnx * (COURSE_HALF_W + WALL_T)
    const cz = pz + side * bnz * (COURSE_HALF_W + WALL_T)

    const fw = new CANNON.Body({ mass: 0, material: trackMat })
    fw.addShape(new CANNON.Box(new CANNON.Vec3(WALL_T, WALL_H, pocketLen + WALL_T / 2)))
    fw.position.set(cx, WALL_H, cz)
    fw.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), bisAngle)
    world.addBody(fw)
  }

  // Funnel — V-shaped staging area oriented along the reverse of the course start direction.
  {
    const [s0x, s0z] = COURSE_SPINE[0]  // [0, 90]
    // Open-end centre point
    const fCx = s0x + FUNNEL_AP_DX * FUNNEL_LENGTH
    const fCz = s0z + FUNNEL_AP_DZ * FUNNEL_LENGTH
    // Four corners of the trapezoid
    const nLx = s0x + FUNNEL_AP_LX * COURSE_HALF_W,      nLz = s0z + FUNNEL_AP_LZ * COURSE_HALF_W
    const nRx = s0x - FUNNEL_AP_LX * COURSE_HALF_W,      nRz = s0z - FUNNEL_AP_LZ * COURSE_HALF_W
    const fLx = fCx + FUNNEL_AP_LX * FUNNEL_OPEN_HALF_W, fLz = fCz + FUNNEL_AP_LZ * FUNNEL_OPEN_HALF_W
    const fRx = fCx - FUNNEL_AP_LX * FUNNEL_OPEN_HALF_W, fRz = fCz - FUNNEL_AP_LZ * FUNNEL_OPEN_HALF_W

    // Helper — add a static wall body between two endpoint positions
    function addFunnelWall(x1, z1, x2, z2, hw) {
      const dx = x2 - x1, dz = z2 - z1
      const len = Math.sqrt(dx * dx + dz * dz)
      const body = new CANNON.Body({ mass: 0, material: trackMat })
      body.addShape(new CANNON.Box(new CANNON.Vec3(hw, WALL_H, len / 2)))
      body.position.set((x1 + x2) / 2, WALL_H, (z1 + z2) / 2)
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(dx, dz))
      world.addBody(body)
    }

    addFunnelWall(nLx, nLz, fLx, fLz, WALL_T)  // left angled wall
    addFunnelWall(nRx, nRz, fRx, fRz, WALL_T)  // right angled wall
    addFunnelWall(fLx, fLz, fRx, fRz, WALL_T)  // back wall across open end

    // Floor: wide box along the approach axis
    const fFloor = new CANNON.Body({ mass: 0, material: trackMat })
    fFloor.addShape(new CANNON.Box(new CANNON.Vec3(FUNNEL_OPEN_HALF_W, FLOOR_H, FUNNEL_LENGTH / 2)))
    fFloor.position.set(
      s0x + FUNNEL_AP_DX * FUNNEL_LENGTH / 2,
      -FLOOR_H,
      s0z + FUNNEL_AP_DZ * FUNNEL_LENGTH / 2
    )
    fFloor.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.atan2(FUNNEL_AP_DX, FUNNEL_AP_DZ))
    world.addBody(fFloor)
  }

  // End-cap wall at the finish line — solid physics body matching the visual cap
  {
    const lastIdx = samples.length - 1
    const [finX, finZ] = samples[lastIdx]
    const [prevX, prevZ] = samples[lastIdx - 1]
    const adx = finX - prevX, adz = finZ - prevZ
    const approachAngle = Math.atan2(adx, adz)
    const cap = new CANNON.Body({ mass: 0, material: trackMat })
    cap.addShape(new CANNON.Box(new CANNON.Vec3(COURSE_HALF_W + 1, WALL_H, WALL_T)))
    cap.position.set(finX, WALL_H, finZ)
    cap.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), approachAngle)
    world.addBody(cap)
  }

  // Pegs – dense spacing (every 3 samples) with randomized lateral offsets each race
  // Stagger base positions so every lane hits at least one peg, then add jitter for variety
  const PEG_BASE = [-0.8, -0.3, 0.3, 0.8, 0, -0.6, 0.6]
  for (let i = 3; i < samples.length - 5; i += 3) {
    const [px, pz] = samples[i]
    const [nx, nz] = samples[Math.min(i + 1, samples.length - 1)]
    const ddx = nx - px, ddz = nz - pz
    const dlen = Math.sqrt(ddx * ddx + ddz * ddz)
    if (dlen < 0.001) continue
    const baseOff = PEG_BASE[Math.floor(i / 3) % PEG_BASE.length]
    const jitter  = (Math.random() - 0.5) * 0.5
    const rawSide = baseOff + jitter
    // Clamp so the peg always leaves a generous gap (1.5 buffer) between
    // its surface and the wall — a marble physically cannot fit in the remaining space.
    const MAX_OFF = COURSE_HALF_W - 0.45 - MBL_RADIUS * 2 - 1.5  // 1.45
    const off     = Math.max(-MAX_OFF, Math.min(MAX_OFF, rawSide * (COURSE_HALF_W * 0.8)))
    const b = new CANNON.Body({ mass: 0, material: pegMat })
    b.addShape(new CANNON.Cylinder(0.45, 0.45, 3, 8))
    b.position.set(px + (-ddz / dlen) * off, 1.5, pz + (ddx / dlen) * off)
    world.addBody(b)
  }

  return { world, marbleMat, pegMat }
}

function getMarbleStartPositions(count) {
  const [s0x, s0z] = COURSE_SPINE[0]
  const cols = Math.min(count, 4)
  const rows = Math.ceil(count / cols)
  const slots = Array.from({ length: count }, (_, i) => {
    const row  = Math.floor(i / cols)
    const col  = i % cols
    const dist = rows > 1 ? (FUNNEL_LENGTH - 3) - row * (FUNNEL_LENGTH - 5) / (rows - 1) : FUNNEL_LENGTH / 2
    const t    = dist / FUNNEL_LENGTH
    const hw   = COURSE_HALF_W + (FUNNEL_OPEN_HALF_W - COURSE_HALF_W) * t
    const usHW = (hw - MBL_RADIUS - 0.2) * 0.9
    const side = cols > 1 ? -usHW + col * (usHW * 2) / (cols - 1) : 0
    return {
      x: s0x + FUNNEL_AP_DX * dist + FUNNEL_AP_LX * side + (Math.random() - 0.5) * 0.4,
      y: 2,
      z: s0z + FUNNEL_AP_DZ * dist + FUNNEL_AP_LZ * side + (Math.random() - 0.5) * 0.5,
    }
  })
  // Shuffle so join order gives no positional advantage
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots
}

function stopMarblesPhysics() {
  if (marblesPhysInterval)      { clearInterval(marblesPhysInterval);      marblesPhysInterval = null }
  if (marblesBroadcastInterval) { clearInterval(marblesBroadcastInterval); marblesBroadcastInterval = null }
  marblesWorld = null
  marbleBodies = []
  marblesFinished = new Set()
}

function startMarblesPhysics() {
  const { world, marbleMat } = buildMarblesWorld()
  marblesWorld = world
  marblesFinished = new Set()

  const positions = getMarbleStartPositions(marblesState.marbles.length)
  marbleBodies = marblesState.marbles.map((_, i) => {
    const body = new CANNON.Body({ mass: 1, material: marbleMat, linearDamping: 0.03, angularDamping: 0.1 })
    body.addShape(new CANNON.Sphere(MBL_RADIUS))
    body.position.set(positions[i].x, positions[i].y, positions[i].z)
    // Random lateral kick so marbles don't all follow the same initial path
    const lateralImpulse = (Math.random() - 0.5) * 5
    body.velocity.set(
      FUNNEL_AP_LX * lateralImpulse,
      0,
      FUNNEL_AP_LZ * lateralImpulse,
    )
    world.addBody(body)
    return body
  })

  const FIXED_STEP = 1 / 60
  marblesPhysInterval = setInterval(() => {
    world.step(FIXED_STEP, FIXED_STEP, 6)

    if (marblesState.phase !== 'racing') return

    // Collect all marbles that reached the finish this step using the approach-plane
    // dot-product test (see FINISH_NORM_X/Z constants).  Sort by dot descending so
    // the marble furthest past the finish wall is processed first and wins ties.
    const crossedThisStep = []
    for (let i = 0; i < marbleBodies.length; i++) {
      if (marblesFinished.has(i)) continue
      const dot = marbleBodies[i].position.x * FINISH_NORM_X + marbleBodies[i].position.z * FINISH_NORM_Z
      if (dot >= FINISH_DETECT_DOT) {
        crossedThisStep.push({ i, dot })
      }
    }
    crossedThisStep.sort((a, b) => b.dot - a.dot)

    for (const { i } of crossedThisStep) {
      marblesFinished.add(i)

      // Freeze the finished marble in place
      const body = marbleBodies[i]
      body.velocity.set(0, 0, 0)
      body.angularVelocity.set(0, 0, 0)
      body.type = CANNON.Body.STATIC
      body.updateMassProperties()

      if (marblesFinished.size === 1) {
        // First marble across = winner
        marblesState.winner = marblesState.marbles[i].username
        io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
        io.to(MARBLES_ROOM).emit('marbles:winner', { username: marblesState.winner })
      }

      if (marblesFinished.size >= marbleBodies.length) {
        marblesState.phase = 'finished'
        io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
        stopMarblesPhysics()
        return
      }
    }
  }, 1000 / 60)

  marblesBroadcastInterval = setInterval(() => {
    const positions = marbleBodies.map((body, i) => ({
      id: marblesState.marbles[i].id,
      x:  +body.position.x.toFixed(3),
      y:  +body.position.y.toFixed(3),
      z:  +body.position.z.toFixed(3),
    }))
    io.to(MARBLES_ROOM).emit('marbles:tick', { positions })
  }, 1000 / 20)
}

/* ── Monster Battles (1v1) ───────────────────────────────── */
const monsterBattles = new Map();      // battleId -> { state, recordId, actions, timers }
const monsterBattleByUser = new Map(); // userId -> battleId
const MONSTER_ACTION_TIMEOUT_MS = 60_000
const SWEEP_INTERVAL_MS = 2 * 60 * 1000
const PVP_ROOM_IDLE_MS = 10 * 60 * 1000
const PVP_MATCH_IDLE_MS = 5 * 60 * 1000
const PVE_MATCH_IDLE_MS = 5 * 60 * 1000
const MONSTER_BATTLE_IDLE_MS = 5 * 60 * 1000
const touchActivity = (obj) => {
  if (obj) obj.lastActivity = Date.now()
}

const isIdle = (obj, now, maxMs) => (now - (obj?.lastActivity || 0)) > maxMs


const ASSET_BASE =
  process.env.ASSET_BASE ||
  (process.env.NODE_ENV === 'production'
    ? 'https://www.cartoonreorbit.com'
    : 'http://localhost:3000');


const withAsset = p => {
  if (!p) return null;

  // Absolute URL → swap origin
  if (p.includes('http')) {
    try {
      const url = new URL(p);
      return `${ASSET_BASE}${url.pathname}${url.search}${url.hash}`;
    } catch {
      // If it's a weird non-URL string, fall back safely
      return p.replace(/^https?:\/\/[^/]+/, ASSET_BASE);
    }
  }

  // Relative path
  return `${ASSET_BASE}${p}`;
};

const sid = v => String(v)

const battlePublicState = (battle) => {
  const { state, actions } = battle
  const p1 = state.participants.player1
  const p2 = state.participants.player2
  return {
    battleId: state.id,
    turnNumber: state.turnNumber,
    status: state.status,
    endReason: state.endReason,
    winnerKey: state.winnerKey,
    participants: {
      player1: {
        userId: p1.userId,
        monsterId: p1.monsterId,
        name: p1.name || null,
        currentHp: p1.currentHp,
        maxHealth: p1.maxHealth,
        attack: p1.attack,
        defense: p1.defense,
        blocksRemaining: p1.blocksRemaining,
        isAi: p1.isAi,
        sprites: p1.sprites || null
      },
      player2: {
        userId: p2.userId,
        monsterId: p2.monsterId,
        name: p2.name || null,
        currentHp: p2.currentHp,
        maxHealth: p2.maxHealth,
        attack: p2.attack,
        defense: p2.defense,
        blocksRemaining: p2.blocksRemaining,
        isAi: p2.isAi,
        sprites: p2.sprites || null
      }
    },
    actionsSubmitted: {
      player1: Boolean(actions.player1),
      player2: Boolean(actions.player2)
    }
  }
}

const monsterPlayerKeyForUser = (battle, userId) => {
  const p1 = battle.state.participants.player1
  const p2 = battle.state.participants.player2
  if (p1.userId && String(p1.userId) === String(userId)) return 'player1'
  if (p2.userId && String(p2.userId) === String(userId)) return 'player2'
  return null
}

const hasPendingMonsterAction = (battle, playerKey) => {
  if (!battle || battle.state.status !== 'active') return false
  const participant = battle.state.participants?.[playerKey]
  if (!participant || participant.isAi) return false
  return !battle.actions?.[playerKey]
}

const ensureMonsterActionDeadline = (battle, playerKey) => {
  if (!battle.deadlines) battle.deadlines = { player1: null, player2: null }
  if (!battle.deadlines[playerKey]) {
    battle.deadlines[playerKey] = Date.now() + MONSTER_ACTION_TIMEOUT_MS
  }
  return battle.deadlines[playerKey]
}

const getMonsterActionRemainingMs = (battle, playerKey) => {
  const deadline = battle.deadlines?.[playerKey]
  if (!deadline) return MONSTER_ACTION_TIMEOUT_MS
  return Math.max(0, Number(deadline) - Date.now())
}

const scheduleMonsterActionTimeout = (io, battle, playerKey, { skipIfExisting = false } = {}) => {
  if (!hasPendingMonsterAction(battle, playerKey)) return
  ensureMonsterActionDeadline(battle, playerKey)
  if (skipIfExisting && battle.timers[playerKey]) return
  if (battle.timers[playerKey]) clearTimeout(battle.timers[playerKey])
  const delay = getMonsterActionRemainingMs(battle, playerKey)
  battle.timers[playerKey] = setTimeout(() => {
    handleMonsterForfeit(io, battle, playerKey, 'TIMEOUT').catch(err => {
      console.error('Failed to forfeit monster battle on timeout:', err)
    })
  }, delay)
}

const clearMonsterTimers = (battle) => {
  if (battle.timers.player1) clearTimeout(battle.timers.player1)
  if (battle.timers.player2) clearTimeout(battle.timers.player2)
  battle.timers.player1 = null
  battle.timers.player2 = null
}

const clearMonsterDisconnectTimer = (battle, playerKey) => {
  if (!battle?.disconnectTimers?.[playerKey]) return
  console.log('[battle:disconnect] clear', battle.state.id, playerKey)
  clearTimeout(battle.disconnectTimers[playerKey])
  battle.disconnectTimers[playerKey] = null
}

const scheduleMonsterDisconnect = (io, battle, playerKey) => {
  if (!hasPendingMonsterAction(battle, playerKey)) return
  if (!battle.disconnectTimers) battle.disconnectTimers = { player1: null, player2: null }
  if (battle.disconnectTimers[playerKey]) return
  console.log('[battle:disconnect] schedule', battle.state.id, playerKey)
  ensureMonsterActionDeadline(battle, playerKey)
  if (battle.timers[playerKey]) {
    clearTimeout(battle.timers[playerKey])
    battle.timers[playerKey] = null
  }
  const delay = getMonsterActionRemainingMs(battle, playerKey)
  battle.disconnectTimers[playerKey] = setTimeout(() => {
    console.log('[battle:disconnect] firing', battle.state.id, playerKey)
    handleMonsterForfeit(io, battle, playerKey, 'DISCONNECT').catch(err => {
      console.error('Failed to forfeit monster battle on disconnect:', err)
    })
  }, delay)
}

const scheduleMonsterTimeouts = (io, battle) => {
  clearMonsterTimers(battle)
  const now = Date.now()
  battle.deadlines = {
    player1: battle.state.participants.player1.isAi ? null : now + MONSTER_ACTION_TIMEOUT_MS,
    player2: battle.state.participants.player2.isAi ? null : now + MONSTER_ACTION_TIMEOUT_MS
  }

  scheduleMonsterActionTimeout(io, battle, 'player1')
  scheduleMonsterActionTimeout(io, battle, 'player2')
}

// Rebuild in-memory action timers for a battle loaded from Redis on boot.
// Uses stored deadline timestamps to calculate remaining time.
const reconstructBattleTimers = (io, battle) => {
  const now = Date.now()
  for (const playerKey of ['player1', 'player2']) {
    const participant = battle.state?.participants?.[playerKey]
    if (!participant || participant.isAi) continue
    if (battle.actions?.[playerKey]) continue  // action already submitted
    const deadline = battle.deadlines?.[playerKey]
    if (!deadline) continue
    const remaining = Math.max(1000, deadline - now)
    battle.timers[playerKey] = setTimeout(() => {
      handleMonsterForfeit(io, battle, playerKey, 'TIMEOUT').catch(err => {
        console.error('[battle] reconstructed timer forfeit failed:', err)
      })
    }, remaining)
  }
}

const persistMonsterBattleState = async (battle) => {
  const p1 = battle.state.participants.player1
  const p2 = battle.state.participants.player2
  const winnerKey = battle.state.winnerKey
  const winner = winnerKey ? battle.state.participants[winnerKey] : null
  await db.monsterBattle.update({
    where: { id: battle.recordId },
    data: {
      turnLog: battle.state.turnLog,
      player1FinalHp: p1.currentHp,
      player2FinalHp: p2.currentHp,
      winnerUserId: winner?.userId ?? null,
      winnerIsAi: Boolean(winner?.isAi),
      endReason: battle.state.endReason ?? null,
      endedAt: battle.state.status === 'finished' ? new Date() : null
    }
  })
}

const cleanupMonsterBattle = (battle) => {
  clearMonsterTimers(battle)
  clearMonsterDisconnectTimer(battle, 'player1')
  clearMonsterDisconnectTimer(battle, 'player2')
  const p1Id = battle.state.participants.player1.userId
  const p2Id = battle.state.participants.player2.userId
  if (p1Id) monsterBattleByUser.delete(String(p1Id))
  if (p2Id) monsterBattleByUser.delete(String(p2Id))
  monsterBattles.delete(battle.state.id)
  syncDeleteBattle(battle.state.id, [p1Id, p2Id].filter(Boolean).map(String))
}

const finishMonsterBattle = async (io, battle, resultPayload) => {
  await persistMonsterBattleState(battle)
  const p1 = battle.state.participants.player1
  const p2 = battle.state.participants.player2
  try {
    if (p1?.userId && p1?.monsterId) {
      await db.userMonster.update({
        where: { id: p1.monsterId },
        data: { hp: Math.max(0, Number(p1.currentHp || 0)) }
      })
    }
    if (p2?.userId && p2?.monsterId && !p2.isAi) {
      await db.userMonster.update({
        where: { id: p2.monsterId },
        data: { hp: Math.max(0, Number(p2.currentHp || 0)) }
      })
    }
  } catch (e) {
    console.error('Failed to persist battle HP to UserMonster:', e)
  }
  io.to(battle.state.id).emit('battle:finished', {
    ...resultPayload,
    turnLog: battle.state.turnLog
  })
  cleanupMonsterBattle(battle)
}

async function handleMonsterForfeit(io, battle, loserKey, reason) {
  if (!battle || battle.state.status !== 'active') return
  clearMonsterTimers(battle)
  const { state: nextState, turnResult } = applyForfeit(battle.state, loserKey, reason)
  battle.state = nextState
  battle.state.turnLog.push({
    turnNumber: nextState.turnNumber,
    actions: {},
    firstActor: null,
    dodge: {},
    damage: {},
    hpAfter: turnResult.hpAfter,
    blocksRemaining: turnResult.blocksRemaining,
    timestamps: { endedAt: new Date().toISOString() },
    endReason: reason,
    winnerKey: turnResult.winnerKey
  })
  if (battle.state.turnLog.length > 200) battle.state.turnLog.shift()
  const finalState = battlePublicState(battle)
  await finishMonsterBattle(io, battle, {
    battleId: battle.state.id,
    winner: turnResult.winnerKey ? battle.state.participants[turnResult.winnerKey] : null,
    endReason: reason,
    finalState
  })
}

const resolveMonsterTurn = async (io, battle) => {
  clearMonsterTimers(battle)
  const resolvedTurn = battle.state.turnNumber
  io.to(battle.state.id).emit('battle:turnResolving', {
    battleId: battle.state.id,
    turnNumber: resolvedTurn,
    actionsLocked: true
  })

  const { state: nextState, turnResult } = resolveTurn(battle.state, battle.actions)
  battle.state = nextState
  battle.state.turnLog.push({
    turnNumber: resolvedTurn,
    actions: { ...battle.actions },
    firstActor: turnResult.firstActor,
    dodge: turnResult.dodge,
    damage: turnResult.damage,
    hpAfter: turnResult.hpAfter,
    blocksRemaining: turnResult.blocksRemaining,
    timestamps: { resolvedAt: new Date().toISOString() },
    endReason: turnResult.endReason ?? null,
    winnerKey: turnResult.winnerKey ?? null
  })
  if (battle.state.turnLog.length > 200) battle.state.turnLog.shift()

  const updatedState = battlePublicState(battle)
  io.to(battle.state.id).emit('battle:turnResolved', {
    battleId: battle.state.id,
    turnNumber: resolvedTurn,
    actions: { ...battle.actions },
    firstActor: turnResult.firstActor,
    results: turnResult,
    updatedState
  })

  if (battle.state.status === 'finished') {
    await finishMonsterBattle(io, battle, {
      battleId: battle.state.id,
      winner: turnResult.winnerKey ? battle.state.participants[turnResult.winnerKey] : null,
      endReason: battle.state.endReason,
      finalState: updatedState
    })
    return
  }

  await persistMonsterBattleState(battle)

  battle.state.turnNumber += 1
  battle.actions = { player1: null, player2: null }
  scheduleMonsterTimeouts(io, battle)
  syncBattle(battle.state.id, battle)
  io.to(battle.state.id).emit('battle:state', battlePublicState(battle))
}

const getUserMonsterBattleData = async (monsterId, userId) => {
  const monster = await db.userMonster.findFirst({
    where: { id: String(monsterId), userId: String(userId) },
    select: {
      id: true,
      name: true,
      customName: true,
      hp: true,
      maxHealth: true,
      atk: true,
      def: true,
      configId: true,
      speciesIndex: true
    }
  })
  if (!monster) return null
  const species = await db.speciesBaseStats.findUnique({
    where: { configId_speciesIndex: { configId: monster.configId, speciesIndex: monster.speciesIndex } },
    select: {
      name: true,
      walkingImagePath: true,
      standingStillImagePath: true,
      jumpingImagePath: true
    }
  })
  return {
    id: monster.id,
    name: monster.customName || species?.name || monster.name || 'Monster',
    stats: {
      hp: monster.hp,
      maxHealth: monster.maxHealth,
      atk: monster.atk,
      def: monster.def
    },
    sprites: {
      walk: species?.walkingImagePath || null,
      idle: species?.standingStillImagePath || null,
      jump: species?.jumpingImagePath || null
    }
  }
}

const selectAiMonster = async () => {
  const total = await db.aiMonster.count()
  if (!total) return null
  const skip = Math.floor(Math.random() * total)
  const [row] = await db.aiMonster.findMany({
    skip,
    take: 1,
    select: {
      id: true,
      name: true,
      rarity: true,
      baseHp: true,
      baseAtk: true,
      baseDef: true,
      walkingImagePath: true,
      standingStillImagePath: true,
      jumpingImagePath: true
    }
  })
  if (!row) return null
  const config = await db.barcodeGameConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { monsterStatVariancePct: true }
  })
  const variancePct = clampVariancePct(config?.monsterStatVariancePct)
  const { rolled } = rollInstanceStats({
    hp: row.baseHp,
    atk: row.baseAtk,
    def: row.baseDef
  }, variancePct)
  return {
    id: row.id,
    name: row.name,
    stats: {
      hp: rolled.hp,
      maxHealth: rolled.hp,
      atk: rolled.atk,
      def: rolled.def
    },
    sprites: {
      walk: row.walkingImagePath || null,
      idle: row.standingStillImagePath || null,
      jump: row.jumpingImagePath || null
    }
  }
}

/* ── Clash PvE: Select → Reveal → Setup ───────────────────── */
// Fisher–Yates shuffle helper
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// --- Stake settlement helper: pays out based on outcome, safely once ---
async function settleStakes(recordId, { outcome, winnerUserId, whoLeftUserId } = {}) {
  return db.$transaction(async tx => {
    const rec = await tx.clashGame.findUnique({
      where: { id: recordId },
      select: {
        player1UserId: true, player2UserId: true,
        player1Points: true, player2Points: true
      }
    })
    if (!rec) return { payouts: {} }

    const p1 = rec.player1UserId
    const p2 = rec.player2UserId
    const s1 = rec.player1Points || 0
    const s2 = rec.player2Points || 0
    const pot = s1 + s2

    // If already settled (stakes zeroed), do nothing.
    if (pot === 0 && s1 === 0 && s2 === 0) return { payouts: {} }

    const payouts = {}

    if (outcome === 'tie') {
      if (p1 && s1 > 0) payouts[p1] = (payouts[p1] || 0) + s1
      if (p2 && s2 > 0) payouts[p2] = (payouts[p2] || 0) + s2
    } else {
      // Winner path: either explicit winnerUserId or survivor on disconnect
      let winner = winnerUserId
      if (!winner && whoLeftUserId) {
        winner = whoLeftUserId === p1 ? p2 : p1
      }
      if (winner && pot > 0) payouts[winner] = (payouts[winner] || 0) + pot
    }

    // credit users & log
    for (const [uid, amt] of Object.entries(payouts)) {
      if (amt <= 0) continue
      const updated = await tx.userPoints.upsert({
        where: { userId: uid },
        create: { userId: uid, points: amt },
        update: { points: { increment: amt } }
      })
      await tx.pointsLog.create({
        data: {
          userId: uid,
          points: amt,
          total:  updated.points,
          method: 'Game - gToons Clash',
          direction: 'increase'
        }
      })
    }

    return { payouts }
  })
}

async function awardClashWinPoints(userId) {
  let toGive = 0
  try {
    const clashConfig  = await db.gameConfig.findUnique({
      where: { gameName: 'Clash' },
      select: { pointsPerWin: true }
    })
    const globalConfig = await db.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { dailyPointLimit: true }
    })
    if (!clashConfig || !globalConfig) return 0

    const { pointsPerWin }         = clashConfig
    const { dailyPointLimit: cap } = globalConfig

    const nowCST    = DateTime.now().setZone('America/Chicago')
    const cutoffCST = nowCST.hour >= 20
      ? nowCST.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
      : nowCST.minus({ days: 1 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
    const cutoffUTC = cutoffCST.toUTC().toJSDate()

    toGive = await db.$transaction(async (tx) => {
      const agg = await tx.gamePointLog.aggregate({
        where: { userId, createdAt: { gte: cutoffUTC } },
        _sum:  { points: true }
      })
      const used = agg._sum.points || 0
      const remaining = Math.max(0, cap - used)
      const give = Math.min(pointsPerWin, remaining)
      if (give > 0) {
        await tx.gamePointLog.create({ data: { userId, points: give } })
        const updated = await tx.userPoints.upsert({
          where:  { userId },
          create: { userId, points: give },
          update: { points: { increment: give } }
        })
        await tx.pointsLog.create({
          data: { userId, points: give, total: updated.points, method: 'Game - gToons Clash', direction: 'increase' }
        })
      }
      return give
    })
  } catch (e) {
    console.error('Failed to award PvP Clash points:', e)
  }
  return toGive
}

function aiChooseSelections(battle) {
  const { aiEnergy, aiHand } = battle.state
  const playable = aiHand.filter(c => c.cost <= aiEnergy)
  if (!playable.length) return []
  // pick highest-cost card, random lane
  const card = playable.sort((a, b) => b.cost - a.cost)[0]
  const laneIndex = Math.floor(Math.random() * 3)
  return [{ cardId: card.id, laneIndex }]
}

const pveMatches = new Map()

// Set to true during graceful shutdown so disconnect handlers don't prematurely
// end active games — the state has already been saved to Redis.
let isShuttingDown = false

// Fire-and-forget Redis sync helpers for clash matches
function syncPveMatch(gameId, match) {
  redisState.setPveMatch(gameId, match).catch(err =>
    console.error('[Redis] Failed to sync PvE match', gameId, err)
  )
}
function syncPvpMatch(roomId, match) {
  redisState.setPvpMatch(roomId, match).catch(err =>
    console.error('[Redis] Failed to sync PvP match', roomId, err)
  )
}

function broadcastPhase(io, match) {
  io.to(match.id).emit('phaseUpdate', match.battle.publicState())
}

function clampSelectionsToLaneCap(state, selections, side, cap = 4) {
  if (!Array.isArray(selections)) return []
  const counts = state.lanes.map(l => side === 'player' ? l.player.length : l.ai.length)
  const out = []
  for (const sel of selections) {
    const i = sel.laneIndex
    if (Number.isInteger(i) && i >= 0 && i < counts.length && counts[i] < cap) {
      out.push(sel)
      counts[i]++
    }
  }
  return out
}

async function endMatch(io, match, result) {
  const { winner, playerLanesWon, aiLanesWon } = result;
  let toGive = 0;

  if (winner === 'player') {
    try {
      const userId = match.playerUserId;

      // 1) Load Clash config (pointsPerWin)
      const clashConfig = await db.gameConfig.findUnique({
        where: { gameName: 'Clash' },
        select: { pointsPerWin: true }
      });

      // 2) Load the singleton global cap
      const globalConfig = await db.globalGameConfig.findUnique({
        where: { id: 'singleton' },
        select: { dailyPointLimit: true }
      });

      if (clashConfig && globalConfig) {
        const { pointsPerWin }         = clashConfig;
        const { dailyPointLimit: cap } = globalConfig;

        const nowCST    = DateTime.now().setZone('America/Chicago');
        const cutoffCST = nowCST.hour >= 20
          ? nowCST.set({ hour: 20, minute: 0, second: 0, millisecond: 0 })
          : nowCST.minus({ days: 1 }).set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
        const cutoffUTC = cutoffCST.toUTC().toJSDate();

        // 6-8) Sum cap usage and award atomically to prevent TOCTOU races
        // where two concurrent match completions both pass the cap check.
        toGive = await db.$transaction(async (tx) => {
          const agg = await tx.gamePointLog.aggregate({
            where: { userId, createdAt: { gte: cutoffUTC } },
            _sum: { points: true }
          });
          const usedSinceCutoff = agg._sum.points || 0;
          const remaining = Math.max(0, cap - usedSinceCutoff);
          const give = Math.min(pointsPerWin, remaining);
          if (give > 0) {
            await tx.gamePointLog.create({ data: { userId, points: give } });
            const updated = await tx.userPoints.upsert({
              where: { userId },
              create: { userId, points: give },
              update: { points: { increment: give } }
            });
            await tx.pointsLog.create({
              data: { userId, points: give, total: updated.points, method: 'Game - gToons Clash', direction: 'increase' }
            });
          }
          return give;
        });
      }
    } catch (err) {
      console.error('Failed to award Clash points:', err);
    }
  }

  // 9) Mark the game record ended
  await db.clashGame.update({
    where: { id: match.recordId },
    data: {
      endedAt:      new Date(),
      winnerUserId: winner === 'player' ? match.playerUserId : null,
      outcome:      winner
    }
  });

  // 10) Broadcast the end‐of‐game summary
  io.to(match.id).emit('gameEnd', {
    winner,
    playerLanesWon,
    aiLanesWon,
    pointsAwarded: toGive
  });

  clearInterval(match.timer);
  pveMatches.delete(match.id);
  redisState.delPveMatch(match.id).catch(() => {})
}


function startSelectTimer(io, match) {
  match.selectDeadline = Date.now() + 60_000
  if (match.timer) clearInterval(match.timer)
  match.timer = setInterval(() => {
    const now = Date.now()
    // Player didn't submit before the deadline — they forfeit, AI wins
    if (now >= match.selectDeadline) {
      clearInterval(match.timer)
      match.timer = null
      endMatch(io, match, { winner: 'ai', playerLanesWon: 0, aiLanesWon: 0 })
      return
    }
    match.battle.tick(now)
    broadcastPhase(io, match)
    if (match.battle.state.phase === 'gameEnd') {
      endMatch(io, match, match.battle.state.result)
    }
  }, 1000)
}

const clone = o => JSON.parse(JSON.stringify(o));

function viewForUser(match, uid, baseState = null) {
  // engine uses 'player' (owner) and 'ai' (joiner). We remap so
  // each client always sees themselves as "player".
  const engineSide = match.userSide?.[uid]; // 'player' or 'ai'
  const raw = clone(baseState || match.battle.state);

  if (engineSide === 'player') {
    // Hide opponent hand/deck
    raw.aiHand = undefined;
    raw.aiDeck = undefined;
    return raw;
  }

  // engineSide === 'ai'  -> this is PLAYER 2. Swap fields so they see "me" as player.
  [raw.playerEnergy, raw.aiEnergy] = [raw.aiEnergy, raw.playerEnergy];
  [raw.playerHand,   raw.aiHand  ] = [raw.aiHand,   raw.playerHand  ];
  [raw.playerDeck,   raw.aiDeck  ] = [raw.aiDeck,   raw.playerDeck  ];
  raw.lanes.forEach(l => { [l.player, l.ai] = [l.ai, l.player]; });

  // Flip priority wording so UI texts ("You attack first") stay correct.
  if (raw.priority === 'player') raw.priority = 'ai';
  else if (raw.priority === 'ai') raw.priority = 'player';

  // Now hide opponent (which is 'ai' after swap)
  raw.aiHand = undefined;
  raw.aiDeck = undefined;
  return raw;
}

async function emitStateToRoom(io, roomId, match, build) {
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    const uid = s.data.userId;
    s.emit('phaseUpdate', build(uid));
  }
}

function roomSize(io, roomId) {
  const set = io.sockets.adapter.rooms.get(roomId)
  return set ? set.size : 0
}

async function handleClashLeave(io, { roomId, userId, leavingSocketId }) {
  if (!roomId) return

  // If there is an active PvP match in this room, end it as incomplete.
  const match = pvpMatches.get(roomId)
  if (match) {
    // compute “future” size after this socket leaves
    let size = roomSize(io, roomId)
    const set = io.sockets.adapter.rooms.get(roomId)
    if (leavingSocketId && set && set.has(leavingSocketId)) size -= 1

    if (match.timer) clearInterval(match.timer)

    // Figure out survivor/winner for stake payout
    const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
    const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;

    // Mark DB and settle stakes to survivor
    let stakePayouts = {}
    try {
      await db.clashGame.update({
        where: { id: match.recordId },
        data: {
          endedAt:       new Date(),
          outcome:       'incomplete',
          winnerUserId:  null,
          whoLeftUserId: userId || null
        }
      })

      const { payouts } = await settleStakes(match.recordId, {
        outcome: 'win',
        winnerUserId: null,
        whoLeftUserId: userId || null
      })
      stakePayouts = payouts || {}
    } catch (e) {
      console.error('Failed to mark PvP game incomplete / settle stakes:', e)
    }

    // Notify remaining sockets with individualized payout amount
    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.emit('gameEnd', {
        winner: 'incomplete',
        playerLanesWon: 0,
        aiLanesWon: 0,
        reason: 'opponent_disconnect',
        pointsAwarded: 0,
        // 👇 NEW
        stakeAwarded: Number(stakePayouts[s.data.userId] || 0)
      })
    }

    // cleanup
    pvpMatches.delete(roomId)
    redisState.delPvpMatch(roomId).catch(() => {})
    io.emit('roomRemoved', { id: roomId })
    return
  }

  // ── Otherwise handle *lobby* rooms (unchanged logic) ──
  const lobby = pvpRooms.get(roomId)
  if (lobby) {
    if (userId) {
      const uid = String(userId)
      lobby.players = lobby.players.filter(id => id !== uid)
      if (lobby.decks) delete lobby.decks[uid]
      if (lobby.deckSnapshots) delete lobby.deckSnapshots[uid]
      if (lobby.ready) delete lobby.ready[uid]
      if (lobby.usernames) delete lobby.usernames[uid]
    }

    // recompute future size after this socket leaves
    let size = roomSize(io, roomId)
    const set = io.sockets.adapter.rooms.get(roomId)
    if (leavingSocketId && set && set.has(leavingSocketId)) size -= 1

    if (size <= 0) {
      pvpRooms.delete(roomId)
      syncDeletePvpRoom(roomId)
      io.emit('roomRemoved', { id: roomId })
    } else if (lobby.players.length === 1) {
      const u = await db.user.findUnique({
        where: { id: lobby.players[0] },
        select: { username: true }
      })
      syncPvpRoom(roomId, lobby)
      io.emit('roomCreated', {
        id: roomId,
        owner: u?.username || 'Unknown',
        points: lobby.stakePoints ?? 0
      })
    }
  }
}

function lobbySnapshot(room) {
  const [p1, p2] = room.players
  return {
    players: room.players,
    usernames: room.usernames || {},
    points: room.stakePoints || 0,
    haveDeck: {
      [p1]: !!room.decks?.[p1],
      [p2]: !!room.decks?.[p2],
    },
    ready: room.ready || {}
  }
}

function buildDeckSnapshotFromCards(cards = [], meta = {}) {
  if (!Array.isArray(cards) || !cards.length) return null
  const counts = new Map()
  for (const raw of cards) {
    const c = raw?.ctoon ?? raw
    if (!c?.id) continue
    const existing = counts.get(c.id)
    if (existing) {
      existing.quantity += 1
      continue
    }
    counts.set(c.id, {
      ctoonId: c.id,
      name: c.name || null,
      gtoonType: c.gtoonType || null,
      cost: Number.isFinite(c.cost) ? c.cost : null,
      power: Number.isFinite(c.power) ? c.power : null,
      quantity: 1
    })
  }
  const list = Array.from(counts.values())
    .sort((a, b) => (b.quantity - a.quantity) || String(a.name || '').localeCompare(String(b.name || '')))
  return {
    deckId: meta.deckId || null,
    deckName: meta.deckName || null,
    totalCards: cards.length,
    cards: list
  }
}

function buildDeckSnapshot(deck) {
  if (!deck) return null
  return buildDeckSnapshotFromCards(deck.cards || [], { deckId: deck.id, deckName: deck.name })
}

async function startPvpMatch(roomId) {
  const room = pvpRooms.get(roomId)
  if (!room || pvpMatches.has(roomId)) return
  const [p1, p2] = room.players
  if (!room.decks?.[p1] || !room.decks?.[p2]) return
  if (!room.ready?.[p1] || !room.ready?.[p2]) return
  const stake = Math.max(0, Math.floor(Number(room.stakePoints || 0)))
  const deckSnap1 = room.deckSnapshots?.[p1] || buildDeckSnapshotFromCards(room.decks?.[p1] || [])
  const deckSnap2 = room.deckSnapshots?.[p2] || buildDeckSnapshotFromCards(room.decks?.[p2] || [])
  const startedAt = new Date()

  const battleId = randomUUID()
  const battle = createBattle({
    playerDeck: room.decks[p1],
    aiDeck:     room.decks[p2],   // 2nd player as opponent
    battleId,
    lanes: LANES
  })

  // create the DB record *now* (game really starts here)
  let record
  try {
    record = await db.$transaction(async tx => {
      // Ensure UserPoints rows exist
      await tx.userPoints.upsert({ where: { userId: p1 }, create: { userId: p1, points: 0 }, update: {} })
      await tx.userPoints.upsert({ where: { userId: p2 }, create: { userId: p2, points: 0 }, update: {} })

      // Load balances now that rows exist
      const a = await tx.userPoints.findUnique({ where: { userId: p1 } })
      const b = await tx.userPoints.findUnique({ where: { userId: p2 } })

      if ((a?.points ?? 0) < stake || (b?.points ?? 0) < stake) {
        throw new Error('INSUFFICIENT_STAKE_BALANCE')
      }

      // Debit both (only if stake > 0)
      let aAfter = a, bAfter = b
      if (stake > 0) {
        aAfter = await tx.userPoints.update({
          where: { userId: p1 },
          data:  { points: { decrement: stake } }
        })
        await tx.pointsLog.create({
          data: { userId: p1, points: stake, total: aAfter.points, method: 'Game - gToons Clash', direction: 'decrease' }
        })

        bAfter = await tx.userPoints.update({
          where: { userId: p2 },
          data:  { points: { decrement: stake } }
        })
        await tx.pointsLog.create({
          data: { userId: p2, points: stake, total: bAfter.points, method: 'Game - gToons Clash', direction: 'decrease' }
        })
      }

      const tournamentMatch = await tx.gtoonTournamentMatch.findFirst({
        where: {
          lockedAt: null,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          pairedAt: { lte: startedAt },
          OR: [
            { playerAUserId: p1, playerBUserId: p2 },
            { playerAUserId: p2, playerBUserId: p1 }
          ]
        }
      })

      // Create the ClashGame with the stake on both sides
      const rec = await tx.clashGame.create({
        data: {
          player1UserId: p1,
          player2UserId: p2,
          player1Points: stake,     // 👈 NEW
          player2Points: stake,     // 👈 NEW
          player1DeckSnapshot: deckSnap1,
          player2DeckSnapshot: deckSnap2,
          isTournament: Boolean(tournamentMatch),
          startedAt
        }
      })
      return rec
    })
  } catch (err) {
    if (String(err?.message) === 'INSUFFICIENT_STAKE_BALANCE') {
      // Notify room that the match cannot start due to stake issues
      io.to(roomId).emit('pvpStakeError', { message: 'One or both players lack enough points to stake.' })
      // Return the room to “waiting” state if needed
      // (Nothing debited; lobby stays intact.)
      return
    }
    console.error('Failed to create staked ClashGame:', err)
    io.to(roomId).emit('pvpStakeError', { message: 'Failed to initialize staked match.' })
    return
  }

  pvpMatches.set(roomId, {
    battle,
    recordId: record.id,
    // map userId -> battle side ("player" is owner, "ai" is joiner)
    userSide: { [p1]: 'player', [p2]: 'ai' },
    pending:  { player: null, ai: null },
    confirmed:{ player: false, ai: false },
    timer: null,
    lastActivity: Date.now()
  })
  pvpRooms.delete(roomId); // no longer a lobby entity
  syncDeletePvpRoom(roomId)  // remove lobby entry from Redis now that match is active
  syncPvpMatch(roomId, pvpMatches.get(roomId))

  (async () => {
    const match = pvpMatches.get(roomId);
    const sockets = await io.in(roomId).fetchSockets();
    for (const s of sockets) {
      s.emit('gameStart', viewForUser(match, s.data.userId));
    }
  })();
  startPvpTimer(io, roomId)
}

function startPvpTimer(io, roomId) {
  const match = pvpMatches.get(roomId);
  if (!match) return;

  match.selectDeadline = Date.now() + 60_000;
  if (match.timer) clearInterval(match.timer);

  match.timer = setInterval(async () => {
    const now = Date.now();

    // ----- HARD TIMEOUT ON SELECT -----
    if (match.battle.state.phase === 'select' &&
        match.selectDeadline &&
        now >= match.selectDeadline) {

      const pConf = !!match.confirmed.player;
      const aConf = !!match.confirmed.ai;

      // Stop ticking and close the room no matter what.
      clearInterval(match.timer);
      match.timer = null;

      if (!pConf && !aConf) {
        // Case A: nobody confirmed → INCOMPLETE
        try {
          await db.clashGame.update({
            where: { id: match.recordId },
            data: {
              endedAt:      new Date(),
              outcome:      'incomplete',
              winnerUserId: null
            }
          });
        } catch (e) {
          console.error('Failed to mark PvP timeout incomplete:', e);
        }

        const sockets = await io.in(roomId).fetchSockets();
        for (const s of sockets) {
          s.emit('gameEnd', {
            winner: 'incomplete',
            playerLanesWon: 0,
            aiLanesWon:     0,
            reason:          'turn_timeout',
            pointsAwarded:   0
          });
        }
        pvpMatches.delete(roomId);
        redisState.delPvpMatch(roomId).catch(() => {})
        return;
      }

      // Case B: exactly one confirmed → that side wins
      const winnerSide = pConf ? 'player' : 'ai';
      const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
      const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;
      const winnerUserId = winnerSide === 'player' ? p1Id : p2Id;

      let awarded = 0;
      let stakePayouts = {};
      try {
        await db.clashGame.update({
          where: { id: match.recordId },
          data: {
            endedAt:      new Date(),
            winnerUserId: winnerUserId,
            outcome:      'player'       // keep your outcome mapping as-is
          }
        });
        if (winnerUserId) {
          awarded = await awardClashWinPoints(winnerUserId);
        }
        // 👇 NEW: settle the pot for the winner
        const { payouts } = await settleStakes(match.recordId, {
          outcome: 'win',
          winnerUserId
        });
        stakePayouts = payouts || {};
      } catch (e) {
        console.error('Failed to close PvP on timeout win:', e);
      }

      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const mine = match.userSide?.[s.data.userId] || 'player';
        const winner =
          winnerSide === 'player'
            ? (mine === 'player' ? 'player' : 'ai')
            : (mine === 'player' ? 'ai' : 'player');

        s.emit('gameEnd', {
          winner,
          playerLanesWon: 0,
          aiLanesWon:     0,
          reason:         'turn_timeout',
          pointsAwarded:  (s.data.userId === winnerUserId ? awarded : 0),
          // 👇 NEW: amount of stake they personally received
          stakeAwarded:   Number(stakePayouts[s.data.userId] || 0)
        });
      }

      pvpMatches.delete(roomId);
      redisState.delPvpMatch(roomId).catch(() => {})
      return;
    }
    // -----------------------------------

    // Freeze engine if one side has confirmed and we’re waiting on the other
    const waitingOnOther =
      match.battle.state.phase === 'select' &&
      (match.confirmed.player || match.confirmed.ai) &&
      !(match.confirmed.player && match.confirmed.ai);

    if (!waitingOnOther) {
      match.battle.tick(now);
    }

    const raw = clone(match.battle.state);

    await emitStateToRoom(io, roomId, match, uid => {
      const snap = viewForUser(match, uid, raw);
      if (snap.phase === 'select' && !snap.selectEndsAt && match.selectDeadline) {
        snap.selectEndsAt = match.selectDeadline;
      }
      return snap;
    });

    if (raw.phase === 'gameEnd') {
      clearInterval(match.timer);
      match.timer = null;

      const p1Id = Object.entries(match.userSide).find(([, side]) => side === 'player')?.[0] || null;
      const p2Id = Object.entries(match.userSide).find(([, side]) => side === 'ai')?.[0] || null;
      const outcome = raw.winner; // 'player' | 'ai' | 'tie'
      const winnerUserId = outcome === 'player' ? p1Id : outcome === 'ai' ? p2Id : null;

      let awarded = 0;
      let stakePayouts = {};
      try {
        await db.clashGame.update({
          where: { id: match.recordId },
          data: {
            endedAt:      new Date(),
            winnerUserId: winnerUserId,
            outcome:      outcome    // 👈 keep actual outcome (not always 'player')
          }
        });

        if (winnerUserId) {
          awarded = await awardClashWinPoints(winnerUserId);
        }

        // 👇 NEW: settle pot (winner gets pot; tie returns each stake)
        const { payouts } = await settleStakes(match.recordId, {
          outcome: outcome === 'tie' ? 'tie' : 'win',
          winnerUserId
        });
        stakePayouts = payouts || {};
      } catch (e) {
        console.error('Failed to finalize PvP game:', e);
      }

      const sockets = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const mine = match.userSide?.[s.data.userId] || 'player';
        const winner =
          raw.winner === 'tie' ? 'tie'
          : raw.winner === 'player'
            ? (mine === 'player' ? 'player' : 'ai')
            : (mine === 'player' ? 'ai'     : 'player');

        const youLanes =  mine === 'player' ? raw.playerLanesWon : raw.aiLanesWon;
        const oppLanes =  mine === 'player' ? raw.aiLanesWon     : raw.playerLanesWon;

        s.emit('gameEnd', {
          winner,
          playerLanesWon: youLanes,
          aiLanesWon:     oppLanes,
          pointsAwarded:  (s.data.userId === winnerUserId ? awarded : 0),
          // 👇 NEW
          stakeAwarded:   Number(stakePayouts[s.data.userId] || 0)
        });
      }
      pvpMatches.delete(roomId);
      redisState.delPvpMatch(roomId).catch(() => {})
    }
  }, 1000);
}

// ──────────────────────────────────────────────────────────────────────────
//  Trade-room auth helpers
//
//  The trade-room handlers below transfer cToon ownership, so every event
//  must be tied to a server-verified user identity. Resolve the caller from
//  the `session` JWT cookie sent during the websocket handshake instead of
//  trusting the client-supplied `user` field.
// ──────────────────────────────────────────────────────────────────────────
function parseSessionCookie(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null
  const match = /(?:^|;\s*)session=([^;]+)/.exec(cookieHeader)
  if (!match) return null
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

async function resolveSocketUser(socket) {
  if (socket.data && Object.prototype.hasOwnProperty.call(socket.data, 'authUser')) {
    return socket.data.authUser
  }
  socket.data = socket.data || {}

  const secret = process.env.JWT_SECRET
  const token = parseSessionCookie(socket.handshake?.headers?.cookie)
  if (!secret || !token) {
    socket.data.authUser = null
    return null
  }

  let payload
  try {
    payload = jwt.verify(token, secret)
  } catch {
    socket.data.authUser = null
    return null
  }

  const userId = payload?.sub
  if (!userId) {
    socket.data.authUser = null
    return null
  }

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, banned: true }
    })
    if (!user || user.banned || !user.username) {
      socket.data.authUser = null
      return null
    }
    socket.data.authUser = { id: user.id, username: user.username }
    return socket.data.authUser
  } catch {
    socket.data.authUser = null
    return null
  }
}

io.on('connection', socket => {
  socket.on('battle:create', async ({ player1UserId, player1MonsterId, opponent }) => {
    try {
      const uid = player1UserId ? sid(player1UserId) : null
      console.log('[battle:create] request', { uid, player1MonsterId, opponent })
      if (!uid || !player1MonsterId) {
        socket.emit('battle:error', { battleId: null, message: 'Missing player data.', code: 'BadPayload' })
        return
      }
      if (monsterBattleByUser.has(uid)) {
        socket.emit('battle:error', { battleId: null, message: 'Already in an active battle.', code: 'AlreadyInBattle' })
        return
      }
      const existing = await db.monsterBattle.findFirst({
        where: {
          endedAt: null,
          OR: [{ player1UserId: uid }, { player2UserId: uid }]
        },
        select: { id: true }
      })
      if (existing) {
        socket.emit('battle:error', { battleId: existing.id, message: 'Already in an active battle.', code: 'AlreadyInBattle' })
        return
      }

      const p1Monster = await getUserMonsterBattleData(player1MonsterId, uid)
      if (!p1Monster) {
        socket.emit('battle:error', { battleId: null, message: 'Monster not found.', code: 'MonsterNotFound' })
        return
      }

      let player2UserId = null
      let player2Monster = null
      let player2IsAi = false

      if (opponent?.type === 'AI') {
        player2IsAi = true
        player2Monster = await selectAiMonster()
        if (!player2Monster) {
          socket.emit('battle:error', { battleId: null, message: 'No AI monster available.', code: 'AiUnavailable' })
          return
        }
      } else if (opponent?.type === 'USER') {
        if (!opponent.userId || !opponent.monsterId) {
          socket.emit('battle:error', { battleId: null, message: 'Missing opponent data.', code: 'BadPayload' })
          return
        }
        player2UserId = sid(opponent.userId)
        if (monsterBattleByUser.has(player2UserId)) {
          socket.emit('battle:error', { battleId: null, message: 'Opponent already in an active battle.', code: 'OpponentBusy' })
          return
        }
        const existingOpponent = await db.monsterBattle.findFirst({
          where: {
            endedAt: null,
            OR: [{ player1UserId: player2UserId }, { player2UserId: player2UserId }]
          },
          select: { id: true }
        })
        if (existingOpponent) {
          socket.emit('battle:error', { battleId: null, message: 'Opponent already in an active battle.', code: 'OpponentBusy' })
          return
        }
        player2Monster = await getUserMonsterBattleData(opponent.monsterId, player2UserId)
        if (!player2Monster) {
          socket.emit('battle:error', { battleId: null, message: 'Opponent monster not found.', code: 'MonsterNotFound' })
          return
        }
      } else {
        socket.emit('battle:error', { battleId: null, message: 'Invalid opponent type.', code: 'BadPayload' })
        return
      }

      const record = await db.monsterBattle.create({
        data: {
          player1UserId: uid,
          player2UserId: player2UserId,
          player2IsAi: player2IsAi,
          player1MonsterId: p1Monster.id,
          player2MonsterId: player2IsAi ? null : player2Monster?.id ?? null,
          player1StartStats: {
            hp: p1Monster.stats.hp,
            maxHealth: p1Monster.stats.maxHealth,
            attack: p1Monster.stats.atk,
            defense: p1Monster.stats.def
          },
          player2StartStats: {
            hp: player2Monster.stats.hp,
            maxHealth: player2Monster.stats.maxHealth,
            attack: player2Monster.stats.atk,
            defense: player2Monster.stats.def,
            aiMonsterId: player2IsAi ? player2Monster.id : null,
            name: player2Monster.name
          },
          turnLog: []
        }
      })

      try {
        await db.userMonster.update({
          where: { id: p1Monster.id },
          data: { lastInteractionAt: new Date() }
        })
      } catch (e) {
        console.error('Failed to update lastInteractionAt for player1 monster:', e)
      }

      const state = createInitialState({
        battleId: record.id,
        player1: {
          userId: uid,
          monsterId: p1Monster.id,
          stats: p1Monster.stats
        },
        player2: {
          userId: player2UserId,
          monsterId: player2Monster?.id ?? null,
          stats: player2Monster.stats
        },
        player2IsAi
      })

      state.participants.player1.name = p1Monster.name
      state.participants.player1.sprites = p1Monster.sprites
      state.participants.player2.name = player2Monster.name
      state.participants.player2.sprites = player2Monster.sprites

  const battle = {
        state,
        recordId: record.id,
        actions: { player1: null, player2: null },
        timers: { player1: null, player2: null },
        deadlines: {},
        disconnectTimers: { player1: null, player2: null },
        lastActivity: Date.now()
      }

      monsterBattles.set(record.id, battle)
      monsterBattleByUser.set(uid, record.id)
      if (player2UserId) monsterBattleByUser.set(player2UserId, record.id)
      syncBattle(record.id, battle)
      syncBattleByUser(uid, record.id)
      if (player2UserId) syncBattleByUser(player2UserId, record.id)

      socket.join(record.id)
      socket.data.monsterBattleId = record.id
      socket.data.userId = uid

      console.log('[battle:create] created', record.id)
      scheduleMonsterTimeouts(io, battle)

      socket.emit('battle:created', { battleId: record.id })
      socket.emit('battle:state', battlePublicState(battle))
    } catch (e) {
      console.error('battle:create failed:', e)
      socket.emit('battle:error', { battleId: null, message: 'Failed to create battle.', code: 'ServerError' })
    }
  })

  socket.on('battle:join', async ({ battleId, userId }) => {
    console.log('[battle:join] request', battleId, userId)
    const battle = monsterBattles.get(battleId)
    if (!battle) {
      console.log('[battle:join] not found', battleId)
      socket.emit('battle:error', { battleId, message: 'Battle not found.', code: 'NotFound' })
      return
    }
    touchActivity(battle)
    const uid = userId ? sid(userId) : socket.data.userId
    const playerKey = uid ? monsterPlayerKeyForUser(battle, uid) : null
    if (!playerKey) {
      console.log('[battle:join] not participant', battleId, uid)
      socket.emit('battle:error', { battleId, message: 'Not a participant.', code: 'NotParticipant' })
      return
    }
    socket.data.userId = uid
    socket.data.monsterBattleId = battleId
    socket.join(battleId)
    clearMonsterDisconnectTimer(battle, playerKey)
    scheduleMonsterActionTimeout(io, battle, playerKey, { skipIfExisting: true })
    console.log('[battle:join] joined', battleId, uid, playerKey)
    socket.emit('battle:state', battlePublicState(battle))
  })

  socket.on('battle:chooseAction', async ({ battleId, turnNumber, action }) => {
    console.log('[battle:chooseAction] request', battleId, turnNumber, action)
    const battle = monsterBattles.get(battleId)
    if (!battle) {
      socket.emit('battle:error', { battleId, message: 'Battle not found.', code: 'NotFound' })
      return
    }
    touchActivity(battle)
    const uid = socket.data.userId
    const playerKey = uid ? monsterPlayerKeyForUser(battle, uid) : null
    if (!playerKey) {
      socket.emit('battle:error', { battleId, message: 'Not a participant.', code: 'NotParticipant' })
      return
    }
    if (battle.state.status !== 'active') return
    if (battle.state.turnNumber !== Number(turnNumber)) {
      socket.emit('battle:error', { battleId, message: 'Stale turn.', code: 'BadTurn' })
      return
    }
    if (battle.actions[playerKey]) return

    const validation = validateAction(battle.state, playerKey, action)
    if (!validation.ok) {
      socket.emit('battle:error', { battleId, message: 'Invalid action.', code: validation.code })
      return
    }

    try {
      const monsterId = battle.state.participants[playerKey]?.monsterId
      if (monsterId) {
        await db.userMonster.update({
          where: { id: monsterId },
          data: { lastInteractionAt: new Date() }
        })
      }
    } catch (e) {
      console.error('Failed to update lastInteractionAt for battle action:', e)
    }

    battle.actions[playerKey] = action
    if (battle.deadlines?.[playerKey]) {
      battle.deadlines[playerKey] = null
    }
    if (battle.timers[playerKey]) {
      clearTimeout(battle.timers[playerKey])
      battle.timers[playerKey] = null
    }
    clearMonsterDisconnectTimer(battle, playerKey)
    io.to(battleId).emit('battle:actionAccepted', { battleId, turnNumber, playerId: uid })

    const aiKey = battle.state.participants.player1.isAi ? 'player1' : 'player2'
    if (battle.state.participants[aiKey].isAi && !battle.actions[aiKey]) {
      battle.actions[aiKey] = chooseAiAction(battle.state)
    }

    if (battle.actions.player1 && battle.actions.player2) {
      console.log('[battle:chooseAction] resolving turn', battleId, battle.state.turnNumber)
      await resolveMonsterTurn(io, battle)
    }
  })

  socket.on('leaveClashRoom', async ({ roomId, userId }) => {
    try {
      // leave socket.io room
      socket.leave(roomId)

      // delegate everything else (lobby or active match) to one place
      await handleClashLeave(io, {
        roomId,
        userId,
        leavingSocketId: socket.id
      })
    } catch (e) {
      console.error('leaveClashRoom failed:', e)
    }
  })

  // --- List open PvP rooms ---
  socket.on('listClashRooms', async () => {
    // waiting rooms = exactly one player
    const waiting = Array.from(pvpRooms.entries()).filter(([, data]) => data.players.length === 1)
    const ownerIds = waiting.map(([, data]) => data.players[0])
    const users = ownerIds.length
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, username: true }
        })
      : []
    const nameById = Object.fromEntries(users.map(u => [u.id, u.username || 'Unknown']))
    const rooms = waiting.map(([id, data]) => ({
      id,
      owner: nameById[data.players[0]] || 'Unknown',
      points: data.stakePoints ?? 0 
    }))
    socket.emit('clashRooms', rooms)
  })

  // --- Create a new PvP room ---
  socket.on('createClashRoom', async ({ roomId, userId, deck, points }) => {
    // store room
    const uid = sid(userId)

    // Validate & clamp stake against creator's balance server-side
    const requested = Math.max(0, Math.floor(Number(points || 0)))
    const up = await db.userPoints.findUnique({ where: { userId: uid } })
    const balance = up?.points ?? 0
    const stake = Math.min(requested, balance)   // never exceed current balance

    pvpRooms.set(roomId, {
      players: [uid],
      decks: {},          // set later via setPvpDeck
      deckSnapshots: {},
      ready: {},          // userId -> bool
      usernames: {},       // userId -> username
      stakePoints: stake,
      lastActivity: Date.now()
    })
    socket.join(roomId);
    socket.data.roomId = roomId
    socket.data.userId = uid
    // notify lobby
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, discordId: true }
    })
    pvpRooms.get(roomId).usernames[uid] = u?.username || 'Unknown'
    syncPvpRoom(roomId, pvpRooms.get(roomId))
    io.emit('roomCreated', { id: roomId, owner: u?.username || 'Unknown', points: stake })

    // ── Discord announce: new gToons Clash PvP room ─────────────────────────
    try {
      const botToken  = process.env.BOT_TOKEN
      const guildId  = process.env.DISCORD_GUILD_ID

      if (!botToken || !guildId) {
        console.error('Missing BOT_TOKEN or DISCORD_GUILD_ID env vars.')
        return
      }

      // Ensure proper Discord auth header
      const authHeader =
        botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

      // 1) Look up the "cmart-alerts" channel by name
      const channelsRes = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          method: 'GET',
          headers: {
            Authorization: authHeader,
          },
        }
      )

      if (!channelsRes.ok) {
        console.error(
          'Failed to fetch guild channels:',
          channelsRes.status,
          channelsRes.statusText
        )
        return
      }

      const channels = await channelsRes.json()
      const targetChannel = channels.find(
        (ch) => ch.type === 0 && ch.name === 'gtoons' // type 0 = text channel
      )

      if (!targetChannel) {
        console.error('No channel named "gtoons" found in the guild.')
        return
      }

      const channelId = targetChannel.id
      if (!botToken) {
        console.warn('BOT_TOKEN not set; skipping PvP room Discord notify')
      } else {
        const display = u?.discordId ? `<@${u.discordId}>` : (u?.username || 'Unknown')
        const payload = {
          content: `🎮 ${display} created a gToons Clash **PvP** room and is looking for a match!  Head over here to play them: https://www.cartoonreorbit.com/games/clash/rooms`
        }
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `${botToken}`, // keep consistent with your auction code
              'Content-Type':  'application/json'
            },
            body: JSON.stringify(payload)
          }
        )
        if (!res.ok) {
          let errJson = null
          try { errJson = await res.json() } catch {}
          console.error('Failed to send PvP room Discord message:', res.status, errJson)
        }
      }
    } catch (err) {
      console.error('Discord PvP room notify failed:', err)
    }
  });

  // --- Join existing PvP room ---
  socket.on('joinClashRoom', async ({ roomId, userId, deck }) => {
    const uid = sid(userId)

    // If the game has already started (lobby → active match transition), treat this
    // as a reconnect rather than a new join.  Handles both post-reload rejoins and
    // the case where a player navigates back to the room URL mid-game.
    if (pvpMatches.has(roomId)) {
      const match = pvpMatches.get(roomId)
      if (match.userSide?.[uid]) {
        socket.data.roomId = roomId
        socket.data.userId = uid
        socket.join(roomId)
        touchActivity(match)
        socket.emit('gameStart', viewForUser(match, uid))
      } else {
        socket.emit('joinError', { message: 'Room unavailable.' })
      }
      return
    }

    const room = pvpRooms.get(roomId);
    if (!room || room.players.length !== 1) {
      socket.emit('joinError', { message: 'Room unavailable.' });
      return;
    }
    touchActivity(room)
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.userId = uid

    const ownerId = room.players[0]
    // If the owner opens their own room page, don't "take" the second slot.
    if (uid === ownerId) {
      // Owner loading their page; idle until opponent arrives
      io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
      return
    }

    // A different user is joining: fill second slot
    if (!room.players.includes(uid)) room.players.push(uid)
    const u2 = await db.user.findUnique({ where: { id: userId }, select: { username: true } })
    room.usernames[uid] = u2?.username || 'Unknown'

    // Now this room is no longer "waiting" → remove from lobby lists
    io.emit('roomRemoved', { id: roomId })
    // Tell both clients the current pregame state
    io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
  });

  socket.on('listClashDecks', async ({ userId }) => {
    const decks = await db.clashDeck.findMany({
      where: { userId },
      include: { cards: { include: { ctoon: true } } }
    })
    const payload = decks.map(d => ({
      id: d.id,
      name: d.name,
      size: d.cards.length,
      // For preview; server will refetch on selection anyway if you want
      sampleNames: d.cards.slice(0, 3).map(c => c.ctoon.name)
    }))
    socket.emit('clashDecks', payload)
  })

  // Single atomic handler: sets deck + ready flag together so startPvpMatch
  // always sees both in a consistent state (fixes race condition where the old
  // separate setPvpDeck / readyPvp events could be processed out of order).
  socket.on('readyUpWithDeck', async ({ roomId, userId, deckId }) => {
    const room = pvpRooms.get(roomId)
    const uid = sid(userId)
    if (!room || !room.players.includes(uid)) return
    touchActivity(room)

    const deck = await db.clashDeck.findUnique({
      where: { id: deckId },
      include: { cards: { include: { ctoon: true } } }
    })
    if (!deck || deck.userId !== userId) {
      socket.emit('deckError', { message: 'Invalid deck' })
      return
    }

    const cards = deck.cards.map(dc => dc.ctoon).slice(0, 12)
    room.decks[uid] = cards.map(c => ({
      id: c.id,
      name: c.name,
      assetPath: withAsset(c.assetPath),
      cost: c.cost ?? 1,
      power: c.power ?? 1,
      abilityKey: c.abilityKey || null,
      gtoonType: c.gtoonType || null,
      abilityData: c.abilityData || null
    }))
    room.deckSnapshots[uid] = buildDeckSnapshot(deck)
    room.ready = room.ready || {}
    room.ready[uid] = true

    io.to(roomId).emit('pvpLobbyState', lobbySnapshot(room))
    await startPvpMatch(roomId)
  })

  // --- Relay selectCards & game flow ---
  socket.on('selectPvPCards', async ({ selections }) => {
    const roomId = socket.data.roomId;
    const match  = pvpMatches.get(roomId);
    if (!match) return;
    touchActivity(match)

    const uid  = socket.data.userId;
    const side = match.userSide?.[uid]; // 'player' | 'ai'
    if (!side) return;

    // record this player's selections
    match.pending[side]   = selections;
    match.confirmed[side] = true;

    // If both are in, apply and jump straight to the next SELECT (no reveal frame)
    if (match.confirmed.player && match.confirmed.ai) {
      // Apply → confirm both sides; engine will do reveal+setup internally
      const pSel = clampSelectionsToLaneCap(match.battle.state, match.pending.player || [], 'player')
      const aSel = clampSelectionsToLaneCap(match.battle.state, match.pending.ai     || [], 'ai')

      match.battle.select('player', pSel)
      match.battle.select('ai',     aSel)
      match.battle.confirm('player');
      match.battle.confirm('ai');

      // clear for next turn
      match.pending   = { player: null, ai: null };
      match.confirmed = { player: false, ai: false };

      // New countdown window for the next turn’s SELECT
      match.selectDeadline = Date.now() + 60_000;

      // Send the *post-advance* state (usually phase === 'select' of the next turn)
      const afterRaw = clone(match.battle.state);
      const sockets  = await io.in(roomId).fetchSockets();
      for (const s of sockets) {
        const snap = viewForUser(match, s.data.userId, afterRaw);
        if (snap.phase === 'select' && !snap.selectEndsAt && match.selectDeadline) {
          snap.selectEndsAt = match.selectDeadline;
        }
        s.emit('phaseUpdate', snap);
      }

      // Persist updated match state after each completed turn
      if (match.battle.state.phase !== 'gameEnd') syncPvpMatch(roomId, match)
    }
  });

  /* ──────────   Clash PvE   ────────── */
  socket.on('joinPvE', async ({ deck, userId }) => {
    try {
      const normalize = (arr = []) => arr.slice(0, 12).map(d => {
        const c = d?.ctoon ?? d
        return {
          id: c.id,
          name: c.name,
          assetPath: withAsset(c.assetPath),
          cost: c.cost ?? 1,
          power: c.power ?? 1,
          abilityKey: c.abilityKey || null,
          gtoonType: c.gtoonType || null,
          abilityData: c.abilityData || null
        }
      })
      const playerDeck = normalize(deck)
      const aiDeck     = shuffle(playerDeck).slice(0, 12)
      const gameId = randomUUID()
      const battle = createBattle({
        playerDeck,
        aiDeck,
        battleId: gameId,
        lanes: LANES
      })

      const { id: recordId } = await db.clashGame.create({
        data: {
          player1UserId: userId,
          player2UserId: null
        }
      })

      const match = {
        id:           gameId,
        socketId:     socket.id,
        battle,
        playerConfirmed: false,
        recordId,
        aiConfirmed:     false,
        timer:           null,
        selectDeadline:  null,
        playerUserId: userId,
        lastActivity: Date.now()
      }

      pveMatches.set(gameId, match)
      syncPveMatch(gameId, match)

      socket.data.gameId = gameId
      socket.join(gameId)

      startSelectTimer(io, match)
      socket.emit('gameStart', battle.publicState())
    } catch (e) {
      console.error('joinPvE failed:', e)
      socket.emit('joinError', { message: 'Failed to start match.' })
    }
  })

  /* ── Handle player selection ──────────────────────────── */
  socket.on('selectCards', ({ selections }) => {
    const match = pveMatches.get(socket.data.gameId)
    if (!match) {
      console.warn(
        '[Server] no match found for socket.data.gameId=',
        socket.data.gameId
      )
      return
    }
    touchActivity(match)
    if (match.battle.state.phase !== 'select') {
      console.warn('[Server] selectCards but phase=', match.battle.state.phase)
      return
    }

    // Apply & confirm both sides (engine will run reveal→setup)
    const playerSel = clampSelectionsToLaneCap(match.battle.state, selections, 'player')
    const aiSel     = clampSelectionsToLaneCap(match.battle.state, aiChooseSelections(match.battle), 'ai')

    match.battle.select('player', playerSel)
    match.battle.select('ai',     aiSel)
    match.battle.confirm('player')
    match.battle.confirm('ai')
    match.battle.confirm('player')
    match.battle.confirm('ai')

    // broadcast the new state (after reveal & setup)
    broadcastPhase(io, match)

    // restart the select timer for the next turn
    startSelectTimer(io, match)
    broadcastPhase(io, match)

    // persist updated state after each turn
    if (match.battle.state.phase !== 'gameEnd') syncPveMatch(match.id, match)

    // handle game end
    if (match.battle.state.phase === 'gameEnd') {
      endMatch(io, match, match.battle.state.result)
    }
  })

  /* ── Disconnect handling ──────────────────────────────── */
  socket.on('disconnect', () => {
    // During a graceful server reload the state has been saved to Redis — don't
    // end the game immediately; the player will rejoin via pve:rejoin.
    if (isShuttingDown) return
    const gid = socket.data.gameId
    if (!gid) return
    const match = pveMatches.get(gid)
    if (match) {
      endMatch(io, match, {
        winner: 'incomplete',           // mark as incomplete
        playerLanesWon: 0,
        aiLanesWon:     0,
        reason:        'player_disconnect'
      })
    }
  })

  socket.on('join-zone', ({ zone }) => {
    const prevZone = socket.zone
    if (prevZone && prevZone !== zone) {
      socket.leave(prevZone)
      if (zoneSockets[prevZone]) {
        zoneSockets[prevZone].delete(socket.id)
      }
      if (zoneVisitors[prevZone]) {
        zoneVisitors[prevZone] = Math.max(zoneVisitors[prevZone] - 1, 0)
        if (zoneVisitors[prevZone] === 0) {
          delete zoneVisitors[prevZone]
          delete zoneSockets[prevZone]
        } else {
          io.to(prevZone).emit('visitor-count', zoneVisitors[prevZone])
        }
      }
    }

    socket.zone = zone
    socket.join(zone)

    zoneSockets[zone] = (zoneSockets[zone] || new Set());
    if (!zoneSockets[zone].has(socket.id)) {
      zoneSockets[zone].add(socket.id)
      zoneVisitors[zone] = (zoneVisitors[zone] || 0) + 1
      io.to(zone).emit('visitor-count', zoneVisitors[zone])
    }
  })

  socket.on('chat-message', ({ zone, user, message }) => {
    io.to(zone).emit('chat-message', { user, message })
  })

  // ── Reconnect rejoin handlers ──────────────────────────────────────────────
  // Emitted by clients on socket reconnect to restore their session.

  // PvP lobby: re-join room and receive current lobby snapshot
  socket.on('pvp:rejoin', ({ roomId, userId }) => {
    const room = pvpRooms.get(roomId)
    if (!room) return
    const uid = sid(userId)
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.userId = uid
    touchActivity(room)
    socket.emit('pvpLobbyState', lobbySnapshot(room))
  })

  // PvE clash match: re-join after socket reconnect / server restart
  socket.on('pve:rejoin', ({ gameId, userId }) => {
    const match = pveMatches.get(gameId)
    if (!match) return
    const uid = sid(userId)
    if (match.playerUserId !== uid) return  // security: only the original player may rejoin

    socket.data.gameId = gameId
    socket.data.userId = uid
    socket.join(gameId)
    touchActivity(match)

    // Start the select-phase tick timer if it isn't running yet
    if (!match.timer) startSelectTimer(io, match)

    socket.emit('gameStart', match.battle.publicState())
  })

  // PvP active match: re-join after socket reconnect / server restart.
  // Also reached when joinClashRoom fires for a room that already has an active match.
  socket.on('pvp:match:rejoin', ({ roomId, userId }) => {
    const match = pvpMatches.get(roomId)
    if (!match) return
    const uid = sid(userId)
    if (!match.userSide?.[uid]) return  // security: only a participant may rejoin

    socket.data.roomId = roomId
    socket.data.userId = uid
    socket.join(roomId)
    touchActivity(match)

    socket.emit('gameStart', viewForUser(match, uid))
  })
  // ──────────────────────────────────────────────────────────────────────────


  socket.on('leave-zone', ({ zone }) => {
    if (zone) {
      socket.leave(zone)
      if (socket.zone === zone) {
        socket.zone = null
      }
    }
    if (zone && zoneVisitors[zone]) {
      zoneVisitors[zone]--
      if (zoneSockets[zone]) {
        zoneSockets[zone].delete(socket.id)
      }

      if (zoneVisitors[zone] <= 0) {
        delete zoneVisitors[zone]
        delete zoneSockets[zone]
      } else {
        io.to(zone).emit('visitor-count', zoneVisitors[zone])
      }
    }
  })

  socket.on('disconnecting', async () => {
    // During a graceful server reload state has already been saved to Redis —
    // skip PvP leave logic so active matches aren't ended prematurely.
    if (isShuttingDown) return

    // Clash PvP cleanup if user leaves the game page / disconnects
    if (socket.data?.roomId) {
      await handleClashLeave(io, {
        roomId: socket.data.roomId,
        userId: socket.data.userId,
        leavingSocketId: socket.id
      })
    }

    const battleId = socket.data?.monsterBattleId
    const userId = socket.data?.userId
    if (battleId && userId) {
      const battle = monsterBattles.get(battleId)
      if (battle && battle.state.status === 'active') {
        const sockets = await io.in(battleId).fetchSockets()
        const stillConnected = sockets.some(s =>
          s.id !== socket.id && String(s.data?.userId) === String(userId)
        )
        if (!stillConnected) {
          const loserKey = monsterPlayerKeyForUser(battle, userId)
          if (loserKey) {
            scheduleMonsterDisconnect(io, battle, loserKey)
          }
        }
      }
    }

    const zone = socket.zone
    if (zone && zoneSockets[zone] && zoneSockets[zone].has(socket.id)) {
      zoneSockets[zone].delete(socket.id)
      zoneVisitors[zone] = Math.max((zoneVisitors[zone] || 1) - 1, 0)

      if (zoneVisitors[zone] === 0) {
        delete zoneVisitors[zone]
        delete zoneSockets[zone]
      } else {
        io.to(zone).emit('visitor-count', zoneVisitors[zone])
      }
    }

  })

  socket.on('new-bid', payload => {
    // forward every property, including newEndAt when present
    io.to(`auction_${payload.auctionId}`).emit('new-bid', payload)
  })

  socket.on('join-auction', ({ auctionId }) => {
    socket.join(`auction_${auctionId}`)
  })

  // leave that auction room
  socket.on('leave-auction', ({ auctionId }) => {
    socket.leave(`auction_${auctionId}`)
  })

  // ── Spin the Wheel events ───────────────────────────────────────────────
  socket.on('stw:subscribe', () => {
    socket.join(STW_ROOM)
    socket.emit('stw:state', stwSnapshot())
  })

  socket.on('stw:join', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('stw:error', { message: 'Not authenticated.' })
    if (!spinWheelState.isOpen) return socket.emit('stw:error', { message: 'Joining is not open.' })
    if (spinWheelState.spinning) return socket.emit('stw:error', { message: 'Wheel is spinning.' })
    if (spinWheelState.participants.some(p => p.username === auth.username)) {
      return socket.emit('stw:error', { message: 'Already on wheel.' })
    }
    spinWheelState.participants.push({ username: auth.username })
    io.to(STW_ROOM).emit('stw:state', stwSnapshot())
  })

  socket.on('stw:allow', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('stw:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin) return socket.emit('stw:error', { message: 'Admin only.' })
    if (spinWheelState.spinning) return socket.emit('stw:error', { message: 'Wheel is spinning.' })
    spinWheelState.isOpen = true
    io.to(STW_ROOM).emit('stw:state', stwSnapshot())
  })

  socket.on('stw:clear', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('stw:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin) return socket.emit('stw:error', { message: 'Admin only.' })
    spinWheelState.participants = []
    spinWheelState.isOpen = false
    spinWheelState.spinning = false
    spinWheelState.sessionId = randomUUID()
    io.to(STW_ROOM).emit('stw:state', stwSnapshot())
  })

  socket.on('stw:spin', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('stw:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin) return socket.emit('stw:error', { message: 'Admin only.' })
    if (spinWheelState.spinning) return socket.emit('stw:error', { message: 'Already spinning.' })
    if (spinWheelState.participants.length === 0) return socket.emit('stw:error', { message: 'No participants.' })

    spinWheelState.isOpen = false
    spinWheelState.spinning = true

    const winnerIdx = Math.floor(Math.random() * spinWheelState.participants.length)
    const winner = spinWheelState.participants[winnerIdx].username

    io.to(STW_ROOM).emit('stw:spinning', {
      ...stwSnapshot(),
      winner,
      winnerIdx
    })

    // After the client animation completes (~6.5s), announce winner and reset spinning flag
    setTimeout(() => {
      spinWheelState.spinning = false
      io.to(STW_ROOM).emit('stw:winner', { username: winner })
      io.to(STW_ROOM).emit('stw:state', stwSnapshot())
    }, 7000)
  })

  // ── Marble Race handlers ─────────────────────────────────────────────────
  socket.on('marbles:subscribe', () => {
    socket.join(MARBLES_ROOM)
    socket.emit('marbles:state', marblesSnapshot())
  })

  socket.on('marbles:join', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('marbles:error', { message: 'Not authenticated.' })
    if (!marblesState.isOpen)                       return socket.emit('marbles:error', { message: 'Joining is not open.' })
    if (marblesState.phase !== 'waiting')           return socket.emit('marbles:error', { message: 'Race already in progress.' })
    if (marblesState.marbles.some(m => m.username === auth.username))
      return socket.emit('marbles:error', { message: 'Already joined.' })
    const color = MARBLE_COLORS[marblesState.marbles.length % MARBLE_COLORS.length]
    marblesState.marbles.push({ id: randomUUID(), username: auth.username, color })
    io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
  })

  socket.on('marbles:allow', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('marbles:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin)                 return socket.emit('marbles:error', { message: 'Admin only.' })
    if (marblesState.phase !== 'waiting') return socket.emit('marbles:error', { message: 'Race not in waiting phase.' })
    marblesState.isOpen = true
    io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
  })

  socket.on('marbles:clear', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('marbles:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin) return socket.emit('marbles:error', { message: 'Admin only.' })
    stopMarblesPhysics()
    marblesState.marbles   = []
    marblesState.isOpen    = false
    marblesState.phase     = 'waiting'
    marblesState.winner    = null
    marblesState.sessionId = randomUUID()
    io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
  })

  socket.on('marbles:start', async () => {
    const auth = await resolveSocketUser(socket)
    if (!auth) return socket.emit('marbles:error', { message: 'Not authenticated.' })
    const dbUser = await db.user.findUnique({ where: { id: auth.id }, select: { isAdmin: true } })
    if (!dbUser?.isAdmin)                 return socket.emit('marbles:error', { message: 'Admin only.' })
    if (marblesState.phase !== 'waiting') return socket.emit('marbles:error', { message: 'Already started.' })
    if (marblesState.marbles.length === 0) return socket.emit('marbles:error', { message: 'No marbles to race.' })
    marblesState.isOpen = false
    marblesState.phase  = 'racing'
    io.to(MARBLES_ROOM).emit('marbles:state', marblesSnapshot())
    startMarblesPhysics()
  })
})

async function sweepStaleState() {
  const now = Date.now()
  const activeSocketIds = new Set(io.sockets.sockets.keys())

  for (const [zone, socketSet] of Object.entries(zoneSockets)) {
    for (const socketId of Array.from(socketSet)) {
      if (!activeSocketIds.has(socketId)) socketSet.delete(socketId)
    }
    if (socketSet.size === 0) {
      delete zoneSockets[zone]
      delete zoneVisitors[zone]
    } else {
      zoneVisitors[zone] = socketSet.size
    }
  }

  for (const [roomId, room] of pvpRooms.entries()) {
    if (roomSize(io, roomId) === 0 && isIdle(room, now, PVP_ROOM_IDLE_MS)) {
      pvpRooms.delete(roomId)
      syncDeletePvpRoom(roomId)
    }
  }

  for (const [roomId, match] of pvpMatches.entries()) {
    if (roomSize(io, roomId) !== 0) continue
    if (!isIdle(match, now, PVP_MATCH_IDLE_MS)) continue
    if (match.timer) clearInterval(match.timer)
    try {
      await db.clashGame.update({
        where: { id: match.recordId },
        data: { endedAt: new Date(), outcome: 'incomplete', winnerUserId: null }
      })
    } catch {}
    pvpMatches.delete(roomId)
    redisState.delPvpMatch(roomId).catch(() => {})
  }

  for (const [gameId, match] of pveMatches.entries()) {
    if (roomSize(io, gameId) !== 0) continue
    if (!isIdle(match, now, PVE_MATCH_IDLE_MS)) continue
    const finished = match.battle?.state?.phase === 'gameEnd' && match.battle?.state?.result
    try {
      if (finished) {
        await endMatch(io, match, match.battle.state.result)
      } else {
        await endMatch(io, match, {
          winner: 'incomplete',
          playerLanesWon: 0,
          aiLanesWon: 0,
          reason: 'inactive'
        })
      }
    } catch {
      if (match.timer) clearInterval(match.timer)
      pveMatches.delete(gameId)
    }
  }

  for (const [battleId, battle] of monsterBattles.entries()) {
    if (roomSize(io, battleId) !== 0) continue
    if (!isIdle(battle, now, MONSTER_BATTLE_IDLE_MS)) continue
    if (battle.state?.status === 'active') {
      try {
        await db.monsterBattle.update({
          where: { id: battle.recordId },
          data: {
            endedAt: new Date(),
            endReason: 'DISCONNECT',
            winnerUserId: null,
            winnerIsAi: false
          }
        })
      } catch {}
    }
    cleanupMonsterBattle(battle)
  }

}

setInterval(() => {
  sweepStaleState().catch((err) => {
    console.error('[socket] stale sweep failed:', err)
  })
}, SWEEP_INTERVAL_MS).unref()

// Extracted close logic — called by the BullMQ worker for each auction job.
async function performAuctionClose(auctionId) {
  const auc = await db.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, status: true, endAt: true, creatorId: true, userCtoonId: true }
  })

  // Guard: already closed or cancelled (e.g. duplicate job fire)
  if (!auc || auc.status !== 'ACTIVE') return

  // Re-check: if endAt is still in the future the job fired too early (can happen
  // due to timer imprecision or clock skew). Reschedule rather than silently
  // completing — a bare `return` would drop the job and leave the auction stuck.
  if (new Date(auc.endAt) > new Date()) {
    await scheduleAuctionClose(auctionId, auc.endAt)
    return
  }

  const { id, creatorId, userCtoonId } = auc
  const now = new Date()

  // Resolve seller: creatorId or OFFICIAL_USERNAME
  let resolvedCreatorId = creatorId
  if (!resolvedCreatorId && process.env.OFFICIAL_USERNAME) {
    const official = await db.user.findUnique({
      where: { username: process.env.OFFICIAL_USERNAME },
      select: { id: true }
    })
    resolvedCreatorId = official?.id || null
  }

  // Highest bid placed before auction end; earliest timestamp breaks ties
  const winningBid = await db.bid.findFirst({
    where: {
      auctionId: id,
      createdAt: { lte: auc.endAt }
    },
    orderBy: [
      { amount: 'desc' },
      { createdAt: 'asc' }
    ],
    select: { userId: true, amount: true }
  })

  // Will be set inside the transaction if endAt was extended after our initial read.
  let extendedEndAt = null

  await db.$transaction(async tx => {
    // Re-check inside the transaction to close the TOCTOU gap: a concurrent bid
    // with anti-snipe may have extended endAt after our initial read above, but
    // scheduleAuctionClose skips rescheduling when the job is already 'active'.
    const current = await tx.auction.findUnique({
      where: { id },
      select: { status: true, endAt: true }
    })
    if (!current || current.status !== 'ACTIVE') return
    if (new Date(current.endAt) > now) {
      extendedEndAt = current.endAt
      return
    }

    await tx.auction.update({
      where: { id },
      data: {
        status: 'CLOSED',
        winnerId: winningBid?.userId || null,
        highestBidderId: winningBid?.userId || null,
        winnerAt: now,
        ...(winningBid && { highestBid: winningBid.amount })
      }
    })

    if (winningBid) {
      const uc = await tx.userCtoon.update({
        where:  { id: userCtoonId },
        data:   { userId: winningBid.userId, isTradeable: true },
        select: { id: true, ctoonId: true, mintNumber: true }
      })

      await tx.userTradeListItem.deleteMany({
        where: { userCtoonId, userId: { not: winningBid.userId } }
      })
      await tx.ctoonOwnerLog.create({
        data: {
          userId:      winningBid.userId,
          ctoonId:     uc.ctoonId,
          userCtoonId: uc.id,
          mintNumber:  uc.mintNumber
        }
      })

      const loserPts = await tx.userPoints.update({
        where: { userId: winningBid.userId },
        data:  { points: { decrement: winningBid.amount } }
      })
      await tx.pointsLog.create({
        data: {
          userId:    winningBid.userId,
          points:    winningBid.amount,
          total:     loserPts.points,
          method:    'Auction',
          direction: 'decrease'
        }
      })

      await tx.lockedPoints.updateMany({
        where: { userId: winningBid.userId, status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'CONSUMED' }
      })
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'RELEASED' }
      })

      if (resolvedCreatorId) {
        const creatorPts = await tx.userPoints.upsert({
          where:  { userId: resolvedCreatorId },
          create: { userId: resolvedCreatorId, points: winningBid.amount },
          update: { points: { increment: winningBid.amount } }
        })
        await tx.pointsLog.create({
          data: {
            userId:    resolvedCreatorId,
            points:    winningBid.amount,
            total:     creatorPts.points,
            method:    'Auction',
            direction: 'increase'
          }
        })
      }
    } else {
      await tx.userCtoon.update({
        where: { id: userCtoonId },
        data:  { isTradeable: true }
      })
      await tx.lockedPoints.updateMany({
        where: { status: 'ACTIVE', contextType: 'AUCTION', contextId: id },
        data:  { status: 'RELEASED' }
      })
    }
  })

  // endAt was extended by a concurrent anti-snipe bid; reschedule and bail out.
  if (extendedEndAt) {
    await scheduleAuctionClose(auctionId, extendedEndAt)
    return
  }

  io.to(`auction_${id}`).emit('auction-ended', {
    winnerId:   winningBid?.userId ?? null,
    winningBid: winningBid?.amount ?? 0
  })
}

// Heartbeat interval — keep this independent of auction processing so the
// timestamp is always fresh even during quiet periods with no auctions ending.
setInterval(async () => {
  try {
    await db.serverHeartbeat.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', lastBeat: new Date() },
      update: { lastBeat: new Date() }
    })
  } catch (err) {
    console.error('[Heartbeat] Failed to update:', err)
  }
}, 60 * 1000).unref()

// Auction notifications
let auctionNotificationInFlight = false
setInterval(async () => {
  if (auctionNotificationInFlight) return
  auctionNotificationInFlight = true
  try {
  const now  = new Date()
  const five = new Date(now.getTime() + 5 * 60 * 1000)

  // fetch auctions ending in the next 5m, not yet notified
  const soonAuctions = await db.auction.findMany({
    where: {
      status: 'ACTIVE',
      endAt:   { lte: five, gt: now },
      endingSoonNotified: false
    },
    include: {
      userCtoon:     { include: { ctoon: true } },
      creator:       true,
      highestBidder: true
    }
  })

  // prefetch holiday flags for all involved ctoonIds
  const ctoonIds = Array.from(
    new Set(soonAuctions.map(a => a.userCtoon.ctoonId))
  )
  const holidayRows = ctoonIds.length
    ? await db.holidayEventItem.findMany({
        where: { ctoonId: { in: ctoonIds } },
        select: { ctoonId: true }
      })
    : []
  const holidaySet = new Set(holidayRows.map(r => r.ctoonId))

  for (const auc of soonAuctions) {
    try {
      const botToken  = process.env.BOT_TOKEN
      const guildId  = process.env.DISCORD_GUILD_ID
      
      if (!botToken || !guildId) {
        console.error('Missing BOT_TOKEN or DISCORD_GUILD_ID env vars.')
        return
      }

      // Ensure proper Discord auth header
      const authHeader =
        botToken.startsWith('Bot ') ? botToken : `Bot ${botToken}`

      // 1) Look up the "cmart-alerts" channel by name
      const channelsRes = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        {
          method: 'GET',
          headers: {
            Authorization: authHeader,
          },
        }
      )

      if (!channelsRes.ok) {
        console.error(
          'Failed to fetch guild channels:',
          channelsRes.status,
          channelsRes.statusText
        )
        return
      }

      const channels = await channelsRes.json()
      const targetChannel = channels.find(
        (ch) => ch.type === 0 && ch.name === 'cmart-alerts' // type 0 = text channel
      )

      if (!targetChannel) {
        console.error('No channel named "cmart-alerts" found in the guild.')
        return
      }

      const channelId = targetChannel.id

      const baseUrl   = process.env.NODE_ENV === 'production'
        ? 'https://www.cartoonreorbit.com'
        : 'http://localhost:3000'
      const auctionLink = `${baseUrl}/auction/${auc.id}`

      // cToon details
      const { name, rarity, assetPath } = auc.userCtoon.ctoon
      const mintNumber = auc.userCtoon.mintNumber
      const isHolidayItem = holidaySet.has(auc.userCtoon.ctoonId)

      // determine bid display: use initialBet if no bids
      const hasBidder       = Boolean(auc.highestBidder)
      const displayedBid    = hasBidder ? auc.highestBid : auc.initialBet
      const topBidderTag    = hasBidder
        ? `<@${auc.highestBidder.discordId}>`
        : 'No one has bid on it'

      // build & encode image URL
      const rawImageUrl = assetPath
        ? assetPath.startsWith('http')
          ? assetPath
          : `${baseUrl}${assetPath}`
        : null
      const imageUrl = rawImageUrl ? encodeURI(rawImageUrl) : null

      // embed fields, omit Mint # for Holiday items
      const fields = [
        { name: 'Rarity',       value: rarity ?? 'N/A',                 inline: true },
        ...(!isHolidayItem ? [{ name: 'Mint #', value: `${mintNumber ?? 'N/A'}`, inline: true }] : []),
        { name: 'Highest Bid',  value: `${displayedBid}`,               inline: true },
        { name: 'Top Bidder',   value: topBidderTag,                    inline: true },
        { name: 'Ends In',      value: `<t:${Math.floor(new Date(auc.endAt).getTime()/1000)}:R>`, inline: false },
        { name: 'View Auction', value: `[Click here](${auctionLink})`,  inline: false }
      ]

      // payload with embed + image + bid info
      const payload = {
        content: `⏰ **Auction ending within 5 minutes!** ⏰`,
        embeds: [
          {
            title: name,
            url: auctionLink,
            fields,
            ...(imageUrl ? { image: { url: imageUrl } } : {})
          }
        ]
      }

      // send to Discord
      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `${botToken}`,
            'Content-Type':  'application/json'
          },
          body: JSON.stringify(payload)
        }
      )

      const json = await res.json()
      if (!res.ok) {
        console.error(
          `Discord warning failed (${res.status}):`,
          JSON.stringify(json, null, 2)
        )
      }

      // mark as notified
      await db.auction.update({
        where: { id: auc.id },
        data:  { endingSoonNotified: true }
      })
    } catch (err) {
      console.error(`Failed 5m-warning for auction ${auc.id}:`, err)
    }
  }
  } finally {
    auctionNotificationInFlight = false
  }
}, 60 * 1000).unref()


// Minimum gap (ms) between last heartbeat and now before we consider it a
// real downtime event.  One missed 60-second tick is noise; anything longer
// means the server was actually down.
const DOWNTIME_THRESHOLD_MS = 90_000

// Boot server only after Prisma is connected to avoid race conditions
async function boot() {
  try {
    await db.$connect()
    // Warm-up: establish a DB connection early
    try { await db.$queryRaw`SELECT 1` } catch {}
    console.log('[Prisma] Connected; starting socket server…')
  } catch (err) {
    console.error('[Prisma] Failed to connect at boot:', err)
    process.exit(1)
  }

  // ── Downtime recovery ──────────────────────────────────────────────────────
  // Check how long the server was down and extend any auctions that would have
  // ended during that window, giving bidders the time they missed.
  try {
    const now = new Date()
    const heartbeat = await db.serverHeartbeat.findUnique({ where: { id: 'singleton' } })

    if (heartbeat) {
      const downtimeMs = now.getTime() - heartbeat.lastBeat.getTime()

      if (downtimeMs > DOWNTIME_THRESHOLD_MS) {
        console.log(`[Boot] Detected downtime of ${Math.round(downtimeMs / 1000)}s. Checking for affected auctions…`)

        // Auctions whose end time fell inside the downtime window are the ones
        // that users couldn't bid on — extend them by the full downtime duration.
        const affected = await db.auction.findMany({
          where: {
            status: 'ACTIVE',
            endAt: { gte: heartbeat.lastBeat, lte: now }
          },
          select: { id: true, endAt: true }
        })

        if (affected.length > 0) {
          console.log(`[Boot] Extending ${affected.length} auction(s) by ${Math.round(downtimeMs / 1000)}s due to downtime.`)

          for (const auc of affected) {
            const newEndAt = new Date(auc.endAt.getTime() + downtimeMs)
            // Reset endingSoonNotified so the 5-minute Discord warning fires again
            // if the new end time is still far enough out.
            const resetNotified = newEndAt.getTime() - now.getTime() > 5 * 60 * 1000
            await db.auction.update({
              where: { id: auc.id },
              data: {
                endAt: newEndAt,
                ...(resetNotified && { endingSoonNotified: false })
              }
            })
            // Reschedule the BullMQ job to the new endAt so it doesn't fire
            // immediately on a stale "waiting" job from before the restart.
            await scheduleAuctionClose(auc.id, newEndAt)
            console.log(`[Boot] Auction ${auc.id}: endAt extended to ${newEndAt.toISOString()}`)
          }
        } else {
          console.log('[Boot] No auctions were affected by the downtime.')
        }
      }
    }

    // Record the first heartbeat for this session so the next boot can detect downtime.
    await db.serverHeartbeat.upsert({
      where:  { id: 'singleton' },
      create: { id: 'singleton', lastBeat: now },
      update: { lastBeat: now }
    })
  } catch (err) {
    // Non-fatal — log and continue booting.
    console.error('[Boot] Downtime recovery check failed:', err)
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Backfill BullMQ jobs for any active auctions that have no job yet ───────
  // Handles the first deploy (existing auctions predate the queue) and any
  // scenario where Redis was flushed. Safe on every boot — scheduleAuctionClose
  // is idempotent.
  try {
    const activeAuctions = await db.auction.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, endAt: true }
    })
    if (activeAuctions.length > 0) {
      console.log(`[Boot] Backfilling BullMQ close jobs for ${activeAuctions.length} active auction(s)…`)
      await Promise.all(activeAuctions.map(a => scheduleAuctionClose(a.id, a.endAt)))
      console.log('[Boot] Backfill complete.')
    }
  } catch (err) {
    console.error('[Boot] Auction job backfill failed:', err)
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ── Backfill BullMQ jobs for time-based mint windows ───────────────────────
  // Ensures mint-end jobs exist for any cToon with mintLimitType="timeBased"
  // whose window hasn't been processed yet (quantity still at safety cap).
  try {
    const pendingMintEnds = await db.ctoon.findMany({
      where: { mintLimitType: 'timeBased', quantity: 999999999 },
      select: { id: true, mintEndDate: true }
    })
    if (pendingMintEnds.length > 0) {
      console.log(`[Boot] Backfilling mint-end jobs for ${pendingMintEnds.length} time-based cToon(s)…`)
      await Promise.all(
        pendingMintEnds
          .filter(c => c.mintEndDate)
          .map(c => scheduleMintEnd(c.id, c.mintEndDate))
      )
      console.log('[Boot] Mint-end backfill complete.')
    }
  } catch (err) {
    console.error('[Boot] Mint-end job backfill failed:', err)
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Start the BullMQ worker AFTER downtime recovery so extended auctions have
  // their jobs rescheduled before any processing begins.
  const auctionCloseWorker = new Worker(
    process.env.AUCTION_CLOSE_QUEUE_KEY || 'auctionClose',
    async (job) => {
      const { auctionId } = job.data
      await performAuctionClose(auctionId)
    },
    { connection: redisConnection, concurrency: 5 }
  )
  auctionCloseWorker.on('failed', (job, err) => {
    console.error(`[AuctionClose] Job ${job?.id} failed:`, err)
  })
  console.log('[AuctionClose] BullMQ worker started.')

  // ── Restore in-memory state from Redis ─────────────────────────────────────
  // Repopulates Maps from Redis so in-progress sessions survive restarts.
  try {
    const [battles, byUser, pvpRoomsData, pveData, pvpData] = await Promise.all([
      redisState.scanBattles(),
      redisState.scanBattleByUser(),
      redisState.scanPvpRooms(),
      redisState.scanPveMatches(),
      redisState.scanPvpMatches(),
    ])
    for (const [id, battle] of battles) {
      monsterBattles.set(id, battle)
      if (battle.state?.status === 'active') reconstructBattleTimers(io, battle)
    }
    for (const [uid, bid] of byUser) monsterBattleByUser.set(uid, bid)
    for (const [id, room] of pvpRoomsData) pvpRooms.set(id, room)

    // Restore active PvE clash matches
    const REJOIN_BUFFER_MS = 90_000  // extend deadlines by 90 s to let players reconnect
    for (const [gameId, saved] of pveData) {
      if (saved.battleState?.phase === 'gameEnd') continue  // already finished
      const battle = createBattle({ _restore: { state: saved.battleState, pending: saved.pendingActions } })
      const match = {
        id:              gameId,
        socketId:        null,  // will be set when player rejoins
        battle,
        playerConfirmed: false,
        recordId:        saved.recordId,
        aiConfirmed:     false,
        timer:           null,
        selectDeadline:  saved.selectDeadline,
        playerUserId:    saved.playerUserId,
        lastActivity:    saved.lastActivity ?? Date.now(),
      }
      // Extend the deadline so the player has time to reconnect after restart
      if (!match.selectDeadline || match.selectDeadline < Date.now() + REJOIN_BUFFER_MS) {
        match.selectDeadline = Date.now() + REJOIN_BUFFER_MS
        match.battle.state.selectEndsAt = match.selectDeadline
      }
      pveMatches.set(gameId, match)
      // Don't start the per-second tick timer yet; startSelectTimer is called on rejoin
    }

    // Restore active PvP clash matches
    for (const [roomId, saved] of pvpData) {
      if (saved.battleState?.phase === 'gameEnd') continue  // already finished
      const battle = createBattle({ _restore: { state: saved.battleState, pending: saved.pendingActions } })
      const match = {
        battle,
        recordId:       saved.recordId,
        userSide:       saved.userSide,
        pending:        { player: null, ai: null },   // reset; players re-submit after rejoin
        confirmed:      { player: false, ai: false },
        timer:          null,
        selectDeadline: saved.selectDeadline,
        lastActivity:   saved.lastActivity ?? Date.now(),
      }
      // Extend the deadline so both players have time to reconnect after restart
      if (!match.selectDeadline || match.selectDeadline < Date.now() + REJOIN_BUFFER_MS) {
        match.selectDeadline = Date.now() + REJOIN_BUFFER_MS
        match.battle.state.selectEndsAt = match.selectDeadline
      }
      pvpMatches.set(roomId, match)
      startPvpTimer(io, roomId)  // restart the per-second tick timer
    }

    console.log(
      `[Boot] Redis restore: ${battles.size} battle(s), ${pvpRoomsData.size} pvp room(s), ` +
      `${pveData.size} pve match(es), ${pvpData.size} pvp match(es)`
    )
  } catch (err) {
    console.error('[Boot] Redis state restore failed (continuing without it):', err)
  }
  // ───────────────────────────────────────────────────────────────────────────

  await startListening(PORT)
}

// Bind the HTTP server, retrying on EADDRINUSE so that PM2 graceful reloads
// don't crash the incoming process while the outgoing one is still draining.
function startListening(port, maxRetries = 8, baseDelayMs = 1000) {
  return new Promise((resolve, reject) => {
    let attempt = 0

    function tryListen() {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
          const delay = baseDelayMs * 2 ** attempt
          attempt++
          console.log(
            `[Boot] Port ${port} busy (EADDRINUSE); retrying in ${delay}ms… ` +
            `(attempt ${attempt}/${maxRetries})`
          )
          setTimeout(tryListen, delay)
        } else {
          reject(err)
        }
      }

      httpServer.once('error', onError)
      httpServer.listen(port, () => {
        httpServer.removeListener('error', onError)
        console.log(`Socket server listening on port ${port}`)
        // Signal PM2 that this instance is ready to accept traffic (used by graceful reload)
        if (process.send) process.send('ready')
        resolve()
      })
    }

    tryListen()
  })
}

boot()

// Graceful shutdown: save active clash game state, then drain connections
async function shutdown(signal = 'SIGTERM') {
  console.log(`\n[Server] Received ${signal}; shutting down gracefully…`)

  // Set flag first so disconnect/disconnecting handlers don't end active games
  isShuttingDown = true

  // Persist all active clash matches to Redis before disconnecting clients.
  // The new process will restore them on boot; players rejoin via pve:rejoin /
  // joinClashRoom and pick up where they left off.
  try {
    const saves = [
      ...[...pveMatches.entries()].map(([id, m]) => redisState.setPveMatch(id, m)),
      ...[...pvpMatches.entries()].map(([id, m]) => redisState.setPvpMatch(id, m)),
    ]
    if (saves.length) {
      await Promise.all(saves)
      console.log(`[Server] Saved ${pveMatches.size} PvE and ${pvpMatches.size} PvP clash match(es) to Redis`)
    }
  } catch (err) {
    console.error('[Server] Failed to persist clash matches to Redis during shutdown:', err)
  }

  // Stop accepting new socket connections and close existing ones
  io.close()
  // Force-close any lingering keep-alive HTTP connections so the server
  // releases its port immediately rather than waiting for clients to time out.
  if (typeof httpServer.closeAllConnections === 'function') {
    httpServer.closeAllConnections()
  }
  httpServer.close(() => process.exit(0))
  // Hard fallback well within PM2's kill_timeout (8 s) so the port is free
  // before PM2 starts the replacement process.
  setTimeout(() => process.exit(0), 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
