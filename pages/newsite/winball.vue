<template>
  <div ref="gameContainer" class="game-container">
        <button class="reset-btn" @click="resetBall">Reset Ball</button>
        <canvas ref="canvas" class="game-canvas"></canvas>

        <!-- Result Modal -->
        <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
          <div class="modal">
            <h2 class="modal-title">{{ modal.title }}</h2>
            <p class="modal-msg">{{ modal.message }}</p>
            <img
              v-if="modal.imageUrl"
              :src="modal.imageUrl"
              alt="Won cToon"
              class="modal-img"
            />
            <button class="modal-btn" @click="closeModal">OK</button>
          </div>
        </div>

        <!-- Scavenger Hunt Modal (defer until Winball result modal closed) -->
        <ScavengerHuntModal v-if="!modal.open && scavenger.isOpen && scavenger.sessionId" />
      </div>
</template>

<script setup>
import { useHead } from '#imports'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Winball',
  description: 'Play Winball, the pinball-style game on Cartoon ReOrbit, for a chance to win points and exclusive cToons.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

useHead({
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    }
  ]
})

import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { useAuth } from '~/composables/useAuth'
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

const { fetchSelf } = useAuth()
const scavenger = useScavengerHunt()

const modal = ref({ open: false, title: '', message: '', imageUrl: '' })
const canvas = ref(null)
const gameContainer = ref(null)

function showModal({ title, message, imageUrl }) {
  modal.value = { open: true, title, message, imageUrl: imageUrl || '' }
}

async function closeModal() {
  modal.value.open = false
  resetBall()
  await fetchSelf({ force: true })
  scavenger.openIfPending()
}

const COLORS = {
  background:              '#ffffff',
  board:                   '#F0E6FF',
  bumper:                  '#8c8cff',
  halfCircle:              '#8c8cff',
  cap:                     '#ffd000',
  goldHalfCircle:          '#FFD700',
  ball:                    '#ff0000',
  walls:                   '#4b4b4b',
  overlayColor:            '#ffffff',
  overlayAlpha:            0,
  colorTransform:          '#ffffff',
  colorTransformIntensity: 0,
  imageWidthPercent:       100,
  imageOffsetXPercent:     0,
  imageOffsetYPercent:     0,
  backboardImagePath:      null,
  bumperImagePaths:        [null, null, null]
}

const PHYSICS = {
  gravity:             15,
  ballMass:            8,
  ballLinearDamping:   0.2,
  ballAngularDamping:  0,
  ballWallRestitution: 1.2,
  plungerMaxPull:      0.6,
  plungerImpactFactor: 0.2,
  plungerForce:        500
}

const LAYOUT = {
  bumpers: [
    { radius: 6, height: 6, x: -8, z: -9 },
    { radius: 6, height: 6, x: -1, z:  0 },
    { radius: 6, height: 6, x:  6, z: -9 }
  ],
  triangles: [
    { radius: 6, depth: 6, x: -15, z: -2 },
    { radius: 0, depth: 6, x:  15, z: -2 }
  ],
  pegs: [
    { radius: 1.5, height: 4, x: -11, z: -17 },
    { radius: 1.5, height: 4, x:  -3, z: -17 },
    { radius: 1.5, height: 4, x:   5, z: -17 },
    { radius: 1.5, height: 4, x:  12, z: -17 },
    { radius: 1.5, height: 4, x: -12, z:  -6 },
    { radius: 1.5, height: 4, x:  -5, z:  -6 },
    { radius: 1.5, height: 4, x:   2, z:  -6 },
    { radius: 1.5, height: 4, x:  10, z:  -6 },
    { radius: 1.5, height: 4, x: -12, z:   4 },
    { radius: 1.5, height: 4, x:  -5, z:   5 },
    { radius: 1.5, height: 4, x:   3, z:   4 },
    { radius: 1.5, height: 4, x:  11, z:   4 }
  ]
}

function hexToInt(hex) {
  return parseInt((hex || '#ffffff').replace('#', ''), 16)
}

let winSound, loseSound, bigBumperSound, plungerSound
function initSounds() {
  winSound = new Audio('/winball/win.mp3')
  winSound.volume = 0.8
  winSound.preload = 'auto'
  loseSound = new Audio('/winball/lose.mp3')
  loseSound.volume = 0.8
  loseSound.preload = 'auto'
  bigBumperSound = new Audio('/winball/bigbumper.mp3')
  bigBumperSound.volume = 0.4
  bigBumperSound.preload = 'auto'
  plungerSound = new Audio('/winball/plunger.mp3')
  plungerSound.volume = 0.8
  plungerSound.preload = 'auto'
}

let audioCtx
let wallBuffer = null

function playWallSound() {
  if (!wallBuffer) return
  const src = audioCtx.createBufferSource()
  src.buffer = wallBuffer
  src.connect(audioCtx.destination)
  src.start(0)
}

function prepareWallSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return fetch('/winball/wall.mp3')
    .then(res => res.arrayBuffer())
    .then(ab => audioCtx.decodeAudioData(ab))
    .then(buf => { wallBuffer = buf })
    .catch(console.error)
}

