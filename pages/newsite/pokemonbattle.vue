<template>
  <div class="pfwg" ref="wrapper">

    <!-- ── Menu ──────────────────────────────────────────────────────────────────────── -->
    <div v-if="screen === 'menu'" class="pfwg-menu" :style="menuStyle">
      <img
        v-if="art('logo')"
        :src="art('logo').path" :width="art('logo').width" :height="art('logo').height"
        alt="Pokemon: Fire, Water, Grass!" class="pfwg-logo"
      />
      <h1 v-else class="pfwg-title">Pokemon<span class="pfwg-title-sub">Fire, Water, Grass!</span></h1>

      <div class="pfwg-types" aria-hidden="true">
        <span v-for="t in TYPES" :key="t" class="pfwg-chip" :class="`is-${t}`">{{ t }}</span>
      </div>
      <p class="pfwg-note">Water douses Fire. Fire burns Grass. Grass drinks Water.</p>

      <!-- Trainer picker. v-if on length, not an empty bordered box that later grows: the
           roster starts empty and every uploaded trainer would otherwise be a layout shift. -->
      <div v-if="trainers.length" class="pfwg-block">
        <h2 class="pfwg-h2">Choose your trainer</h2>
        <div class="pfwg-trainers" role="radiogroup" aria-label="Choose your trainer">
          <button
            v-for="t in trainers" :key="t.id" type="button" role="radio"
            :aria-checked="trainerId === t.id" class="pfwg-trainer"
            :class="{ 'is-on': trainerId === t.id }" @click="pickTrainer(t.id)"
          >
            <img :src="t.imagePath" :alt="t.name" :width="t.width || undefined"
                 :height="t.height || undefined" loading="lazy" class="pfwg-trainer-art" />
            <span class="pfwg-trainer-name">{{ t.name }}</span>
          </button>
        </div>
      </div>

      <div class="pfwg-block">
        <h2 class="pfwg-h2">Single player</h2>
        <div class="pfwg-tiers" role="radiogroup" aria-label="Difficulty">
          <button
            v-for="t in aiTiers" :key="t.id" type="button" role="radio"
            :aria-checked="tier === t.id" class="pfwg-tier"
            :class="{ 'is-on': tier === t.id }" @click="tier = t.id"
          >{{ t.label }}</button>
        </div>
        <button class="pfwg-btn pfwg-btn--go" @click="startAi">Battle the computer</button>
        <p class="pfwg-note">Practice as much as you like. No points.</p>
      </div>

      <div class="pfwg-block">
        <div class="pfwg-block-head">
          <h2 class="pfwg-h2">Head to head</h2>
          <span class="pfwg-count">{{ rooms.length }} open</span>
        </div>
        <p v-if="pointsPerWin > 0" class="pfwg-note pfwg-note--tight">
          Winner takes <strong>{{ pointsPerWin }}</strong> points, from the same daily pool as
          TKO, gToons Clash and Ed, Edd n Eddy RPS.
        </p>

        <button v-if="!myRoomId" class="pfwg-btn pfwg-btn--alt" @click="createRoom" :disabled="!connected">
          {{ connected ? 'Create a battle' : 'Connecting...' }}
        </button>
        <div v-else class="pfwg-waiting">
          <span class="pfwg-spinner" aria-hidden="true"></span>
          Waiting for a challenger...
          <button class="pfwg-link" @click="leaveRoom">Cancel</button>
        </div>

        <ul v-if="rooms.length" class="pfwg-rooms">
          <li v-for="r in rooms" :key="r.id">
            <button class="pfwg-room" @click="joinRoom(r.id)" :disabled="!connected">
              <span class="pfwg-room-name">{{ r.owner }}</span>
              <span class="pfwg-room-go">Battle &rarr;</span>
            </button>
          </li>
        </ul>
        <p v-else-if="!myRoomId" class="pfwg-empty">Nobody is waiting. Create a battle and the Discord will hear about it.</p>
      </div>

      <button v-if="hasMusic" class="pfwg-link pfwg-sound" @click="toggleSound">
        Sound: {{ soundOn ? 'ON' : 'OFF' }}
      </button>

      <p v-if="error" class="pfwg-error" role="alert">{{ error }}</p>
    </div>

    <!-- ── Battle ────────────────────────────────────────────────────────────────────── -->
    <div v-else class="pfwg-battle">
      <!-- HUD: names, trainer portraits and the timer on ONE row. A 360x640 phone gives this
           screen about 396px of height and a separate portrait row costs 36 of them. -->
      <header class="pfwg-hud">
        <div class="pfwg-side">
          <img v-if="myTrainer" :src="myTrainer.thumbPath || myTrainer.imagePath" alt=""
               class="pfwg-portrait" aria-hidden="true" />
          <span class="pfwg-name">{{ me.username }}</span>
        </div>
        <div class="pfwg-mid">
          <span class="pfwg-round">Round {{ roundNumber }}</span>
          <!-- Hidden during the intermission. The server zeroes the deadline at reveal, so a
               visible timer would sit on "0" for four seconds every round and read as a hang. -->
          <span v-if="!inBreak && deadlineAt" class="pfwg-timer" :class="{ 'is-low': secondsLeft <= 3 }">
            {{ secondsLeft }}
          </span>
          <span v-else class="pfwg-timer pfwg-timer--idle" aria-hidden="true">&middot;</span>
        </div>
        <div class="pfwg-side pfwg-side--right">
          <span class="pfwg-name">{{ opp.username }}</span>
          <img v-if="oppTrainer" :src="oppTrainer.thumbPath || oppTrainer.imagePath" alt=""
               class="pfwg-portrait" aria-hidden="true" />
        </div>
      </header>

      <!-- The stage carries the backdrop's own aspect ratio, so background-size 100% 100%
           cannot distort it. `cover` would crop the platforms out of a desktop-shaped box. -->
      <div class="pfwg-stage">
        <div class="pfwg-field" :style="fieldStyle">
          <!-- Far side: opponent, front-facing, upper right. -->
          <div class="pfwg-slot pfwg-slot--far">
            <div class="pfwg-hpbox">
              <span class="pfwg-hp-name">{{ oppMon.name }}</span>
              <span class="pfwg-hp-wrap" :aria-label="`${oppMon.name}, ${winsNeeded - me.score} of ${winsNeeded} HP`">
                <span class="pfwg-hp-track" aria-hidden="true">
                  <span class="pfwg-hp-fill" :class="`is-${oppHpState}`" :style="{ transform: `scaleX(${oppHp})` }"></span>
                </span>
                <span class="pfwg-hp-num">{{ winsNeeded - me.score }}/{{ winsNeeded }}</span>
              </span>
            </div>
            <img v-if="oppSprite" :src="oppSprite.path" :alt="oppMon.name" class="pfwg-mon pfwg-mon--far" />
            <span v-else class="pfwg-mon pfwg-mon--far pfwg-ghost" :class="`is-${TYPES[oppType]}`" aria-hidden="true"></span>
          </div>

          <!-- Near side: you, back-facing, lower left. -->
          <div class="pfwg-slot pfwg-slot--near">
            <img v-if="mySprite" :src="mySprite.path" :alt="myMon.name" class="pfwg-mon pfwg-mon--near" />
            <span v-else class="pfwg-mon pfwg-mon--near pfwg-ghost" :class="`is-${TYPES[myType]}`" aria-hidden="true"></span>
            <div class="pfwg-hpbox pfwg-hpbox--near">
              <span class="pfwg-hp-name">{{ myMon.name }}</span>
              <span class="pfwg-hp-wrap" :aria-label="`${myMon.name}, ${winsNeeded - opp.score} of ${winsNeeded} HP`">
                <span class="pfwg-hp-track" aria-hidden="true">
                  <span class="pfwg-hp-fill" :class="`is-${myHpState}`" :style="{ transform: `scaleX(${myHp})` }"></span>
                </span>
                <span class="pfwg-hp-num">{{ winsNeeded - opp.score }}/{{ winsNeeded }}</span>
              </span>
            </div>
          </div>

          <button v-if="hasMusic" class="pfwg-mute" @click="toggleSound"
                  :aria-label="soundOn ? 'Turn sound off' : 'Turn sound on'">
            <span class="pfwg-mute-icon" :class="{ 'is-off': !soundOn }" aria-hidden="true"></span>
          </button>

          <div v-if="over" class="pfwg-over">
            <p v-if="endReason === 'sweep'" class="pfwg-over-title">Battle abandoned</p>
            <p v-else class="pfwg-over-title" :class="won ? 'is-win' : 'is-loss'">
              {{ won ? 'You win!' : 'You lose!' }}
            </p>
            <p v-if="endReason === 'sweep'" class="pfwg-over-note">Nobody moved for a while. No points either way.</p>
            <p v-else-if="endReason === 'forfeit'" class="pfwg-over-note">
              {{ won ? 'Your opponent fled.' : 'You fled the battle.' }}
            </p>
            <p v-else-if="won && pointsAwarded > 0" class="pfwg-over-note">+{{ pointsAwarded }} points</p>
            <p v-else-if="won && suppressReason" class="pfwg-over-note">
              {{ SUPPRESS_COPY[suppressReason] || 'No points for this one.' }}
            </p>
            <button ref="overBtn" class="pfwg-btn pfwg-btn--go" @click="backToMenu">Back to the menu</button>
          </div>
        </div>
      </div>

      <!-- Fixed-height grid track, never a min-height that grows: anything that reflows here
           moves the move buttons under the player's thumb the instant a round resolves. The
           string is bounded because battleText() carries no username. -->
      <div class="pfwg-text" aria-hidden="true">
        <p class="pfwg-text-line">{{ textLines[0] }}</p>
        <p class="pfwg-text-line">{{ textLines[1] }}</p>
      </div>
      <!-- One live region, in the DOM from mount with empty content, written once per round
           with the whole result. A v-if'd region that appears with content already in it is
           announced inconsistently, and running the typewriter through a live region would
           re-announce on every character. -->
      <p class="pfwg-sr" aria-live="polite" aria-atomic="true">{{ liveText }}</p>

      <div class="pfwg-moves">
        <button
          v-for="(t, i) in TYPES" :key="t" type="button" class="pfwg-move" :class="[`is-${t}`, { 'is-picked': myPick === i }]"
          :aria-disabled="!canThrow" @click="throwType(i)"
        >
          <span class="pfwg-move-glyph" :class="`is-${t}`" aria-hidden="true"></span>
          <span class="pfwg-move-label">{{ t }}</span>
          <span class="pfwg-move-key" aria-hidden="true">{{ i + 1 }}</span>
        </button>
      </div>
    </div>

    <!-- Teleported to body: .site-container carries a transform, which makes it the containing
         block for position:fixed and would trap this inside the scaled box. -->
    <Teleport to="body">
      <div v-if="blockedLandscape" class="pfwg-rotate" role="dialog" aria-modal="true">
        <span class="pfwg-rotate-icon" aria-hidden="true"></span>
        <p class="pfwg-rotate-text">Turn your phone upright to battle</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { io as ioClient } from 'socket.io-client'
