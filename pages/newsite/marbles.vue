<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #main-content>
      <div ref="gameContainer" class="marbles-container">
        <!-- Admin controls (top-left, vertical) -->
        <div v-if="isAdmin" class="admin-controls">
          <button
            class="ctrl-btn allow-btn"
            :disabled="phase !== 'waiting'"
            @click="adminAllow"
          >Allow</button>
          <button
            class="ctrl-btn clear-btn"
            :disabled="phase === 'waiting'"
            @click="adminClear"
          >Clear</button>
          <button
            class="ctrl-btn start-btn"
            :disabled="phase !== 'allowed' || marbles.length === 0"
            @click="adminStart"
          >Start</button>
        </div>

        <!-- Join button for non-admins -->
        <button
          v-if="!isAdmin && canJoin"
          class="join-btn"
          @click="joinRace"
        >Join</button>

        <!-- Status label -->
        <div class="status-label">
          <span v-if="phase === 'waiting'">Waiting for host…</span>
          <span v-else-if="phase === 'allowed'">Open! Click Join to enter</span>
          <span v-else-if="phase === 'racing'">Race in progress!</span>
          <span v-else-if="phase === 'finished'">Race finished!</span>
        </div>

        <!-- Marble list (pre-race) -->
        <div v-if="phase !== 'racing'" class="marble-list">
          <span
            v-for="m in marbles"
            :key="m.username"
            class="marble-chip"
            :style="{ backgroundColor: m.color }"
          >{{ m.username }}</span>
        </div>

        <!-- Three.js canvas -->
        <canvas ref="canvas" class="game-canvas" />

        <!-- Winner modal -->
        <div v-if="winner" class="modal-overlay">
          <div class="modal">
            <div class="modal-trophy">🏆</div>
            <h2 class="modal-title">Winner!</h2>
            <p class="modal-winner" :style="{ color: winnerColor }">{{ winner }}</p>
            <p class="modal-subtitle">crossed the finish line first!</p>
          </div>
        </div>
      </div>
    </template>
  </NuxtLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { io } from 'socket.io-client'
import { useAuth } from '~/composables/useAuth'
import { useRuntimeConfig } from '#imports'

definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })
useHead({ htmlAttrs: { class: 'newsite-marbles' } })

// ─── Auth ─────────────────────────────────────────────────────────────────────
const { user, fetchSelf } = useAuth()
const isAdmin = computed(() => Boolean(user.value?.isAdmin))
const myUsername = computed(() => user.value?.username || null)

// ─── Game state ───────────────────────────────────────────────────────────────
const phase = ref('waiting')   // waiting | allowed | racing | finished
const marbles = ref([])        // [{ username, color }]
const winner = ref(null)
const winnerColor = computed(() => marbles.value.find(m => m.username === winner.value)?.color || '#FFD700')
const canJoin = computed(() =>
  phase.value === 'allowed' &&
  myUsername.value &&
  !marbles.value.find(m => m.username === myUsername.value)
)

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const canvas = ref(null)
const gameContainer = ref(null)

// ─── Course constants ─────────────────────────────────────────────────────────
const RAMP_ANGLE = Math.PI / 9      // 20 degrees tilt
const RAMP_HW = 11                  // half-width of ramp
const RAMP_HL = 80                  // half-length of ramp
const WALL_H = 2.5                  // wall half-height
const MARBLE_RADIUS = 1
const FINISH_LOCAL_Z = 65           // finish line local-Z on ramp
const START_LOCAL_Z = -65           // start line local-Z on ramp

// Convert local ramp coords → world coords
function rampToWorld(lx, ly, lz) {
  const cos = Math.cos(RAMP_ANGLE)
  const sin = Math.sin(RAMP_ANGLE)
  return new THREE.Vector3(lx, ly * cos - lz * sin, ly * sin + lz * cos)
}

// Convert world coords → local ramp Z (for finish detection)
function worldToLocalZ(wx, wy, wz) {
  const sin = Math.sin(RAMP_ANGLE)
  const cos = Math.cos(RAMP_ANGLE)
  return -wy * sin + wz * cos
}