const makeMat = (hex, opts = {}) =>
  new THREE.MeshPhongMaterial({
    color: hex,
    specular: 0xffffff,
    shininess: opts.shininess ?? 50,
    transparent: true,
    opacity: opts.opacity ?? 0.9
  })

let stateHistory = []
let frameTick = 0
let gameEnded = false

let scene, world
let ballBody, ballMesh
let capBody = null
let capMesh = null
let capClosed = false
let ballLaunched = false
let initialBallPos = { x: 0, y: 0, z: 0 }

let rootGroup
let laneCenterX, plungerY, plungerOriginalZ
let launched = false
let plungerPulling = false
let pullStrength = 0
let plungerMesh, plungerBody

let renderer = null
let camera = null
let resizeObserver = null
let animFrameId = null

const resetBall = () => {
  if (capBody) { world.removeBody(capBody); capBody = null }
  if (capMesh) { rootGroup.remove(capMesh); capMesh = null }
  capClosed = false
  stateHistory = []
  frameTick = 0
  gameEnded = false
  initSounds()
  prepareWallSound()
  ballBody.position.set(initialBallPos.x, initialBallPos.y, initialBallPos.z)
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballMesh.position.set(initialBallPos.x, initialBallPos.y, initialBallPos.z)
  ballLaunched = false
  ballBody.type = CANNON.Body.KINEMATIC
  ballBody.collisionResponse = false
  plungerBody.position.set(laneCenterX, plungerY, plungerOriginalZ)
  plungerBody.velocity.setZero()
  plungerMesh.position.set(laneCenterX, plungerY, plungerOriginalZ)
  launched = false
  plungerPulling = false
  pullStrength = 0
  plungerBody.type = CANNON.Body.KINEMATIC
  plungerBody.collisionResponse = true
}

