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
        <button
          class="mbl-btn focus-btn"
          :disabled="raceState.phase !== 'racing'"
          @click="focusLeader"
        >1st</button>
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
        <template v-if="isAdmin">Drag to look &nbsp;·&nbsp; "1st" focuses leader</template>
        <template v-else>Following your marble…</template>
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
const MBL_RADIUS  = 0.8
const FINISH_Z    = -118

// Curved course — Catmull-Rom spine [x, z]
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
  [-15, -108],
  [ 0,  -118],
]
const COURSE_HALF_W = 5
const COURSE_N_SEGS = 120

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

// ─── Three.js internals ────────────────────────────────────────────────────
let renderer, scene, camera, animId
let marbleMeshMap = new Map()   // marble id → { mesh, targetPos, username }
let labelDivMap   = new Map()   // marble id → DOM label div
let labelContainer = null

// Camera control state
let isDragging = false, lastMouseX = 0, lastMouseY = 0
let camTheta = Math.PI, camPhi = Math.PI / 4
let camDist = 60, camTarget = new THREE.Vector3(0, 0, 75)
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

  // Camera controls – admin only
  if (isAdmin.value) {
    canvas.addEventListener('mousedown',  onMouseDown)
    canvas.addEventListener('mousemove',  onMouseMove)
    canvas.addEventListener('mouseup',    onMouseUp)
    canvas.addEventListener('mouseleave', onMouseUp)
    canvas.addEventListener('wheel',      onWheel, { passive: true })
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false })
    canvas.addEventListener('touchend',   onMouseUp)
  }

  animate()
}

function buildTrackMeshes() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.8, metalness: 0.1 })
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.85 })
  const pegMat   = new THREE.MeshStandardMaterial({ color: 0xffd60a, roughness: 0.3, metalness: 0.5, emissive: 0x554400 })

  const samples = buildCourseSamples()
  const WALL_H  = 3
  const WALL_T  = 0.3
  const pegGeo  = new THREE.CylinderGeometry(0.45, 0.45, 3, 10)

  const nSegs = samples.length - 1

  // Pre-compute per-segment direction data
  const sDx    = new Array(nSegs)
  const sDz    = new Array(nSegs)
  const sLen   = new Array(nSegs)
  const sAngle = new Array(nSegs)
  for (let i = 0; i < nSegs; i++) {
    const [x1, z1] = samples[i], [x2, z2] = samples[i + 1]
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.sqrt(dx * dx + dz * dz)
    sDx[i] = dx; sDz[i] = dz; sLen[i] = len
    sAngle[i] = Math.atan2(dx, dz)
  }

  // Unsigned miter — extends each segment to fill corner gaps; overlapping transparent meshes have no visible artifact
  function miterExt(a, b) {
    if (a < 0 || b >= nSegs) return 0.1
    let delta = sAngle[b] - sAngle[a]
    if (delta >  Math.PI) delta -= 2 * Math.PI
    if (delta < -Math.PI) delta += 2 * Math.PI
    return Math.min(COURSE_HALF_W * Math.abs(Math.tan(delta / 2)), COURSE_HALF_W)
  }

  for (let i = 0; i < nSegs; i++) {
    const dx = sDx[i], dz = sDz[i], len = sLen[i]
    if (len < 0.001) continue
    const angle = sAngle[i]
    const [x1, z1] = samples[i], [x2, z2] = samples[i + 1]
    const rawMidX = (x1 + x2) / 2, rawMidZ = (z1 + z2) / 2

    // Floor + walls all use unsigned miter so corners are always filled
    const bk  = miterExt(i - 1, i), ft = miterExt(i, i + 1)
    const tot  = len + bk + ft
    const sh   = (ft - bk) / 2

    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(COURSE_HALF_W * 2, 1, tot), floorMat)
    floorMesh.position.set(rawMidX + (dx / len) * sh, -0.5, rawMidZ + (dz / len) * sh)
    floorMesh.rotation.y = angle
    floorMesh.receiveShadow = true
    scene.add(floorMesh)

    const lw = new THREE.Mesh(new THREE.BoxGeometry(WALL_T * 2, WALL_H * 2, tot), wallMat)
    lw.position.set(
      rawMidX + (dx / len) * sh + (-dz / len) * (COURSE_HALF_W + WALL_T),
      WALL_H,
      rawMidZ + (dz / len) * sh + ( dx / len) * (COURSE_HALF_W + WALL_T)
    )
    lw.rotation.y = angle
    lw.castShadow = true
    scene.add(lw)

    const rw = new THREE.Mesh(new THREE.BoxGeometry(WALL_T * 2, WALL_H * 2, tot), wallMat)
    rw.position.set(
      rawMidX + (dx / len) * sh + ( dz / len) * (COURSE_HALF_W + WALL_T),
      WALL_H,
      rawMidZ + (dz / len) * sh + (-dx / len) * (COURSE_HALF_W + WALL_T)
    )
    rw.rotation.y = angle
    rw.castShadow = true
    scene.add(rw)
  }

  // Pegs — same logic as server (denser, every 5 samples, cycling left/center/right/center)
  const PEG_PATTERN = [-1, 0, 1, 0]
  for (let i = 5; i < samples.length - 7; i += 5) {
    const [px, pz] = samples[i]
    const [nx, nz] = samples[Math.min(i + 1, samples.length - 1)]
    const ddx = nx - px, ddz = nz - pz
    const dlen = Math.sqrt(ddx * ddx + ddz * ddz)
    if (dlen < 0.001) continue
    const side = PEG_PATTERN[Math.floor(i / 5) % PEG_PATTERN.length]
    const off  = side * (COURSE_HALF_W * 0.45)
    const mesh = new THREE.Mesh(pegGeo, pegMat)
    mesh.position.set(px + (-ddz / dlen) * off, 1.5, pz + (ddx / dlen) * off)
    mesh.castShadow = true
    scene.add(mesh)
  }
}