// Marble starting positions (row at top of ramp)
function marbleStartPos(index, total) {
  const spacing = Math.min(2.2, (RAMP_HW * 2 - 2) / Math.max(total - 1, 1))
  const startX = -((total - 1) * spacing) / 2
  const lx = startX + index * spacing
  const ly = 0.5 + MARBLE_RADIUS
  return rampToWorld(lx, ly, START_LOCAL_Z)
}

// ─── Three.js / Cannon state ──────────────────────────────────────────────────
let renderer, scene, camera, controls
let physicsWorld
let animId
let raceStarted = false
let winnerEmitted = false

// Marble objects: [{ username, color, mesh, label, body }]
const marbleObjects = []

// Camera targets
const START_CAM_POS  = new THREE.Vector3(0, 55, -130)
const START_CAM_TGT  = rampToWorld(0, 1, START_LOCAL_Z)

let cameraLocked = true  // locked until Start is clicked

// ─── Scene setup ─────────────────────────────────────────────────────────────
function initScene() {
  const w = gameContainer.value.clientWidth
  const h = gameContainer.value.clientHeight

  // Renderer
  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(w, h)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // Scene
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e1a)
  scene.fog = new THREE.Fog(0x0a0e1a, 180, 320)

  // Camera
  camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500)
  camera.position.copy(START_CAM_POS)

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(START_CAM_TGT)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 10
  controls.maxDistance = 250
  controls.enabled = false   // locked until Start

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.55)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffeedd, 1.2)
  sun.position.set(30, 80, -40)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 300
  sun.shadow.camera.left = -120
  sun.shadow.camera.right = 120
  sun.shadow.camera.top = 120
  sun.shadow.camera.bottom = -120
  scene.add(sun)

  buildCourse()
  buildFinishLine()
}

