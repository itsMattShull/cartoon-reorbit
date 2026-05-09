<template>
  <NuxtLayout name="newsite-template">
    <div class="marbles-root">

      <!-- ── Admin controls (top-left) ── -->
      <div v-if="isAdmin" class="admin-controls">
        <button
          class="mbl-btn allow-btn"
          :disabled="raceState.isOpen || raceState.phase !== 'waiting'"
          @click="doAllow"
        >Allow</button>
        <button
          class="mbl-btn clear-btn"
          :disabled="raceState.phase === 'waiting' && !raceState.isOpen && raceState.marbles.length === 0"
          @click="doClear"
        >Clear</button>
        <button
          class="mbl-btn start-btn"
          :disabled="raceState.phase !== 'waiting' || raceState.marbles.length === 0"
          @click="doStart"
        >Start</button>
      </div>

      <!-- ── Non-admin Join button (top-right) ── -->
      <div v-else class="player-controls">
        <button
          class="mbl-btn join-btn"
          :disabled="!raceState.isOpen || raceState.phase !== 'waiting' || hasJoined"
          @click="doJoin"
        >{{ hasJoined ? 'Joined!' : 'Join' }}</button>
        <span class="status-text">
          <template v-if="raceState.phase === 'racing'">Race in progress!</template>
          <template v-else-if="raceState.phase === 'finished'">Race finished!</template>
          <template v-else-if="hasJoined">You're on the starting line!</template>
          <template v-else-if="!raceState.isOpen">Waiting for host to open joining…</template>
          <template v-else>Click Join to enter the race!</template>
        </span>
      </div>

      <!-- ── Marble count ── -->
      <div class="marble-count">
        {{ raceState.marbles.length }} marble{{ raceState.marbles.length !== 1 ? 's' : '' }}
      </div>

      <!-- ── Three.js canvas ── -->
      <canvas ref="threeCanvas" class="race-canvas" />

      <!-- ── Camera hint ── -->
      <div v-if="raceState.phase === 'racing'" class="cam-hint">
        Drag to look around &nbsp;·&nbsp; Auto-following leader
      </div>

      <!-- ── Winner modal ── -->
      <Teleport to="body">
        <div v-if="winnerModal" class="mbl-modal-backdrop" @click.self="winnerModal = null">
          <div class="mbl-modal">
            <div class="mbl-trophy">🏆</div>
            <div class="mbl-modal-title">Winner!</div>
            <div class="mbl-modal-name">{{ winnerModal }}</div>
            <button class="mbl-btn dismiss-btn" @click="winnerModal = null">Dismiss</button>
          </div>
        </div>
      </Teleport>
    </div>
  </NuxtLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { io as ioClient } from 'socket.io-client'
import * as THREE from 'three'
import { useRuntimeConfig } from '#imports'

definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

const { user, fetchSelf, isAdmin } = useAuth()
const runtime = useRuntimeConfig()

// ─── Socket state ──────────────────────────────────────────────────────────
const raceState = ref({
  marbles: [], isOpen: false, phase: 'waiting', sessionId: '', winner: null,
})
const winnerModal = ref(null)

const hasJoined = computed(() =>
  !!user.value?.username && raceState.value.marbles.some(m => m.username === user.value.username)
)

// ─── Three.js refs ─────────────────────────────────────────────────────────
const threeCanvas = ref(null)

// ─── Marble race constants (must match server) ──────────────────────────────
const MBL_RADIUS   = 0.8
const FINISH_Z     = -105
const MBL_FLOOR_SEGS = [
  [  0,  70,  6, 20],
  [  4,  40,  8, 10],
  [  8,   7,  5, 22.5],
  [  0, -25, 10, 10],
  [ -8, -55,  5, 20],
  [ -4,-82.5, 8, 7.5],
  [  0,-100,  7, 10],
]
const MBL_WALL_PAIRS = [
  [0, -6.3,  6.3],
  [1, -4.5, 12.5],
  [2,  2.7, 13.3],
  [3,-10.5, 10.5],
  [4,-13.3, -2.7],
  [5,-12.5,  4.5],
  [6, -7.3,  7.3],
]
const MBL_PEGS = [
  [-3,78],[3,75],[0,72],[-2,68],[2,64],[-3,60],[3,57],[0,54],
  [5,25],[11,22],[8,18],[5,14],[11,10],[8,6],[5,2],[11,-2],[8,-7],[5,-11],
  [-11,-40],[-5,-43],[-8,-47],[-11,-51],[-5,-55],[-8,-59],[-11,-63],[-5,-67],[-8,-71],
]