import {
  TYPES, FIRE, isType, compareTypes, pokemonForType, battleText,
  hpFraction, hpState, chooseAiMove, aiTierById, intermissionMs, MAX_BREAK_MS, FAINT_MS
} from '~/lib/pokemonBattle'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // The battle has to fit a 360x640 phone with no nested scroller. The sidebar and footer are
  // ~67px of that budget. Read from route meta -- the layout declares no props, so passing
  // these to <NuxtLayout> instead would silently do nothing.
  showSidebar: false,
  showFooter: false,
  // Pinch-zoom is disabled below, so a page tall enough to scroll would leave a short-viewport
  // player no way to reach the move buttons.
  fitHeight: true,
  ssr: false,
  title: 'Pokemon: Fire, Water, Grass!',
  description: 'Fire, Water and Grass in a three-way standoff. Battle the computer or another trainer for points on Cartoon ReOrbit.'
})

useHead({
  htmlAttrs: { class: 'pfwg-page' },
  // viewport-fit=cover is required for env(safe-area-inset-*) to resolve to anything but 0 --
  // nuxt.config's site-wide viewport omits it, so the move buttons would sit under the iPhone
  // home indicator.
  meta: [{
    name: 'viewport',
    content: 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover, user-scalable=no'
  }]
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const runtime = useRuntimeConfig()

const SUPPRESS_COPY = {
  cap_exhausted: "You have hit today's PvP points cap. Still counts as a win!",
  pair_limit: 'You have already traded points with this trainer today.',
  same_device: 'No points: you and your opponent look like the same device.',
  abandoned: 'No points -- the battle was abandoned.',
  self_match: 'No points for battling yourself.',
  banned: 'No points awarded.'
}

/* ── State ────────────────────────────────────────────────────────────────────────────── */
const screen = ref('menu')
const wrapper = ref(null)
const overBtn = ref(null)
const blockedLandscape = ref(false)
const error = ref('')

const assets = ref({})
const trainers = ref([])
const aiTiers = ref([])
const trainerId = ref(null)
const tier = ref('rookie')

const rooms = ref([])
const myRoomId = ref(null)
const connected = ref(false)
const pointsPerWin = ref(0)

const isAi = ref(false)
const me = ref({ username: 'You', character: null, score: 0 })
const opp = ref({ username: 'Rival', character: null, score: 0 })
const winsNeeded = ref(3)
const roundNumber = ref(1)
const deadlineAt = ref(0)
const nextRoundAt = ref(0)
const nowMs = ref(Date.now())
const myPick = ref(null)
const revealed = ref(null)
const textLines = ref(['', ''])
const liveText = ref('')
const over = ref(false)
const won = ref(false)
const endReason = ref('natural')
const pointsAwarded = ref(0)
const suppressReason = ref(null)
const roundSeconds = ref(12)
// The player's own picks, oldest first, ties included -- the AI's only input.
const aiHistory = ref([])
const aiWinStreak = ref(0)
const aiCommitted = ref(null)

const art = (slot) => assets.value?.[slot] || null
const hasMusic = computed(() => Boolean(art('battlemusic') || art('menumusic')))

const myType = computed(() => (revealed.value ? revealed.value.you : (myPick.value ?? FIRE)))
const oppType = computed(() => (revealed.value ? revealed.value.opponent : FIRE))
const myMon = computed(() => pokemonForType(myType.value))
const oppMon = computed(() => pokemonForType(oppType.value))
const mySprite = computed(() => (revealed.value ? art(`${myMon.value.id}-back`) : null))
const oppSprite = computed(() => (revealed.value ? art(`${oppMon.value.id}-front`) : null))

const myTrainer = computed(() => trainers.value.find(t => t.id === me.value.character) || null)
const oppTrainer = computed(() => trainers.value.find(t => t.id === opp.value.character) || null)

// Your HP drains as the OPPONENT scores.
const myHp = computed(() => hpFraction(opp.value.score, winsNeeded.value))
const oppHp = computed(() => hpFraction(me.value.score, winsNeeded.value))
const myHpState = computed(() => hpState(myHp.value))
const oppHpState = computed(() => hpState(oppHp.value))

const inBreak = computed(() => nextRoundAt.value > nowMs.value)
const secondsLeft = computed(() => {
  if (!deadlineAt.value) return 0
  return Math.max(0, Math.ceil((deadlineAt.value - nowMs.value) / 1000))
})
const canThrow = computed(() =>
  !over.value && myPick.value === null && !revealed.value && deadlineAt.value > 0
)

// The uploaded menu backdrop. Scrimmed rather than shown raw: the title, the type chips and
// the notes sit directly on it, and an arbitrary uploaded image is as likely to be bright as
// dark. MENU_SCRIM is the alpha at which #f8f8f8 body text still clears 4.5:1 over a pure
// WHITE image, which is the worst case an admin can produce.
//
// 0.66, not the 0.55 a pure-black scrim would need: this scrim is tinted (#0c1c2e), and a
// tinted overlay composites LIGHTER than black at the same alpha, which quietly costs about
// a point of contrast. Computed rather than eyeballed, and asserted in
// tests/pokemonBattleWiring.test.js so a later colour tweak cannot silently undo it.
const MENU_SCRIM = 0.66
const menuStyle = computed(() => {
  const bg = art('menubg')
  if (!bg) return {}
  return {
    backgroundImage:
      `linear-gradient(rgba(12, 28, 46, ${MENU_SCRIM}), rgba(12, 28, 46, ${MENU_SCRIM})), url('${bg.path}')`
  }
})

const fieldStyle = computed(() => {
  const bg = art('battlebg')
  const style = {}
  if (bg) {
    style.backgroundImage = `url('${bg.path}')`
    // Driven by the uploaded file's REAL dimensions, reported by the config endpoint from
    // sharp metadata. Hardcoding a ratio while the art is admin-supplied guarantees a mismatch,
    // and every mismatch is a layout shift.
    if (bg.width && bg.height) style.aspectRatio = `${bg.width} / ${bg.height}`
  }
  return style
})

/* ── Countdown ────────────────────────────────────────────────────────────────────────── */
let tickTimer = null
function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
}
function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null } }