// ─── Course geometry ──────────────────────────────────────────────────────────
function buildCourse() {
  // Physics world
  physicsWorld = new CANNON.World()
  physicsWorld.gravity.set(0, -9.81, 0)
  physicsWorld.broadphase = new CANNON.NaiveBroadphase()
  physicsWorld.solver.iterations = 10

  // Materials
  const floorMat = new CANNON.Material('floor')
  const wallMat  = new CANNON.Material('wall')
  const obstMat  = new CANNON.Material('obstacle')
  const mblMat   = new CANNON.Material('marble')

  const floorContact = new CANNON.ContactMaterial(floorMat, mblMat, { restitution: 0.25, friction: 0.6 })
  const wallContact  = new CANNON.ContactMaterial(wallMat, mblMat,  { restitution: 0.35, friction: 0.2 })
  const obstContact  = new CANNON.ContactMaterial(obstMat, mblMat,  { restitution: 0.55, friction: 0.15 })
  physicsWorld.addContactMaterial(floorContact)
  physicsWorld.addContactMaterial(wallContact)
  physicsWorld.addContactMaterial(obstContact)

  // Store materials for marble bodies created later
  physicsWorld._marbleMat = mblMat

  const rampQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), RAMP_ANGLE)
  const cannonRampQuat = new CANNON.Quaternion(rampQuat.x, rampQuat.y, rampQuat.z, rampQuat.w)

  // ── Floor ──
  const floorGeo  = new THREE.BoxGeometry(RAMP_HW * 2, 1, RAMP_HL * 2)
  const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshPhongMaterial({ color: 0x2a6e3f, shininess: 10 }))
  floorMesh.quaternion.copy(rampQuat)
  floorMesh.receiveShadow = true
  scene.add(floorMesh)

  const floorBody = new CANNON.Body({ mass: 0, material: floorMat })
  floorBody.addShape(new CANNON.Box(new CANNON.Vec3(RAMP_HW, 0.5, RAMP_HL)))
  floorBody.quaternion.copy(cannonRampQuat)
  physicsWorld.addBody(floorBody)

  // ── Side walls ──
  addWall(cannonRampQuat, -RAMP_HW - 0.5, wallMat, rampQuat, 'left')
  addWall(cannonRampQuat,  RAMP_HW + 0.5, wallMat, rampQuat, 'right')

  // ── Start wall (top) ──
  const startWallLocal = rampToWorld(0, WALL_H, START_LOCAL_Z - 2)
  const startWallGeo   = new THREE.BoxGeometry(RAMP_HW * 2, WALL_H * 2, 0.8)
  const startWallMesh  = new THREE.Mesh(startWallGeo, new THREE.MeshPhongMaterial({ color: 0x3399ff, transparent: true, opacity: 0.6 }))
  startWallMesh.position.copy(startWallLocal)
  startWallMesh.quaternion.copy(rampQuat)
  scene.add(startWallMesh)

  const swBody = new CANNON.Body({ mass: 0, material: wallMat })
  swBody.addShape(new CANNON.Box(new CANNON.Vec3(RAMP_HW, WALL_H, 0.4)))
  swBody.position.set(startWallLocal.x, startWallLocal.y, startWallLocal.z)
  swBody.quaternion.copy(cannonRampQuat)
  physicsWorld.addBody(swBody)

  // ── End wall (bottom) ──
  const endWallLocal = rampToWorld(0, WALL_H, FINISH_LOCAL_Z + 3)
  const endWallGeo   = new THREE.BoxGeometry(RAMP_HW * 2, WALL_H * 2, 0.8)
  const endWallMesh  = new THREE.Mesh(endWallGeo, new THREE.MeshPhongMaterial({ color: 0xff3333, transparent: true, opacity: 0.6 }))
  endWallMesh.position.copy(endWallLocal)
  endWallMesh.quaternion.copy(rampQuat)
  scene.add(endWallMesh)

  const ewBody = new CANNON.Body({ mass: 0, material: wallMat })
  ewBody.addShape(new CANNON.Box(new CANNON.Vec3(RAMP_HW, WALL_H, 0.4)))
  ewBody.position.set(endWallLocal.x, endWallLocal.y, endWallLocal.z)
  ewBody.quaternion.copy(cannonRampQuat)
  physicsWorld.addBody(ewBody)

  // ── Lane markings ──
  addLaneMarkings(rampQuat)

  // ── Obstacles ──
  addObstacles(cannonRampQuat, obstMat)
}

function addWall(cannonQuat, localX, wallMat, threeQuat, side) {
  const worldPos = rampToWorld(localX, WALL_H, 0)

  const wallGeo  = new THREE.BoxGeometry(1, WALL_H * 2, RAMP_HL * 2)
  const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshPhongMaterial({ color: 0x446688, transparent: true, opacity: 0.7 }))
  wallMesh.position.copy(worldPos)
  wallMesh.quaternion.copy(threeQuat)
  wallMesh.receiveShadow = true
  scene.add(wallMesh)

  const body = new CANNON.Body({ mass: 0, material: wallMat })
  body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, WALL_H, RAMP_HL)))
  body.position.set(worldPos.x, worldPos.y, worldPos.z)
  body.quaternion.copy(cannonQuat)
  physicsWorld.addBody(body)
}

function addLaneMarkings(rampQuat) {
  // Dashed center line
  for (let z = START_LOCAL_Z + 8; z < FINISH_LOCAL_Z; z += 12) {
    const pos = rampToWorld(0, 0.51, z)
    const geo  = new THREE.BoxGeometry(0.3, 0.05, 5)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }))
    mesh.position.copy(pos)
    mesh.quaternion.copy(rampQuat)
    scene.add(mesh)
  }
}

