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

  const records = [
    `fr0 = "285.45,294.2,0,-36.6,p,5";
fr6 = "285.45,142.08,-3.67,-20.03,w,0";
fr7 = "282.33,125.04,-9.3,-15.59,w,23";
fr31 = "157.32,177.07,-5.02,-13.23,b3,1";
fr33 = "149.65,157.68,10.62,-4.78,b1,2";
fr36 = "170.85,149.92,-10.13,0.92,b2,2";
fr39 = "150.77,153.49,7.37,6.94,b1,3";
fr43 = "172.38,178.78,10.56,-4.6,b3,1";
fr45 = "183.04,174.22,-2.82,10.4,b2,0";
fr46 = "180.78,182.55,7.95,-6.7,b3,0";
fr47 = "186.89,177.41,-4.27,11.06,b2,0";
fr48 = "184.06,184.75,9.54,-6.81,b3,0";
fr49 = "190.83,179.93,-1.24,13.03,b2,0";
fr50 = "189.87,190.04,13.11,0.67,b3,4";
fr55 = "240.54,202.51,-7.92,-4.12,w,6";
fr62 = "197.58,202.84,7.53,0.17,b3,5";
fr68 = "231.24,217.67,-4.6,-3.86,pin18,14";
fr83 = "185.45,285.68,-7.38,9.91,pin14,4";
fr88 = "156.72,334.34,-2.67,0.05,win1";
fr_max = "88";`,
    `fr0 = "285.45,294.2,0,-36.9,p,5";
fr6 = "285.45,142.08,-3.71,-20.34,w,0";
fr7 = "282.36,125.12,-9.45,-15.86,w,18";
fr26 = "172.34,106.81,2.17,10.92,pin2,1";
fr28 = "175.9,125.68,-11.32,4.57,b2,2";
fr31 = "150.92,138.19,12.45,2.95,b1,1";
fr33 = "170.63,143.8,-12.68,3.98,b2,1";
fr35 = "151.24,150.76,10.76,8.83,b1,3";
fr39 = "187.84,187.94,11.48,9.35,b3,3";
fr43 = "227.36,227.47,-6.19,13.29,pin18,0";
fr44 = "223.43,235.92,-8.07,-7.23,pin9,3";
fr48 = "199.86,219.72,7.49,-0.56,b3,4";
fr53 = "227.36,226.33,-4.71,4.26,pin18,2";
fr56 = "216.6,238.75,-6.59,3.82,pin9,10";
fr67 = "163.27,331.23,-9.03,10.77,pin20,0";
fr68 = "159.75,335.43,-2.75,-0.81,win1";
fr_max = "68";`,
    `fr0 = "285.45,294.2,0,-37,p,5";
fr6 = "285.45,142.08,-3.72,-20.44,w,0";
fr7 = "282.37,125.14,-9.5,-15.95,w,18";
fr26 = "172.2,104.54,5.09,9.27,pin2,1";
fr28 = "180.09,119.76,-11.04,-2.76,b2,1";
fr30 = "167.13,116.85,-2.73,8.85,pin2,5";
fr36 = "153.81,177.52,-6.28,-11.21,b3,1";
fr38 = "146.52,164.81,11.25,1.06,b1,3";
fr42 = "184.2,175.27,5.73,9.7,b2,6";
fr49 = "213.15,243.06,-11.26,6.26,pin9,4";
fr54 = "167.62,279.41,9.85,5.54,pin13,1";
fr56 = "184.2,289.82,-7.81,5.36,pin14,6";
fr63 = "142.98,339.29,-7.23,9.92,win1";
fr_max = "63";`,
    `fr0 = "285.45,294.2,0,-37.5,p,5";
fr6 = "285.45,142.08,-3.78,-20.95,w,0";
fr7 = "282.41,125.26,-9.75,-16.4,w,18";
fr26 = "169.67,98.55,8.7,0.8,pin2,3";
fr30 = "198.22,107.77,3.06,-7.34,b2,10";
fr41 = "222.53,107.95,5.45,-3.94,b2,2";
fr44 = "236.43,101.35,-1.59,4.8,w,2";
fr47 = "233.14,113.36,6.29,-3.57,b2,1";
fr49 = "241.9,109.05,-2.72,4.76,w,1";
fr51 = "237.74,117.23,5.98,-2.07,b2,1";
fr53 = "246.12,114.99,-1.52,5.07,w,1";
fr55 = "243.6,124.52,6.27,2.25,b2,1";
fr57 = "251.74,127.96,-0.86,6.63,w,7";
fr65 = "246.29,203.19,-11.14,4.14,w,9";
fr75 = "166.83,277.31,11.2,4.07,pin13,1";
fr77 = "185.67,285.24,-7.23,-3.29,pin14,2";
fr80 = "167.84,280.32,4.14,-1.31,pin13,4";
fr85 = "185.04,286.59,-4.01,2.14,pin14,8";
fr94 = "159.18,335.16,1.71,0.91,win1";
fr_max = "94";`,
    `fr0 = "285.45,294.2,0,-37.8,p,5";
fr6 = "285.45,142.08,-3.82,-21.25,w,0";
fr7 = "282.43,125.32,-9.9,-16.66,w,18";
fr26 = "167.63,96.43,7.3,-3.05,pin2,7";
fr34 = "210.49,105.95,4.96,-6.21,b2,3";
fr38 = "224.39,92.91,0.22,3.69,pin1,3";
fr42 = "225.05,108.88,5.13,-4.89,b2,2";
fr45 = "235.94,100.67,-2.22,3.55,w,2";
fr48 = "230.76,111.78,4.47,-3.95,b2,2";
fr51 = "239.52,105.71,-1.43,3.12,w,2";
fr54 = "236.2,115.8,5.38,-1.44,b2,1";
fr56 = "245.75,114.47,-0.93,5.42,w,1";
fr58 = "244.1,125.35,6.18,3.36,b2,1";
fr60 = "252.96,130.87,-0.18,7.51,w,6";
fr67 = "251.97,196.91,-11.02,3.51,w,6";
fr74 = "195.81,234.14,-2.77,12.09,b3,4";
fr79 = "186.04,284.61,-10.62,9.07,pin14,4";
fr84 = "142.15,333.71,11.13,6.22,pin19,0";
fr85 = "146.44,336.11,4.84,-2.53,win1";
fr_max = "85";`,
    `fr0 = "285.45,294.2,0,-38.21,p,5";
fr6 = "285.45,142.08,-3.87,-21.65,w,0";
fr7 = "282.46,125.4,-10.1,-17.01,w,18";
fr26 = "164.54,94.53,3.42,-6.12,pin2,11";
fr38 = "193.09,109.79,-5.54,-6.94,b2,6";
fr45 = "163.94,94.28,-1.75,-2.94,pin2,4";
fr50 = "156.74,93.71,-2.17,-0.27,pin2,2";
fr53 = "151.55,96.04,-2.68,2.15,pin2,0";
fr54 = "151.55,96.04,-2.67,1.88,pin2,5";
fr60 = "139.93,117.42,7.85,-2.37,b1,1";
fr62 = "149.5,114.94,-0.72,6.35,pin2,2";
fr65 = "148.09,129.17,6.79,4.88,b1,3";
fr69 = "171.35,153.14,-2.53,10.6,b2,2";
fr72 = "166.07,177.34,1.34,-12.62,b3,4";
fr77 = "171.03,139.61,0.38,-4.64,b2,5";
fr83 = "172.71,132.7,-1.93,2.04,b2,7";
fr91 = "160.77,176.95,-1.14,-9.33,b3,13";
fr105 = "150.18,178.32,-4.93,-7.62,b3,1";
fr107 = "143.82,168.98,7.14,3.58,b1,2";
fr110 = "157.21,177.08,5.05,-7.19,b3,3";
fr114 = "173.48,160.25,-4.82,2.43,b2,4";
fr119 = "156.17,177.18,-5.19,-6.35,b3,2";
fr122 = "145.7,166.2,4.98,3.25,b1,2";
fr125 = "157.71,177.04,3.43,-5.59,b3,9";
fr135 = "182.92,183.93,7.03,0.01,b3,8";
fr144 = "229.16,220.32,-8.19,1.88,pin18,9";
fr154 = "168.01,284.37,1.39,12.72,pin13,3";
fr158 = "172,325.26,-3.33,-9.92,pin20,4";
fr163 = "157.97,295.57,-1.33,4.04,pin13,5";
fr169 = "151.36,334.2,-2.48,1.77,win1";
fr_max = "169";`,
    `fr0 = "285.45,294.2,0,-38.6,p,4";
fr5 = "285.45,142.08,-4.38,-23.17,w,0";
fr6 = "282.13,124.51,-10.68,-18.44,w,4";
fr11 = "236.37,58.09,-10.62,-5.04,w,14";
fr26 = "132.01,111.33,8.03,-10.6,b1,13";
fr40 = "209.17,105.96,3.53,-7.72,b2,3";
fr44 = "220.41,87.54,-2.97,0.64,pin1,5";
fr50 = "206.6,106.1,-3.35,-5.95,b2,11";
fr62 = "179.13,120.93,-7.92,3.47,b2,3";
fr66 = "151.32,140.82,8.52,6.24,b1,2";
fr69 = "173.77,160.96,0.35,12.19,b2,1";
fr71 = "174.29,179.43,8.71,-9.41,b3,0";
fr72 = "181.01,172.18,-10.5,9.45,b2,0";
fr73 = "173.34,179.09,-1.95,-13.25,b3,17";
fr91 = "151.6,177.96,-5.41,-9.43,b3,1";
fr93 = "145.15,167.07,9.19,2.4,b1,3";
fr97 = "171.28,178.44,9.49,-1.08,b3,1";
fr99 = "187.32,177.72,2.94,9.47,b2,1";
fr101 = "191.54,192.02,9.29,5.4,b3,4";
fr106 = "227.87,223.3,-8.7,5.17,pin18,11";
fr118 = "154.89,334.05,-3.41,0.2,win1";
fr_max = "118";`,
    `fr0 = "285.45,294.2,0,-41.8,p,4";
fr5 = "285.45,142.08,-4.81,-26.3,w,0";
fr6 = "282.33,125.05,-12.21,-21.16,w,3";
fr10 = "243.4,63.75,-14.72,-6.69,w,15";
fr26 = "91.99,111.44,-13.39,-0.05,b1,1";
fr28 = "75.39,111.81,0.82,11.31,w,1";
fr30 = "76.53,128.25,-10.03,7.03,b1,1";
fr32 = "65.7,136.04,3,10.9,w,4";
fr37 = "76.69,184.61,12.08,3.33,pin8,4";
fr42 = "122.27,206.5,-12.89,2.18,b3,5";
fr48 = "59.87,234.18,-3.54,12.36,pin17,1";
fr50 = "53.55,257.57,6.04,-6.4,pin4,9";
fr60 = "96.28,255.84,1.62,-5.16,pin10,8";
fr69 = "107.06,258.82,5.19,1.43,pin10,11";
fr81 = "149.79,334.57,-0.83,0.34,win1";
fr_max = "81";`,
    `fr0 = "285.45,294.2,0,-42.3,p,4";
fr5 = "285.45,142.08,-4.88,-26.78,w,0";
fr6 = "282.36,125.11,-12.44,-21.57,w,3";
fr10 = "243.89,64.14,-15.07,-6.99,w,16";
fr27 = "83.1,118.62,-11.71,7.1,b1,1";
fr29 = "67.57,128.6,4.02,11.98,w,1";
fr31 = "72.62,144.09,-4.87,12.33,b1,3";
fr35 = "58.43,184.98,-12.51,5.88,pin8,1";
fr37 = "37.82,195.7,5.81,-7.78,w,17";
fr55 = "102.82,256.37,8.6,-5.25,pin10,4";
fr60 = "133.94,245.69,1.25,6.99,b3,8";
fr69 = "142.59,335.25,4.38,13.73,pin19,0";
fr70 = "143.63,338.5,-4.64,5.53,win1";
fr_max = "70";`,
    `fr0 = "285.45,294.2,0,-42.7,p,4";
fr5 = "285.45,142.08,-4.93,-27.16,w,0";
fr6 = "282.37,125.16,-12.63,-21.89,w,3";
fr10 = "244.26,64.44,-15.35,-7.23,w,18";
fr29 = "64.25,149.77,8.99,10.87,pin3,12";
fr42 = "147.07,335.73,-4.11,3.59,win1";
fr_max = "42";`,
    `fr0 = "285.45,294.2,0,-43,p,4";
fr5 = "285.45,142.08,-4.98,-27.44,w,0";
fr6 = "282.39,125.2,-12.77,-22.14,w,3";
fr10 = "244.52,64.65,-15.55,-7.4,w,13";
fr24 = "94.64,90.73,2.91,12.08,pin15,1";
fr26 = "98.72,108.28,-6.2,-11.59,b1,1";
fr28 = "92.3,96.4,8.4,1.19,pin15,3";
fr32 = "119.49,106.64,8.17,-1.36,b1,3";
fr36 = "146.58,108.9,-3.71,5.72,pin2,1";
fr38 = "140.94,118.46,7.2,-2.49,b1,1";
fr40 = "150.26,115.74,0.14,6.12,pin2,3";
fr44 = "150.65,136.85,3.8,8.05,b1,4";
fr49 = "165.18,177.22,5.61,-10.69,b3,1";
fr51 = "173.97,161.41,-10.3,-0.58,b2,2";
fr54 = "147.23,163.5,4.04,9.93,b1,1";
fr56 = "152.76,177.71,-0.8,-11.32,b3,2";
fr59 = "150.82,153.23,3.57,-5.3,b1,6";
fr66 = "170.66,147.69,-2.34,4.64,b2,4";
fr71 = "161.34,176.95,-1.42,-8.61,b3,12";
fr84 = "148.74,178.73,-5.26,-6.3,b3,1";
fr86 = "142.05,171.19,5.5,4.95,b1,1";
fr88 = "149.51,178.5,0.9,-7.6,b3,10";
fr99 = "156.72,177.13,-0.77,-6.09,b3,9";
fr109 = "151.26,178.04,-3.36,-5.66,b3,2";
fr112 = "144.3,168.32,3.37,2.54,b1,2";
fr115 = "152.6,177.74,0.68,-5.06,b3,7";
fr123 = "156.78,177.12,-0.48,-4.35,b3,6";
fr130 = "154.1,177.47,-1.66,-2.84,b3,5";
fr136 = "146.48,179.51,-3.64,-1.87,b3,14";
fr151 = "110.73,264.11,8.2,9.4,pin10,6";
fr158 = "153.63,334,5.65,0.36,win1";
fr_max = "158";`,
    `fr0 = "285.45,294.2,0,-43.3,p,4";
fr5 = "285.45,142.08,-5.02,-27.73,w,0";
fr6 = "282.4,125.23,-12.9,-22.38,w,3";
fr10 = "244.78,64.86,-15.76,-7.57,w,13";
fr24 = "94.7,87.16,7.52,8.19,pin15,2";
fr27 = "110.19,105.99,5.44,-10.85,b1,13";
fr41 = "160.86,93.53,4.14,-4.85,pin2,10";
fr52 = "192.71,109.98,-5.18,-7.3,b2,7";
fr60 = "162.96,93.96,-1.48,-3.54,pin2,5";
fr66 = "155.82,93.93,-2.51,-0.61,pin2,7";
fr74 = "140.94,118.46,8.18,-1.18,b1,1";
fr76 = "152.48,117.49,3.99,6.43,pin2,6";
fr83 = "175.34,179.84,10.4,-5.87,b3,0";
fr84 = "183.91,175.01,-5.05,12.5,b2,0";
fr85 = "180.85,182.59,8.89,-10,b3,0";
fr86 = "186.03,176.77,-7.77,12.47,b2,0";
fr87 = "181.97,183.29,8.55,-11.99,b3,0";
fr88 = "186.42,177.06,-9.48,12.88,b2,0";
fr89 = "181.88,183.23,8.23,-13.84,b3,0";
fr90 = "185.82,176.61,-11.76,12.7,b2,0";
fr91 = "180.49,182.38,5.9,-16.36,b3,0";
fr92 = "183.34,174.5,-16.06,8.7,b2,0";
fr93 = "174.26,179.42,-5.7,-16.62,b3,11";
fr105 = "125.45,108.27,-0.68,-3.23,b1,5";
fr111 = "122.53,107.35,1.53,-3.64,b1,6";
fr118 = "130.96,110.74,4.52,-0.92,b1,12";
fr131 = "170.64,178.27,8.13,-10,b3,0";
fr132 = "178.29,168.87,-12.32,6.65,b2,1";
fr134 = "163.73,177.08,-9.71,-9.51,b3,1";
fr136 = "147.75,162.44,12.14,3.79,b1,8";
fr145 = "227.71,223.89,-9.54,7.61,pin18,9";
fr155 = "155.19,334.08,-4.06,0.9,win1";
fr_max = "155";`,
    `fr0 = "285.45,294.2,0,-43.9,p,4";
fr5 = "285.45,142.08,-5.1,-28.29,w,0";
fr6 = "282.42,125.29,-13.18,-22.86,w,3";
fr10 = "245.26,65.24,-16.17,-7.89,w,13";
fr24 = "93.11,82.34,9.39,-0.21,pin15,6";
fr31 = "146.35,106.25,-5.11,7.99,pin2,1";
fr33 = "139.7,117.19,9.08,-4.93,b1,0";
fr34 = "147.96,112.72,-6.42,4.95,pin2,1";
fr36 = "140.88,118.4,6.74,-5.75,b1,1";
fr38 = "147.88,112.57,-5.01,2.21,pin2,1";
fr40 = "139.71,117.2,3.6,-3.93,b1,2";
fr43 = "147.19,111.06,-2.09,1.55,pin2,2";
fr46 = "141.57,119.15,4.4,-0.22,b1,11";
fr58 = "177.71,180.89,10.78,-5.97,b3,0";
fr59 = "185.67,176.49,-3.77,13.22,b2,0";
fr60 = "183.45,184.3,11.43,-7.6,b3,0";
fr61 = "190.4,179.68,-1.36,14.92,b2,0";
fr62 = "189.49,189.62,15.01,0.07,b3,4";
fr67 = "248.83,200.38,-4.34,-8.69,w,4";
fr72 = "233.35,177.38,0.87,4.1,b2,5";
fr78 = "237.48,212.91,-8.09,1.94,w,14";
fr93 = "158.01,334.7,1.04,0.64,win1";
fr_max = "93";`,
    `fr0 = "285.45,294.2,0,-44.7,p,4";
fr5 = "285.45,142.08,-5.21,-29.04,w,0";
fr6 = "282.45,125.37,-13.54,-23.5,w,2";
fr9 = "245.83,65.71,-18.82,-7.21,w,11";
fr21 = "83.64,75.88,-7.95,-6.82,pin15,1";
fr23 = "74.02,68.01,2,7.2,w,1";
fr25 = "76.4,76.92,-3.92,-4.35,pin15,1";
fr27 = "70.23,71,1.17,4.34,w,1";
fr29 = "72.3,79.87,-4.52,1.3,pin15,11";
fr41 = "33.2,164.28,1.95,13.38,w,2";
fr44 = "37.39,195.23,12.62,4.62,w,13";
fr58 = "158.04,334.71,10.15,4.35,win1";
fr_max = "58";`,
    `fr0 = "285.45,294.2,0,-46,p,3";
fr4 = "285.45,142.08,-5.91,-31.79,w,0";
fr5 = "282.23,124.78,-14.71,-25.98,w,2";
fr8 = "248.49,67.85,-20.98,-8.56,w,9";
fr18 = "91.93,53.86,-8.01,11.5,w,2";
fr21 = "77.03,76.65,-12.69,-2.3,pin15,0";
fr22 = "66.67,74.77,3.47,10.96,w,0";
fr23 = "69.64,84.13,-7.8,7.46,pin15,4";
fr28 = "37.25,126.88,1.59,13.05,w,1";
fr30 = "39.67,147.56,-9.07,9.43,pin3,0";
fr31 = "33.2,154.3,6.88,10.01,w,3";
fr35 = "54.93,191.88,-7.38,10.51,pin8,1";
fr37 = "46.1,204.84,9.61,-3.54,w,1";
fr39 = "56.85,201.14,-3.49,6.31,pin8,1";
fr41 = "51.77,211.1,6.25,-0.71,w,9";
fr51 = "98.41,255.65,3.57,-6.13,pin10,16";
fr68 = "137.56,327.55,10.86,0.55,pin19,2";
fr71 = "163.02,331.66,-5.36,-4.4,pin20,5";
fr77 = "137.28,327.34,0.56,-2.76,pin19,5";
fr83 = "139.85,329.68,3.42,2,pin19,2";
fr86 = "146.94,335.81,0.33,0.15,win1";
fr_max = "86";`,
    `fr0 = "285.45,294.2,0,-46.2,p,3";
fr4 = "285.45,142.08,-5.94,-31.98,w,0";
fr5 = "282.24,124.8,-14.8,-26.14,w,2";
fr8 = "248.53,67.88,-21.13,-8.65,w,9";
fr18 = "94.22,52.06,-7.99,11.22,w,2";
fr21 = "78.27,76.23,-11.55,-4.23,pin15,0";
fr22 = "68.35,72.6,4.92,9.47,w,0";
fr23 = "72.19,79.99,-7.64,-1.08,pin15,1";
fr25 = "63.39,79.05,0.58,6.42,w,1";
fr27 = "64.46,92.05,-6.37,2.54,w,3";
fr31 = "47.09,102.99,-1.1,7.63,w,3";
fr35 = "43.25,137.52,-3.03,10.94,w,0";
fr36 = "41.19,144.96,-8.38,7.28,pin3,0";
fr37 = "33.32,151.8,4.09,10.21,w,5";
fr43 = "51.47,210.77,12.14,5.49,w,12";
fr56 = "158.09,334.73,10.2,3.63,win1";
fr_max = "56";`,
    `fr0 = "285.45,294.2,0,-46.8,p,3";
fr4 = "285.45,142.08,-6.03,-32.55,w,0";
fr5 = "282.26,124.86,-15.07,-26.62,w,2";
fr8 = "248.67,68,-21.56,-8.89,w,8";
fr17 = "104.97,46.35,-11.24,8.75,w,7";
fr25 = "36.92,129,1.8,15.97,w,1";
fr27 = "39.13,149.04,-8.52,13.17,pin3,0";
fr28 = "33.2,158.24,6.46,13.54,w,4";
fr33 = "57.04,216.91,13.86,7.67,w,10";
fr44 = "163.93,330.27,-13.6,-0.79,pin20,1";
fr46 = "140.16,330.07,1.64,-8.95,pin19,12";
fr59 = "155.4,334.1,1.79,1.6,win1";
fr_max = "59";`,
    `fr0 = "285.45,294.2,0,-47,p,3";
fr4 = "285.45,142.08,-6.05,-32.73,w,0";
fr5 = "282.27,124.87,-15.16,-26.78,w,2";
fr8 = "248.72,68.03,-21.7,-8.97,w,8";
fr17 = "107.89,44.91,-11.26,8.44,w,7";
fr25 = "36.52,131.53,1.86,16.38,w,1";
fr27 = "38.71,151.05,-4.88,15.59,pin3,1";
fr29 = "33.2,168.96,3.51,15.68,w,1";
fr31 = "39.3,197.34,13.9,6.97,w,12";
fr44 = "161.7,335.02,-10.94,11.67,pin20,0";
fr45 = "160.78,336,-2.58,-1.47,win1";
fr_max = "45";`
  ].map(parsePath);

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

  function parsePath(text) {
    const points = new Map();
    let max = 0;
    text.split("\n").forEach((line) => {
      const maxMatch = line.match(/fr_max = "(\d+)"/);
      if (maxMatch) max = Number(maxMatch[1]);
      const match = line.match(/fr(\d+) = "([^"]+)"/);
      if (!match) return;
      const [x, y, vx, vy, event = "p", iter = "0"] = match[2].split(",");
      points.set(Number(match[1]), {
        x: Number(x), y: Number(y), vx: Number(vx), vy: Number(vy),
        event, iter: Number(iter)
      });
    });
    return { points, max };
  }

  function stepPath() {
    if (!state.path) return;
    const point = state.path.points.get(state.frame);
    if (point) {
      state.ball = { x: point.x, y: point.y, vx: point.vx, vy: point.vy };
      react(point.event, point.x, point.y);
    } else {
      state.ball.vx *= 0.95;
      state.ball.vy *= 0.95;
      state.ball.x += state.ball.vx;
      state.ball.y += state.ball.vy;
      state.ball.vy += 1.4;
    }
    state.frame += 1;
    if (state.frame > state.path.max + 24) {
      state.ballVisible = false;
      state.mode = "ready";
      state.path = null;
      state.force = 0;
      state.launchPower = LAUNCH_POWER_MIN;
      state.celebrating = Boolean(state.prize);
      state.lastCelebrate = performance.now();
      if (!state.prize) {
        state.ball = { x: LAUNCH_REST_X, y: LAUNCH_REST_Y, vx: 0, vy: 0 };
        state.ballVisible = true;
      }
      state.message = state.prize ? state.prize : "TRY AGAIN";
    }
  }

  function pathPointAtOrBefore(path, frame) {
    for (let current = frame; current >= 0; current -= 1) {
      const point = path.points.get(current);
      if (point) return { frame: current, point };
    }
    return { frame: 0, point: { x: 285.45, y: 294.2, vx: 0, vy: 0, event: "p", iter: 0 } };
  }

  function pathForCup(path, cup) {
    const targets = {
      "1": { x: 153.5, y: 334.6 },
      "2": { x: 76.4, y: 258.8 },
      "3": { x: 224.5, y: 277.9 }
    };
    const target = targets[cup] || targets["1"];
    const points = new Map(Array.from(path.points.entries()).map(([frame, point]) => [frame, { ...point }]));
    const winFrame = Array.from(points.entries()).find(([, point]) => point.event?.startsWith("win"))?.[0] ?? path.max;
    const start = pathPointAtOrBefore(path, Math.max(0, winFrame - 12));
    const span = Math.max(1, winFrame - start.frame);

    for (let frame = start.frame; frame <= winFrame; frame += 1) {
      const t = (frame - start.frame) / span;
      points.set(frame, {
        x: start.point.x + (target.x - start.point.x) * t,
        y: start.point.y + (target.y - start.point.y) * t,
        vx: 0,
        vy: 0,
        event: frame === winFrame ? `win${cup}` : "p",
        iter: 0
      });
    }
    return { points, max: path.max };
  }

  function cupForForce(force) {
    if (force < 34) return "2";
    if (force < 67) return "1";
    return "3";
  }

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

  function resolveWallSegments() {
    let touched = false;
    const segments = state.launcherCleared ? [...wallSegments, ...launcherCurveWalls()] : wallSegments;
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
    const base = sounds[id];
    if (!base) return;
    window.__winballSoundEvents.push({ id, at: performance.now() });
    if (window.__winballSoundEvents.length > 50) window.__winballSoundEvents.shift();
    const audio = base.cloneNode();
    audio.volume = base.volume;
    const played = audio.play();
    if (played && typeof played.catch === "function") played.catch(() => {});
  }
  window.__winballPlaySound = playSound;

  function primeSounds() {
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

  function labelShineFrame(object, now) {
    const frames = overlaySets[object.set];
    if (!frames || frames.length <= 1) return 0;
    const offsets = { star1: 0, star2: 8, star3: 16 };
    const step = Math.floor(now / (1000 / SWF_FPS)) + (offsets[object.id] || 0);
    return 1 + (step % (frames.length - 1));
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
  window.addEventListener("keydown", (evt) => {
    if ((evt.code === "Space" || evt.code === "ArrowDown") && !evt.repeat) {
      evt.preventDefault();
      startCharge();
    }
  });
  window.addEventListener("keyup", (evt) => {
    if (evt.code === "Space" || evt.code === "ArrowDown") {
      evt.preventDefault();
      releaseCharge();
    }
  });

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
    resizeCanvas();
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

  window.addEventListener("resize", resizeCanvas);
  window.__newWinballDispose = () => {
    disposed = true;
    if (drawFrameId) cancelAnimationFrame(drawFrameId);
    window.removeEventListener("resize", resizeCanvas);
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
  src: url("/newwinball/fonts/84_Futura BdCn BT.ttf") format("truetype");
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
  body.page-newsite-newwinball .main-content {
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
  }
}
</style>