/* ── Audio ────────────────────────────────────────────────────────────────────────────────
 * HTMLAudioElement routed through a GainNode, and exactly ONE AudioContext for the page's
 * life. Three reasons this is not just `new Audio()` with .volume:
 *   * el.volume is READ-ONLY on iOS, so any fade built on it silently does nothing on the
 *     platform most players are on. A GainNode works everywhere.
 *   * decodeAudioData on a 3-minute track holds ~63MB of Float32 resident; an element streams.
 *   * Chrome caps AudioContexts per document (~6), so creating one per match kills all audio
 *     for the tab after a handful of battles.
 * createMediaElementSource permanently binds to its element and throws if called twice for the
 * same one, so each source node is created exactly once. */
const soundOn = ref(true)
let audioCtx = null
let musicGain = null
const els = {}
const srcNodes = new WeakSet()
let fadeTimer = null

function ensureCtx() {
  if (audioCtx) return audioCtx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  audioCtx = new Ctx()
  musicGain = audioCtx.createGain()
  musicGain.gain.value = soundOn.value ? 0.5 : 0
  musicGain.connect(audioCtx.destination)
  return audioCtx
}

function makeEl(slot) {
  const a = art(slot)
  if (!a) return null
  if (els[slot]) return els[slot]
  const el = new Audio()
  el.src = a.path
  el.loop = true
  el.preload = 'none'
  el.crossOrigin = 'anonymous'
  els[slot] = el
  const ctx = ensureCtx()
  if (ctx && !srcNodes.has(el)) {
    try {
      ctx.createMediaElementSource(el).connect(musicGain)
      srcNodes.add(el)
    } catch { /* already bound; nothing to do */ }
  }
  return el
}

// Everything up to resume()/play() must be synchronous inside the gesture task -- an await
// before them loses the user-activation and the play is blocked.
let unlocked = false
function unlockAudio() {
  if (unlocked || !hasMusic.value) return
  unlocked = true
  const ctx = ensureCtx()
  if (!ctx) return
  ctx.resume?.()
  // Prime BOTH elements inside this gesture. matchStart arrives on a socket event, not a
  // gesture, and on iOS an element never played inside a gesture cannot be started later --
  // which reads to the player as "the music just stops when a battle begins".
  for (const slot of ['menumusic', 'battlemusic']) {
    const el = makeEl(slot)
    if (!el) continue
    el.play().then(() => { if (slot !== currentTrack) el.pause() }).catch(() => { unlocked = false })
  }
  playTrack(screen.value === 'battle' ? 'battlemusic' : 'menumusic')
}

let currentTrack = null
function playTrack(slot) {
  if (!hasMusic.value) return
  currentTrack = slot
  if (!soundOn.value || !unlocked) return
  const el = makeEl(slot)
  if (!el) return
  // Hard swap with a short fade, not a cross-fade: it is what the real games do, it avoids the
  // dip of a linear cross-fade, and it never has two multi-MB streams decoding at once.
  for (const [k, other] of Object.entries(els)) if (k !== slot && !other.paused) other.pause()
  el.play().catch(() => { unlocked = false })
}