function addObstacles(cannonQuat, obstMat) {
  const obstacleLayout = [
    // [localX, localZ]
    { x: -7, z: -42 }, { x: 0, z: -42 }, { x: 7, z: -42 },
    { x: -5, z: -28 }, { x: 5, z: -28 },
    { x: -8, z: -14 }, { x: -2, z: -14 }, { x: 4, z: -14 },
    { x: -6, z:   0 }, { x: 1, z:   0 }, { x: 7, z:   0 },
    { x: -3, z:  14 }, { x: 6, z:  14 },
    { x: -7, z:  28 }, { x: 0, z:  28 }, { x: 7, z:  28 },
    { x: -4, z:  42 }, { x: 4, z:  42 },
  ]

  for (const { x, z } of obstacleLayout) {
    const radius = 1.1 + Math.random() * 0.4
    const worldPos = rampToWorld(x, 0.5 + radius, z)

    // Three.js sphere
    const geo  = new THREE.SphereGeometry(radius, 12, 8)
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xcc8833, shininess: 60 }))
    mesh.position.copy(worldPos)
    mesh.castShadow = true
    scene.add(mesh)

    // Cannon body (static)
    const body = new CANNON.Body({ mass: 0, material: obstMat })
    body.addShape(new CANNON.Sphere(radius))
    body.position.set(worldPos.x, worldPos.y, worldPos.z)
    physicsWorld.addBody(body)
  }
}

function buildFinishLine() {
  const rampQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), RAMP_ANGLE)
  // Finish line stripe
  const pos = rampToWorld(0, 0.52, FINISH_LOCAL_Z)
  const geo  = new THREE.BoxGeometry(RAMP_HW * 2, 0.05, 1.5)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  mesh.position.copy(pos)
  mesh.quaternion.copy(rampQuat)
  scene.add(mesh)

  // Alternating black/white checker pattern stripes
  const colors = [0x000000, 0xffffff]
  for (let i = 0; i < 8; i++) {
    const cx = -RAMP_HW + i * (RAMP_HW * 2 / 8) + (RAMP_HW / 8)
    const cp = rampToWorld(cx, 0.52, FINISH_LOCAL_Z)
    const cg = new THREE.BoxGeometry(RAMP_HW * 2 / 8, 0.06, 1.5)
    const cm = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: colors[i % 2] }))
    cm.position.copy(cp)
    cm.quaternion.copy(rampQuat)
    scene.add(cm)
  }

  // Finish line posts
  for (const side of [-RAMP_HW, RAMP_HW]) {
    const postPos = rampToWorld(side, 4, FINISH_LOCAL_Z)
    const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 8)
    const postMesh = new THREE.Mesh(postGeo, new THREE.MeshPhongMaterial({ color: 0xdddddd }))
    postMesh.position.copy(postPos)
    postMesh.quaternion.copy(rampQuat)
    scene.add(postMesh)
  }

  // Banner between posts
  const bannerPos = rampToWorld(0, 8.2, FINISH_LOCAL_Z)
  const bannerGeo = new THREE.BoxGeometry(RAMP_HW * 2, 0.4, 0.1)
  const bannerMesh = new THREE.Mesh(bannerGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }))
  bannerMesh.position.copy(bannerPos)
  bannerMesh.quaternion.copy(rampQuat)
  scene.add(bannerMesh)
}

// ─── Create/destroy marble meshes ─────────────────────────────────────────────
function createMarbleMesh(username, color, index, total) {
  const hexColor = parseInt(color.replace('#', ''), 16)

  // Sphere mesh
  const geo  = new THREE.SphereGeometry(MARBLE_RADIUS, 20, 16)
  const mat  = new THREE.MeshPhongMaterial({ color: hexColor, shininess: 120, specular: 0xffffff })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true

  // Label sprite
  const label = createLabelSprite(username, color)
  label.position.set(0, MARBLE_RADIUS + 1.8, 0)
  mesh.add(label)

  const pos = marbleStartPos(index, total)
  mesh.position.copy(pos)
  scene.add(mesh)

  return { username, color, mesh, label, body: null }
}

function createLabelSprite(text, color) {
  const canvas = document.createElement('canvas')
  canvas.width  = 256
  canvas.height = 56
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  ctx.beginPath()
  ctx.roundRect(2, 2, 252, 52, 8)
  ctx.fill()

  ctx.font = 'bold 28px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text.length > 14 ? text.slice(0, 13) + '…' : text, 128, 28)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(7, 1.6, 1)
  return sprite
}

