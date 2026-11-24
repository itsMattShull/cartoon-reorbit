<template>
  <div class="new-winball-page">
    <ClientOnly>
      <main class="shell" aria-label="Winball">
        <div id="stage" class="svg-stage" data-src="svg/frames/3_layer_back.svg" aria-hidden="true"></div>
        <div id="actors-back" aria-hidden="true"></div>
        <div id="stage-foreground" class="svg-stage" data-src="svg/frames/3_layer_foreground.svg" aria-hidden="true"></div>
        <div id="actors-effects" aria-hidden="true"></div>
        <canvas id="game" width="507" height="430" aria-label="Winball game canvas"></canvas>
        <div id="actors-playfield" aria-hidden="true"></div>
        <div id="actors-top" aria-hidden="true"></div>
        <div id="stage-top" class="svg-stage" data-src="svg/frames/3_layer_top.svg" aria-hidden="true"></div>
        <div id="brand-replacement" aria-hidden="true">
          <img src="/newwinball/images/newlogo.gif" alt="">
        </div>
        <div id="rules-replacement" aria-hidden="true">
          <p>WINBALL is your chance to WIN<br>Points or Prizes!</p>
          <p>To play, click the lever. Your prize<br>is determined by where<br>the ball lands:</p>
          <p>Cup 1 = {{ leftCupPoints }} Points</p>
          <p>Cup 2 = {{ rightCupPoints }} Points</p>
          <p>GOLDEN CUP = {{ goldCupPoints }} Points + PRIZE!</p>
          <p>If the ball misses the cups and<br>lands in the gutter, you don't win<br>anything, but you can try again.</p>
        </div>
      </main>

      <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <h2 class="modal-title">{{ modal.title }}</h2>
          <p class="modal-msg">{{ modal.message }}</p>
          <img
            v-if="modal.imageUrl"
            :src="modal.imageUrl"
            alt="Won cToon"
            class="modal-img"
          >
          <button class="modal-btn" @click="closeModal">OK</button>
        </div>
      </div>

      <ScavengerHuntModal v-if="!modal.open && scavenger.isOpen && scavenger.sessionId" />
    </ClientOnly>
  </div>
</template>

<script setup>
import { useHead } from '#imports'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useAuth } from '~/composables/useAuth'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // fitHeight keeps the whole playfield on screen; see the flag's note in the layout.
  fitHeight: true,
  title: 'Winball',
  description: 'Play Winball, the pinball-style game on Cartoon ReOrbit, for a chance to win points and exclusive cToons.'
})

useHead({
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    }
  ]
})

const { clearSidebarMiddle } = useNewsiteLayout()
const { fetchSelf } = useAuth()
const scavenger = useScavengerHunt()

clearSidebarMiddle()

const config = ref({})
const modal = ref({ open: false, title: '', message: '', imageUrl: '' })

const leftCupPoints = computed(() => config.value.leftCupPoints ?? 150)
const rightCupPoints = computed(() => config.value.rightCupPoints ?? 150)
const goldCupPoints = computed(() => config.value.goldCupPoints ?? 300)