function toggleSound() {
  soundOn.value = !soundOn.value
  try { localStorage.setItem('pfwg:sound', soundOn.value ? 'on' : 'off') } catch {}
  if (musicGain && audioCtx) {
    const t = audioCtx.currentTime
    musicGain.gain.cancelScheduledValues(t)
    musicGain.gain.setValueAtTime(musicGain.gain.value, t)
    musicGain.gain.linearRampToValueAtTime(soundOn.value ? 0.5 : 0, t + 0.15)
  }
  if (soundOn.value) { unlocked ? playTrack(currentTrack || 'menumusic') : unlockAudio() }
  else for (const el of Object.values(els)) el.pause()
}

function teardownAudio() {
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null }
  for (const el of Object.values(els)) {
    el.pause()
    // removeAttribute + load(), never src = '': an empty src resolves to the document URL and
    // fires a bogus request, and without load() Chrome keeps the stream open and the tab's
    // audio indicator lit after navigation.
    el.removeAttribute('src')
    el.load()
  }
  for (const k of Object.keys(els)) delete els[k]
  try { musicGain?.disconnect() } catch {}
  // Closing is the critical one: an unclosed context survives SPA navigation and the
  // per-document cap is reached after a handful of visits.
  audioCtx?.close?.().catch(() => {})
  audioCtx = null
  musicGain = null
  unlocked = false
}

function onVisibility() {
  if (document.hidden) {
    // Pause the ELEMENTS, not just suspend the context: a suspended context plays silently
    // while currentTime keeps advancing, so the player returns to a track minutes ahead.
    for (const el of Object.values(els)) el.pause()
  } else if (soundOn.value && unlocked) {
    audioCtx?.resume?.().then(() => {
      if (audioCtx && audioCtx.state !== 'running') unlocked = false
    }).catch(() => { unlocked = false })
    playTrack(currentTrack || 'menumusic')
  }
}

/* ── Socket ───────────────────────────────────────────────────────────────────────────── */
let socket = null

function applyView(v) {
  me.value = v.you
  opp.value = v.opponent
  winsNeeded.value = v.winsNeeded
  roundNumber.value = v.round
  deadlineAt.value = v.deadlineAt || 0
}