function rebuildMarbleMeshes() {
  // Remove existing marble meshes
  for (const mo of marbleObjects) {
    scene.remove(mo.mesh)
    if (mo.body) physicsWorld.removeBody(mo.body)
  }
  marbleObjects.length = 0

  const list = marbles.value
  list.forEach((m, i) => {
    const obj = createMarbleMesh(m.username, m.color, i, list.length)
    marbleObjects.push(obj)
  })
}

function addMarbleMesh(username, color) {
  // Called when a single marble joins during 'allowed' phase
  const total = marbles.value.length
  const index = total - 1
  const obj = createMarbleMesh(username, color, index, total)
  // Reposition all marbles so they space evenly
  marbleObjects.push(obj)
  repositionMarbles()
}

function repositionMarbles() {
  const total = marbles.value.length
  marbleObjects.forEach((mo, i) => {
    const pos = marbleStartPos(i, total)
    mo.mesh.position.copy(pos)
    if (mo.body) {
      mo.body.position.set(pos.x, pos.y, pos.z)
      mo.body.velocity.setZero()
      mo.body.angularVelocity.setZero()
    }
  })
}

// ─── Race physics ──────────────────────────────────────────────────────────────
function startPhysics() {
  const total = marbleObjects.length
  const mblMat = physicsWorld._marbleMat

  marbleObjects.forEach((mo, i) => {
    if (mo.body) return
    const pos = marbleStartPos(i, total)
    const body = new CANNON.Body({
      mass: 5,
      material: mblMat,
      linearDamping: 0.1,
      angularDamping: 0.1,
    })
    body.addShape(new CANNON.Sphere(MARBLE_RADIUS))
    body.position.set(pos.x, pos.y, pos.z)
    // Small random push to spread marbles
    body.velocity.set((Math.random() - 0.5) * 0.3, 0, 0)
    physicsWorld.addBody(body)
    mo.body = body
  })
}

// ─── Animation loop ───────────────────────────────────────────────────────────
const FIXED_STEP = 1 / 60
let lastTime = null

function animate(timestamp) {
  animId = requestAnimationFrame(animate)

  const dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.05) : FIXED_STEP
  lastTime = timestamp

  if (raceStarted && physicsWorld) {
    physicsWorld.step(FIXED_STEP, dt, 3)

    let leader = null
    let leadZ = -Infinity

    for (const mo of marbleObjects) {
      if (!mo.body) continue
      mo.mesh.position.copy(mo.body.position)
      mo.mesh.quaternion.copy(mo.body.quaternion)

      const localZ = worldToLocalZ(mo.body.position.x, mo.body.position.y, mo.body.position.z)

      if (localZ > leadZ) {
        leadZ = localZ
        leader = mo
      }

      // Finish line detection
      if (!winnerEmitted && localZ >= FINISH_LOCAL_Z) {
        winnerEmitted = true
        socket.emit('marble:winner', { winner: mo.username })
      }
    }

    // Camera follows leader
    if (!cameraLocked && leader) {
      const leaderPos = new THREE.Vector3().copy(leader.mesh.position)
      controls.target.lerp(leaderPos, 0.05)
    }
  }

  if (controls.enabled) controls.update()
  renderer.render(scene, camera)
}

// ─── Camera reset ─────────────────────────────────────────────────────────────
function resetCamera() {
  camera.position.copy(START_CAM_POS)
  controls.target.copy(START_CAM_TGT)
  controls.update()
  controls.enabled = false
  cameraLocked = true
}

// ─── Socket setup ─────────────────────────────────────────────────────────────
let socket

