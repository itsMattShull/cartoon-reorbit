<template>
  <Nav />
  <div class="game-container">
    <button class="reset-btn mt-16" @click="resetBall">Reset Ball</button>
    <canvas ref="canvas" class="game-canvas"></canvas>
  </div>
</template>

<script setup>
import { useHead } from '#imports'
 definePageMeta({ layout: false })
 // 1) lock viewport so mobile can’t zoom
 useHead({
   meta: [
     {
       name: 'viewport',
       content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
     }
   ]
 })
import { ref, onMounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as CANNON from 'cannon-es'

const COLORS = {
  board:          0xF0E6FF,  // light lavender
  bumper:         0x8c8cff,  // periwinkle-blue
  halfCircle:     0x8c8cff,  // pale lilac
  cap:            0xffd000,
  goldHalfCircle: 0xFFD700
}

let winSound, loseSound, bigBumperSound, plungerSound, wallSound;
function initSounds() {
  winSound = new Audio('/winball/win.mp3')
  winSound.volume = 0.8     // tweak volume 0.0–1.0
  winSound.preload = 'auto'

  loseSound = new Audio('/winball/lose.mp3')
  loseSound.volume = 0.8     // tweak volume 0.0–1.0
  loseSound.preload = 'auto'

  bigBumperSound = new Audio('/winball/bigbumper.mp3')
  bigBumperSound.volume = 0.4     // tweak volume 0.0–1.0
  bigBumperSound.preload = 'auto'

  plungerSound = new Audio('/winball/plunger.mp3')
  plungerSound.volume = 0.8     // tweak volume 0.0–1.0
  plungerSound.preload = 'auto'
}

let audioCtx
let wallBuffer = null


// on collision
function playWallSound() {
  if (!wallBuffer) return
  const src = audioCtx.createBufferSource()
  src.buffer = wallBuffer
  src.connect(audioCtx.destination)
  src.start(0)
}

// 1) helper to init or resume the context and load the buffer
function prepareWallSound() {
  // create or resume context
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  // fetch + decode
  return fetch('/winball/wall.mp3')
    .then(res => res.arrayBuffer())
    .then(ab => audioCtx.decodeAudioData(ab))
    .then(buf => {
      wallBuffer = buf
    })
    .catch(console.error)
}

// ➤ shared material settings
const makeMat = (hex, opts = {}) =>
  new THREE.MeshPhongMaterial({
    color: hex,
    specular: 0xffffff,
    shininess: opts.shininess ?? 50,
    transparent: true,
    opacity: opts.opacity  ?? 0.9
  })

let stateHistory = []
let gameEnded = false

const canvas = ref(null)
let scene, world

let ballBody, ballMesh
let capBody = null
let capMesh = null
let capClosed = false
let ballLaunched = false
let initialBallPos = { x: 0, y: 0, z: 0 }

// Hoisted variables for manual reset
let rootGroup
let laneCenterX, plungerY, plungerOriginalZ
let launched = false
let plungerPulling = false
let pullStrength = 0
let plungerMesh, plungerBody

// Manual reset for ball, plunger, and cap
const resetBall = () => {
  // Remove cap wall
  if (capBody) {
    world.removeBody(capBody)
    capBody = null
  }
  if (capMesh) {
    rootGroup.remove(capMesh)
    capMesh = null
  }
  capClosed = false
  stateHistory = []
  gameEnded = false

  initSounds()
  prepareWallSound()

  // Reset ball
  ballBody.position.set(initialBallPos.x, initialBallPos.y, initialBallPos.z)
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballMesh.position.set(initialBallPos.x, initialBallPos.y, initialBallPos.z)
  ballLaunched = false
  // Freeze ball on plunger until user pulls
  ballBody.type = CANNON.Body.KINEMATIC
  ballBody.collisionResponse = false

  // Reset plunger
  plungerBody.position.set(laneCenterX, plungerY, plungerOriginalZ)
  plungerBody.velocity.setZero()
  plungerMesh.position.set(laneCenterX, plungerY, plungerOriginalZ)
  launched = false
  plungerPulling = false
  pullStrength = 0
  // Restore plunger physics
  plungerBody.type = CANNON.Body.KINEMATIC
  plungerBody.collisionResponse = true
}

onMounted(() => {
  // === TUNABLE PARAMETERS ===
  const ballMass = 8                            // increased mass for realistic pinball feel
  const boardGravityVec = new CANNON.Vec3(0, 0, 15) // gravity along negative Z (board downhill)
  const ballLinearDamping = 0.2           // slight rolling damping
  const ballAngularDamping = 0          // spin friction for realistic roll
  const ballWallFriction = 0      // low friction on walls for snappy bounce
  const ballWallRestitution = 1.2   // high restitution for energetic wall bounces
  const boardFriction = 0         // moderate friction on playfield for rolling
  const boardRestitution = 0.0      // no bounce on the board surface
  const plungerMaxPull = 0.6                    // max pull distance
  const plungerImpactFactor = 0.2               // plunger velocity multiplier for transfer
  const boardTilt = 0                    // tilt angle in radians (positive rotates board toward player)
  const boardRotationY = 0    // radians: rotate around Y to align downhill vertically

  initSounds()

  prepareWallSound()

  /* ---------- THREE SCENE ---------- */
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#ffffff')
  // Root group to rotate entire machine: lay flat and orient downhill
  rootGroup = new THREE.Group()
  rootGroup.rotation.set(Math.PI / 2, boardRotationY, 0)
  scene.add(rootGroup)

  /* ---------- CAMERA + CONTROLS ---------- */
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 0, 85)  // slightly more top-down view
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)

  // const controls = new OrbitControls(camera, renderer.domElement)
  // controls.enableDamping = true
  // controls.dampingFactor = 0.05
  // controls.target.set(0, 0, 0)
  // controls.update()
  const clock = new THREE.Clock()

  /* ---------- LIGHTING ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const dir = new THREE.DirectionalLight(0xffffff, 0.6)
  dir.position.set(15, 30, 20)
  scene.add(dir)

  /* ---------- BOARD ---------- */
  const boardWidth  = 36
  const boardLength = 50

  // --- Board with semicircular north edge ---
  const halfWidth = boardWidth / 2
  const radius = halfWidth                         // radius for the semicircle
  const rectTopY = boardLength / 2 - radius        // end of straight edges (north straight‑edge limit)

  // Define the 2‑D shape (XY plane) – semicircle now on the north edge
  const shape = new THREE.Shape()
  shape.moveTo(-halfWidth, -boardLength / 2)        // South‑west
  shape.lineTo( halfWidth, -boardLength / 2)        // South‑east
  shape.lineTo( halfWidth,  rectTopY)               // Straight up right edge
  shape.absarc(0, rectTopY, radius, 0, Math.PI, false) // Half‑circle arc (east→west, CCW)
  shape.lineTo(-halfWidth, -boardLength / 2)        // Close path

  // Create geometry and orient it onto X‑Z plane
  const boardGeo = new THREE.ShapeGeometry(shape, 48)
  boardGeo.rotateX(-Math.PI / 2 - boardTilt)                    // lay flat with tilt
  boardGeo.computeVertexNormals()

  const boardMat = makeMat(COLORS.board, { opacity: 0.5 }) // single white color
  const board    = new THREE.Mesh(boardGeo, boardMat)
  // board.rotation.x = -Math.PI / 2           // lay flat
  board.position.set(0, 0, 0)
  rootGroup.add(board)

  /* ---------- PHYSICS WORLD ---------- */
  world = new CANNON.World({ gravity: boardGravityVec })
  // Tilt: north (+Z) side lower, south higher

  /* ---------- MATERIALS ---------- */
  const defaultMat = new CANNON.Material('default')
  const wallMat = new CANNON.Material('wall')
  const laneWallMat = new CANNON.Material('laneWall')
  // Board material for low bounce
  const boardMatPhys = new CANNON.Material('board')
  // Board (playfield) contact: rolls, no bounce
  world.defaultContactMaterial = new CANNON.ContactMaterial(
    defaultMat, boardMatPhys,
    { friction: boardFriction, restitution: boardRestitution }
  )
  // Wall contact: snappy bounces off walls/plunger
  world.addContactMaterial(new CANNON.ContactMaterial(
    defaultMat, wallMat,
    { friction: ballWallFriction, restitution: ballWallRestitution }
  ))
  // Guide lane walls use same bouncy material
  world.addContactMaterial(new CANNON.ContactMaterial(
    defaultMat, laneWallMat,
    { friction: ballWallFriction, restitution: ballWallRestitution }
  ))

  /* ---------- BOARD PHYSICS ---------- */
  const boardBody = new CANNON.Body({ mass: 0, material: boardMatPhys })
  const boardShape = new CANNON.Plane()
  boardBody.addShape(boardShape)
  // Match the board’s orientation (flat X-Z plane) with tilt
  boardBody.quaternion.setFromEuler(-Math.PI / 2 - boardTilt, 0, 0)
  world.addBody(boardBody)

  // --- Ball ---
  const ballRadius = 1
  // Compute lane center X for plunger lane
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
  // Allow movement only along X and Z axes; lock Y-axis translation
  ballBody.linearFactor.set(1, 0, 1)
  // Prevent tunneling through walls
  ballBody.ccdSpeedThreshold = ballRadius * 2
  ballBody.ccdIterations = 10

  ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 32, 32),
    new THREE.MeshPhongMaterial({ color: '#ff0000' })
  )
  rootGroup.add(ballMesh)

  ballBody.type = CANNON.Body.KINEMATIC
  ballBody.collisionResponse = false

  // --- Plunger ---
  const plungerLength = 4

  // Compute plunger Y and Z
  const southZ = boardLength / 2 + wallThickness / 2               // flush at board edge
  const plungerZ = southZ - plungerLength / 2 + 1.2
  function boardYAt(z) {
    return Math.tan(boardTilt) * z
  }
  plungerY = boardYAt(plungerZ) + plungerLength / 2 - 1

  // Align ball on plunger at startup
  const initialBallZ = plungerZ - plungerLength / 2 - ballRadius
  const initialBallY = plungerY + ballRadius
  ballBody.position.set(laneCenterX, initialBallY, initialBallZ)
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballMesh.position.set(laneCenterX, initialBallY, initialBallZ)

  // Store for reset
  initialBallPos = { x: laneCenterX, y: initialBallY, z: initialBallZ }

  const plungerGeometry = new THREE.CylinderGeometry(1, 1, plungerLength, 16)
  const plungerMaterial = new THREE.MeshPhongMaterial({ color: '#8888ff' })
  plungerMesh = new THREE.Mesh(plungerGeometry, plungerMaterial)
  plungerMesh.rotation.x = Math.PI / 2 - boardTilt
  plungerMesh.position.set(laneCenterX, plungerY, plungerZ)
  rootGroup.add(plungerMesh)

  plungerBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(1, 1, plungerLength / 2)),
    position: new CANNON.Vec3(laneCenterX, plungerY, plungerZ),
    material: wallMat
  })
  // Treat as kinematic so we can move it via velocity each frame
  plungerBody.type = CANNON.Body.KINEMATIC
  // Rotate body to match board tilt
  plungerBody.quaternion.setFromEuler(-boardTilt, 0, 0)
  world.addBody(plungerBody)

  let plungerStartY = 0
  const maxPull = plungerMaxPull      // allow a deeper pull
  // impulse strength calibrated for board length and tilt
  const plungerForce = 500
  const maxBallSpeed = 700  // cap launch speed to allow full travel

  plungerOriginalZ = plungerMesh.position.z

  /* ---------- WALLS ---------- */
  const wallHeight = 3
  // const wallThickness = 0.5   // Already defined above with ball/plunger
  const wallMatColor = '#4b4b4b'
  const walls = []

  // Helper to get the Y position of the board surface at a given Z (accounts for tilt)
  // utility: create a vertical wall (visual + physics)
  function addWall (px, pz, sx, sz, rotY = 0, mat = wallMat) {
    const yPos = boardYAt(pz) + wallHeight / 2
    // Physics
    const shape = new CANNON.Box(new CANNON.Vec3(sx / 2, wallHeight / 2, sz / 2))
    const body = new CANNON.Body({ mass: 0, shape, material: mat })
    body.position.set(px, yPos, pz)
    body.quaternion.setFromEuler(-boardTilt, rotY, 0)
    world.addBody(body)

    walls.push(body)

    // Visual
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, wallHeight, sz),
      new THREE.MeshPhongMaterial({ color: wallMatColor })
    )
    // Sync mesh to physics body transform
    mesh.position.copy(body.position)
    mesh.quaternion.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    )
    rootGroup.add(mesh)
  }

  const westX = -boardWidth / 2 - wallThickness / 2
  const eastX =  boardWidth / 2 + wallThickness / 2
  const northZ = -boardLength / 2            // negative‑Z (curved side)
  // const southZ =  boardLength / 2 + wallThickness / 2              // positive‑Z (straight side)
  const rectLenZ = rectTopY - (-boardLength / 2)                   // rectangular section length

  const segmentCount = 20
  const arcRadius = radius + wallThickness / 2

  // Side walls span from the curved-wall endpoints (startZ) down to the south wall
  const startZ = northZ + arcRadius    // Z at which curved wall meets straight section
  const endZ = southZ - wallThickness / 2
  const straightLength = endZ - startZ + wallThickness
  const straightCenterZ = (startZ + endZ) / 2

  addWall(westX, straightCenterZ, wallThickness, straightLength)
  addWall(eastX, straightCenterZ, wallThickness, straightLength, 0, laneWallMat)
  // Guide wall next to plunger lane, tightened gap
  // guideGap, guideX, and laneCenterX already defined above
  addWall(guideX, straightCenterZ, wallThickness, straightLength, 0, laneWallMat)

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

  // --- Bumpers ---