// Connected once the menu is on screen.
//
// This was originally deferred until the player clicked "Create a battle", to keep a
// single-player-only visitor off the socket server (which is a single fork'd process). That was
// wrong twice over. The button is disabled until `connected` is true, and `connected` only
// becomes true after this runs -- so the only thing that could start the connection was a click
// on a button that could never be clicked, and the lobby sat on "Connecting..." forever. It also
// could not have paid off: the lobby shares a screen with the single-player mode, so every
// visitor sees the room list, and a room list fed by no socket permanently reads "0 open".
function connectSocket() {
  if (socket) return
  const url = import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`
  socket = ioClient(url, { withCredentials: true, reconnectionDelayMax: 5000 })

  socket.on('connect', () => { connected.value = true; socket.emit('pkmnb:subscribe') })
  socket.on('disconnect', () => { connected.value = false })
  socket.on('pkmnb:rooms', (l) => { rooms.value = l })
  socket.on('pkmnb:config', (c) => {
    pointsPerWin.value = c?.pointsPerWin ?? 0
    if (c?.winsNeeded) winsNeeded.value = c.winsNeeded
    if (c?.roundSeconds) roundSeconds.value = c.roundSeconds
  })
  socket.on('pkmnb:roomAdded', (r) => {
    if (!rooms.value.some(x => x.id === r.id)) rooms.value = [r, ...rooms.value]
  })
  socket.on('pkmnb:roomRemoved', ({ id }) => {
    rooms.value = rooms.value.filter(r => r.id !== id)
    if (myRoomId.value === id && screen.value === 'menu') myRoomId.value = null
  })
  socket.on('pkmnb:roomCreated', ({ id }) => { myRoomId.value = id })

  socket.on('pkmnb:matchStart', (v) => {
    isAi.value = false
    myRoomId.value = null
    resetBattle()
    applyView(v)
    screen.value = 'battle'
    startTick()
    playTrack('battlemusic')
  })

  socket.on('pkmnb:round', (v) => {
    applyView(v)
    revealed.value = null
    myPick.value = null
    nextRoundAt.value = 0
    textLines.value = ['What will you do?', '']
  })

  socket.on('pkmnb:reveal', (v) => {
    applyView(v)
    nextRoundAt.value = v.nextRoundAt || 0
    showReveal(v.reveal)
  })

  socket.on('pkmnb:matchEnd', (v) => {
    applyView(v)
    won.value = v.won
    endReason.value = v.endReason
    pointsAwarded.value = v.pointsAwarded || 0
    suppressReason.value = v.suppressReason || null
    deadlineAt.value = 0
    stopTick()
    const hold = v.endReason === 'natural' && revealed.value ? MAX_BREAK_MS + FAINT_MS : 0
    if (endTimer) clearTimeout(endTimer)
    endTimer = setTimeout(finishMatch, hold)
  })

  socket.on('pkmnb:error', ({ message }) => {
    error.value = message || 'Something went wrong.'
    setTimeout(() => { error.value = '' }, 4000)
  })
}

let endTimer = null
function finishMatch() {
  over.value = true
  // Move focus into the panel: it announces the result and stops keyboard users being
  // stranded on a button that has just been removed.
  nextTick(() => overBtn.value?.focus?.())
}

function showReveal(r) {
  revealed.value = { you: r.you, opponent: r.opponent }
  const mine = battleText(r.you, r.opponent, roundNumber.value)
  const theirs = battleText(r.opponent, r.you, roundNumber.value)
  textLines.value = [`Foe ${theirs.attack}`, `${mine.attack} ${mine.verdict}`]
  // One combined utterance per round, written once, rather than four separate writes.
  liveText.value =
    `Foe ${theirs.attack} ${mine.attack} ${mine.verdict} ` +
    `${myMon.value.name} ${winsNeeded.value - opp.value.score} of ${winsNeeded.value} HP.`
}

/* ── Menu actions ─────────────────────────────────────────────────────────────────────── */
function pickTrainer(id) {
  trainerId.value = id
  try { localStorage.setItem('pfwg:trainer', id) } catch {}
}
function createRoom() {
  error.value = ''
  connectSocket()
  socket?.emit('pkmnb:createRoom', { character: trainerId.value })
}
function joinRoom(id) { error.value = ''; socket?.emit('pkmnb:joinRoom', { roomId: id, character: trainerId.value }) }
function leaveRoom() { socket?.emit('pkmnb:leave'); myRoomId.value = null }

function resetBattle() {
  if (endTimer) { clearTimeout(endTimer); endTimer = null }
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null }
  over.value = false
  won.value = false
  endReason.value = 'natural'
  pointsAwarded.value = 0
  suppressReason.value = null
  revealed.value = null
  myPick.value = null
  nextRoundAt.value = 0
  textLines.value = ['', '']
  liveText.value = ''
}

function backToMenu() {
  stopTick()
  screen.value = 'menu'
  isAi.value = false
  resetBattle()
  playTrack('menumusic')
  socket?.emit('pkmnb:listRooms')
}

/* ── Throwing ─────────────────────────────────────────────────────────────────────────── */
function throwType(t) {
  if (!canThrow.value || !isType(t)) return
  myPick.value = t
  aiHistory.value = [...aiHistory.value, t]
  if (isAi.value) { aiResolve(t); return }
  socket?.emit('pkmnb:throw', { round: roundNumber.value, hand: t })
}

/* ── Single player ────────────────────────────────────────────────────────────────────────
 * Entirely local. Nothing here may ever report a result to the server: there is no emit and no
 * fetch in this section, and tests/pokemonBattleWiring.test.js asserts that stays true. The
 * award path is PvP-only by construction -- a match can only be built from two distinct
 * authenticated sockets -- and this is the client half of that guarantee. */
let aiTimer = null

function startAi() {
  isAi.value = true
  resetBattle()
  aiHistory.value = []
  aiWinStreak.value = 0
  me.value = { username: 'You', character: trainerId.value, score: 0 }
  opp.value = { username: aiTierById(tier.value).label, character: null, score: 0 }
  roundNumber.value = 1
  screen.value = 'battle'
  unlockAudio()
  playTrack('battlemusic')
  aiArmRound()
}

function aiArmRound() {
  revealed.value = null
  myPick.value = null
  nextRoundAt.value = 0
  textLines.value = ['What will you do?', '']
  // The AI commits BEFORE the player moves, from history that excludes this round. The RPS
  // game's CPU takes the player's hand as an argument and then draws its own -- harmless for a
  // uniform pick, literal cheating for a predictive one.
  aiCommitted.value = chooseAiMove(aiHistory.value, tier.value, aiWinStreak.value, cryptoRandom)
  deadlineAt.value = Date.now() + roundSeconds.value * 1000
  startTick()
  if (aiTimer) clearTimeout(aiTimer)
  aiTimer = setTimeout(() => {
    if (!revealed.value && screen.value === 'battle' && isAi.value) {
      const forced = Math.floor(cryptoRandom() * TYPES.length) % TYPES.length
      myPick.value = forced
      aiHistory.value = [...aiHistory.value, forced]
      aiResolve(forced)
    }
  }, roundSeconds.value * 1000 + 250)
}

function cryptoRandom() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] / 4294967296
  }
  return Math.random()
}

function aiResolve(mine) {
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null }
  const theirs = aiCommitted.value ?? 0
  const cmp = compareTypes(mine, theirs)
  if (cmp > 0) { me.value = { ...me.value, score: me.value.score + 1 }; aiWinStreak.value = 0 }
  else if (cmp < 0) { opp.value = { ...opp.value, score: opp.value.score + 1 }; aiWinStreak.value++ }
  deadlineAt.value = 0
  stopTick()
  const breakMs = intermissionMs(cmp)
  nextRoundAt.value = Date.now() + breakMs
  startTick()
  showReveal({ you: mine, opponent: theirs, result: cmp === 0 ? 'tie' : (cmp > 0 ? 'win' : 'loss') })

  const decided = me.value.score >= winsNeeded.value || opp.value.score >= winsNeeded.value
  aiTimer = setTimeout(() => {
    if (screen.value !== 'battle' || !isAi.value) return
    if (decided) {
      won.value = me.value.score > opp.value.score
      endReason.value = 'natural'
      pointsAwarded.value = 0
      suppressReason.value = null
      stopTick()
      finishMatch()
    } else {
      roundNumber.value += 1
      aiArmRound()
    }
  }, breakMs)
}

/* ── Keyboard ─────────────────────────────────────────────────────────────────────────── */
function onKey(e) {
  if (screen.value !== 'battle') return
  const i = ['1', '2', '3'].indexOf(e.key)
  if (i !== -1) { e.preventDefault(); throwType(i) }
}

/* ── Orientation ──────────────────────────────────────────────────────────────────────── */
function checkOrientation() {
  const landscape = window.innerWidth > window.innerHeight
  // >768 in landscape is the case the layout scales to ~38%, where a 48px button becomes 18
  // physical pixels and no media query inside the page can see it.
  blockedLandscape.value = landscape && window.innerWidth > 768 && window.innerHeight < 500
}

function blockGesture(e) { e.preventDefault() }
function blockMultiTouch(e) { if (e.touches && e.touches.length > 1) e.preventDefault() }
let orientationHandler = null

onMounted(async () => {
  try {
    const s = localStorage.getItem('pfwg:sound')
    if (s) soundOn.value = s !== 'off'
    const t = localStorage.getItem('pfwg:trainer')
    if (t) trainerId.value = t
    const d = localStorage.getItem('pfwg:tier')
    if (d) tier.value = d
  } catch {}

  try {
    const cfg = await $fetch('/api/game/pokemonbattle/config')
    assets.value = cfg.assets || {}
    trainers.value = cfg.trainers || []
    aiTiers.value = cfg.aiTiers || []
    if (cfg.winsNeeded) winsNeeded.value = cfg.winsNeeded
    if (cfg.roundSeconds) roundSeconds.value = cfg.roundSeconds
    // A stored trainer that has since been retired must not linger, or the server rejects the
    // room create with a validation error the player cannot act on.
    if (trainerId.value && !trainers.value.some(x => x.id === trainerId.value)) trainerId.value = null
  } catch {
    error.value = 'Could not load the game. Try again in a moment.'
  }

  // After the config, so the lobby has its trainer roster before a room can be created.
  connectSocket()

  checkOrientation()
  orientationHandler = () => nextTick(checkOrientation)
  window.addEventListener('orientationchange', orientationHandler)
  window.addEventListener('resize', orientationHandler)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('keydown', onKey)

  // One-shot unlock on the first real interaction, whatever it is.
  const once = { capture: true, once: true }
  document.addEventListener('pointerdown', unlockAudio, once)
  document.addEventListener('keydown', unlockAudio, once)
  document.addEventListener('touchend', unlockAudio, once)

  document.addEventListener('gesturestart', blockGesture, { passive: false })
  document.addEventListener('gesturechange', blockGesture, { passive: false })
  document.addEventListener('gestureend', blockGesture, { passive: false })
  document.addEventListener('touchmove', blockMultiTouch, { passive: false })
  document.addEventListener('dblclick', blockGesture, { passive: false })
})

onBeforeUnmount(() => {
  stopTick()
  if (aiTimer) clearTimeout(aiTimer)
  if (endTimer) clearTimeout(endTimer)
  teardownAudio()
  if (orientationHandler) {
    window.removeEventListener('orientationchange', orientationHandler)
    window.removeEventListener('resize', orientationHandler)
  }
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', unlockAudio, true)
  document.removeEventListener('keydown', unlockAudio, true)
  document.removeEventListener('touchend', unlockAudio, true)
  document.removeEventListener('gesturestart', blockGesture)
  document.removeEventListener('gesturechange', blockGesture)
  document.removeEventListener('gestureend', blockGesture)
  document.removeEventListener('touchmove', blockMultiTouch)
  document.removeEventListener('dblclick', blockGesture)
  if (socket) { socket.emit('pkmnb:leave'); socket.close(); socket = null }
})
</script>

<!-- Gated by the html class useHead adds on entry and removes on leave, so none of this leaks
     to the rest of the site. -->
<style>
html.pfwg-page,
html.pfwg-page body {
  touch-action: pan-y;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
html.pfwg-page { min-height: 100svh; background: #185068 no-repeat fixed; }
html.pfwg-page body { background: transparent; min-height: 100svh; }

/* A drag that starts on the nav and sweeps across the buttons otherwise leaves a live
   selection that swallows the next tap -- on a 12-second round that is a lost round. The
   -webkit- prefix is not optional; Safari ignores the unprefixed property. */
html.pfwg-page body,
html.pfwg-page body * {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
}
html.pfwg-page body input,
html.pfwg-page body textarea,
html.pfwg-page body [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}
html.pfwg-page body ::selection { background: transparent; }
</style>

<style scoped>
/* Futura Bold Condensed is the early-2000s Cartoon Network face, self-hosted alongside the
   Winball page. font-display: block, not swap: Futura is far narrower than the site's Nunito,
   so a swap would reflow the battle text from three lines to two mid-battle. The file is 10KB. */
@font-face {
  font-family: 'FuturaBdCnBT';
  src: url('/newwinball/fonts/84_Futura BdCn BT.ttf') format('truetype');
  font-display: block;
}

.pfwg {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-family: 'FuturaBdCnBT', 'Trebuchet MS', system-ui, sans-serif;
  letter-spacing: 0.3px;
  color: #f8f8f8;
}

/* ── Menu ─────────────────────────────────────────────────────────────────────────────── */
.pfwg-menu {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  text-align: center;
  /* Backdrop set inline from the uploaded asset; these only describe how it is drawn.
     `cover` rather than the battlefield's `100% 100%` -- this one is scenery behind a
     scrolling column, so cropping it is correct and distorting it is not. Never
     `background-attachment: fixed`: unsupported and janky on iOS. */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: scroll;
}
.pfwg-logo { display: block; width: min(100%, 420px); height: auto; margin: 0 auto 6px; }
.pfwg-title {
  margin: 4px 0 8px;
  font-size: clamp(26px, 8vw, 46px);
  font-weight: 900;
  color: #ffcb05;
  text-shadow: -2px -2px 0 #2a75bb, 2px -2px 0 #2a75bb, -2px 2px 0 #2a75bb, 2px 2px 0 #2a75bb, 0 5px 0 rgba(0,0,0,.35);
  line-height: 1.05;
}
.pfwg-title-sub { display: block; font-size: .45em; color: #f8f8f8; text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000; }

.pfwg-types { display: flex; justify-content: center; gap: 6px; margin-bottom: 4px; }
.pfwg-chip {
  padding: 2px 10px;
  border: 2px solid #f8f8f8;
  border-radius: 999px;
  font-size: 12px;
  text-transform: uppercase;
  color: #202020;
}
.pfwg-chip.is-fire { background: #f8a038; }
.pfwg-chip.is-water { background: #6890f0; color: #f8f8f8; }
.pfwg-chip.is-grass { background: #78c850; }

.pfwg-block {
  margin-top: 10px;
  padding: 8px;
  border: 3px solid #f8f8f8;
  border-radius: 10px;
  background: rgba(0, 0, 0, .35);
  text-align: left;
}
.pfwg-block-head { display: flex; align-items: baseline; justify-content: space-between; }
.pfwg-h2 { margin: 0 0 6px; font-size: 17px; }
.pfwg-count { font-size: 12px; opacity: .75; }
.pfwg-note { margin: 4px 0 0; font-size: 12px; opacity: .8; text-align: center; }
.pfwg-note--tight { margin: 0 0 6px; }

.pfwg-trainers { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; }
.pfwg-trainer {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-height: 56px; padding: 4px; min-width: 0;
  border: 3px solid #f8f8f8; border-radius: 8px;
  background: #303850; color: #f8f8f8; font-family: inherit; font-size: 12px; cursor: pointer;
}
.pfwg-trainer.is-on { background: #ffcb05; color: #202020; }
/* Without this a tap that lands on the art never reaches the button. */
.pfwg-trainer-art { width: 100%; height: auto; max-height: 72px; object-fit: contain; pointer-events: none; }
.pfwg-trainer-name { pointer-events: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }

.pfwg-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 6px; }
.pfwg-tier {
  min-height: 44px; padding: 6px 4px;
  border: 3px solid #f8f8f8; border-radius: 8px;
  background: #303850; color: #f8f8f8; font-family: inherit; font-size: 13px; cursor: pointer;
}
.pfwg-tier.is-on { background: #ffcb05; color: #202020; }

.pfwg-btn {
  display: block; width: 100%; min-height: 48px; margin: 6px 0 2px; padding: 10px 14px;
  border: 3px solid #202020; border-radius: 10px;
  font-family: inherit; font-size: 18px; cursor: pointer;
  box-shadow: 0 4px 0 #202020;
}
.pfwg-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #202020; }
.pfwg-btn:disabled { opacity: .5; cursor: not-allowed; }
.pfwg-btn--go { background: #78c850; color: #202020; }
.pfwg-btn--alt { background: #ffcb05; color: #202020; }

.pfwg-rooms { list-style: none; margin: 8px 0 0; padding: 0; }
.pfwg-rooms li + li { margin-top: 6px; }
/* The whole card is the target, not a small pill on the right: at 352px a right-hand button
   collides with a long username. */
.pfwg-room {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; min-height: 56px; padding: 8px 12px;
  border: 3px solid #f8f8f8; border-radius: 8px;
  background: #303850; color: #f8f8f8; font-family: inherit; font-size: 15px; text-align: left; cursor: pointer;
}
.pfwg-room:disabled { opacity: .55; cursor: not-allowed; }
.pfwg-room-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pfwg-room-go { flex-shrink: 0; font-size: 13px; color: #ffcb05; }
.pfwg-empty { margin: 8px 0 0; font-size: 12px; opacity: .7; text-align: center; }

.pfwg-waiting { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; font-size: 14px; }
.pfwg-spinner {
  width: 16px; height: 16px; border: 3px solid rgba(248,248,248,.25); border-top-color: #ffcb05;
  border-radius: 50%; animation: pfwg-spin .8s linear infinite;
}
@keyframes pfwg-spin { to { transform: rotate(360deg); } }

.pfwg-link {
  background: none; border: none; font-family: inherit; font-size: 14px; color: #f8f8f8;
  text-decoration: underline; cursor: pointer; min-height: 44px;
}
.pfwg-sound { display: block; margin: 10px auto 0; }
.pfwg-error {
  margin: 8px 0 0; padding: 6px 10px; border-radius: 8px;
  background: #7a1f1f; border: 2px solid #f85838; font-size: 13px;
}

/* ── Battle ────────────────────────────────────────────────────────────────────────────
   Explicit grid tracks. The text box and the move row are FIXED heights, so nothing that
   happens mid-round can reflow the controls under the player's thumb.

   Written mobile-first with an INTRINSIC stage, which is the whole point. The layout gives
   .main-content `height: auto` on mobile (mainContentMobileStyle in newsite-template.vue), so
   nothing in this subtree has a definite height to resolve against. The first version sized the
   stage with a `1fr` track and the field with `height: 100%` -- against an indefinite parent
   both resolve to zero, and the battlefield rendered as a 0px sliver with the rest of the
   screen left empty below it. blackjack.vue documents the same trap. So the stage gets a
   definite height from the viewport here, and only takes the flexible track on desktop, where
   the box really is a fixed 682px. */
.pfwg-battle {
  display: grid;
  grid-template-rows: auto auto 54px 60px;
  gap: 6px;
  min-height: 0;
  min-width: 0;
  padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
  padding-left: max(8px, env(safe-area-inset-left));
  padding-right: max(8px, env(safe-area-inset-right));
  box-sizing: border-box;
}

.pfwg-hud { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; min-width: 0; }
.pfwg-side { display: flex; align-items: center; gap: 5px; min-width: 0; }
.pfwg-side--right { justify-content: flex-end; }
.pfwg-portrait { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #f8f8f8; object-fit: cover; flex-shrink: 0; }
.pfwg-name { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pfwg-mid { display: flex; flex-direction: column; align-items: center; }
.pfwg-round { font-size: 10px; opacity: .75; white-space: nowrap; }
.pfwg-timer { font-size: 22px; line-height: 1; font-variant-numeric: tabular-nums; }
.pfwg-timer.is-low { color: #f85838; }
.pfwg-timer--idle { opacity: .35; }

/* The field is sized from its WIDTH, never its height, and that is load-bearing in both
   directions. Width is the one dimension that is definite everywhere -- the layout hands this
   subtree an auto height on mobile -- so a height-driven field collapses to nothing there. And
   deriving width from height overflows: at a 2.14 ratio a 280px-tall stage wants a 600px-wide
   field, which on a 375px phone is silently cropped by .main-content's `overflow: hidden`
   rather than scrolled. Width in, height out, capped so a tall portrait screen does not hand
   the battlefield half the page. */
.pfwg-stage {
  max-height: min(42svh, 320px);
  min-width: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.pfwg-field {
  position: relative;
  width: 100%;
  height: auto;
  /* Only bites where the box is wider than it is tall (landscape, desktop); the field then
     letterboxes inside the stage rather than overflowing it. */
  max-height: 100%;
  aspect-ratio: 240 / 112;
  border: 3px solid #202020;
  border-radius: 8px;
  /* Safe ONLY because the box carries the image's own ratio. `cover` would crop the platforms
     out of a desktop-shaped box; `contain` would bake in an unstyleable letterbox. */
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-color: #78a060;
  /* Pixel art. Smoothing turns a 240px backdrop to mush at any upscale. */
  image-rendering: pixelated;
}

.pfwg-slot { position: absolute; display: flex; flex-direction: column; align-items: center; }
/* Classic diagonal staging: opponent far and upper right, player near and lower left. */
.pfwg-slot--far { top: 4%; right: 3%; width: 44%; }
.pfwg-slot--near { bottom: 2%; left: 3%; width: 48%; flex-direction: column-reverse; }

.pfwg-mon { width: auto; max-width: 100%; object-fit: contain; image-rendering: pixelated; pointer-events: none; }
.pfwg-mon--far { height: clamp(38px, 13vh, 96px); }
.pfwg-mon--near { height: clamp(46px, 16vh, 124px); }
/* Placeholder until the art is uploaded: a typed silhouette rather than a broken image. */
.pfwg-ghost { display: block; width: 46%; border-radius: 50% 50% 42% 42%; opacity: .8; border: 3px solid rgba(0,0,0,.45); }
.pfwg-ghost.is-fire { background: #f8a038; }
.pfwg-ghost.is-water { background: #6890f0; }
.pfwg-ghost.is-grass { background: #78c850; }

/* HP boxes live INSIDE the stage, where they are in the real game. Two rows of their own
   would cost 68px of a ~396px budget. */
.pfwg-hpbox {
  width: 100%;
  padding: 2px 5px;
  box-sizing: border-box;
  background: #f8f8f8;
  border: 2px solid #383838;
  border-radius: 4px;
  color: #383838;
}
.pfwg-hp-name { display: block; font-size: 10px; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pfwg-hp-wrap { display: flex; align-items: center; gap: 4px; }
.pfwg-hp-track {
  flex: 1;
  height: 8px;
  background: #282828;
  border-radius: 4px;
  overflow: hidden;
}
/* scaleX, not width: a width transition relayouts the box every frame on a device that is
   already decoding sprites. transform is composited. */
.pfwg-hp-fill {
  display: block;
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transition: transform .7s ease, background-color .3s ease;
}
.pfwg-hp-fill.is-ok { background: #58d858; }
.pfwg-hp-fill.is-low { background: #f8d030; }
.pfwg-hp-fill.is-critical { background: #f85838; }
/* Numerals beside the bar, always. Colour alone is the deuteranopia confusion pair and this
   bar is the primary score readout. */
.pfwg-hp-num { font-size: 10px; font-variant-numeric: tabular-nums; }

.pfwg-mute {
  position: absolute; top: 4px; left: 4px;
  width: 44px; height: 44px;
  display: grid; place-items: center;
  background: none; border: none; cursor: pointer; padding: 0;
}
/* Drawn, never an emoji: this repo already shipped a game whose emoji rendered as blanks on a
   real device, and tests assert the template stays emoji-free. */
.pfwg-mute-icon {
  width: 18px; height: 18px;
  background: #f8f8f8;
  border: 2px solid #202020;
  clip-path: polygon(0 30%, 35% 30%, 70% 0, 70% 100%, 35% 70%, 0 70%);
  position: relative;
}
.pfwg-mute-icon.is-off { opacity: .45; }
.pfwg-mute-icon.is-off::after {
  content: ''; position: absolute; left: -20%; top: 45%; width: 140%; height: 3px;
  background: #f85838; transform: rotate(-20deg);
}

.pfwg-over {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px; padding: 12px;
  background: rgba(0, 0, 0, .68); text-align: center;
}
.pfwg-over-title { margin: 0; font-size: clamp(24px, 8vw, 42px); color: #f8f8f8; }
.pfwg-over-title.is-win { color: #ffcb05; }
.pfwg-over-title.is-loss { color: #f85838; }
.pfwg-over-note { margin: 0; font-size: 13px; }
.pfwg-over .pfwg-btn { width: min(100%, 260px); }

/* Fixed height, overflow hidden -- see the grid note above. */
.pfwg-text {
  height: 54px;
  overflow: hidden;
  padding: 4px 8px;
  box-sizing: border-box;
  background: #f8f8f8;
  border: 3px solid #383838;
  border-radius: 6px;
  color: #383838;
}
.pfwg-text-line { margin: 0; font-size: 14px; line-height: 1.25; }

/* Visually hidden but available to screen readers. */
.pfwg-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.pfwg-moves { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; min-width: 0; }
.pfwg-move {
  position: relative;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: 60px; min-width: 0; padding: 4px 2px;
  border: 3px solid #202020; border-radius: 8px;
  font-family: inherit; color: #202020; cursor: pointer;
  box-shadow: 0 4px 0 #202020;
  /* Withholds zoom gestures on the play surface; the page still scrolls via pan-y on html. */
  touch-action: manipulation;
}
/* Fire/Water/Grass as red/blue/green is the deuteranopia confusion pair, and it is the primary
   input. So every button also carries its name as visible text, a distinct glyph shape, and a
   distinct lightness -- fire light, grass mid, water dark. */
.pfwg-move.is-fire { background: #f8a038; }
.pfwg-move.is-water { background: #6890f0; color: #f8f8f8; }
.pfwg-move.is-grass { background: #78c850; }
.pfwg-move.is-picked { outline: 4px solid #ffcb05; outline-offset: -4px; }
.pfwg-move[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
.pfwg-move:active:not([aria-disabled="true"]) { transform: translateY(3px); box-shadow: 0 1px 0 #202020; }
.pfwg-move-glyph { width: 16px; height: 16px; background: currentColor; pointer-events: none; }
.pfwg-move-glyph.is-fire { clip-path: polygon(50% 0, 80% 40%, 70% 100%, 30% 100%, 20% 40%); }
.pfwg-move-glyph.is-water { clip-path: polygon(50% 0, 90% 60%, 50% 100%, 10% 60%); }
.pfwg-move-glyph.is-grass { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); border-radius: 40%; }
.pfwg-move-label { font-size: 12px; text-transform: uppercase; pointer-events: none; }
.pfwg-move-key { position: absolute; top: 2px; right: 4px; font-size: 9px; opacity: .6; pointer-events: none; }

/* Nothing in edrps.vue defines a focus ring, and it copies user-select/tap-highlight
   suppression -- which together make a keyboard player unable to see where they are. */
.pfwg-move:focus-visible,
.pfwg-btn:focus-visible,
.pfwg-tier:focus-visible,
.pfwg-trainer:focus-visible,
.pfwg-room:focus-visible,
.pfwg-link:focus-visible,
.pfwg-mute:focus-visible {
  outline: 3px solid #f8f8f8;
  outline-offset: 2px;
  box-shadow: 0 0 0 6px #202020;
}

/* Hover is emulated on touch and latches after a tap. A move button left lit reads as "locked
   in", which is exactly the wrong signal in a simultaneous game. */
@media (hover: hover) {
  .pfwg-move:not([aria-disabled="true"]):hover { filter: brightness(1.08); }
  .pfwg-room:hover:not(:disabled), .pfwg-trainer:hover, .pfwg-tier:hover { filter: brightness(1.08); }
}
@media (hover: none) {
  .pfwg-move:hover, .pfwg-room:hover, .pfwg-trainer:hover, .pfwg-tier:hover { filter: none; }
}

/* On mobile the layout's .main-content is itself height:auto/overflow-y:auto, so a menu that
   scrolls internally is a scroller nested inside the page's own -- and on iOS the outer page
   then refuses to scroll until the inner one bottoms out. Let the menu grow and the page
   scroll. The battle screen is unaffected: it fits its box at every size. */
@media (max-width: 768px) {
  .pfwg-menu { flex: none; overflow-y: visible; min-height: 0; }
  /* height:100% resolves to auto against the layout's auto-height .main-content, and an
     explicit 100% there is what collapsed the battlefield. Say `auto` and mean it. */
  .pfwg { height: auto; }
}

/* Landscape on a phone that stays in the layout's mobile branch. Stacked, the HUD, text box
   and moves alone eat 148px of a ~139px box, so they go side by side and only the taller
   column has to fit. */
@media (max-height: 520px) and (min-width: 560px) {
  .pfwg-battle {
    grid-template-columns: 1fr minmax(140px, 32%);
    grid-template-rows: auto 1fr;
    grid-template-areas: "hud moves" "stage moves";
    gap: 4px;
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
  }
  .pfwg-hud { grid-area: hud; }
  /* The landscape grid gives the stage a real `1fr` track inside a viewport-height box, so it
     drops the portrait viewport cap and fills its cell instead. */
  .pfwg-stage { grid-area: stage; max-height: none; min-height: 0; }
  .pfwg-moves { grid-area: moves; grid-template-columns: 1fr; grid-template-rows: repeat(3, 1fr); gap: 4px; }
  .pfwg-move { min-height: 38px; flex-direction: row; gap: 6px; }
  /* No room for a two-line box here; the HP bars already carry the state. */
  .pfwg-text { display: none; }
  .pfwg-hp-name { font-size: 9px; }
}

/* Desktop. Here .main-content is a real fixed box, so the stage can take the leftover space
   the way the mobile version cannot -- and the 240px-wide backdrop needs a ceiling or it is
   blown up more than 4x. */
@media (min-width: 769px) {
  .pfwg { height: 100%; }
  .pfwg-battle { grid-template-rows: auto 1fr 54px 60px; flex: 1; height: 100%; }
  /* A real box with real leftover space, so the cap comes off and the field centres in it. */
  .pfwg-stage { max-height: none; min-height: 0; }
  .pfwg-field { max-width: 720px; }
}

.pfwg-rotate {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: #185068; color: #ffcb05; text-align: center; padding: 24px;
}
.pfwg-rotate-icon {
  display: block; width: 44px; height: 74px;
  border: 4px solid #ffcb05; border-radius: 8px; position: relative;
  animation: pfwg-tilt 1.6s ease-in-out infinite;
}
.pfwg-rotate-text { margin: 0; font-size: 20px; }
@keyframes pfwg-tilt { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } }

/* Reduced motion means less movement, never a faster game: the timings stay identical so the
   client cannot desync from the server's intermission. */
@media (prefers-reduced-motion: reduce) {
  .pfwg-spinner, .pfwg-rotate-icon { animation: none; }
  .pfwg-hp-fill { transition: none; }
  .pfwg-move, .pfwg-btn { transition: none; }
}
</style>