function setupSocket() {
  const runtime = useRuntimeConfig()
  socket = io(
    import.meta.env.PROD
      ? undefined
      : `http://localhost:${runtime.public.socketPort}`,
    { reconnectionDelayMax: 5000 }
  )

  socket.on('connect', () => {
    socket.emit('marble:getState')
  })

  socket.on('marble:state', ({ phase: p, marbles: ms, winner: w }) => {
    phase.value = p
    marbles.value = ms
    winner.value = w
    if (scene) rebuildMarbleMeshes()
  })

  socket.on('marble:joined', (marble) => {
    marbles.value.push(marble)
    if (scene && phase.value !== 'racing') addMarbleMesh(marble.username, marble.color)
  })

  socket.on('marble:phaseChange', ({ phase: p }) => {
    phase.value = p
  })

  socket.on('marble:cleared', () => {
    phase.value = 'waiting'
    marbles.value = []
    winner.value = null
    raceStarted = false
    winnerEmitted = false
    if (scene) {
      rebuildMarbleMeshes()
      resetCamera()
    }
  })

  socket.on('marble:started', ({ marbles: ms }) => {
    phase.value = 'racing'
    marbles.value = ms
    winner.value = null
    winnerEmitted = false
    if (scene) {
      rebuildMarbleMeshes()
      raceStarted = true
      cameraLocked = false
      controls.enabled = true
      if (marbleObjects.length > 0) {
        controls.target.copy(START_CAM_TGT)
      }
      startPhysics()
    }
  })

  socket.on('marble:won', ({ winner: w }) => {
    winner.value = w
    phase.value = 'finished'
    raceStarted = false
  })
}

// ─── Admin actions ────────────────────────────────────────────────────────────
function adminAllow() { socket.emit('marble:allow') }
function adminClear() { socket.emit('marble:clear') }
function adminStart() { socket.emit('marble:start') }
function joinRace()   { socket.emit('marble:join') }

// ─── Resize handler ───────────────────────────────────────────────────────────
function onResize() {
  if (!renderer || !gameContainer.value) return
  const w = gameContainer.value.clientWidth
  const h = gameContainer.value.clientHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  setupSocket()
  initScene()
  animate(0)
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', onResize)
  if (socket) socket.disconnect()
  if (renderer) renderer.dispose()
})
</script>

<style>
html.newsite-marbles {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #001833 115px,
    #001833 100%
  ) no-repeat fixed !important;
}
html.newsite-marbles body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.marbles-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0e1a;
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Admin controls ── */
.admin-controls {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ctrl-btn {
  width: 88px;
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: opacity 0.15s, transform 0.1s;
}
.ctrl-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  transform: none;
}
.ctrl-btn:not(:disabled):hover { opacity: 0.88; transform: scale(1.04); }

.allow-btn { background: #22cc66; color: #fff; }
.clear-btn { background: #ee4444; color: #fff; }
.start-btn { background: #ff9900; color: #fff; }

/* ── Join button ── */
.join-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 20;
  padding: 10px 26px;
  background: #22aaff;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: opacity 0.15s, transform 0.1s;
}
.join-btn:hover { opacity: 0.88; transform: scale(1.04); }

/* ── Status label ── */
.status-label {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: rgba(0, 0, 0, 0.6);
  color: #eee;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 20px;
  pointer-events: none;
  white-space: nowrap;
}

/* ── Marble chip list ── */
.marble-list {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  max-width: 90%;
  pointer-events: none;
}
.marble-chip {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
}

/* ── Winner modal ── */
.modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
}
.modal {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border: 2px solid #ffd700;
  border-radius: 16px;
  padding: 36px 48px;
  text-align: center;
  box-shadow: 0 0 60px rgba(255, 215, 0, 0.3);
  animation: pop-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes pop-in {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
.modal-trophy {
  font-size: 52px;
  line-height: 1;
  margin-bottom: 8px;
}
.modal-title {
  color: #ffd700;
  font-size: 28px;
  font-weight: 800;
  margin: 0 0 6px;
}
.modal-winner {
  font-size: 32px;
  font-weight: 900;
  margin: 0 0 4px;
  text-shadow: 0 0 20px currentColor;
}
.modal-subtitle {
  color: #aaa;
  font-size: 14px;
  margin: 0;
}
</style>