// ─── Three.js internals ────────────────────────────────────────────────────
let renderer, scene, camera, animId
let marbleMeshMap = new Map()   // marble id → { mesh, label, targetPos }
let labelDivMap   = new Map()   // marble id → DOM label div
let labelContainer = null

// Camera control state
let isDragging = false, lastMouseX = 0, lastMouseY = 0
let camTheta = Math.PI, camPhi = Math.PI / 4
let camDist = 60, camTarget = new THREE.Vector3(0, 0, 70)
let userOverride = false, userOverrideTimer = null
let cameraMode = 'static'  // 'static' | 'follow'

let socket = null

// ─── Socket setup ──────────────────────────────────────────────────────────
function connectSocket() {
  const url = runtime.public.socketUrl || window.location.origin.replace(/:\d+$/, ':3001')
  socket = ioClient(url, { withCredentials: true })

  socket.on('connect', () => {
    socket.emit('marbles:subscribe')
  })

  socket.on('marbles:state', (state) => {
    const prevPhase = raceState.value.phase
    raceState.value = state

    if (prevPhase !== 'waiting' && state.phase === 'waiting') {
      // Race was cleared — rebuild scene to starting state
      resetScene()
      cameraMode = 'static'
      userOverride = false
      snapCameraToStart()
    }
    if (prevPhase === 'waiting' && state.phase === 'racing') {
      cameraMode = 'follow'
    }
    if (state.phase === 'waiting') {
      syncMarbleMeshes(state.marbles)
    }
  })

  socket.on('marbles:tick', ({ positions }) => {
    for (const pos of positions) {
      const entry = marbleMeshMap.get(pos.id)
      if (entry) {
        entry.targetPos.set(pos.x, pos.y, pos.z)
      }
    }
  })

  socket.on('marbles:winner', ({ username }) => {
    winnerModal.value = username
  })

  socket.on('marbles:error', ({ message }) => {
    console.warn('[marbles]', message)
  })
}

// ─── Admin / player actions ────────────────────────────────────────────────
function doAllow() { socket?.emit('marbles:allow') }
function doClear()  { socket?.emit('marbles:clear') }
function doStart()  { socket?.emit('marbles:start') }
function doJoin()   { socket?.emit('marbles:join') }

// ─── Three.js setup ────────────────────────────────────────────────────────
function initThree() {
  const canvas = threeCanvas.value
  const W = canvas.clientWidth
  const H = canvas.clientHeight

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(W, H, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(0x1a1a2e, 80, 280)

  camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 500)
  snapCameraToStart()

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(20, 60, 60)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -60
  sun.shadow.camera.right = 60
  sun.shadow.camera.top = 120
  sun.shadow.camera.bottom = -120
  sun.shadow.camera.far = 300
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0x6699ff, 0.4)
  fill.position.set(-20, 30, -60)
  scene.add(fill)

  buildTrackMeshes()
  buildFinishLine()
  buildLabelContainer()

  // Mouse / touch camera controls
  canvas.addEventListener('mousedown',  onMouseDown)
  canvas.addEventListener('mousemove',  onMouseMove)
  canvas.addEventListener('mouseup',    onMouseUp)
  canvas.addEventListener('mouseleave', onMouseUp)
  canvas.addEventListener('wheel',      onWheel, { passive: true })
  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove',  onTouchMove,  { passive: false })
  canvas.addEventListener('touchend',   onMouseUp)

  animate()
}