function runNewWinballGame() {
const SWF_FPS = 21;
  const W = 507;
  const H = 430;
  const canvas = document.getElementById("game");
  const stageEls = Array.from(document.querySelectorAll(".svg-stage"));
  const actorsBackEl = document.getElementById("actors-back");
  const actorsEffectsEl = document.getElementById("actors-effects");
  const actorsPlayfieldEl = document.getElementById("actors-playfield");
  const actorsTopEl = document.getElementById("actors-top");
  const ctx = canvas.getContext("2d");
  const DEBUG_PATH = new URLSearchParams(location.search).get("debug") === "1";
  const ASSET_BASE = window.__newWinballAssetBase || "/newwinball/";
  const assetUrl = (path) => `${ASSET_BASE}${path}`;
  const ballImg = new Image();
  ballImg.src = assetUrl("svg/sprites/DefineSprite_47/1.svg");
  const soundFiles = {
    wall: assetUrl("sounds/135.mp3"),
    pinSoft: assetUrl("sounds/136.mp3"),
    bumper: assetUrl("sounds/61.mp3"),
    prize: assetUrl("sounds/23.mp3"),
    gutter: assetUrl("sounds/37.mp3"),
    plunger: assetUrl("sounds/127.mp3")
  };
  const soundVolumes = {
    wall: 0.35,
    pinSoft: 0.55,
    bumper: 0.7,
    prize: 0.85,
    gutter: 0.8,
    plunger: 0.65
  };
  const sounds = Object.fromEntries(Object.entries(soundFiles).map(([id, src]) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = soundVolumes[id] ?? 1;
    return [id, audio];
  }));

  let audioCtx = null;
  const audioBuffers = {};
  (async () => {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      await Promise.all(Object.entries(soundFiles).map(async ([id, src]) => {
        try {
          const resp = await fetch(src);
          const buf = await resp.arrayBuffer();
          audioBuffers[id] = await audioCtx.decodeAudioData(buf);
        } catch {}
      }));
    } catch {}
  })();

  window.__winballSoundEvents = [];
  window.__winballPath = [];
  window.__winballDumpPath = () => window.__winballPath.map((point) => (
    `${point.step},${point.x.toFixed(2)},${point.y.toFixed(2)},${point.vx.toFixed(2)},${point.vy.toFixed(2)},${point.lane ? 1 : 0},${point.tag || ""}`
  )).join("\n");
  let stageScale = 1;
  let disposed = false;
  let drawFrameId = 0;
  const PLUNGER_FPS = 21;
  const PLUNGER_FRAME_COUNT = 10;
  const makeFrames = (dir, count, start = 1, cache = "") => Array.from({ length: count }, (_, index) => {
    const img = new Image();
    img.src = `${assetUrl(dir)}/${index + start}.svg${cache}`;
    return img;
  });
  const plungerFrames = makeFrames("svg/sprites/DefineSprite_120", PLUNGER_FRAME_COUNT, 1);
  const overlaySets = {
    bumper: makeFrames("svg/sprites/DefineSprite_63", 18, 1, "?v=newicon2"),
    bumperShine: makeFrames("svg/sprites/DefineSprite_56", 75, 1),
    pin: makeFrames("svg/sprites/DefineSprite_74", 22, 1),
    gutterGraphic: makeFrames("svg/sprites/DefineSprite_8", 35, 1),
    gutterText: makeFrames("svg/sprites/DefineSprite_38", 58, 1),
    star1: makeFrames("svg/sprites/DefineSprite_16", 25, 1),
    star23: makeFrames("svg/sprites/DefineSprite_19", 25, 1),
    prize1: makeFrames("svg/sprites/DefineSprite_28", 38, 1),
    prize2: makeFrames("svg/sprites/DefineSprite_26", 32, 1),
    prize3: makeFrames("svg/sprites/DefineSprite_24", 34, 1),
    cupSide: makeFrames("svg/sprites/DefineSprite_67", 1, 1),
    cupCenter: makeFrames("svg/sprites/DefineSprite_72", 1, 1)
  };
  const overlaySizes = {
    bumper: [79, 79],
    bumperShine: [79, 79],
    pin: [11, 11],
    gutterGraphic: [245.65, 28.4],
    gutterText: [154.6, 9.1],
    star1: [114.5, 112.6],
    star23: [112.6, 112.6],
    prize1: [48.35, 19.85],
    prize2: [7.3, 14.1],
    prize3: [12.25, 14.8],
    cupSide: [44.14, 45.82],
    cupCenter: [37.7, 35.95],
    launcherBack: [47.4, 152.75],
    launcherFront: [47.4, 152.75],
    plunger: [24.8, 96.4]
  };
  const overlayTargets = {
    b1: { id: "b1", set: "bumper", x: 72.55, y: 106, depth: 108 },
    b2: { id: "b2", set: "bumper", x: 170.55, y: 106, depth: 117 },
    b3: { id: "b3", set: "bumper", x: 120.95, y: 177, depth: 99 },
    b1Shine: { id: "b1Shine", set: "bumperShine", x: 72.55, y: 106, depth: 108.5 },
    b2Shine: { id: "b2Shine", set: "bumperShine", x: 170.55, y: 106, depth: 117.5 },
    b3Shine: { id: "b3Shine", set: "bumperShine", x: 120.95, y: 177, depth: 99.5 },
    gutterGraphic: { id: "gutterGraphic", set: "gutterGraphic", x: 25.3, y: 359.2, depth: 2 },
    gutterText: { id: "gutterText", set: "gutterText", x: 104.8, y: 376.65, depth: 35 },
    star1: { id: "star1", set: "star1", x: 98.25, y: 267.6, depth: 7, layer: "effects" },
    star2: { id: "star2", set: "star23", x: 22.5, y: 213.45, depth: 14, layer: "effects" },
    star3: { id: "star3", set: "star23", x: 171.3, y: 231.55, depth: 21, layer: "effects" },
    prize1: { id: "prize1", set: "prize1", x: 130.35, y: 307.75, depth: 33, layer: "effects" },
    prize2: { id: "prize2", set: "prize2", x: 72.5, y: 255.5, depth: 31, layer: "effects" },
    prize3: { id: "prize3", set: "prize3", x: 219.95, y: 271.8, depth: 29, layer: "effects" }
  };
  const pinTargets = {
    pin1: [228.5, 75.75], pin2: [155.35, 99.45], pin3: [47.6, 145.75],
    pin4: [44.15, 262.4], pin5: [93.45, 295.05], pin6: [75.4, 351.95],
    pin7: [151.1, 259.05], pin8: [63.75, 187.05], pin9: [220.8, 241.85],
    pin10: [94.55, 261.65], pin11: [218.25, 323.45], pin12: [247.9, 284.55],
    pin13: [151.1, 275.9], pin14: [191.1, 284.45], pin15: [74.8, 84.75],
    pin16: [64.45, 338.45], pin17: [44.85, 220.3], pin18: [236.35, 219.95],
    pin19: [125.9, 333.05], pin20: [170.35, 333.05]
  };
  const dynamicObjects = [
    overlayTargets.gutterGraphic,
    overlayTargets.star1,
    overlayTargets.star2,
    overlayTargets.star3,
    overlayTargets.prize3,
    overlayTargets.prize2,
    overlayTargets.prize1,
    overlayTargets.gutterText,
    overlayTargets.b3,
    overlayTargets.b3Shine,
    overlayTargets.b1,
    overlayTargets.b1Shine,
    overlayTargets.b2,
    overlayTargets.b2Shine,
    { id: "cup2", set: "cupSide", x: 55.7027, y: 244.3938, depth: 126 },
    { id: "cup3", set: "cupSide", x: 205.9527, y: 263.0938, depth: 131 },
    { id: "cup1", set: "cupCenter", x: 134.55, y: 313.25, depth: 136 },
    ...Object.entries(pinTargets).map(([id, xy], index) => ({ id, set: "pin", x: xy[0], y: xy[1], depth: 142 + index * 2 })),
    { id: "launcherBack", set: "launcherBack", x: 263.4, y: 308.85, depth: 214 },
    { id: "plunger", set: "plunger", x: 273.3, y: 309.15, depth: 214.1 },
    { id: "launcherFront", set: "launcherFront", x: 263.4, y: 308.85, depth: 214.2 }
  ];
  const actorEls = new Map();
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    stageScale = nextW / W;
    ctx.setTransform(stageScale, 0, 0, stageScale, 0, 0);
  }

  async function inlineStageSvg(container) {
    const src = container.dataset.src;
    if (!src) return;
    try {
      const text = await fetch(assetUrl(src)).then((res) => res.text());
      const svg = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
      svg.classList.add("inline-stage-svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      hideStageCharacters(svg, ["85", "87", "113", "114", "115", "116"]);
      container.replaceChildren(svg);
    } catch (err) {
      console.warn(`Could not inline ${src}.`, err);
    }
  }

  function hideStageCharacters(svg, ids) {
    const hidden = new Set(ids);
    svg.querySelectorAll("use").forEach((node) => {
      const characterId = node.getAttribute("ffdec:characterId")
        || node.getAttributeNS("https://www.free-decompiler.com/flash", "characterId");
      if (hidden.has(characterId)) node.style.display = "none";
    });
  }

  const state = {
    mode: "ready",
    force: 0,
    launchPower: 56,
    charging: false,
    chargeStart: 0,
    path: null,
    frame: 0,
    lastStep: 0,
    physicsLast: 0,
    settleFrames: 0,
    inLauncherLane: false,
    lastWallHit: 0,
    ballVisible: true,
    hideBallAt: 0,
    ballSink: null,
    ball: { x: 287.85, y: 296.56, vx: 0, vy: 0 },
    animations: [],
    bumperPic: { b1: 3, b2: 3, b3: 3 },
    celebrating: false,
    lastCelebrate: 0,
    physicsStep: 0,
    lastCollision: "",
    launcherCleared: false,
    pin1Armed: false,
    message: "PULL",
    prize: "",
    resultCup: null,
    submitted: false,
    wobble: 0
  };

  const BALL_RADIUS = 9.7;
  const PIN_RADIUS = 5.2;
  const LAUNCH_CURVE_END_Y = 68;
  const LAUNCH_CURVE_START_Y = 142;
  const LAUNCH_CURVE_PULL = 37.5;
  const LAUNCH_CURVE_EXIT_SLOPE = 1.05;
  const LAUNCH_POWER_MIN = 56;
  const LAUNCH_POWER_MAX = 71;
  window.__winballPowerRange = { min: LAUNCH_POWER_MIN, max: LAUNCH_POWER_MAX };
  const LAUNCH_REST_X = 285.45;
  const LAUNCH_REST_Y = 294.2;
  const launcherReturnWall = { id: "launcherReturnWall", x1: 234, y1: 71.6, x2: 237.6, y2: 45.3 };
  const bumperBodies = [
    { id: "b1", x: 112.05, y: 145.5, r: 28, kick: 8.32 },
    { id: "b2", x: 210.05, y: 145.5, r: 28, kick: 8.32 },
    { id: "b3", x: 160.45, y: 216.5, r: 28, kick: 8.32 }
  ];
  const pinBodies = Object.entries(pinTargets).map(([id, [x, y]]) => ({ id, x: x + 5.5, y: y + 5.5, r: PIN_RADIUS }));
  const cupMouths = [
    { id: "2", x1: 60.8, y1: 266.4, x2: 95.8, y2: 266.4 },
    { id: "1", x1: 135.4, y1: 326.0, x2: 171.4, y2: 326.0 },
    { id: "3", x1: 211.0, y1: 285.0, x2: 246.0, y2: 285.0 }
  ];
  const cupSinkTargets = {
    "1": { x: 153.4, y: 343.6 },
    "2": { x: 77.8, y: 279.0 },
    "3": { x: 228.0, y: 297.4 }
  };

  function arcSegments(cx, cy, rx, ry, fromDeg, toDeg, steps, id) {
    const segments = [];
    for (let i = 0; i < steps; i += 1) {
      const a1 = (fromDeg + (toDeg - fromDeg) * i / steps) * Math.PI / 180;
      const a2 = (fromDeg + (toDeg - fromDeg) * (i + 1) / steps) * Math.PI / 180;
      segments.push({
        id: `${id}${i}`,
        x1: cx + Math.cos(a1) * rx,
        y1: cy + Math.sin(a1) * ry,
        x2: cx + Math.cos(a2) * rx,
        y2: cy + Math.sin(a2) * ry
      });
    }
    return segments;
  }

  const wallSegments = [
    ...arcSegments(160, 158, 137, 137, 184, 269, 12, "outerLeft"),
    ...arcSegments(160, 158, 137, 137, 271, 332, 10, "outerRight"),
    ...arcSegments(160, 158, 111, 112, 214, 226, 3, "leftGuide"),
    { id: "leftCutTop", x1: 24, y1: 197, x2: 54, y2: 225 },
    { id: "leftCutBottom", x1: 54, y1: 225, x2: 24, y2: 254 },
    { id: "leftOuterWall_to_outerLeft0", x1: 24, y1: 148.4, x2: 24, y2: 254 },
    { id: "leftWall", x1: 24, y1: 254, x2: 24, y2: 382 },
    { id: "leftBottom", x1: 24, y1: 388, x2: 129, y2: 388 },
    { id: "rightCutTop", x1: 268, y1: 196, x2: 238, y2: 225 },
    { id: "rightCutBottom", x1: 238, y1: 225, x2: 268, y2: 254 },
    { id: "rightRail", x1: 268, y1: 151, x2: 268, y2: 302 },
    { id: "rightWallLower", x1: 268, y1: 302, x2: 268, y2: 388 },
    { id: "leftTunnel_pin15_pin3", x1: 80.3, y1: 90.25, x2: 53.1, y2: 151.25 }
  ];

  function finishRound() {
    if (!state.submitted && typeof window.__newWinballSubmitRound === "function") {
      state.submitted = true;
      window.__newWinballSubmitRound({
        cup: state.resultCup,
        path: [...window.__winballPath]
      });
    }
    state.mode = "ready";
    state.path = null;
    state.force = 0;
    state.launchPower = LAUNCH_POWER_MIN;
    state.celebrating = Boolean(state.prize);
    state.lastCelebrate = performance.now();
    if (!state.prize) {
      state.ball = { x: LAUNCH_REST_X, y: LAUNCH_REST_Y, vx: 0, vy: 0 };
      state.ballVisible = true;
      state.hideBallAt = 0;
      state.ballSink = null;
      state.message = "TRY AGAIN";
    } else {
      state.message = state.prize;
    }
  }

  function bounceCircle(body, restitution) {
    const ball = state.ball;
    const dx = ball.x - body.x;
    const dy = ball.y - body.y;
    const minDist = BALL_RADIUS + body.r;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 0 || distSq >= minDist * minDist) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * nx;
      ball.vy -= (1 + restitution) * vn * ny;
    }
    return true;
  }

  function launcherLaneGuide(y) {
    if (y > LAUNCH_CURVE_START_Y) return { x: 285.45, dxdy: 0 };
    const span = LAUNCH_CURVE_START_Y - LAUNCH_CURVE_END_Y;
    const t = Math.max(0, Math.min(1, (LAUNCH_CURVE_START_Y - y) / span));
    const t2 = t * t;
    const t3 = t2 * t;
    const curve = (-2 * t3 + 3 * t2) + (t3 - t2) * LAUNCH_CURVE_EXIT_SLOPE;
    const curveSlope = (-6 * t2 + 6 * t) + (3 * t2 - 2 * t) * LAUNCH_CURVE_EXIT_SLOPE;
    const dxdy = LAUNCH_CURVE_PULL * curveSlope / span;
    return { x: 285.45 - curve * LAUNCH_CURVE_PULL, dxdy };
  }

  function launcherLaneCenterX(y) {
    return launcherLaneGuide(y).x;
  }

  function launcherCurveWalls() {
    const walls = [];
    const laneHalfWidth = 20;
    for (let y = LAUNCH_CURVE_START_Y; y > LAUNCH_CURVE_END_Y; y -= 8) {
      const nextY = Math.max(LAUNCH_CURVE_END_Y, y - 8);
      const x1 = launcherLaneCenterX(y);
      const x2 = launcherLaneCenterX(nextY);
      walls.push({
        id: `launcherCurveInner${walls.length}`,
        x1: x1 - laneHalfWidth,
        y1: y,
        x2: x2 - laneHalfWidth,
        y2: nextY
      });
      walls.push({
        id: `launcherCurveOuter${walls.length}`,
        x1: x1 + laneHalfWidth,
        y1: y,
        x2: x2 + laneHalfWidth,
        y2: nextY
      });
    }
    return walls;
  }

  function recordBallPath(tag = "") {
    const point = {
      step: state.physicsStep,
      x: state.ball.x,
      y: state.ball.y,
      vx: state.ball.vx,
      vy: state.ball.vy,
      lane: state.inLauncherLane,
      tag: tag || state.lastCollision
    };
    window.__winballPath.push(point);
    if (window.__winballPath.length > 900) window.__winballPath.shift();
    state.lastCollision = "";
  }

  function resolveSegmentCollision(segment, restitution = 0.72) {
    const ball = state.ball;
    const sx = segment.x2 - segment.x1;
    const sy = segment.y2 - segment.y1;
    const lenSq = sx * sx + sy * sy;
    if (!lenSq) return false;
    const t = Math.max(0, Math.min(1, ((ball.x - segment.x1) * sx + (ball.y - segment.y1) * sy) / lenSq));
    const px = segment.x1 + sx * t;
    const py = segment.y1 + sy * t;
    const dx = ball.x - px;
    const dy = ball.y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 0 || distSq >= BALL_RADIUS * BALL_RADIUS) return false;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = BALL_RADIUS - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + restitution) * vn * nx;
      ball.vy -= (1 + restitution) * vn * ny;
    }
    return true;
  }

  const _launcherCurveWallsCache = launcherCurveWalls();

  function resolveWallSegments() {
    let touched = false;
    const segments = state.launcherCleared ? [...wallSegments, ..._launcherCurveWallsCache] : wallSegments;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const segment of segments) {
        if (resolveSegmentCollision(segment)) {
          touched = true;
          state.lastCollision = segment.id;
        }
      }
    }
    if (touched && performance.now() - state.lastWallHit > 90) {
      state.lastWallHit = performance.now();
      react("w");
    }
  }

  function crossedCupMouth(cup, prevX, prevY, x, y) {
    if (y < cup.y1 || prevY > cup.y1 || y === prevY) return false;
    const t = (cup.y1 - prevY) / (y - prevY);
    if (t < 0 || t > 1) return false;
    const crossedX = prevX + (x - prevX) * t;
    return crossedX >= cup.x1 - BALL_RADIUS * 0.45 && crossedX <= cup.x2 + BALL_RADIUS * 0.45;
  }

  function applyWallBounce() {
    const ball = state.ball;

    if (state.inLauncherLane) {
      if (ball.y >= LAUNCH_REST_Y && ball.vy > 0) {
        ball.x = launcherLaneCenterX(LAUNCH_REST_Y);
        ball.y = LAUNCH_REST_Y;
        ball.vx = 0;
        ball.vy = -Math.abs(ball.vy) * 0.28;
        state.lastCollision = "launcherBottom";
        if (Math.abs(ball.vy) < 0.65) {
          ball.vy = 0;
          state.mode = "ready";
          state.force = 0;
          state.launchPower = LAUNCH_POWER_MIN;
          state.charging = false;
          state.settleFrames = 0;
          state.inLauncherLane = false;
          state.physicsLast = 0;
          state.message = "PULL";
        }
        return;
      }

      if (ball.y > LAUNCH_CURVE_END_Y) {
        const guide = launcherLaneGuide(ball.y);
        ball.x = guide.x;
        ball.vx = guide.dxdy * ball.vy;
        return;
      }

      state.inLauncherLane = false;
      ball.x = launcherLaneCenterX(LAUNCH_CURVE_END_Y);
      const powerRatio = state.launchPower / 100;
      ball.vx = Math.min(ball.vx, -3.8 - state.launchPower * 0.085 - powerRatio * powerRatio * 2.0);
      return;
    }

    if (state.launcherCleared && resolveSegmentCollision(launcherReturnWall, 0.78)) {
      state.lastCollision = "launcherReturnWall";
      react("w");
    }
  }

  function stepPhysics(dt) {
    if (state.mode !== "playing") return;
    state.physicsStep += 1;
    const ball = state.ball;
    const prevX = ball.x;
    const prevY = ball.y;
    ball.vy += 0.831 * dt;
    ball.vx *= Math.pow(0.993, dt);
    ball.vy *= Math.pow(0.997, dt);
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    applyWallBounce();
    if (state.mode !== "playing") {
      recordBallPath();
      return;
    }
    if (!state.inLauncherLane && ball.x < 232) state.launcherCleared = true;
    if (state.launcherCleared && (ball.x < 188 || ball.y > 150)) state.pin1Armed = true;
    if (!state.inLauncherLane) resolveWallSegments();

    for (const bumper of bumperBodies) {
      if (bounceCircle(bumper, 1.02)) {
        const speed = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx = ball.vx / speed * Math.max(speed, bumper.kick);
        ball.vy = ball.vy / speed * Math.max(speed, bumper.kick);
        state.lastCollision = bumper.id;
        react(bumper.id);
      }
    }

    for (const pin of pinBodies) {
      if (pin.id === "pin1" && !state.pin1Armed) continue;
      if (bounceCircle(pin, 0.72)) {
        state.lastCollision = pin.id;
        react(pin.id);
      }
    }

    for (const cup of cupMouths) {
      if (ball.vy > 0 && crossedCupMouth(cup, prevX, prevY, ball.x, ball.y)) {
        state.lastCollision = `cup${cup.id}Mouth`;
        react(`win${cup.id}`);
        finishRound();
        return;
      }
    }

    if (ball.y > 371) {
      react("g");
      finishRound();
      return;
    }

    if (Math.hypot(ball.vx, ball.vy) < 0.18 && ball.y > 320) {
      state.settleFrames += 1;
    } else {
      state.settleFrames = 0;
    }
    if (state.settleFrames > 45) {
      react("g");
      finishRound();
    }
    recordBallPath();
  }

  function react(event, x, y) {
    if (event === "p") return;
    if (event === "w") {
      playSound("wall");
      return;
    } else if (event.startsWith("b")) {
      const nextPic = state.bumperPic[event] === 1 ? 2 : state.bumperPic[event] === 2 ? 3 : 1;
      state.bumperPic[event] = nextPic;
      playSound("bumper");
      addAnimation({ ...overlayTargets[event], sequence: nextPic === 1 ? [1, 2] : nextPic === 2 ? [3, 4] : [5, 6] });
    } else if (event.startsWith("pin")) {
      const pos = pinTargets[event];
      playSound("pinSoft");
      if (pos) addAnimation({ id: event, set: "pin", x: pos[0], y: pos[1] });
    } else if (event.startsWith("win")) {
      const cup = event.slice(3);
      state.resultCup = cup;
      state.prize = cup === "1" ? "300 POINTS + PRIZE" : "150 POINTS";
      state.message = "WIN!";
      state.ballVisible = true;
      state.hideBallAt = performance.now() + 430;
      state.ballSink = {
        started: performance.now(),
        duration: 360,
        from: { x: state.ball.x, y: state.ball.y },
        to: cupSinkTargets[cup] || { x: state.ball.x, y: state.ball.y + 10 }
      };
      playSound("prize");
      addAnimation({ ...overlayTargets[`star${cup}`], restart: true, loop: true, sequence: starPlaySequence(`star${cup}`) });
      addAnimation(overlayTargets[`prize${cup}`]);
    } else if (event === "g") {
      state.resultCup = null;
      state.ballVisible = false;
      state.hideBallAt = 0;
      state.ballSink = null;
      state.message = "GUTTER";
      state.celebrating = false;
      playSound("gutter");
      addAnimation(overlayTargets.gutterGraphic);
      addAnimation(overlayTargets.gutterText);
    }
  }

  function playSound(id) {
    window.__winballSoundEvents.push({ id, at: performance.now() });
    if (window.__winballSoundEvents.length > 50) window.__winballSoundEvents.shift();
    if (audioCtx && audioBuffers[id]) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffers[id];
      const gain = audioCtx.createGain();
      gain.gain.value = soundVolumes[id] ?? 1;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      source.start(0);
      return;
    }
    const base = sounds[id];
    if (!base) return;
    const audio = base.cloneNode();
    audio.volume = base.volume;
    const played = audio.play();
    if (played && typeof played.catch === "function") played.catch(() => {});
  }
  window.__winballPlaySound = playSound;

  function primeSounds() {
    if (audioCtx?.state === "suspended") audioCtx.resume();
    Object.values(sounds).forEach((audio) => audio.load());
  }

  function addAnimation(target) {
    if (!target) return;
    if (target.restart) {
      state.animations = state.animations.filter((animation) => animation.id !== target.id);
    }
    state.animations.push({ ...target, started: performance.now() });
  }

  function bumperIdleFrame(id) {
    const pic = state.bumperPic[id];
    if (pic === 1) return 2;
    if (pic === 2) return 4;
    return 0;
  }

  function animationLength(animation) {
    if (animation.sequence) return animation.sequence.length;
    return overlaySets[animation.set]?.length || 0;
  }

  function starPlaySequence(id) {
    const length = overlaySets[id === "star1" ? "star1" : "star23"].length - 1;
    return Array.from({ length }, (_, index) => index + 1);
  }

  function actorLayerForDepth(depth) {
    if (depth < 93) return actorsBackEl;
    if (depth < 214) return actorsPlayfieldEl;
    return actorsTopEl;
  }

  function actorLayerForObject(object) {
    if (object.layer === "effects") return actorsEffectsEl;
    return actorLayerForDepth(object.depth);
  }

  function setupActors() {
    actorsBackEl.innerHTML = "";
    actorsEffectsEl.innerHTML = "";
    actorsPlayfieldEl.innerHTML = "";
    actorsTopEl.innerHTML = "";
    const objects = [...dynamicObjects].sort((a, b) => a.depth - b.depth);
    for (const object of objects) {
      const img = document.createElement("img");
      const [width, height] = overlaySizes[object.set];
      img.className = "actor";
      img.draggable = false;
      img.style.left = `${object.x / W * 100}%`;
      img.style.top = `${object.y / H * 100}%`;
      img.style.width = `${width / W * 100}%`;
      img.style.height = `${height / H * 100}%`;
      img.src = frameSrc(object.set, 0);
      const parent = actorLayerForObject(object);
      parent.appendChild(img);
      actorEls.set(object.id, { img, src: img.src });
    }
  }

  function frameSrc(set, frame) {
    if (set === "launcherBack") return assetUrl("svg/sprites/DefineSprite_131/launcher_back.svg");
    if (set === "launcherFront") return assetUrl("svg/sprites/DefineSprite_131/launcher_front.svg");
    if (set === "plunger") return plungerFrames[Math.min(PLUNGER_FRAME_COUNT - 1, frame)]?.src || "";
    if (set === "star1") return assetUrl(`svg/sprites/DefineSprite_16/${frame + 1}.svg`);
    if (set === "star23") return assetUrl(`svg/sprites/DefineSprite_19/${frame + 1}.svg`);
    const img = overlaySets[set]?.[frame] || overlaySets[set]?.[0];
    return img?.src || "";
  }

  function startCharge() {
    if (state.mode !== "ready") return;
    state.mode = "charging";
    state.charging = true;
    state.chargeStart = performance.now();
    primeSounds();
    state.ball = { x: LAUNCH_REST_X, y: LAUNCH_REST_Y, vx: 0, vy: 0 };
    state.ballVisible = true;
    state.hideBallAt = 0;
    state.ballSink = null;
    state.animations = [];
    state.inLauncherLane = false;
    state.celebrating = false;
    state.physicsStep = 0;
    state.lastCollision = "";
    state.launcherCleared = false;
    state.pin1Armed = false;
    window.__winballPath = [];
    state.prize = "";
    state.resultCup = null;
    state.submitted = false;
    state.message = "PULL";
  }

  function launchWithPower(force) {
    state.force = Math.max(0, Math.min(100, Math.round(force)));
    state.launchPower = LAUNCH_POWER_MIN + (LAUNCH_POWER_MAX - LAUNCH_POWER_MIN) * (state.force / 100);
    const powerRatio = state.launchPower / 100;
    const lateral = ((state.force % 23) - 11) * 0.025;
    state.path = null;
    state.frame = 0;
    state.mode = "playing";
    state.charging = false;
    state.ballVisible = true;
    state.hideBallAt = 0;
    state.ballSink = null;
    state.ball = {
      x: LAUNCH_REST_X,
      y: LAUNCH_REST_Y,
      vx: -0.55 - state.launchPower * 0.018 - powerRatio * powerRatio * 0.6 + lateral,
      vy: -12.15 - state.launchPower * 0.12 - powerRatio * powerRatio * 2.0
    };
    state.settleFrames = 0;
    state.inLauncherLane = true;
    state.physicsStep = 0;
    state.lastCollision = "";
    state.launcherCleared = false;
    state.pin1Armed = false;
    window.__winballPath = [];
    state.physicsLast = performance.now();
    state.lastStep = state.physicsLast;
    state.message = `POWER ${state.force}%`;
    playSound("plunger");
  }

  function releaseCharge() {
    if (!state.charging) return;
    const elapsed = performance.now() - state.chargeStart;
    let force = Math.floor(elapsed / 10);
    if (force > 100) force = 50 + Math.floor(Math.random() * 50);
    launchWithPower(force);
  }

  function setupDebugPowerChooser() {
    if (!DEBUG_PATH) return;
    const panel = document.createElement("div");
    panel.id = "debug-power";

    const label = document.createElement("label");
    label.textContent = "Power ";

    const value = document.createElement("output");
    value.value = "50%";
    value.textContent = "50%";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = "50";

    const launch = document.createElement("button");
    launch.type = "button";
    launch.textContent = "Launch";

    const presets = document.createElement("div");
    presets.className = "debug-power-presets";

    function setPower(power) {
      slider.value = String(power);
      value.value = `${power}%`;
      const effective = LAUNCH_POWER_MIN + (LAUNCH_POWER_MAX - LAUNCH_POWER_MIN) * (power / 100);
      value.textContent = `${power}% (${effective.toFixed(1)}%)`;
    }

    function fire(power = Number(slider.value)) {
      state.mode = "ready";
      launchWithPower(power);
    }

    slider.addEventListener("input", () => setPower(Number(slider.value)));
    launch.addEventListener("click", () => fire());

    [10, 25, 50, 75, 85, 90, 100].forEach((power) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${power}%`;
      button.addEventListener("click", () => {
        setPower(power);
        fire(power);
      });
      presets.appendChild(button);
    });

    label.appendChild(value);
    panel.append(label, slider, launch, presets);
    document.body.appendChild(panel);
    window.__winballLaunchPower = fire;
  }

  function pointerInLever(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX - rect.left) * W / rect.width;
    const y = (evt.clientY - rect.top) * H / rect.height;
    return x > 262 && x < 304 && y > 334 && y < 410;
  }

  canvas.addEventListener("pointerdown", (evt) => {
    canvas.setPointerCapture(evt.pointerId);
    if (pointerInLever(evt) || state.mode === "ready") startCharge();
  });
  canvas.addEventListener("pointerup", releaseCharge);
  canvas.addEventListener("pointercancel", releaseCharge);
  // Named so they can be removed on teardown. Listeners on `canvas` die with
  // the element, but these are on `window`: as anonymous handlers they kept the
  // whole game scope (physics world, stage actors, audio graph) reachable for
  // the life of the document, and a second visit added another pair.
  const onKeyDown = (evt) => {
    if ((evt.code === "Space" || evt.code === "ArrowDown") && !evt.repeat) {
      evt.preventDefault();
      startCharge();
    }
  };
  const onKeyUp = (evt) => {
    if (evt.code === "Space" || evt.code === "ArrowDown") {
      evt.preventDefault();
      releaseCharge();
    }
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function drawBall(x, y) {
    const size = 24.2 * 0.80133057;
    const left = x - size / 2;
    const top = y - size / 2;
    if (ballImg.complete && ballImg.naturalWidth > 0) {
      ctx.drawImage(ballImg, left, top, size, size);
      return;
    }
    ctx.fillStyle = "#99e1ff";
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDebugPath() {
    const points = window.__winballPath;
    if (!DEBUG_PATH || points.length < 2) return;
    ctx.save();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255, 40, 40, 0.85)";
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 230, 0, 0.95)";
    for (let index = 0; index < points.length; index += 12) {
      const point = points[index];
      ctx.beginPath();
      ctx.arc(point.x, point.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    const end = points[points.length - 1];
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fillRect(8, 8, 230, 22);
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.fillText(`x ${end.x.toFixed(1)} y ${end.y.toFixed(1)} vx ${end.vx.toFixed(1)} vy ${end.vy.toFixed(1)} lane ${end.lane ? 1 : 0}`, 14, 23);
    ctx.restore();
  }

  function debugLabel(text, x, y, fill = "rgba(0, 0, 0, 0.72)") {
    ctx.font = "7px sans-serif";
    const width = ctx.measureText(text).width + 4;
    ctx.fillStyle = fill;
    ctx.fillRect(x - 2, y - 8, width, 9);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y - 1);
  }

  function drawDebugCircle(body, color, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(body.x, body.y, body.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(body.x, body.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    debugLabel(label || body.id, body.x + body.r + 2, body.y);
  }

  function drawDebugLine(line, color, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    debugLabel(label || line.id, (line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2);
  }

  function drawDebugHitboxes() {
    if (!DEBUG_PATH) return;
    ctx.save();

    ctx.lineWidth = 1;
    wallSegments.forEach((segment) => {
      ctx.strokeStyle = segment.id.startsWith("outer") ? "rgba(0, 210, 255, 0.9)" : "rgba(255, 160, 0, 0.9)";
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
      debugLabel(segment.id, (segment.x1 + segment.x2) / 2, (segment.y1 + segment.y2) / 2);
    });
    launcherCurveWalls().forEach((segment) => {
      drawDebugLine(segment, "rgba(180, 80, 255, 0.85)", segment.id);
    });

    bumperBodies.forEach((body) => drawDebugCircle(body, "rgba(255, 50, 210, 0.9)", body.id));
    pinBodies.forEach((body) => drawDebugCircle(body, "rgba(255, 235, 0, 0.9)", body.id));
    cupMouths.forEach((cup) => drawDebugLine(cup, "rgba(0, 255, 130, 0.95)", `cup${cup.id}Mouth`));

    ctx.strokeStyle = "rgba(180, 80, 255, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = LAUNCH_CURVE_START_Y + 50; y >= LAUNCH_CURVE_END_Y; y -= 4) {
      const x = launcherLaneCenterX(y);
      if (y === LAUNCH_CURVE_START_Y + 50) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    debugLabel("launcherGuide", launcherLaneCenterX((LAUNCH_CURVE_START_Y + LAUNCH_CURVE_END_Y) / 2) + 4, (LAUNCH_CURVE_START_Y + LAUNCH_CURVE_END_Y) / 2);

    drawDebugLine(launcherReturnWall, "rgba(255, 40, 40, 0.95)", "launcherReturnWall");
    drawDebugLine({ x1: LAUNCH_REST_X - 11, y1: LAUNCH_REST_Y, x2: LAUNCH_REST_X + 11, y2: LAUNCH_REST_Y }, "rgba(255, 80, 80, 0.95)", "launcherBottom");

    ctx.restore();
  }

  function drawOverlay(now) {
    if (state.mode === "charging") {
      const elapsed = now - state.chargeStart;
      state.force = Math.min(100, Math.floor(elapsed / 10));
    }
    updateActors(now);
  }

  function updateActors(now) {
    if (state.celebrating && now - state.lastCelebrate >= 1000 / SWF_FPS) {
      const id = `pin${Math.floor(Math.random() * 20) + 1}`;
      const pos = pinTargets[id];
      if (pos) addAnimation({ id, set: "pin", x: pos[0], y: pos[1] });
      state.lastCelebrate = now;
    }

    const active = new Map();
    for (const animation of state.animations) {
      const frames = overlaySets[animation.set];
      const step = Math.floor((now - animation.started) / (1000 / SWF_FPS));
      const length = animationLength(animation);
      const frameStep = animation.loop && length ? step % length : step;
      const frame = animation.sequence ? animation.sequence[Math.min(frameStep, animation.sequence.length - 1)] : frameStep;
      if (frames && (animation.loop || step < length) && frame < frames.length) {
        active.set(animation.id, frame);
      }
    }
    for (const object of dynamicObjects) {
      const actor = actorEls.get(object.id);
      if (!actor) continue;
      const parent = actorLayerForObject(object);
      if (actor.img.parentElement !== parent) parent.appendChild(actor.img);
      let frame = active.has(object.id) ? active.get(object.id) : 0;
      if (object.set === "bumper" && !active.has(object.id)) {
        frame = bumperIdleFrame(object.id);
      }
      if (object.set === "bumperShine") {
        frame = Math.floor(now / (1000 / SWF_FPS)) % overlaySets.bumperShine.length;
      }
      if (object.id === "plunger" && state.mode === "charging") {
        frame = Math.min(PLUNGER_FRAME_COUNT - 1, Math.floor((now - state.chargeStart) / (1000 / PLUNGER_FPS)));
      }
      const nextSrc = frameSrc(object.set, frame);
      if (nextSrc && actor.src !== nextSrc) {
        actor.img.src = nextSrc;
        actor.src = nextSrc;
      }
    }
    state.animations = state.animations.filter((animation) => {
      return animation.loop || Math.floor((now - animation.started) / (1000 / SWF_FPS)) < animationLength(animation);
    });
  }

  function draw(now) {
    if (disposed) return;
    if (state.ballSink) {
      const t = Math.min(1, (now - state.ballSink.started) / state.ballSink.duration);
      const eased = t * t * (3 - 2 * t);
      state.ball.x = state.ballSink.from.x + (state.ballSink.to.x - state.ballSink.from.x) * eased;
      state.ball.y = state.ballSink.from.y + (state.ballSink.to.y - state.ballSink.from.y) * eased;
      if (t >= 1) state.ballSink = null;
    }
    if (state.hideBallAt && now >= state.hideBallAt) {
      state.ballVisible = false;
      state.hideBallAt = 0;
    }
    if (state.mode === "playing") {
      if (!state.physicsLast) state.physicsLast = now;
      const elapsed = Math.min(100, now - state.physicsLast);
      const steps = Math.max(1, Math.ceil(elapsed / 8));
      const dt = elapsed / steps / (1000 / SWF_FPS);
      for (let i = 0; i < steps; i += 1) {
        stepPhysics(dt);
      }
      state.physicsLast = now;
    }

    ctx.clearRect(0, 0, W, H);
    drawOverlay(now);
    drawDebugHitboxes();
    drawDebugPath();
    if (state.ballVisible) drawBall(state.ball.x, state.ball.y);
    drawFrameId = requestAnimationFrame(draw);
  }

  async function setupStageLayers() {
    for (const stageEl of stageEls) {
      await inlineStageSvg(stageEl);
    }
  }

  resizeCanvas();
  const resizeObs = new ResizeObserver(() => resizeCanvas());
  resizeObs.observe(canvas);
  window.__newWinballDispose = () => {
    disposed = true;
    if (drawFrameId) cancelAnimationFrame(drawFrameId);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    resizeObs.disconnect();
    audioCtx?.close().catch(() => {});
  };
  setupDebugPowerChooser();
  setupStageLayers().finally(setupActors);
  drawFrameId = requestAnimationFrame(draw);
}


function showModal({ title, message, imageUrl }) {
  modal.value = { open: true, title, message, imageUrl: imageUrl || '' }
}

async function closeModal() {
  modal.value.open = false
  await fetchSelf({ force: true })
  scavenger.openIfPending()
}

function stateHistoryForCup(cup) {
  const pockets = {
    1: { x: 0, z: 19.25 },
    2: { x: -10, z: 13.25 },
    3: { x: 10, z: 13.25 }
  }
  const pocket = pockets[cup]
  if (!pocket) {
    return [
      { position: { x: 15, z: 23 }, velocity: { x: 0, z: 4 } },
      { position: { x: 15, z: 25 }, velocity: { x: 0, z: 0 } }
    ]
  }
  return [
    { position: { x: pocket.x, z: pocket.z - 3 }, velocity: { x: 0, z: 3 } },
    { position: { x: pocket.x, z: pocket.z + 1 }, velocity: { x: 0, z: 0 } }
  ]
}

async function submitRound({ cup }) {
  try {
    const result = await $fetch('/api/game/winball', {
      method: 'POST',
      body: stateHistoryForCup(cup)
    })

    if (result.result === 'hit') {
      if (result.grandPrizeCtoon) {
        showModal({
          title: 'Winner',
          message: `You won ${result.pointsAwarded} points and a grand prize cToon: "${result.grandPrizeCtoon}".\n\nYou have ${result.pointsRemainingToday} points remaining today.`,
          imageUrl: result.grandPrizeCtoonImage || ''
        })
      } else {
        showModal({
          title: 'Winner',
          message: `You won ${result.pointsAwarded} points.\n\nYou have ${result.pointsRemainingToday} points remaining today.`
        })
      }
      await scavenger.maybeTrigger('winball_win', { open: false })
    } else {
      showModal({ title: 'Gutter', message: 'You hit the gutter.' })
    }

    await fetchSelf({ force: true })
  } catch (err) {
    console.error('Error verifying Winball result:', err)
    showModal({
      title: 'Winball',
      message: 'Could not verify this round. Please try again.'
    })
  }
}

onMounted(async () => {
  scavenger.reset()

  try {
    config.value = await $fetch('/api/winball-config')
  } catch (err) {
    console.warn('Could not load Winball config, using defaults', err)
  }

  window.__newWinballAssetBase = '/newwinball/'
  window.__newWinballSubmitRound = submitRound

  runNewWinballGame()

})

onBeforeUnmount(() => {
  window.__newWinballDispose?.()
  delete window.__newWinballDispose
  delete window.__newWinballSubmitRound
  delete window.__newWinballAssetBase
})
</script>

<style>
@font-face {
  font-family: "FuturaBdCnBT";
  src: url("/newwinball/fonts/84_Futura_BdCn_BT.ttf") format("truetype");
  font-weight: 700;
}

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
  body.page-newwinball .main-content {
    min-height: calc(100svh - 190px);
    max-width: 100% !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
}
</style>

<style scoped>
.new-winball-page {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #111134;
  font-family: Arial, Helvetica, sans-serif;
  user-select: none;
  touch-action: none;
}

.shell {
  position: relative;
  width: min(100%, calc(100% * 507 / 430));
  max-width: 100%;
  aspect-ratio: 507 / 430;
  container-type: inline-size;
}

#stage,
#stage-foreground,
#stage-top,
#game,
#actors-back,
#actors-effects,
#actors-playfield,
#actors-top {
  display: block;
  width: 100%;
  height: 100%;
}

#stage,
#stage-foreground,
#stage-top {
  position: absolute;
  inset: 0;
  user-select: none;
  pointer-events: none;
}

#stage {
  z-index: 0;
}

#stage-foreground {
  z-index: 2;
}

#stage-top {
  z-index: 7;
}

:deep(.svg-stage svg) {
  display: block;
  width: 100%;
  height: 100%;
}

#game {
  position: absolute;
  inset: 0;
  image-rendering: auto;
  cursor: pointer;
  touch-action: none;
  z-index: 4;
  will-change: transform;
}

#actors-back,
#actors-effects,
#actors-playfield,
#actors-top {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#actors-back {
  z-index: 1;
}

#actors-effects {
  z-index: 3;
}

#actors-playfield {
  z-index: 5;
}

#actors-top {
  z-index: 6;
}

#brand-replacement,
#rules-replacement {
  position: absolute;
  pointer-events: none;
  z-index: 8;
}

#brand-replacement {
  left: 63.5%;
  top: 4.7%;
  width: 32.6%;
  height: 17.9%;
  display: grid;
  place-items: center;
  overflow: hidden;
}

#brand-replacement img {
  display: block;
  width: 96%;
  height: 92%;
  object-fit: contain;
}

#rules-replacement {
  left: 65%;
  top: 32.7%;
  width: 29.6%;
  height: 44.2%;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  color: #000033;
  font-family: "FuturaBdCnBT", "Arial Narrow", Arial, Helvetica, sans-serif;
  font-size: clamp(10px, 2.17cqw, 22px);
  font-weight: 700;
  line-height: 1.02;
  text-align: center;
}

#rules-replacement p {
  margin: 0 0 0.76em;
}

#rules-replacement p:nth-child(3),
#rules-replacement p:nth-child(4),
#rules-replacement p:nth-child(5) {
  margin-bottom: 0.2em;
}

:deep(.actor) {
  position: absolute;
  display: block;
  user-select: none;
}

.modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.modal {
  display: grid;
  justify-items: center;
  width: fit-content;
  max-width: 92%;
  padding: 20px;
  color: #fff;
  text-align: center;
  background: #111;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.modal-img {
  display: block;
  max-width: 92%;
  height: auto;
}

.modal-title {
  margin: 0 0 8px;
  font: 600 20px/1.2 system-ui;
}

.modal-msg {
  margin: 0 0 12px;
  font: 400 16px/1.5 system-ui;
  white-space: pre-line;
}

.modal-btn {
  padding: 8px 14px;
  color: #000;
  cursor: pointer;
  background: #fff;
  border: 0;
  border-radius: 6px;
}

.modal-btn:hover {
  background: #e6e6e6;
}

@media (max-width: 768px) {
  .new-winball-page {
    min-height: calc(100svh - 190px);
    max-width: 100%;
    box-sizing: border-box;
    align-items: start;
  }
}
</style>