const bumperRadius = 3
const bumperHeight = 3
// Z position for bumpers (just above center)
const bumperZ = 0
// X positions for the three bumpers
const bumperXs = [-12, -1, 8]
const bumpers = []

bumperXs.forEach((bx) => {
  // Offset left/right bumpers forward by 3 units
  const zOffset = bx === -1 ? 0 : -9
  const actualZ = bumperZ + zOffset
  // Physics: a cylinder standing upright
  const cylShape = new CANNON.Cylinder(bumperRadius, bumperRadius, bumperHeight, 16)
  // Align its axis to Y
  const q = new CANNON.Quaternion()
  q.setFromEuler(Math.PI / 2, 0, 0)
  cylShape.transformAllPoints(new CANNON.Vec3(), q)
  const bumperBody = new CANNON.Body({
    mass: 0,
    shape: cylShape,
    material: wallMat   // high-restitution “wall” material
  })
  const by = boardYAt(actualZ) + bumperHeight / 2
  bumperBody.position.set(bx, by, actualZ)
  world.addBody(bumperBody)
  
  bumpers.push(bumperBody)

  // Visual: a matching Three.js cylinder
  const bumperGeo = new THREE.CylinderGeometry(bumperRadius, bumperRadius, bumperHeight, 32)
  const bumperMat = makeMat(COLORS.bumper, { opacity: 0.8, shininess: 80 })
  const bumperMesh = new THREE.Mesh(bumperGeo, bumperMat)
  bumperMesh.position.set(bx, by, actualZ)
  // No extra rotation needed—upright by default
  rootGroup.add(bumperMesh)
})

  // ---------- HALF-CIRCLE TRIGGERS ----------
  const halfCircleConfigs = [
    { name: 'halfCircle1', x: -10, z: southZ - 12, radius: 2 },
    { name: 'halfCircle2', x:  0, z: southZ - 6, radius: 2 },
    { name: 'halfCircle3', x:  10, z: southZ - 12, radius: 2 },
  ];
  const halfCircles = [];

  halfCircleConfigs.forEach(({ name, x, z, radius }) => {
    // 1) Visual: extruded half-circle lying flat
    const shape = new THREE.Shape()
    shape.moveTo(-radius, 0)
    shape.absarc(0, 0, radius, 0, Math.PI, false)
    const extrudeSettings = { depth: 0.5, bevelEnabled: false }
    const extrudedGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    extrudedGeo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(
      extrudedGeo,
      // new THREE.MeshPhongMaterial({ color: COLORS.halfCircle, transparent: true, opacity: 0.85 })
      (() => {
        if (name === 'halfCircle2') {
          return new THREE.MeshPhongMaterial({
            color: COLORS.goldHalfCircle,    // gold
            specular: 0xFFFFFF, // full‐white highlights
            shininess: 100,     // max out the gloss
            transparent: true,
            opacity: 1
          })
        } else {
          return new THREE.MeshPhongMaterial({
            color: COLORS.halfCircle,    // your default pale
            specular: 0xffffff,
            shininess: 50,
            transparent: true,
            opacity: 0.85
          })
        }
      })()
    )
    mesh.position.set(x, boardYAt(z), z - 0.25)
    mesh.rotation.y = Math.PI
    mesh.name = name
    rootGroup.add(mesh)

    // 2) Physics: exactly match that mesh’s surface
    const meshGeo = mesh.geometry;

    // pull out the flat vertex array
    const verts = meshGeo.attributes.position.array;

    // build an index array if none exists
    let idx;
    if (meshGeo.index) {
      idx = meshGeo.index.array;
    } else {
      // non-indexed: every group of 3 vertices is a triangle
      const vertCount = verts.length / 3;       // total vertices
      idx = [];
      for (let i = 0; i < vertCount; i += 3) {
        idx.push(i, i + 1, i + 2);
      }
    }

    // now make your trimesh shape
    const trimeshShape = new CANNON.Trimesh(verts, idx);
    const triggerBody = new CANNON.Body({ mass: 0 });
    triggerBody.addShape(trimeshShape);

    // match position & rotation exactly
    triggerBody.position.copy(mesh.position);
    triggerBody.quaternion.copy(mesh.quaternion);

    // sensor mode
    triggerBody.collisionResponse = false;
    world.addBody(triggerBody);

    // keep track
    halfCircles.push({ name, mesh, trigger: triggerBody });
  })


  // 3) Listen for contact against the ball
  world.addEventListener('beginContact', ({ bodyA, bodyB }) => {
    if (
      (bodyA === ballBody && walls.includes(bodyB)) ||
      (bodyB === ballBody && walls.includes(bodyA))
    ) {
      playWallSound()
    }

    // bumper hit?
    if (
      (bodyA === ballBody && bumpers.includes(bodyB)) ||
      (bodyB === ballBody && bumpers.includes(bodyA))
    ) {
      const s = bigBumperSound.cloneNode()   // clone with same src
      s.currentTime = 0
      s.play().catch(()=>{})
    }

    halfCircles.forEach(({ name, trigger }) => {
      if (
        (bodyA === ballBody && bodyB === trigger) ||
        (bodyB === ballBody && bodyA === trigger)
      ) {
        stateHistory.push({
          position: {
            x: ballBody.position.x,
            y: ballBody.position.y,
            z: ballBody.position.z
          },
          velocity: {
            x: ballBody.velocity.x,
            y: ballBody.velocity.y,
            z: ballBody.velocity.z
          }
        });

        // stop the ball cold
        ballBody.velocity.setZero();
        ballBody.angularVelocity.setZero();
        ballBody.type = CANNON.Body.STATIC;
        ballBody.collisionResponse = false;
        gameEnded = true

        // ── now call our new endpoint
        ;(async () => {
          try {
            console.log('posting to winball, states.length=', stateHistory.length)
            // Nuxt’s $fetch works client-side too
            const result = await $fetch('/api/game/winball', {
              method: 'POST',
              body: stateHistory
            })
            // handle the verdict
            if (result.result === 'hit') {
              // play the sound
              winSound.currentTime = 0     // rewind in case it’s still fading out
              winSound.play().catch(() => {
                // user gesture might be needed on some browsers; fallback silently
              })

              alert(`You won ${result.pointsAwarded} points!`)
            }
            else if (result.result === 'gutter') {
              // play the sound
              loseSound.currentTime = 0     // rewind in case it’s still fading out
              loseSound.play().catch(() => {
                // user gesture might be needed on some browsers; fallback silently
              })
              alert("You hit the gutter.")
            }
          } catch (err) {
            console.error('Error verifying ball:', err)
            console.log('Verification failed; please retry.')
          }
        })()
      }
    });
  });


  /* ---------- TEXT LABELS ---------- */
  function createLabelSprite (text) {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.font = '80px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#000000'
    ctx.clearRect(0, 0, size, size)
    ctx.fillText(text, size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(10, 5, 1)              // tweak size as needed
    return sprite
  }


  /* ---------- MAIN LOOP ---------- */
  function animate () {
    requestAnimationFrame(animate)
    // controls.update()

    const dt = clock.getDelta() || 1/60

    if (plungerMesh && plungerBody) {
      // Determine desired plunger position
      let desiredZ
      if (plungerPulling) {
        pullStrength = Math.min(maxPull, pullStrength + dt * 1.5)
        desiredZ = plungerOriginalZ + pullStrength * 4
      } else {
        desiredZ = plungerOriginalZ
        // Only reset pullStrength if not yet launched
        if (!launched) pullStrength = 0
      }

      // Compute velocity to reach desired position this frame
      const dz = desiredZ - plungerBody.position.z
      const speed = (dz / dt) * plungerImpactFactor
      plungerBody.velocity.set(0, 0, speed)

      // Adjust plunger Y to stay flush with tilted board
      const newPlungerY = boardYAt(plungerBody.position.z) + plungerLength / 2
      plungerBody.position.y = newPlungerY
      plungerMesh.position.y = newPlungerY

      // Keep mesh visually synced
      plungerMesh.position.z += (plungerBody.position.z - plungerMesh.position.z) * 0.5
    }

    // While pulling (and before initial launch), keep the ball resting on the plunger face
    if (plungerPulling && !ballLaunched) {
      const frontZ = plungerBody.position.z - plungerLength / 2
      // Compute ball position: center sits ballRadius in front of the plunger face
      const targetZ = frontZ - ballRadius
      const targetY = boardYAt(frontZ) + ballRadius
      ballBody.position.set(laneCenterX, targetY, targetZ)
      // Halt any unwanted motion
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
    }

    // ALSO: if we haven’t pulled or launched yet, keep ball glued
    if (!plungerPulling && !ballLaunched) {
      const frontZ = plungerBody.position.z - plungerLength / 2
      const targetZ = frontZ - ballRadius
      const targetY = boardYAt(frontZ) + ballRadius
      ballBody.position.set(laneCenterX, targetY, targetZ)
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
    }

    // Step the physics world
    world.step(1/60, dt, 20)
    ballBody.linearFactor.set(1, 0, 1)

    // ── record every tick
    if(!gameEnded) {
      stateHistory.push({
        position: {
          x: ballBody.position.x,
          y: ballBody.position.y,
          z: ballBody.position.z
        },
        velocity: {
          x: ballBody.velocity.x,
          y: ballBody.velocity.y,
          z: ballBody.velocity.z
        }
      })
    }
    
    // Clamp ball to board surface on Y axis so it only moves in X/Z
    const zPos = ballBody.position.z
    const clampY = boardYAt(zPos) + ballRadius
    ballBody.position.y = clampY
    ballBody.velocity.y = 0

    // --- Stop ball at south wall and lock it in place ---
    const southLimit = southZ - ballRadius
    if (ballLaunched && ballBody.position.z >= southLimit - 1 && !gameEnded) {
      stateHistory.push({
        position: {
          x: ballBody.position.x,
          y: ballBody.position.y,
          z: ballBody.position.z
        },
        velocity: {
          x: ballBody.velocity.x,
          y: ballBody.velocity.y,
          z: ballBody.velocity.z
        }
      });

      gameEnded = true

      // Snap to the wall face
      const whereitstopped = ballBody.position.z
      ballBody.position.z = whereitstopped
      // Zero all motion
      ballBody.velocity.setZero()
      ballBody.angularVelocity.setZero()
      // Disable further physics interactions
      ballBody.collisionResponse = false
      ballBody.type = CANNON.Body.STATIC;
      // Mark as no longer launched
      // ballLaunched = false

      // ── now call our new endpoint
      ;(async () => {
        try {
          console.log('sending stuff')
          // Nuxt’s $fetch works client-side too
          console.log('posting to winball, states.length=', stateHistory.length)

          const result = await $fetch('/api/game/winball', {
            method: 'POST',
            body: stateHistory
          })
          // handle the verdict
          if (result.result === 'hit') {
            // play the sound
            winSound.currentTime = 0     // rewind in case it’s still fading out
            winSound.play().catch(() => {
              // user gesture might be needed on some browsers; fallback silently
            })
            alert(`You won ${result.pointsAwarded} points!`)
          }
          else if (result.result === 'gutter') {
            // play the sound
            loseSound.currentTime = 0     // rewind in case it’s still fading out
            loseSound.play().catch(() => {
              // user gesture might be needed on some browsers; fallback silently
            })
            alert("You hit the gutter.")
          }
          else {
            console.log(`Still in play? Server returned “${result.result}.”`)
          }
        } catch (err) {
          console.error('Error verifying ball:', err)
          console.log('Verification failed; please retry.')
        }
      })()
    }


    // Sync the ball mesh to its physics body
    if (ballMesh && ballBody) {
      ballMesh.position.copy(ballBody.position)
      ballMesh.quaternion.copy(ballBody.quaternion)
    }

    // Close cap once ball has cleared the curve and is moving away
    if (!capClosed && ballBody.position.z + 4 < startZ - ballRadius && ballBody.velocity.z < 0) {
      capClosed = true
      ballLaunched = true
      // Cap wall creation
      const capStartX = guideX
      const capEndX = eastX
      const capWidth = capEndX - capStartX
      const capCenterX = (capStartX + capEndX) / 2
      const capZ = startZ
      const capY = boardYAt(capZ) + wallHeight / 2
      const capThickness = wallThickness

      // Physics
      const capShape = new CANNON.Box(new CANNON.Vec3(capWidth / 2, wallHeight / 2, capThickness / 2))
      capBody = new CANNON.Body({ mass: 0, shape: capShape, material: wallMat })
      capBody.position.set(capCenterX-0.4, capY-0.2, capZ-1)
      capBody.quaternion.setFromEuler(-boardTilt, Math.PI / 4, 0)
      world.addBody(capBody)
      plungerBody.collisionResponse = false

      // Visual
      capMesh = new THREE.Mesh(
        new THREE.BoxGeometry(capWidth, wallHeight, capThickness),
        new THREE.MeshPhongMaterial({ color: COLORS.cap, shininess: 100 })
      )
      capMesh.position.set(capCenterX-0.4, capY-0.2, capZ-0.2)
      capMesh.rotation.set(-boardTilt, Math.PI / 4, 0)
      rootGroup.add(capMesh)
    }

    // --- Remove lane-specific slowdown for natural rolling ---
    // (removed: allow natural rolling and bouncing)

    renderer.render(scene, camera)
  }
  animate()

  /* ---------- HANDLE RESIZE ---------- */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  // --- Mouse Plunger ---
  canvas.value.addEventListener('pointerdown', (e) => {
    const rect = canvas.value.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(plungerMesh)
    if (intersects.length > 0) {
      plungerPulling = true
      plungerStartY = e.clientY
    }
  })

  canvas.value.addEventListener('pointermove', (e) => {
    // do nothing; we’ll use animation loop to increment pullStrength
  })

  canvas.value.addEventListener('pointerup', () => {
    if (plungerPulling) {
      plungerPulling = false

      // play the sound
      plungerSound.currentTime = 0     // rewind in case it’s still fading out
      plungerSound.play().catch(() => {
        // user gesture might be needed on some browsers; fallback silently
      })

      // Normalize pull (0–1)
      const norm = pullStrength / maxPull
      // Quadratic mapping: small pulls → very small, big pulls → full
      const forwardImpulse = plungerForce * (norm * norm)
      // Apply impulse toward the north (negative Z)
      if (!ballLaunched) {
        // restore real physics…
        ballBody.type = CANNON.Body.DYNAMIC
        ballBody.collisionResponse = true
        // …then launch
        ballBody.applyImpulse(new CANNON.Vec3(0, 0, -forwardImpulse), ballBody.position)
      }
      pullStrength = 0
      launched = true
      ballLaunched = true
      // plungerBody.collisionResponse = false
      // world.removeBody(plungerBody)   // disable further plunger collisions
    }
  })
})
</script>

<style scoped>
.game-container {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #101010;
  overflow: hidden;

  /* 2a) disable text selection/highlight */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;

  /* 2b) disable scroll/pinch gestures on the container */
  touch-action: none;
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
  background: #fff;
  color: #000;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: sans-serif;
  touch-action: manipulation;
}
.reset-btn:hover {
  background: #eee;
}
</style>