function buildTrackMeshes() {
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x2d6a4f, roughness: 0.8, metalness: 0.1,
  })
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3a86ff, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.75,
  })
  const pegMat = new THREE.MeshStandardMaterial({
    color: 0xffd60a, roughness: 0.3, metalness: 0.5, emissive: 0x554400,
  })

  // Floor segments
  for (const [cx, cz, halfW, halfLen] of MBL_FLOOR_SEGS) {
    const geo = new THREE.BoxGeometry(halfW * 2, 1, halfLen * 2)
    const mesh = new THREE.Mesh(geo, floorMat)
    mesh.position.set(cx, -0.5, cz)
    mesh.receiveShadow = true
    scene.add(mesh)

    // Subtle lane lines on floor
    const lineGeo = new THREE.PlaneGeometry(halfW * 2 - 0.2, halfLen * 2 - 0.2)
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 1 })
    const lineMesh = new THREE.Mesh(lineGeo, lineMat)
    lineMesh.rotation.x = -Math.PI / 2
    lineMesh.position.set(cx, 0.01, cz)
    scene.add(lineMesh)
  }

  // Walls
  for (const [si, lx, rx] of MBL_WALL_PAIRS) {
    const [cx, cz, , halfLen] = MBL_FLOOR_SEGS[si]
    for (const wx of [lx, rx]) {
      const geo = new THREE.BoxGeometry(0.6, 3, halfLen * 2)
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.position.set(wx, 1.5, cz)
      mesh.receiveShadow = true
      mesh.castShadow = true
      scene.add(mesh)
    }
  }

  // Pegs
  const pegGeo = new THREE.SphereGeometry(0.6, 10, 8)
  for (const [px, pz] of MBL_PEGS) {
    const mesh = new THREE.Mesh(pegGeo, pegMat)
    mesh.position.set(px, 0.6, pz)
    mesh.castShadow = true
    scene.add(mesh)
  }
}

function buildFinishLine() {
  // Chequered finish line stripe
  const stripeGeo = new THREE.PlaneGeometry(16, 2)
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x888888, roughness: 0.4,
  })
  const stripe = new THREE.Mesh(stripeGeo, mat)
  stripe.rotation.x = -Math.PI / 2
  stripe.position.set(0, 0.02, FINISH_Z)
  scene.add(stripe)

  // Glowing post markers
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 8)
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xff0044, emissive: 0x880022, roughness: 0.3,
  })
  for (const px of [-8, 8]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(px, 3, FINISH_Z)
    scene.add(post)
  }

  // Banner between posts
  const bannerGeo = new THREE.PlaneGeometry(16, 1.2)
  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0xff0044, emissive: 0x550011, side: THREE.DoubleSide,
  })
  const banner = new THREE.Mesh(bannerGeo, bannerMat)
  banner.position.set(0, 6.4, FINISH_Z)
  scene.add(banner)
}

function buildLabelContainer() {
  labelContainer = document.createElement('div')
  labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;'
  threeCanvas.value.parentElement.appendChild(labelContainer)
}

// ─── Marble mesh management ────────────────────────────────────────────────
function syncMarbleMeshes(marbles) {
  const newIds = new Set(marbles.map(m => m.id))

  // Remove departed
  for (const [id, entry] of marbleMeshMap) {
    if (!newIds.has(id)) {
      scene.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      marbleMeshMap.delete(id)
    }
  }
  for (const [id, div] of labelDivMap) {
    if (!newIds.has(id)) {
      labelContainer?.removeChild(div)
      labelDivMap.delete(id)
    }
  }

  // Add new
  const spreadMax = Math.min(marbles.length - 1, 10) * 1.8
  const step = marbles.length > 1 ? spreadMax / (marbles.length - 1) : 0

  marbles.forEach((m, i) => {
    if (marbleMeshMap.has(m.id)) return
    const geo = new THREE.SphereGeometry(MBL_RADIUS, 20, 16)
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(m.color),
      roughness: 0.2,
      metalness: 0.6,
      envMapIntensity: 1,
    })
    const mesh = new THREE.Mesh(geo, mat)
    const startX = -spreadMax / 2 + i * step
    mesh.position.set(startX, MBL_RADIUS, 87)
    mesh.castShadow = true
    scene.add(mesh)

    // Label div
    const div = document.createElement('div')
    div.textContent = m.username
    div.style.cssText = `
      position:absolute;
      background:rgba(0,0,0,0.65);
      color:#fff;
      padding:1px 5px;
      border-radius:4px;
      font-size:10px;
      font-family:Nunito,sans-serif;
      white-space:nowrap;
      transform:translate(-50%,-100%);
      pointer-events:none;
    `
    labelContainer?.appendChild(div)
    labelDivMap.set(m.id, div)

    marbleMeshMap.set(m.id, { mesh, targetPos: mesh.position.clone() })
  })
}