onMounted(async () => {
  scavenger.reset()

  try {
    const cfg = await $fetch('/api/winball-config')
    COLORS.background     = cfg.winballColorBackground || COLORS.background
    COLORS.board          = cfg.winballColorBackboard  || COLORS.board
    COLORS.overlayColor   = cfg.winballOverlayColor    || COLORS.overlayColor
    if (cfg.winballOverlayAlpha != null) COLORS.overlayAlpha = cfg.winballOverlayAlpha
    COLORS.colorTransform = cfg.winballColorTransform || COLORS.colorTransform
    if (cfg.winballColorTransformIntensity != null) COLORS.colorTransformIntensity = cfg.winballColorTransformIntensity
    if (cfg.winballImageWidthPercent != null) COLORS.imageWidthPercent = cfg.winballImageWidthPercent
    if (cfg.winballImageOffsetXPercent != null) COLORS.imageOffsetXPercent = cfg.winballImageOffsetXPercent
    if (cfg.winballImageOffsetYPercent != null) COLORS.imageOffsetYPercent = cfg.winballImageOffsetYPercent
    COLORS.backboardImagePath = cfg.winballBackboardImagePath || null
    COLORS.bumperImagePaths = [
      cfg.winballBumper1ImagePath || null,
      cfg.winballBumper2ImagePath || null,
      cfg.winballBumper3ImagePath || null
    ]
    COLORS.walls          = cfg.winballColorWalls      || COLORS.walls
    COLORS.ball           = cfg.winballColorBall       || COLORS.ball
    COLORS.bumper         = cfg.winballColorBumpers    || COLORS.bumper
    COLORS.halfCircle     = cfg.winballColorLeftCup    || COLORS.halfCircle
    COLORS.rightCircle    = cfg.winballColorRightCup   || COLORS.halfCircle
    COLORS.goldHalfCircle = cfg.winballColorGoldCup    || COLORS.goldHalfCircle
    COLORS.cap            = cfg.winballColorCap        || COLORS.cap
    if (cfg.winballGravity             != null) PHYSICS.gravity             = cfg.winballGravity
    if (cfg.winballBallMass            != null) PHYSICS.ballMass            = cfg.winballBallMass
    if (cfg.winballBallLinearDamping   != null) PHYSICS.ballLinearDamping   = cfg.winballBallLinearDamping
    if (cfg.winballBallAngularDamping  != null) PHYSICS.ballAngularDamping  = cfg.winballBallAngularDamping
    if (cfg.winballBallWallRestitution != null) PHYSICS.ballWallRestitution = cfg.winballBallWallRestitution
    if (cfg.winballPlungerMaxPull      != null) PHYSICS.plungerMaxPull      = cfg.winballPlungerMaxPull
    if (cfg.winballPlungerImpactFactor != null) PHYSICS.plungerImpactFactor = cfg.winballPlungerImpactFactor
    if (cfg.winballPlungerForce        != null) PHYSICS.plungerForce        = cfg.winballPlungerForce
    if (cfg.winballBumper1Radius != null) LAYOUT.bumpers[0].radius = cfg.winballBumper1Radius
    if (cfg.winballBumper1Height != null) LAYOUT.bumpers[0].height = cfg.winballBumper1Height
    if (cfg.winballBumper1X      != null) LAYOUT.bumpers[0].x      = cfg.winballBumper1X
    if (cfg.winballBumper1Z      != null) LAYOUT.bumpers[0].z      = cfg.winballBumper1Z
    if (cfg.winballBumper2Radius != null) LAYOUT.bumpers[1].radius = cfg.winballBumper2Radius
    if (cfg.winballBumper2Height != null) LAYOUT.bumpers[1].height = cfg.winballBumper2Height
    if (cfg.winballBumper2X      != null) LAYOUT.bumpers[1].x      = cfg.winballBumper2X
    if (cfg.winballBumper2Z      != null) LAYOUT.bumpers[1].z      = cfg.winballBumper2Z
    if (cfg.winballBumper3Radius != null) LAYOUT.bumpers[2].radius = cfg.winballBumper3Radius
    if (cfg.winballBumper3Height != null) LAYOUT.bumpers[2].height = cfg.winballBumper3Height
    if (cfg.winballBumper3X      != null) LAYOUT.bumpers[2].x      = cfg.winballBumper3X
    if (cfg.winballBumper3Z      != null) LAYOUT.bumpers[2].z      = cfg.winballBumper3Z
    if (cfg.winballTriangle1Radius != null) LAYOUT.triangles[0].radius = cfg.winballTriangle1Radius
    if (cfg.winballTriangle1Depth  != null) LAYOUT.triangles[0].depth  = cfg.winballTriangle1Depth
    if (cfg.winballTriangle1X      != null) LAYOUT.triangles[0].x      = cfg.winballTriangle1X
    if (cfg.winballTriangle1Z      != null) LAYOUT.triangles[0].z      = cfg.winballTriangle1Z
    if (cfg.winballTriangle2Radius != null) LAYOUT.triangles[1].radius = cfg.winballTriangle2Radius
    if (cfg.winballTriangle2Depth  != null) LAYOUT.triangles[1].depth  = cfg.winballTriangle2Depth
    if (cfg.winballTriangle2X      != null) LAYOUT.triangles[1].x      = cfg.winballTriangle2X
    if (cfg.winballTriangle2Z      != null) LAYOUT.triangles[1].z      = cfg.winballTriangle2Z
    for (let i = 0; i < 12; i++) {
      const n = i + 1
      if (cfg[`winballPeg${n}Radius`] != null) LAYOUT.pegs[i].radius = cfg[`winballPeg${n}Radius`]
      if (cfg[`winballPeg${n}Height`] != null) LAYOUT.pegs[i].height = cfg[`winballPeg${n}Height`]
      if (cfg[`winballPeg${n}X`]      != null) LAYOUT.pegs[i].x      = cfg[`winballPeg${n}X`]
      if (cfg[`winballPeg${n}Z`]      != null) LAYOUT.pegs[i].z      = cfg[`winballPeg${n}Z`]
    }
  } catch (e) {
    console.warn('Could not load Winball config, using defaults', e)
  }

  const ballMass = PHYSICS.ballMass
  const boardGravityVec = new CANNON.Vec3(0, 0, PHYSICS.gravity)
  const ballLinearDamping = PHYSICS.ballLinearDamping
  const ballAngularDamping = PHYSICS.ballAngularDamping
  const ballWallFriction = 0
  const ballWallRestitution = PHYSICS.ballWallRestitution
  const boardFriction = 0
  const boardRestitution = 0.0
  const plungerMaxPull = PHYSICS.plungerMaxPull
  const plungerImpactFactor = PHYSICS.plungerImpactFactor
  const boardTilt = 0
  const boardRotationY = 0

  initSounds()
  prepareWallSound()

  const containerW = gameContainer.value.clientWidth
  const containerH = gameContainer.value.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)
  rootGroup = new THREE.Group()
  rootGroup.rotation.set(Math.PI / 2, boardRotationY, 0)
  scene.add(rootGroup)

  camera = new THREE.PerspectiveCamera(45, containerW / containerH, 0.1, 1000)
  camera.position.set(0, 0, 85)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setSize(containerW, containerH)

  const clock = new THREE.Clock()

  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(15, 30, 20)
  scene.add(dir)

  const boardWidth  = 36
  const boardLength = 50
  const halfWidth = boardWidth / 2
  const radius = halfWidth
  const rectTopY = boardLength / 2 - radius

  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth, -boardLength / 2)
  shape.lineTo( halfWidth, -boardLength / 2)
  shape.lineTo( halfWidth,  rectTopY)
  shape.absarc(0, rectTopY, radius, 0, Math.PI, false)
  shape.lineTo(-halfWidth, -boardLength / 2)

  const boardGeo = new THREE.ShapeGeometry(shape, 48)
  boardGeo.rotateX(-Math.PI / 2 - boardTilt)
  boardGeo.computeVertexNormals()

  const board = new THREE.Mesh(boardGeo, makeMat(hexToInt(COLORS.board), { opacity: 1 }))
  board.position.set(0, 0, 0)
  rootGroup.add(board)

  if (COLORS.backboardImagePath) {
    const imageMat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide })
    const imageMesh = new THREE.Mesh(boardGeo.clone(), imageMat)
    imageMesh.position.set(0, 0.02, 0)
    const tex = new THREE.TextureLoader().load(COLORS.backboardImagePath, (loadedTex) => {
      const imageAspect = loadedTex.image.width / loadedTex.image.height
      const widthScale = Math.max(0.01, (COLORS.imageWidthPercent || 100) / 100)
      loadedTex.wrapS = THREE.ClampToEdgeWrapping
      loadedTex.wrapT = THREE.ClampToEdgeWrapping
      loadedTex.repeat.set((1 / boardWidth) / widthScale, (imageAspect / boardWidth) / widthScale)
      loadedTex.offset.set(
        0.5 + ((COLORS.imageOffsetXPercent || 0) / 100),
        0.5 + ((COLORS.imageOffsetYPercent || 0) / 100)
      )
      loadedTex.needsUpdate = true
      imageMat.needsUpdate = true
    })
    imageMat.map = tex
    imageMat.needsUpdate = true
    rootGroup.add(imageMesh)
  }

  const transformIntensity = Math.max(0, Math.min(1, COLORS.colorTransformIntensity || 0))
  if (transformIntensity > 0) {
    const transformMesh = new THREE.Mesh(
      boardGeo.clone(),
      new THREE.MeshBasicMaterial({
        color: hexToInt(COLORS.colorTransform),
        transparent: true,
        opacity: transformIntensity,
        side: THREE.DoubleSide,
        blending: THREE.MultiplyBlending
      })
    )
    transformMesh.position.set(0, 0.03, 0)
    rootGroup.add(transformMesh)
  }

  const overlayAlpha = Math.max(0, Math.min(1, COLORS.overlayAlpha || 0))
  if (overlayAlpha > 0) {
    const overlayMesh = new THREE.Mesh(
      boardGeo.clone(),
      new THREE.MeshBasicMaterial({
        color: hexToInt(COLORS.overlayColor),
        transparent: true,
        opacity: overlayAlpha,
        side: THREE.DoubleSide
      })
    )
    overlayMesh.position.set(0, 0.04, 0)
    rootGroup.add(overlayMesh)
  }

  world = new CANNON.World({ gravity: boardGravityVec })

  const defaultMat  = new CANNON.Material('default')
  const wallMat     = new CANNON.Material('wall')
  const laneWallMat = new CANNON.Material('laneWall')
  const boardMatPhys = new CANNON.Material('board')

  world.defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMat, boardMatPhys, { friction: boardFriction, restitution: boardRestitution }
  )
  world.addContactMaterial(new CANNON.ContactMaterial(
    defaultMat, wallMat, { friction: ballWallFriction, restitution: ballWallRestitution }
  ))
  world.addContactMaterial(new CANNON.ContactMaterial(
    defaultMat, laneWallMat, { friction: ballWallFriction, restitution: ballWallRestitution }
  ))
  const pegMat = new CANNON.Material('peg')
  world.addContactMaterial(new CANNON.ContactMaterial(
    defaultMat, pegMat, { friction: 0, restitution: 0.4 }
  ))

  const boardBody = new CANNON.Body({ mass: 0, material: boardMatPhys })
  boardBody.addShape(new CANNON.Plane())
  boardBody.quaternion.setFromEuler(-Math.PI / 2 - boardTilt, 0, 0)
  world.addBody(boardBody)

  const ballRadius = 1
  const wallThickness = 0.5
  const laneEastX = halfWidth + wallThickness / 2
  const guideGap = ballRadius * 2 + 1
  const guideX = laneEastX - guideGap
  laneCenterX = (guideX + laneEastX) / 2

  ballBody = new CANNON.Body({
    mass: ballMass,
    shape: new CANNON.Sphere(ballRadius),
    position: new CANNON.Vec3(laneCenterX, ballRadius, boardLength / 2 - 2.0),
    material: defaultMat,
    linearDamping: ballLinearDamping,
    angularDamping: ballAngularDamping
  })
  world.addBody(ballBody)
  ballBody.linearFactor.set(1, 0, 1)
  ballBody.ccdSpeedThreshold = 0.1
  ballBody.ccdIterations = 20

  ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 32, 32),
    new THREE.MeshPhongMaterial({ color: COLORS.ball })
  )
  rootGroup.add(ballMesh)
  ballBody.type = CANNON.Body.KINEMATIC
  ballBody.collisionResponse = false

  const plungerLength = 4
  const southZ = boardLength / 2 + wallThickness / 2
  const plungerZ = southZ - plungerLength / 2 + 1.2

  function boardYAt(z) { return Math.tan(boardTilt) * z }

  plungerY = boardYAt(plungerZ) + plungerLength / 2 - 1

  const initialBallZ = plungerZ - plungerLength / 2 - ballRadius
  const initialBallY = plungerY + ballRadius
  ballBody.position.set(laneCenterX, initialBallY, initialBallZ)
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballMesh.position.set(laneCenterX, initialBallY, initialBallZ)
  initialBallPos = { x: laneCenterX, y: initialBallY, z: initialBallZ }

  plungerMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, plungerLength, 16),
    new THREE.MeshPhongMaterial({ color: '#8888ff' })
  )
  plungerMesh.rotation.x = Math.PI / 2 - boardTilt
  plungerMesh.position.set(laneCenterX, plungerY, plungerZ)
  rootGroup.add(plungerMesh)

  plungerBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(1, 1, plungerLength / 2)),
    position: new CANNON.Vec3(laneCenterX, plungerY, plungerZ),
    material: wallMat
  })
  plungerBody.type = CANNON.Body.KINEMATIC
  plungerBody.quaternion.setFromEuler(-boardTilt, 0, 0)
  world.addBody(plungerBody)

  const maxPull = plungerMaxPull
  const plungerForce = PHYSICS.plungerForce
  plungerOriginalZ = plungerMesh.position.z

  const wallHeight = 3
  const walls = []

  function addWall(px, pz, sx, sz, rotY = 0, mat = wallMat) {
    const yPos = boardYAt(pz) + wallHeight / 2
    const wBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(sx / 2, wallHeight / 2, sz / 2)),
      material: mat
    })
    wBody.position.set(px, yPos, pz)
    wBody.quaternion.setFromEuler(-boardTilt, rotY, 0)
    world.addBody(wBody)
    walls.push(wBody)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, wallHeight, sz),
      new THREE.MeshPhongMaterial({ color: COLORS.walls })
    )
    mesh.position.copy(wBody.position)
    mesh.quaternion.set(wBody.quaternion.x, wBody.quaternion.y, wBody.quaternion.z, wBody.quaternion.w)
    rootGroup.add(mesh)
  }

  const westX  = -boardWidth / 2 - wallThickness / 2
  const eastX  =  boardWidth / 2 + wallThickness / 2
  const northZ = -boardLength / 2
  const segmentCount = 20
  const arcRadius = radius + wallThickness / 2
  const startZ = northZ + arcRadius
  const endZ = southZ - wallThickness / 2
  const straightLength = endZ - startZ + wallThickness
  const straightCenterZ = (startZ + endZ) / 2

  addWall(westX, straightCenterZ, wallThickness, straightLength)
  addWall(eastX, straightCenterZ, wallThickness, straightLength, 0, laneWallMat)
  addWall(guideX, straightCenterZ, wallThickness, straightLength, 0, laneWallMat)

  for (let triIdx = 0; triIdx < LAYOUT.triangles.length; triIdx++) {
    const triCfg = LAYOUT.triangles[triIdx]
    if (triCfg.radius <= 0) continue
    const tRadius = triCfg.radius
    const tZ = triCfg.z
    const tX = triCfg.x
    const tY = boardYAt(tZ) + wallHeight / 2
    const triShape = new CANNON.Cylinder(tRadius, tRadius, wallHeight, 3)
    const triShapeQuat = new CANNON.Quaternion()
    triShapeQuat.setFromEuler(Math.PI / 2, 0, 0)
    triShape.transformAllPoints(new CANNON.Vec3(), triShapeQuat)
    const triBody = new CANNON.Body({ mass: 0, shape: triShape, material: wallMat })
    triBody.position.set(tX, tY, tZ)
    const triFlipY = triIdx === 1 ? Math.PI : 0
    triBody.quaternion.setFromEuler(-boardTilt, Math.PI / 2 + triFlipY, 0)
    world.addBody(triBody)
    walls.push(triBody)
    const triMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tRadius, tRadius, wallHeight, 3),
      new THREE.MeshPhongMaterial({ color: COLORS.walls })
    )
    triMesh.position.copy(triBody.position)
    triMesh.quaternion.set(triBody.quaternion.x, triBody.quaternion.y, triBody.quaternion.z, triBody.quaternion.w)
    rootGroup.add(triMesh)
  }

  addWall(0, southZ, boardWidth + wallThickness * 2, wallThickness)

  for (let i = 0; i < segmentCount; i++) {
    const a0 = Math.PI * (i / segmentCount)
    const a1 = Math.PI * ((i + 1) / segmentCount)
    const midAngle = (a0 + a1) / 2
    const segLen = arcRadius * (a1 - a0)
    const cx = Math.cos(midAngle) * arcRadius
    const cz = northZ + arcRadius - Math.sin(midAngle) * arcRadius
    addWall(cx, cz, wallThickness, segLen, midAngle)
  }

  const bumpers = []
  const bumperVisuals = []

  LAYOUT.bumpers.forEach((bCfg, bumperIdx) => {
    if (bCfg.radius <= 0) return
    const bumperRadius = bCfg.radius
    const bumperHeight = bCfg.height
    const bx = bCfg.x
    const actualZ = bCfg.z
    const cylShape = new CANNON.Cylinder(bumperRadius, bumperRadius, bumperHeight, 16)
    const q = new CANNON.Quaternion()
    q.setFromEuler(Math.PI / 2, 0, 0)
    cylShape.transformAllPoints(new CANNON.Vec3(), q)
    const bumperBody = new CANNON.Body({ mass: 0, shape: cylShape, material: wallMat })
    const by = boardYAt(actualZ) + bumperHeight / 2
    bumperBody.position.set(bx, by, actualZ)
    world.addBody(bumperBody)
    bumpers.push(bumperBody)

    const bumperGeo = new THREE.CylinderGeometry(bumperRadius, bumperRadius, bumperHeight, 32)
    const bumperMat = makeMat(hexToInt(COLORS.bumper), { opacity: 0, shininess: 80 })
    bumperMat.emissive = new THREE.Color(hexToInt(COLORS.bumper))
    bumperMat.emissiveIntensity = 0
    const bumperMesh = new THREE.Mesh(bumperGeo, bumperMat)
    bumperMesh.position.set(bx, by, actualZ)
    rootGroup.add(bumperMesh)

    const bumperVisual = { body: bumperBody, mesh: bumperMesh, imageMat: null, glowUntil: 0 }
    const imgPath = COLORS.bumperImagePaths[bumperIdx]
    if (imgPath) {
      const tex = new THREE.TextureLoader().load(imgPath, (loadedTex) => {
        loadedTex.wrapS = THREE.ClampToEdgeWrapping
        loadedTex.wrapT = THREE.ClampToEdgeWrapping
        loadedTex.needsUpdate = true
      })
      const imgGeo = new THREE.CircleGeometry(bumperRadius, 32)
      const imgMat = new THREE.MeshPhongMaterial({
        map: tex, transparent: true, opacity: 1, side: THREE.DoubleSide,
        emissive: 0xffffff, emissiveIntensity: 0
      })
      const imgMesh = new THREE.Mesh(imgGeo, imgMat)
      imgMesh.rotation.x = -Math.PI / 2
      imgMesh.position.set(bx, by + bumperHeight / 2 + 0.05, actualZ)
      rootGroup.add(imgMesh)
      bumperVisual.imageMat = imgMat
    }
    bumperVisuals.push(bumperVisual)
  })

  LAYOUT.pegs.forEach((pCfg) => {
    if (pCfg.radius <= 0) return
    const pegRadius = pCfg.radius
    const pegHeight = pCfg.height
    const px = pCfg.x
    const pz = pCfg.z
    const pegCylShape = new CANNON.Cylinder(pegRadius, pegRadius, pegHeight, 16)
    const pegQ = new CANNON.Quaternion()
    pegQ.setFromEuler(Math.PI / 2, 0, 0)
    pegCylShape.transformAllPoints(new CANNON.Vec3(), pegQ)
    const pegBody = new CANNON.Body({ mass: 0, shape: pegCylShape, material: pegMat })
    const py = boardYAt(pz) + pegHeight / 2
    pegBody.position.set(px, py, pz)
    world.addBody(pegBody)
    const pegMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(pegRadius, pegRadius, pegHeight, 16),
      new THREE.MeshPhongMaterial({ color: hexToInt(COLORS.bumper), specular: 0xffffff, shininess: 60 })
    )
    pegMesh.position.set(px, py, pz)
    rootGroup.add(pegMesh)
  })

  const halfCircleConfigs = [
    { name: 'halfCircle1', x: -10, z: southZ - 12, radius: 2 },
    { name: 'halfCircle2', x:   0, z: southZ -  6, radius: 2 },
    { name: 'halfCircle3', x:  10, z: southZ - 12, radius: 2 }
  ]
  const halfCircles = []

  halfCircleConfigs.forEach(({ name, x, z, radius: hRadius }) => {
    const hShape = new THREE.Shape()
    hShape.moveTo(-hRadius, 0)
    hShape.absarc(0, 0, hRadius, 0, Math.PI, false)
    const extrudedGeo = new THREE.ExtrudeGeometry(hShape, { depth: 0.5, bevelEnabled: false })
    extrudedGeo.rotateX(-Math.PI / 2)
    const mat = (() => {
      if (name === 'halfCircle2') {
        return new THREE.MeshPhongMaterial({ color: hexToInt(COLORS.goldHalfCircle), specular: 0xFFFFFF, shininess: 100, transparent: true, opacity: 1 })
      } else if (name === 'halfCircle3') {
        return new THREE.MeshPhongMaterial({ color: hexToInt(COLORS.rightCircle || COLORS.halfCircle), specular: 0xffffff, shininess: 50, transparent: true, opacity: 1 })
      } else {
        return new THREE.MeshPhongMaterial({ color: hexToInt(COLORS.halfCircle), specular: 0xffffff, shininess: 50, transparent: true, opacity: 1 })
      }
    })()
    const mesh = new THREE.Mesh(extrudedGeo, mat)
    mesh.position.set(x, boardYAt(z), z - 0.25)
    mesh.rotation.y = Math.PI
    mesh.name = name
    rootGroup.add(mesh)

    const verts = mesh.geometry.attributes.position.array
    let idx
    if (mesh.geometry.index) {
      idx = mesh.geometry.index.array
    } else {
      const vertCount = verts.length / 3
      idx = []
      for (let i = 0; i < vertCount; i += 3) idx.push(i, i + 1, i + 2)
    }
    const trimeshShape = new CANNON.Trimesh(verts, idx)
    const triggerBody = new CANNON.Body({ mass: 0 })
    triggerBody.addShape(trimeshShape)
    triggerBody.position.copy(mesh.position)
    triggerBody.quaternion.copy(mesh.quaternion)
    triggerBody.collisionResponse = false
    world.addBody(triggerBody)
    halfCircles.push({ name, mesh, trigger: triggerBody })
  })

  world.addEventListener('beginContact', ({ bodyA, bodyB }) => {
    if (
      (bodyA === ballBody && walls.includes(bodyB)) ||
      (bodyB === ballBody && walls.includes(bodyA))
    ) {
      playWallSound()
    }

    if (
      (bodyA === ballBody && bumpers.includes(bodyB)) ||
      (bodyB === ballBody && bumpers.includes(bodyA))
    ) {
      const hitBumper = bodyA === ballBody ? bodyB : bodyA
      const hitVisual = bumperVisuals.find((v) => v.body === hitBumper)
      if (hitVisual) hitVisual.glowUntil = performance.now() + 180
      const s = bigBumperSound.cloneNode()
      s.currentTime = 0
      s.play().catch(() => {})
    }

    halfCircles.forEach(({ trigger }) => {
      if (
        (bodyA === ballBody && bodyB === trigger) ||
        (bodyB === ballBody && bodyA === trigger)
      ) {
        stateHistory.push({ position: { ...ballBody.position }, velocity: { ...ballBody.velocity } })
        ballBody.velocity.setZero()
        ballBody.angularVelocity.setZero()
        ballBody.type = CANNON.Body.STATIC
        ballBody.collisionResponse = false
        gameEnded = true
        ;(async () => {
          try {
            const result = await $fetch('/api/game/winball', { method: 'POST', body: stateHistory })
            if (result.result === 'hit') {
              winSound.currentTime = 0
              winSound.play().catch(() => {})
              if (result.grandPrizeCtoon) {
                showModal({
                  title: 'Winner',
                  message: `You won ${result.pointsAwarded} points and a grand prize cToon: "${result.grandPrizeCtoon}".\n\nYou have ${result.pointsRemainingToday} points remaining today.`,
                  imageUrl: result.grandPrizeCtoonImage || ''
                })
                await scavenger.maybeTrigger('winball_win', { open: false })
                resetBall()
              } else {
                showModal({ title: 'Winner', message: `You won ${result.pointsAwarded} points.\n\nYou have ${result.pointsRemainingToday} points remaining today.` })
                await scavenger.maybeTrigger('winball_win', { open: false })
                resetBall()
              }
            } else if (result.result === 'gutter') {
              loseSound.currentTime = 0
              loseSound.play().catch(() => {})
              showModal({ title: 'Gutter', message: 'You hit the gutter.' })
              resetBall()
            }
            await fetchSelf({ force: true })
          } catch (err) {
            console.error('Error verifying ball:', err)
          }
        })()
      }
    })
  })

  function animate() {
    animFrameId = requestAnimationFrame(animate)
    const dt = clock.getDelta()

    if (plungerMesh && plungerBody) {
      let desiredZ
      if (plungerPulling) {
        pullStrength = Math.min(maxPull, pullStrength + dt * 1.5)
        desiredZ = plungerOriginalZ + pullStrength * 4
      } else {
        desiredZ = plungerOriginalZ
        if (!launched) pullStrength = 0
      }
      const dz = desiredZ - plungerBody.position.z
      const speed = (dz / dt) * plungerImpactFactor
      plungerBody.velocity.set(0, 0, speed)
      const newPlungerY = boardYAt(plungerBody.position.z) + plungerLength / 2
      plungerBody.position.y = newPlungerY
      plungerMesh.position.y = newPlungerY
      plungerMesh.position.z += (plungerBody.position.z - plungerMesh.position.z) * 0.5
    }

    const now = performance.now()
    bumperVisuals.forEach((visual) => {
      const glowProgress = visual.glowUntil > now ? (visual.glowUntil - now) / 180 : 0
      const glowIntensity = Math.max(0, Math.min(1, glowProgress))
      visual.mesh.material.emissiveIntensity = glowIntensity * 1.4
      if (visual.imageMat) visual.imageMat.emissiveIntensity = glowIntensity * 1.8
    })

    if (plungerPulling && !ballLaunched) {
      const frontZ = plungerBody.position.z - plungerLength / 2
      ballBody.position.set(laneCenterX, boardYAt(frontZ) + ballRadius, frontZ - ballRadius)
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
    }

    if (!plungerPulling && !ballLaunched) {
      const frontZ = plungerBody.position.z - plungerLength / 2
      ballBody.position.set(laneCenterX, boardYAt(frontZ) + ballRadius, frontZ - ballRadius)
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
    }

    world.step(1 / 60, dt, 10)
    ballBody.linearFactor.set(1, 0, 1)

    if (!gameEnded) {
      frameTick++
      if (frameTick % 4 === 0) {
        stateHistory.push({ position: { ...ballBody.position }, velocity: { ...ballBody.velocity } })
      }
    }

    const zPos = ballBody.position.z
    ballBody.position.y = boardYAt(zPos) + ballRadius
    ballBody.velocity.y = 0

    const southLimit = southZ - ballRadius
    if (ballBody.position.x < 16.75 && ballBody.position.z >= southLimit - 1 && !gameEnded) {
      stateHistory.push({ position: { ...ballBody.position }, velocity: { ...ballBody.velocity } })
      gameEnded = true
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
      ballBody.collisionResponse = false
      ballBody.type = CANNON.Body.STATIC
      ;(async () => {
        try {
          const result = await $fetch('/api/game/winball', { method: 'POST', body: stateHistory })
          if (result.result === 'hit') {
            winSound.currentTime = 0
            winSound.play().catch(() => {})
            if (result.grandPrizeCtoon) {
              showModal({
                title: 'Winner',
                message: `You won ${result.pointsAwarded} points and a grand prize cToon: "${result.grandPrizeCtoon}".\n\nYou have ${result.pointsRemainingToday} points remaining today.`,
                imageUrl: result.grandPrizeCtoonImage || ''
              })
              await scavenger.maybeTrigger('winball_win', { open: false })
              resetBall()
            } else {
              showModal({ title: 'Winner', message: `You won ${result.pointsAwarded} points.\n\nYou have ${result.pointsRemainingToday} points remaining today.` })
              await scavenger.maybeTrigger('winball_win', { open: false })
              resetBall()
            }
            await fetchSelf({ force: true })
          } else if (result.result === 'gutter') {
            loseSound.currentTime = 0
            loseSound.play().catch(() => {})
            showModal({ title: 'Gutter', message: 'You hit the gutter.' })
            resetBall()
          }
        } catch (err) {
          console.error('Error verifying ball:', err)
        }
      })()
    }

    if (ballMesh && ballBody) {
      ballMesh.position.copy(ballBody.position)
      ballMesh.quaternion.copy(ballBody.quaternion)
    }

    if (!capClosed && ballBody.velocity.x != 0) {
      capClosed = true
      ballLaunched = true
      const capStartX = guideX
      const capEndX = eastX
      const capWidth = capEndX - capStartX
      const capCenterX = (capStartX + capEndX) / 2
      const capZ = startZ
      const capY = boardYAt(capZ) + wallHeight / 2
      const capThickness = wallThickness
      const capShape = new CANNON.Box(new CANNON.Vec3(capWidth / 2, wallHeight / 2, capThickness / 2))
      capBody = new CANNON.Body({ mass: 0, shape: capShape, material: wallMat })
      capBody.position.set(capCenterX - 0.4, capY - 0.2, capZ - 1)
      capBody.quaternion.setFromEuler(-boardTilt, Math.PI / 4, 0)
      world.addBody(capBody)
      plungerBody.collisionResponse = false
      capMesh = new THREE.Mesh(
        new THREE.BoxGeometry(capWidth, wallHeight, capThickness),
        new THREE.MeshPhongMaterial({ color: hexToInt(COLORS.cap), shininess: 100 })
      )
      capMesh.position.set(capCenterX - 0.4, capY - 0.2, capZ - 0.2)
      capMesh.rotation.set(-boardTilt, Math.PI / 4, 0)
      rootGroup.add(capMesh)
    }

    renderer.render(scene, camera)
  }
  animate()

  resizeObserver = new ResizeObserver(() => {
    if (!gameContainer.value || !renderer || !camera) return
    const w = gameContainer.value.clientWidth
    const h = gameContainer.value.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  resizeObserver.observe(gameContainer.value)

  canvas.value.addEventListener('pointerdown', (e) => {
    const rect = canvas.value.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)
    if (raycaster.intersectObject(plungerMesh).length > 0) plungerPulling = true
  })

  canvas.value.addEventListener('pointerup', () => {
    if (plungerPulling) {
      plungerPulling = false
      plungerSound.currentTime = 0
      plungerSound.play().catch(() => {})
      const norm = pullStrength / maxPull
      const forwardImpulse = plungerForce * (norm * norm)
      if (!ballLaunched) {
        ballBody.type = CANNON.Body.DYNAMIC
        ballBody.collisionResponse = true
        ballBody.applyImpulse(new CANNON.Vec3(0, 0, -forwardImpulse), ballBody.position)
      }
      pullStrength = 0
      launched = true
      ballLaunched = true
    }
  })
})