function buildFinishLine() {
  // Determine approach direction from the last two course samples
  const samples = buildCourseSamples()
  const lastIdx = samples.length - 1
  const [finX, finZ] = samples[lastIdx]
  const [prevX, prevZ] = samples[lastIdx - 1]
  const adx = finX - prevX, adz = finZ - prevZ
  const approachAngle = Math.atan2(adx, adz)

  // Everything lives in a group so a single rotation aligns all pieces
  const group = new THREE.Group()
  group.position.set(finX, 0, finZ)
  group.rotation.y = approachAngle
  scene.add(group)

  const finishW = COURSE_HALF_W * 2

  // Floor stripe (perpendicular to approach direction)
  const stripeGeo = new THREE.PlaneGeometry(finishW, 2)
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x888888, roughness: 0.4 })
  const stripe = new THREE.Mesh(stripeGeo, stripeMat)
  stripe.rotation.x = -Math.PI / 2
  stripe.position.y = 0.02
  group.add(stripe)

  // Posts on each side
  const postGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 8)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0x880022, roughness: 0.3 })
  for (const postX of [-(COURSE_HALF_W + 0.3), COURSE_HALF_W + 0.3]) {
    const post = new THREE.Mesh(postGeo, postMat)
    post.position.set(postX, 3, 0)
    group.add(post)
  }

  // Banner above the posts
  const bannerGeo = new THREE.PlaneGeometry(finishW + 0.6, 1.2)
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0xff0044, emissive: 0x550011, side: THREE.DoubleSide })
  const banner = new THREE.Mesh(bannerGeo, bannerMat)
  banner.position.set(0, 6.4, 0)
  group.add(banner)

  // End-cap wall across the full track width just past the finish line,
  // preventing marbles from escaping or getting pinched in the closing walls
  const capMat = new THREE.MeshStandardMaterial({ color: 0x3a86ff, roughness: 0.6, metalness: 0.2, transparent: true, opacity: 0.85 })
  const capGeo = new THREE.BoxGeometry(finishW + 0.6, 6, 0.6)
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.set(0, 3, 1)
  group.add(cap)
}

function buildLabelContainer() {
  labelContainer = document.createElement('div')
  labelContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;'
  threeCanvas.value.parentElement.appendChild(labelContainer)
}

// ─── Marble mesh management ────────────────────────────────────────────────
function syncMarbleMeshes(marbles) {
  const newIds = new Set(marbles.map(m => m.id))

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

  const maxSpread = (COURSE_HALF_W - MBL_RADIUS - 0.3) * 2
  const spreadMax = Math.min((marbles.length - 1) * 1.5, maxSpread)
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

    marbleMeshMap.set(m.id, { mesh, targetPos: mesh.position.clone(), username: m.username })
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
  camTarget.set(0, 0, 75)
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

function getMyMarblePosition() {
  const myUsername = user.value?.username
  if (!myUsername) return null
  for (const [, entry] of marbleMeshMap) {
    if (entry.username === myUsername) return entry.targetPos
  }
  return null
}

function focusLeader() {
  const leader = getLeaderPosition()
  if (!leader) return
  camTarget.set(leader.x, 0, leader.z)
  camDist = 55
  applyCameraOrbit()
}

// ─── Animation loop ────────────────────────────────────────────────────────
const _tmpVec = new THREE.Vector3()

function animate() {
  animId = requestAnimationFrame(animate)

  const lerpSpeed = 0.25

  for (const [, entry] of marbleMeshMap) {
    entry.mesh.position.lerp(entry.targetPos, lerpSpeed)
  }

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

  if (cameraMode === 'follow' && !userOverride) {
    // Admins follow the race leader; non-admins are locked to their own marble
    const followPos = isAdmin.value ? getLeaderPosition() : getMyMarblePosition()
    if (followPos) {
      const tgt = new THREE.Vector3(followPos.x, 0, followPos.z)
      camTarget.lerp(tgt, 0.04)
      camDist = THREE.MathUtils.lerp(camDist, 55, 0.02)
      applyCameraOrbit()
    }
  }

  renderer.render(scene, camera)
}

// ─── Mouse / touch controls (admin only) ──────────────────────────────────
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

@media (max-width: 768px) {
  .marbles-root {
    height: calc(100dvh - 120px);
    min-height: 320px;
  }
}

.race-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* Admin has cursor: grab since they can drag; non-admin gets default */
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
.focus-btn   { background: #ff9500; color: #000; }
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