function resetScene() {
  for (const [, entry] of marbleMeshMap) {
    scene.remove(entry.mesh)
    entry.mesh.geometry.dispose()
    entry.mesh.material.dispose()
  }
  marbleMeshMap.clear()
  for (const [, div] of labelDivMap) {
    labelContainer?.removeChild(div)
  }
  labelDivMap.clear()
}

// ─── Camera helpers ────────────────────────────────────────────────────────
function snapCameraToStart() {
  camTarget.set(0, 0, 70)
  camTheta = Math.PI
  camPhi   = Math.PI / 4.5
  camDist  = 65
  applyCameraOrbit()
}

function applyCameraOrbit() {
  const x = camTarget.x + camDist * Math.sin(camPhi) * Math.sin(camTheta)
  const y = camTarget.y + camDist * Math.cos(camPhi)
  const z = camTarget.z + camDist * Math.sin(camPhi) * Math.cos(camTheta)
  camera.position.set(x, y, z)
  camera.lookAt(camTarget)
}

function getLeaderPosition() {
  let minZ = Infinity, leader = null
  for (const [, entry] of marbleMeshMap) {
    if (entry.targetPos.z < minZ) {
      minZ = entry.targetPos.z
      leader = entry.targetPos
    }
  }
  return leader
}

// ─── Animation loop ────────────────────────────────────────────────────────
const _tmpVec = new THREE.Vector3()

function animate() {
  animId = requestAnimationFrame(animate)

  const lerpSpeed = 0.25

  // Lerp marble meshes toward latest physics positions
  for (const [id, entry] of marbleMeshMap) {
    entry.mesh.position.lerp(entry.targetPos, lerpSpeed)
  }

  // Update HTML labels to follow marble positions
  if (labelContainer) {
    const W = renderer.domElement.clientWidth
    const H = renderer.domElement.clientHeight
    for (const [id, div] of labelDivMap) {
      const entry = marbleMeshMap.get(id)
      if (!entry) continue
      _tmpVec.copy(entry.mesh.position)
      _tmpVec.y += MBL_RADIUS + 0.5
      _tmpVec.project(camera)
      const sx = ( _tmpVec.x * 0.5 + 0.5) * W
      const sy = (-_tmpVec.y * 0.5 + 0.5) * H
      const behind = _tmpVec.z > 1
      div.style.display = behind ? 'none' : 'block'
      div.style.left = sx + 'px'
      div.style.top  = sy + 'px'
    }
  }

  // Follow camera
  if (cameraMode === 'follow' && !userOverride) {
    const leader = getLeaderPosition()
    if (leader) {
      const tgt = new THREE.Vector3(leader.x, 0, leader.z)
      camTarget.lerp(tgt, 0.04)
      camDist = THREE.MathUtils.lerp(camDist, 55, 0.02)
      applyCameraOrbit()
    }
  }

  renderer.render(scene, camera)
}

// ─── Mouse / touch controls ────────────────────────────────────────────────
function onMouseDown(e) {
  isDragging = true
  lastMouseX = e.clientX
  lastMouseY = e.clientY
}
function onMouseMove(e) {
  if (!isDragging) return
  const dx = e.clientX - lastMouseX
  const dy = e.clientY - lastMouseY
  lastMouseX = e.clientX
  lastMouseY = e.clientY
  camTheta -= dx * 0.008
  camPhi    = Math.max(0.15, Math.min(Math.PI * 0.48, camPhi + dy * 0.006))
  applyCameraOrbit()
  setUserOverride()
}
function onMouseUp() { isDragging = false }
function onWheel(e) {
  camDist = Math.max(10, Math.min(200, camDist + e.deltaY * 0.1))
  applyCameraOrbit()
  setUserOverride()
}