onBeforeUnmount(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
  if (resizeObserver) resizeObserver.disconnect()
  if (renderer) renderer.dispose()
})
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}

@media (max-width: 768px) {
  body.page-newsite-winball .main-content {
    min-height: calc(100svh - 190px);
    max-width: 100% !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
}
</style>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: #101010;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}

@media (max-width: 768px) {
  .game-container {
    min-height: calc(100svh - 190px);
    max-width: 100%;
    box-sizing: border-box;
  }
}

.game-canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.reset-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.9);
  color: #000;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: sans-serif;
  touch-action: manipulation;
}

.reset-btn:hover {
  background: #fff;
}

.modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  background: #111;
  color: #fff;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  text-align: center;
  display: grid;
  justify-items: center;
  width: fit-content;
  max-width: 92%;
}

.modal-img {
  display: block;
  height: auto;
  max-width: 92%;
}

.modal-title { font: 600 20px/1.2 system-ui; margin: 0 0 8px; }
.modal-msg   { font: 400 16px/1.5 system-ui; margin: 0 0 12px; white-space: pre-line; }
.modal-btn   { padding: 8px 14px; border: 0; border-radius: 6px; background: #fff; color: #000; cursor: pointer; }
.modal-btn:hover { background: #e6e6e6; }
</style>