let touchStartX = 0, touchStartY = 0
function onTouchStart(e) {
  if (e.touches.length === 1) {
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    isDragging = true
  }
}
function onTouchMove(e) {
  if (!isDragging || e.touches.length !== 1) return
  e.preventDefault()
  const dx = e.touches[0].clientX - touchStartX
  const dy = e.touches[0].clientY - touchStartY
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
  camTheta -= dx * 0.008
  camPhi    = Math.max(0.15, Math.min(Math.PI * 0.48, camPhi + dy * 0.006))
  applyCameraOrbit()
  setUserOverride()
}

function setUserOverride() {
  if (cameraMode !== 'follow') return
  userOverride = true
  if (userOverrideTimer) clearTimeout(userOverrideTimer)
  userOverrideTimer = setTimeout(() => { userOverride = false }, 4000)
}

// ─── Resize handler ────────────────────────────────────────────────────────
function onResize() {
  const canvas = threeCanvas.value
  if (!canvas || !renderer) return
  const W = canvas.clientWidth
  const H = canvas.clientHeight
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  camera.updateProjectionMatrix()
}

// ─── Watch for marble list changes during waiting phase ────────────────────
watch(() => raceState.value.marbles, (marbles) => {
  if (raceState.value.phase === 'waiting') {
    syncMarbleMeshes(marbles)
  }
}, { deep: true })

// ─── Lifecycle ────────────────────────────────────────────────────────────
onMounted(async () => {
  await fetchSelf()
  connectSocket()
  await nextTick()
  initThree()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  socket?.disconnect()
  if (animId) cancelAnimationFrame(animId)
  window.removeEventListener('resize', onResize)
  if (userOverrideTimer) clearTimeout(userOverrideTimer)
  labelContainer?.remove()
  renderer?.dispose()
})
</script>

<style scoped>
.marbles-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a2e;
}

.race-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.race-canvas:active { cursor: grabbing; }

/* ── Admin controls – stacked vertically in top-left ── */
.admin-controls {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}

/* ── Player controls – top-right ── */
.player-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 10;
}

.status-text {
  color: #cce;
  font-size: 12px;
  font-family: 'Nunito', sans-serif;
  text-shadow: 0 1px 3px #000;
}

/* ── Marble count ── */
.marble-count {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  color: #adf;
  font-size: 13px;
  font-family: 'Nunito', sans-serif;
  background: rgba(0,0,0,0.5);
  padding: 2px 10px;
  border-radius: 6px;
  z-index: 10;
}

/* ── Camera hint ── */
.cam-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(200,220,255,0.7);
  font-size: 11px;
  font-family: 'Nunito', sans-serif;
  pointer-events: none;
  z-index: 10;
}

/* ── Shared button styles ── */
.mbl-btn {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  font-family: 'Nunito', sans-serif;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
  white-space: nowrap;
}
.mbl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.mbl-btn:not(:disabled):hover { filter: brightness(1.15); }

.allow-btn   { background: #3a86ff; color: #fff; }
.clear-btn   { background: #ef476f; color: #fff; }
.start-btn   { background: #06d6a0; color: #000; }
.join-btn    { background: #ffd60a; color: #000; }
.dismiss-btn { background: #3a86ff; color: #fff; margin-top: 8px; }

/* ── Winner modal ── */
.mbl-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.mbl-modal {
  background: linear-gradient(135deg, #1b2a4a 0%, #0d1b2a 100%);
  border: 2px solid #3a86ff;
  border-radius: 16px;
  padding: 40px 56px;
  text-align: center;
  animation: pop-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
  box-shadow: 0 0 60px rgba(58,134,255,0.4);
}

.mbl-trophy {
  font-size: 56px;
  line-height: 1;
  margin-bottom: 8px;
}

.mbl-modal-title {
  font-family: 'Nunito', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #ffd60a;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.mbl-modal-name {
  font-family: 'Nunito', sans-serif;
  font-size: 34px;
  font-weight: 800;
  color: #fff;
  margin-bottom: 20px;
  text-shadow: 0 0 20px #ffd60a;
}

@keyframes pop-in {
  from { transform: scale(0.6); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}
</style>
