<template>
  <!-- The layout comes from definePageMeta below; wrapping in <NuxtLayout> as well would
       render newsite-template inside itself and duplicate the whole header. -->
  <div class="rps" ref="wrapper">

    <!-- ── Lobby ─────────────────────────────────────────────────────────────────── -->
    <div v-if="screen === 'lobby'" class="rps-lobby">
      <!-- The title lettering lives on the lobby only. On the match screen the vertical
           budget on a 360x640 phone is ~396px and every one of those pixels is spoken for. -->
      <h1 class="rps-title">Ed, Edd n Eddy<span class="rps-title-sub">Rock Paper Scissors</span></h1>

      <div class="rps-pickers" role="radiogroup" aria-label="Choose your character">
        <button
          v-for="c in CHARACTERS"
          :key="c.id"
          type="button"
          role="radio"
          :aria-checked="character === c.id"
          class="rps-pick"
          :class="{ 'is-on': character === c.id }"
          :style="{ '--accent': c.accent }"
          @click="pickCharacter(c.id)"
        >
          <!-- pointer-events:none in CSS: without it a tap that lands on the sprite is
               swallowed and the card never selects. -->
          <img :src="c.art" :alt="c.name" :width="c.width" :height="c.height" class="rps-pick-art" />
          <span class="rps-pick-name">{{ c.name }}</span>
          <span class="rps-pick-tag">{{ c.tagline }}</span>
        </button>
      </div>

      <!-- Above the room list on purpose: the room list is usually empty, and a dead lobby
           must never be the first thing a player meets. -->
      <button class="rps-btn rps-btn--go" @click="startCpu" :disabled="!character">
        Play the Eds
      </button>
      <p class="rps-note">Practice against the computer. No points, play as much as you like.</p>

      <div class="rps-versus">
        <div class="rps-versus-head">
          <h2 class="rps-h2">Head to head</h2>
          <span class="rps-count">{{ rooms.length }} open</span>
        </div>

        <p v-if="pointsPerWin > 0" class="rps-note rps-note--tight">
          Winner takes <strong>{{ pointsPerWin }}</strong> points, from the same daily pool as
          TKO and gToons Clash.
        </p>

        <button
          v-if="!myRoomId"
          class="rps-btn rps-btn--alt"
          @click="createRoom"
          :disabled="!character || !connected"
        >
          Create a room
        </button>
        <div v-else class="rps-waiting">
          <span class="rps-spinner" aria-hidden="true"></span>
          Waiting for an opponent…
          <button class="rps-link" @click="leaveRoom">Cancel</button>
        </div>

        <ul v-if="rooms.length" class="rps-rooms">
          <!-- The whole card is the target, not a small button on the right: at 352px wide a
               right-hand pill collides with a long username. -->
          <li v-for="r in rooms" :key="r.id">
            <button class="rps-room" @click="joinRoom(r.id)" :disabled="!character || !connected">
              <span class="rps-room-name">{{ r.owner }}</span>
              <span class="rps-room-go">Challenge →</span>
            </button>
          </li>
        </ul>
        <p v-else-if="!myRoomId" class="rps-empty">
          Nobody's waiting right now. Create a room and the Discord will hear about it.
        </p>
      </div>

      <p v-if="error" class="rps-error" role="alert">{{ error }}</p>
    </div>

    <!-- ── Match ─────────────────────────────────────────────────────────────────── -->
    <div v-else class="rps-match">
      <header class="rps-hud">
        <div class="rps-side">
          <span class="rps-side-name">{{ me.username }}</span>
          <!-- Pips sit on the name row rather than in a band of their own: a separate row
               costs 40px of a 396px budget. -->
          <span class="rps-pips" :aria-label="`${me.score} of ${winsNeeded} won`">
            <i v-for="n in winsNeeded" :key="n" :class="{ 'is-on': n <= me.score }"></i>
          </span>
        </div>
        <div class="rps-mid">
          <span class="rps-round">Round {{ roundNumber }}</span>
          <span class="rps-timer" :class="{ 'is-low': secondsLeft <= 3 }">{{ secondsLeft }}</span>
        </div>
        <div class="rps-side rps-side--right">
          <span class="rps-side-name">{{ opp.username }}</span>
          <span class="rps-pips" :aria-label="`${opp.score} of ${winsNeeded} won`">
            <i v-for="n in winsNeeded" :key="n" :class="{ 'is-on': n <= opp.score }"></i>
          </span>
        </div>
      </header>

      <div class="rps-scene">
        <div class="rps-fighter rps-fighter--me">
          <p v-if="myLine" class="rps-bubble">{{ myLine }}</p>
          <div class="rps-throw" :class="{ 'is-shown': revealed }">
            <img
              v-if="revealed"
              :src="HAND_ART[revealed.you].art" :alt="HANDS[revealed.you]"
              :width="HAND_ART[revealed.you].width" :height="HAND_ART[revealed.you].height"
              class="rps-throw-art"
            />
            <!-- The waiting and committed markers are CSS shapes rather than glyphs, for the
                 same reason the hands are images now: a font that lacks the character draws
                 nothing at all, and there is no fallback to notice. -->
            <span v-else class="rps-pending" :class="{ 'is-locked': iThrew }" aria-hidden="true"></span>
          </div>
          <img
            :src="myChar.art" :alt="myChar.name"
            :width="myChar.width" :height="myChar.height"
            class="rps-art"
          />
        </div>

        <div class="rps-fighter rps-fighter--opp">
          <p v-if="oppLine" class="rps-bubble rps-bubble--right">{{ oppLine }}</p>
          <div class="rps-throw" :class="{ 'is-shown': revealed }">
            <img
              v-if="revealed"
              :src="HAND_ART[revealed.opponent].art" :alt="HANDS[revealed.opponent]"
              :width="HAND_ART[revealed.opponent].width" :height="HAND_ART[revealed.opponent].height"
              class="rps-throw-art rps-throw-art--flip"
            />
            <span v-else class="rps-pending" :class="{ 'is-locked': oppThrew }" aria-hidden="true"></span>
          </div>
          <img
            :src="oppChar.art" :alt="oppChar.name"
            :width="oppChar.width" :height="oppChar.height"
            class="rps-art rps-art--flip"
          />
        </div>

        <p v-if="banner" class="rps-banner" :class="`is-${bannerKind}`">{{ banner }}</p>

        <!-- Absolute inside the scene, never `position: fixed`: .site-container carries a
             transform, which would make it the containing block for a fixed element and trap
             the overlay inside the scaled box. -->
        <div v-if="over" class="rps-over">
          <!-- A swept match has no winner, so neither player is told they lost one. -->
          <p v-if="endReason === 'sweep'" class="rps-over-title">Match abandoned</p>
          <p v-else class="rps-over-title" :class="won ? 'is-win' : 'is-loss'">
            {{ won ? 'You win!' : 'You lose!' }}
          </p>
          <p v-if="endReason === 'sweep'" class="rps-over-note">
            Nobody threw for a while, so the match was called off. No points either way.
          </p>
          <p v-else-if="endReason === 'forfeit'" class="rps-over-note">
            {{ won ? 'Your opponent left the match.' : 'You left the match.' }}
          </p>
          <p v-else-if="won && pointsAwarded > 0" class="rps-over-note">
            +{{ pointsAwarded }} points
          </p>
          <p v-else-if="won && suppressReason" class="rps-over-note">
            {{ SUPPRESS_COPY[suppressReason] || 'No points for this one.' }}
          </p>
          <button class="rps-btn rps-btn--go" @click="backToLobby">Back to the cul-de-sac</button>
        </div>
      </div>

      <div class="rps-controls">
        <button
          v-for="(hand, i) in HAND_ART"
          :key="i"
          type="button"
          class="rps-hand"
          :class="{ 'is-picked': myPick === i }"
          :disabled="!canThrow"
          @click="throwHand(i)"
        >
          <!-- pointer-events off so a tap landing on the art still reaches the button. -->
          <img
            :src="hand.art" alt=""
            :width="hand.width" :height="hand.height"
            class="rps-hand-art" aria-hidden="true"
          />
          <span class="rps-hand-label">{{ HANDS[i] }}</span>
        </button>
      </div>

      <button v-if="!over" class="rps-link rps-quit" @click="quitMatch">
        {{ isCpu ? 'Back to the cul-de-sac' : 'Forfeit' }}
      </button>
    </div>

    <!-- A landscape phone WIDER than 768px takes the layout's desktop branch, which scales the
         whole 1040x862 design to fit ~346px of height — about 38%. A 48px button becomes 18
         physical pixels and no media query inside the page can see it. Teleported to body so
         the fixed positioning isn't captured by .site-container's transform. -->
    <Teleport to="body">
      <div v-if="blockedLandscape" class="rps-rotate">
        <span class="rps-rotate-icon" aria-hidden="true"></span>
        <p class="rps-rotate-text">Turn your phone upright to play</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { io as ioClient } from 'socket.io-client'
import { CHARACTERS, HANDS, HAND_ART, ROUND_BREAK_MS, characterById, compareHands } from '~/lib/edRps'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // The match has to fit a 360x640 phone without a nested scroller. The sidebar and footer are
  // ~67px of that budget. Read from route meta — the layout declares no props, so passing
  // these to <NuxtLayout> instead would silently do nothing.
  showSidebar: false,
  showFooter: false,
  // This page disables pinch-zoom, so a page tall enough to scroll would leave a
  // short-viewport player no way to reach the bottom of the match.
  fitHeight: true,
  ssr: false,
  title: 'Ed, Edd n Eddy Rock Paper Scissors',
  description: 'Face off in the cul-de-sac. Pick Ed, Edd or Eddy and play rock paper scissors head to head for points on Cartoon ReOrbit.'
})

useHead({
  htmlAttrs: { class: 'edrps-page' },
  // viewport-fit=cover is required for env(safe-area-inset-*) to resolve to anything but 0 —
  // nuxt.config's site-wide viewport omits it, so the throw buttons would sit under the
  // iPhone home indicator.
  meta: [{
    name: 'viewport',
    content: 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, viewport-fit=cover, user-scalable=no'
  }]
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const runtime = useRuntimeConfig()

const SUPPRESS_COPY = {
  cap_exhausted: "You've hit today's PvP points cap. Still counts as a win!",
  pair_limit: "You've already traded points with this player today.",
  same_device: 'No points: you and your opponent look like the same device.',
  abandoned: 'No points — the match was abandoned.',
  banned: 'No points awarded.'
}

/* ── UI state ─────────────────────────────────────────────────────────────────────── */
const screen = ref('lobby')
const character = ref(null)
const rooms = ref([])
const myRoomId = ref(null)
const connected = ref(false)
const error = ref('')
const wrapper = ref(null)
const blockedLandscape = ref(false)

const isCpu = ref(false)
const me = ref({ username: 'You', character: 'ed', score: 0 })
const opp = ref({ username: 'Opponent', character: 'eddy', score: 0 })
const winsNeeded = ref(4)
const maxRounds = ref(7)
const roundNumber = ref(1)
const deadlineAt = ref(0)
const nowMs = ref(Date.now())
const iThrew = ref(false)
const oppThrew = ref(false)
const myPick = ref(null)
const revealed = ref(null)
const banner = ref('')
const bannerKind = ref('tie')
const myLine = ref('')
const oppLine = ref('')
const over = ref(false)
const won = ref(false)
const endReason = ref('natural')
const pointsAwarded = ref(0)
const suppressReason = ref(null)
const pointsPerWin = ref(0)
const cpuRoundSeconds = ref(15)

const myChar = computed(() => characterById(me.value.character))
const oppChar = computed(() => characterById(opp.value.character))
const secondsLeft = computed(() => {
  if (!deadlineAt.value) return 0
  return Math.max(0, Math.ceil((deadlineAt.value - nowMs.value) / 1000))
})
const canThrow = computed(() => !over.value && !iThrew.value && !revealed.value && deadlineAt.value > 0)

/* ── Countdown ────────────────────────────────────────────────────────────────────────
 * One interval mutating one ref. The server sends an absolute deadline once per round and
 * never ticks — a per-second server broadcast per match is what makes the Clash timer
 * expensive. */
// Holds the match-over panel back so the final round's result is readable first.
let matchEndTimer = null

let tickTimer = null
function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => { nowMs.value = Date.now() }, 250)
}
function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
}

/* ── Socket ───────────────────────────────────────────────────────────────────────── */
let socket = null

function applyView(v) {
  me.value = v.you
  opp.value = v.opponent
  winsNeeded.value = v.winsNeeded
  maxRounds.value = v.maxRounds
  roundNumber.value = v.round
  deadlineAt.value = v.deadlineAt || 0
  iThrew.value = v.youThrew
  oppThrew.value = v.opponentThrew
}

function connectSocket() {
  // withCredentials so the session cookie rides along in dev, where the socket server is a
  // different origin. Without it every handler would see an unauthenticated socket.
  const url = import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`
  socket = ioClient(url, { withCredentials: true, reconnectionDelayMax: 5000 })

  socket.on('connect', () => {
    connected.value = true
    socket.emit('edrps:subscribe')
  })
  socket.on('disconnect', () => { connected.value = false })

  socket.on('edrps:rooms', (list) => { rooms.value = list })
  socket.on('edrps:config', (cfg) => {
    pointsPerWin.value = cfg?.pointsPerWin ?? 0
    // Only used to size the pip rows before a match starts; matchStart carries the
    // authoritative values.
    if (cfg?.winsNeeded) winsNeeded.value = cfg.winsNeeded
    if (cfg?.maxRounds) maxRounds.value = cfg.maxRounds
    if (cfg?.roundSeconds) cpuRoundSeconds.value = cfg.roundSeconds
  })
  socket.on('edrps:roomAdded', (r) => {
    if (!rooms.value.some(x => x.id === r.id)) rooms.value = [r, ...rooms.value]
  })
  socket.on('edrps:roomRemoved', ({ id }) => {
    rooms.value = rooms.value.filter(r => r.id !== id)
    if (myRoomId.value === id && screen.value === 'lobby') myRoomId.value = null
  })
  socket.on('edrps:roomCreated', ({ id }) => { myRoomId.value = id })

  socket.on('edrps:matchStart', (v) => {
    isCpu.value = false
    myRoomId.value = null
    resetMatchUi()
    applyView(v)
    screen.value = 'match'
    startTick()
  })

  socket.on('edrps:round', (v) => {
    applyView(v)
    revealed.value = null
    myPick.value = null
    banner.value = ''
    myLine.value = ''
    oppLine.value = ''
  })

  socket.on('edrps:opponentThrew', () => { oppThrew.value = true })
  socket.on('edrps:throwAccepted', () => { iThrew.value = true })

  socket.on('edrps:reveal', (v) => {
    applyView(v)
    showReveal(v.reveal)
  })

  socket.on('edrps:matchEnd', (v) => {
    applyView(v)
    won.value = v.won
    endReason.value = v.endReason
    pointsAwarded.value = v.pointsAwarded || 0
    suppressReason.value = v.suppressReason || null
    deadlineAt.value = 0
    stopTick()

    // The server ends a decided match on the same tick it reveals the final round, so the
    // panel is held back for the same beat the server puts between ordinary rounds — long
    // enough to read who took the last one. A forfeit or a sweep has no round result behind
    // it, so those show immediately.
    const holdForResult = v.endReason === 'natural' && !!revealed.value
    if (matchEndTimer) clearTimeout(matchEndTimer)
    if (holdForResult) {
      matchEndTimer = setTimeout(() => { over.value = true }, ROUND_BREAK_MS)
    } else {
      over.value = true
    }
  })

  socket.on('edrps:opponentDropped', () => {
    banner.value = 'Opponent disconnected…'
    bannerKind.value = 'tie'
  })
  socket.on('edrps:opponentReturned', () => {
    if (banner.value === 'Opponent disconnected…') banner.value = ''
  })

  socket.on('edrps:error', ({ message }) => {
    error.value = message || 'Something went wrong.'
    setTimeout(() => { error.value = '' }, 4000)
  })
}

function showReveal(r) {
  revealed.value = { you: r.you, opponent: r.opponent }
  iThrew.value = false
  oppThrew.value = false
  bannerKind.value = r.result
  // Names the winner rather than saying "you win": with two usernames already on the HUD, the
  // name is what makes the result scannable at a glance from either side of the match.
  const roundNo = r.n ?? roundNumber.value
  banner.value = r.result === 'tie'
    ? `Round ${roundNo} — tie! Throw again`
    : `Round ${roundNo} winner ${r.result === 'win' ? me.value.username : opp.value.username}!`
  const mine = myChar.value.lines
  const theirs = oppChar.value.lines
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  if (r.result === 'tie') {
    myLine.value = pick(mine.tie)
    oppLine.value = pick(theirs.tie)
  } else if (r.result === 'win') {
    myLine.value = pick(mine.win)
    oppLine.value = pick(theirs.lose)
  } else {
    myLine.value = pick(mine.lose)
    oppLine.value = pick(theirs.win)
  }
}

/* ── Lobby actions ────────────────────────────────────────────────────────────────── */
function pickCharacter(id) {
  character.value = id
  try { localStorage.setItem('edrps:character', id) } catch {}
}

function createRoom() {
  error.value = ''
  socket?.emit('edrps:createRoom', { character: character.value })
}

function joinRoom(id) {
  error.value = ''
  socket?.emit('edrps:joinRoom', { roomId: id, character: character.value })
}

function leaveRoom() {
  socket?.emit('edrps:leave')
  myRoomId.value = null
}

function resetMatchUi() {
  if (matchEndTimer) { clearTimeout(matchEndTimer); matchEndTimer = null }
  over.value = false
  won.value = false
  endReason.value = 'natural'
  pointsAwarded.value = 0
  suppressReason.value = null
  revealed.value = null
  myPick.value = null
  iThrew.value = false
  oppThrew.value = false
  banner.value = ''
  myLine.value = ''
  oppLine.value = ''
}

function backToLobby() {
  stopTick()
  screen.value = 'lobby'
  isCpu.value = false
  resetMatchUi()
  socket?.emit('edrps:listRooms')
}

function quitMatch() {
  if (isCpu.value) { backToLobby(); return }
  socket?.emit('edrps:leave')
  // The server confirms with edrps:matchEnd; this just stops the clock ticking meanwhile.
  deadlineAt.value = 0
  stopTick()
}

/* ── Throwing ─────────────────────────────────────────────────────────────────────── */
function throwHand(hand) {
  if (!canThrow.value) return
  myPick.value = hand
  if (isCpu.value) { cpuResolve(hand); return }
  iThrew.value = true
  socket?.emit('edrps:throw', { round: roundNumber.value, hand })
}

/* ── CPU practice ─────────────────────────────────────────────────────────────────────
 * Entirely local: no socket, no match row, no points. Nothing here may ever report a result
 * to the server — the award path is PvP-only by construction. */
let cpuTimer = null

function randomHand() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1)
    // Rejection-sample so the three hands stay equally likely rather than 2^32 % 3 biased.
    do { crypto.getRandomValues(a) } while (a[0] >= 4294967295 - (4294967295 % 3))
    return a[0] % 3
  }
  return Math.floor(Math.random() * 3)
}

function startCpu() {
  if (!character.value) return
  isCpu.value = true
  resetMatchUi()
  const others = CHARACTERS.filter(c => c.id !== character.value)
  // One draw, not two: picking the name and the sprite independently produces an opponent
  // called "Ed" who is drawn as Eddy.
  const foe = others[Math.floor(Math.random() * others.length)]
  me.value = { username: 'You', character: character.value, score: 0 }
  opp.value = { username: foe.name, character: foe.id, score: 0 }
  roundNumber.value = 1
  screen.value = 'match'
  cpuArmRound()
}

function cpuArmRound() {
  revealed.value = null
  myPick.value = null
  iThrew.value = false
  oppThrew.value = false
  banner.value = ''
  myLine.value = ''
  oppLine.value = ''
  const ms = cpuRoundSeconds.value * 1000
  deadlineAt.value = Date.now() + ms
  startTick()
  if (cpuTimer) clearTimeout(cpuTimer)
  cpuTimer = setTimeout(() => {
    if (!revealed.value && screen.value === 'match' && isCpu.value) cpuResolve(randomHand())
  }, ms + 250)
}

function cpuResolve(myHand) {
  if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null }
  const theirs = randomHand()
  const cmp = compareHands(myHand, theirs)
  if (cmp > 0) me.value = { ...me.value, score: me.value.score + 1 }
  else if (cmp < 0) opp.value = { ...opp.value, score: opp.value.score + 1 }
  deadlineAt.value = 0
  stopTick()
  showReveal({
    you: myHand,
    opponent: theirs,
    result: cmp === 0 ? 'tie' : (cmp > 0 ? 'win' : 'loss')
  })

  const decided = me.value.score >= winsNeeded.value || opp.value.score >= winsNeeded.value
  setTimeout(() => {
    if (screen.value !== 'match' || !isCpu.value) return
    if (decided) {
      over.value = true
      won.value = me.value.score > opp.value.score
      endReason.value = 'natural'
      pointsAwarded.value = 0
      suppressReason.value = null
    } else {
      roundNumber.value += 1
      cpuArmRound()
    }
  }, ROUND_BREAK_MS)
}

/* ── Orientation ──────────────────────────────────────────────────────────────────── */
function checkOrientation() {
  const landscape = window.innerWidth > window.innerHeight
  // >768 in landscape is the case the layout scales to ~38%; narrower landscape phones stay
  // in the mobile branch and are handled by the side-by-side CSS instead.
  blockedLandscape.value = landscape && window.innerWidth > 768 && window.innerHeight < 500
}

/* ── Zoom / gesture suppression ────────────────────────────────────────────────────────
 * touch-action alone stops double-tap zoom but the spec still permits "continuous zooming",
 * so iOS pinch needs these explicit handlers. All non-passive so preventDefault applies. */
function blockGesture(e) { e.preventDefault() }
function blockMultiTouch(e) { if (e.touches && e.touches.length > 1) e.preventDefault() }

let orientationHandler = null

onMounted(() => {
  try {
    const saved = localStorage.getItem('edrps:character')
    if (saved && CHARACTERS.some(c => c.id === saved)) character.value = saved
  } catch {}
  if (!character.value) character.value = 'eddy'

  connectSocket()

  checkOrientation()
  // Only orientationchange, never resize: on iOS the collapsing URL bar fires resize on
  // nearly every scroll pixel.
  orientationHandler = () => nextTick(checkOrientation)
  window.addEventListener('orientationchange', orientationHandler)
  window.addEventListener('resize', orientationHandler)

  document.addEventListener('gesturestart', blockGesture, { passive: false })
  document.addEventListener('gesturechange', blockGesture, { passive: false })
  document.addEventListener('gestureend', blockGesture, { passive: false })
  document.addEventListener('touchmove', blockMultiTouch, { passive: false })
  document.addEventListener('dblclick', blockGesture, { passive: false })
})

onBeforeUnmount(() => {
  stopTick()
  if (cpuTimer) clearTimeout(cpuTimer)
  if (matchEndTimer) clearTimeout(matchEndTimer)
  if (orientationHandler) {
    window.removeEventListener('orientationchange', orientationHandler)
    window.removeEventListener('resize', orientationHandler)
  }
  document.removeEventListener('gesturestart', blockGesture)
  document.removeEventListener('gesturechange', blockGesture)
  document.removeEventListener('gestureend', blockGesture)
  document.removeEventListener('touchmove', blockMultiTouch)
  document.removeEventListener('dblclick', blockGesture)
  if (socket) {
    socket.emit('edrps:leave')
    socket.close()
    socket = null
  }
})
</script>

<!-- Gated by the html class useHead adds on entry and removes on leave, so none of this leaks
     to the rest of the site the way the ungated blocks on the gtoons pages do. -->
<style>
html.edrps-page,
html.edrps-page body {
  touch-action: pan-y;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

html.edrps-page {
  min-height: 100svh;
  background: linear-gradient(to bottom, #000 0px, #000 65px, #7ec0ee 115px, #b9e3f7 100%) no-repeat fixed;
}
html.edrps-page body { background: transparent; min-height: 100svh; }

/* Nothing on the page is selectable, chrome included: a drag that starts on the nav and
   sweeps across the buttons otherwise leaves a live selection that swallows the next tap —
   which on a 15-second round is a lost round. The -webkit- prefix is not optional; Safari
   ignores the unprefixed property. */
html.edrps-page body,
html.edrps-page body * {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
}
html.edrps-page body input,
html.edrps-page body textarea,
html.edrps-page body [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}
html.edrps-page body ::selection { background: transparent; }
html.edrps-page body ::-moz-selection { background: transparent; }
</style>

<style scoped>
.rps {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  box-sizing: border-box;
  font-family: 'Trebuchet MS', 'Comic Sans MS', system-ui, sans-serif;
  color: #10243a;
}

/* ── Title ─────────────────────────────────────────────────────────────────────────
   An 8-way text-shadow, not -webkit-text-stroke: a centred stroke eats the thin parts of
   the glyphs at the 24-30px the mobile budget allows and the lettering turns to mush. */
.rps-title {
  margin: 4px 0 8px;
  text-align: center;
  font-size: clamp(22px, 7vw, 40px);
  font-weight: 900;
  font-style: italic;
  letter-spacing: 0.5px;
  color: #e2231a;
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000,
    0 4px 0 rgba(0, 0, 0, 0.35);
  line-height: 1.05;
}
.rps-title-sub {
  display: block;
  font-size: 0.5em;
  color: #fff33b;
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000;
}

/* ── Lobby ─────────────────────────────────────────────────────────────────────────── */
.rps-lobby {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.rps-pickers {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin-bottom: 10px;
  min-width: 0;
}

.rps-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 6px 4px 8px;
  border: 3px solid #10243a;
  border-radius: 12px;
  background: #fffdf2;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.rps-pick.is-on {
  background: var(--accent, #fff33b);
  box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--accent, #e2231a);
  transform: translateY(-2px);
}
.rps-pick-art {
  width: auto;
  height: clamp(64px, 17vw, 104px);
  max-width: 100%;
  object-fit: contain;
  /* Without this a tap landing on the sprite never reaches the button. */
  pointer-events: none;
}
.rps-pick-name { font-weight: 900; font-size: 15px; }
/* The three silhouettes are similar at thumbnail size, so the name is not decoration. */
.rps-pick-tag {
  font-size: 10px;
  line-height: 1.15;
  text-align: center;
  opacity: 0.72;
}

.rps-btn {
  display: block;
  width: 100%;
  min-height: 48px;
  margin: 6px 0 2px;
  padding: 10px 14px;
  border: 3px solid #10243a;
  border-radius: 12px;
  font-family: inherit;
  font-size: 17px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 4px 0 #10243a;
  transition: transform 0.08s ease, box-shadow 0.08s ease;
}
.rps-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #10243a; }
.rps-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rps-btn--go { background: #4caf50; color: #fff; }
.rps-btn--alt { background: #fff33b; color: #10243a; }

.rps-note { margin: 2px 0 8px; font-size: 11px; text-align: center; opacity: 0.75; }
.rps-note--tight { margin: 0 0 6px; }

.rps-versus {
  margin-top: 10px;
  padding: 8px;
  border: 3px solid #10243a;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
}
.rps-versus-head { display: flex; align-items: baseline; justify-content: space-between; }
.rps-h2 { margin: 0; font-size: 16px; font-weight: 900; }
.rps-count { font-size: 11px; opacity: 0.7; }

.rps-rooms { list-style: none; margin: 8px 0 0; padding: 0; max-height: 210px; overflow-y: auto; }
.rps-rooms li + li { margin-top: 6px; }
.rps-room {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border: 3px solid #10243a;
  border-radius: 10px;
  background: #fffdf2;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.rps-room:disabled { opacity: 0.55; cursor: not-allowed; }
.rps-room-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rps-room-go { flex-shrink: 0; font-size: 12px; color: #e2231a; font-weight: 900; }

.rps-empty { margin: 8px 0 0; font-size: 12px; text-align: center; opacity: 0.7; }

.rps-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  font-size: 14px;
  font-weight: 700;
}
.rps-spinner {
  width: 16px; height: 16px;
  border: 3px solid rgba(16, 36, 58, 0.25);
  border-top-color: #e2231a;
  border-radius: 50%;
  animation: rps-spin 0.8s linear infinite;
}
@keyframes rps-spin { to { transform: rotate(360deg); } }

.rps-link {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: #10243a;
  text-decoration: underline;
  cursor: pointer;
  min-height: 32px;
}
.rps-error {
  margin: 8px 0 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #ffe0de;
  border: 2px solid #e2231a;
  font-size: 13px;
  text-align: center;
}

/* ── Match ─────────────────────────────────────────────────────────────────────────── */
.rps-match {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 6px 8px calc(8px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  gap: 6px;
}

.rps-hud {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
}
.rps-side { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rps-side--right { align-items: flex-end; }
.rps-side-name {
  font-size: 13px;
  font-weight: 900;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rps-pips { display: flex; gap: 3px; }
.rps-pips i {
  width: 11px; height: 11px;
  border: 2px solid #10243a;
  border-radius: 50%;
  background: #fff;
}
.rps-pips i.is-on { background: #e2231a; }

.rps-mid { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.rps-round { font-size: 10px; font-weight: 700; opacity: 0.75; white-space: nowrap; }
.rps-timer {
  font-size: 22px;
  font-weight: 900;
  line-height: 1;
  color: #10243a;
  font-variant-numeric: tabular-nums;
}
.rps-timer.is-low { color: #e2231a; }

.rps-scene {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  border: 3px solid #10243a;
  border-radius: 12px;
  overflow: hidden;
  background-image: url('/games/edrps/culdesac.webp');
  background-size: cover;
  background-position: center 40%;
  /* Never `fixed`: unsupported and janky on iOS. */
  background-attachment: scroll;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 4px;
}

.rps-fighter {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
  flex: 1;
}
.rps-art {
  height: min(62%, 220px);
  width: auto;
  max-width: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.35));
}
.rps-art--flip { transform: scaleX(-1); }

.rps-throw {
  display: flex;
  align-items: center;
  justify-content: center;
  height: clamp(34px, 11vw, 62px);
  opacity: 0.75;
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.rps-throw.is-shown { opacity: 1; transform: scale(1.1); }

.rps-throw-art {
  height: 100%;
  width: auto;
  max-width: 100%;
  object-fit: contain;
  pointer-events: none;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
}
/* Mirrored so the two hands face each other across the cul-de-sac. */
.rps-throw-art--flip { transform: scaleX(-1); }

/* Waiting-to-throw marker. Drawn, not typed: this replaced ❔/🔒, which rendered as nothing
   on a device whose font lacked them — the same failure that hid the hands themselves. */
.rps-pending {
  display: block;
  width: clamp(20px, 6vw, 30px);
  height: clamp(20px, 6vw, 30px);
  border: 3px dashed #10243a;
  border-radius: 50%;
  /* Opaque, not tinted: at 45% over the cul-de-sac's pale sky the waiting marker was
     effectively invisible, so a player could not tell "opponent is thinking" from
     "nothing is happening". */
  background: #fffdf2;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  position: relative;
}
/* Committed: solid, with a checkmark built from two borders on a rotated box. */
.rps-pending.is-locked {
  border-style: solid;
  border-color: #10243a;
  background: #4caf50;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.rps-pending.is-locked::after {
  content: '';
  position: absolute;
  left: 32%;
  top: 14%;
  width: 26%;
  height: 52%;
  border: solid #fff;
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}

/* Absolutely positioned so a reaction line can never add layout height — otherwise the throw
   buttons reflow under the player's thumb the instant a round resolves. */
.rps-bubble {
  position: absolute;
  top: 2px;
  left: 2px;
  right: 2px;
  margin: 0;
  padding: 5px 8px;
  border: 2px solid #10243a;
  border-radius: 10px;
  background: #fffdf2;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  pointer-events: none;
}

.rps-banner {
  position: absolute;
  left: 50%;
  top: 45%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 4px 12px;
  border-radius: 10px;
  font-size: clamp(14px, 4.5vw, 22px);
  font-weight: 900;
  color: #fff33b;
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000;
  /* Wraps rather than nowrap: the banner names the round winner, and a long username on one
     line would be clipped by the scene's overflow with no way to tell it had been. */
  max-width: 92%;
  text-align: center;
  line-height: 1.15;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.rps-banner.is-win { color: #7dff6b; }
.rps-banner.is-loss { color: #ff8f8f; }

.rps-over {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.62);
  text-align: center;
}
.rps-over-title {
  margin: 0;
  font-size: clamp(26px, 8vw, 44px);
  font-weight: 900;
  font-style: italic;
  /* The abandoned-match variant carries neither modifier, so it needs its own colour. */
  color: #fff;
  text-shadow:
    -2px -2px 0 #000, 0 -2px 0 #000, 2px -2px 0 #000,
    -2px 0 0 #000, 2px 0 0 #000,
    -2px 2px 0 #000, 0 2px 0 #000, 2px 2px 0 #000;
}
.rps-over-title.is-win { color: #fff33b; }
.rps-over-title.is-loss { color: #ff8f8f; }
.rps-over-note { margin: 0; color: #fff; font-size: 13px; font-weight: 700; }
.rps-over .rps-btn { width: min(100%, 280px); }

.rps-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
}
.rps-hand {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 60px;
  min-width: 0;
  padding: 6px 2px;
  border: 3px solid #10243a;
  border-radius: 12px;
  background: #fffdf2;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 0 #10243a;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.12s ease;
  /* The play surface withholds every zoom gesture; the page still scrolls via pan-y on html. */
  touch-action: manipulation;
}
.rps-hand:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 #10243a; }
.rps-hand.is-picked { background: #fff33b; }
.rps-hand:disabled { opacity: 0.45; cursor: not-allowed; }
.rps-hand-art {
  height: clamp(24px, 7vw, 34px);
  width: auto;
  max-width: 100%;
  object-fit: contain;
  /* Without this a tap that lands on the art is swallowed and the throw never registers. */
  pointer-events: none;
}
.rps-hand-label {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  pointer-events: none;
}

.rps-quit { flex-shrink: 0; align-self: center; opacity: 0.75; }

/* Hover is emulated on touch and latches after a tap. A throw button left lit reads as
   "my choice is locked in", which is exactly the wrong signal in a simultaneous game. */
@media (hover: hover) {
  .rps-pick:hover, .rps-room:hover:not(:disabled) { filter: brightness(1.06); }
  .rps-hand:hover:not(:disabled) { background: #fff9c4; }
}
@media (hover: none) {
  .rps-pick:hover, .rps-room:hover, .rps-hand:hover { filter: none; background: #fffdf2; }
  .rps-hand.is-picked:hover { background: #fff33b; }
}

/* On mobile the layout's .main-content is itself `height: auto; overflow-y: auto`, so a lobby
   that scrolls internally is a scroller nested inside the page's own — and on iOS the outer
   page then refuses to scroll until the inner one bottoms out. Let the lobby grow and the page
   scroll instead. Desktop keeps the internal scroll, because there the box is a fixed 682px.
   The match screen is unaffected: it fits its box at every size and never scrolls. */
@media (max-width: 768px) {
  .rps-lobby {
    flex: none;
    overflow-y: visible;
    min-height: 0;
  }
}

/* ── Landscape on a phone that stays in the layout's mobile branch (<=768 wide) ────────
   Stacked, the HUD and controls alone eat 132px of a ~147px box. Side by side, the budget
   only has to cover the taller column instead of their sum. */
@media (max-height: 520px) and (min-width: 560px) {
  .rps-match {
    display: grid;
    grid-template-columns: 1fr minmax(150px, 32%);
    grid-template-rows: auto 1fr;
    grid-template-areas:
      "hud   controls"
      "scene controls";
    gap: 4px;
    /* A 640x360 phone hands this box ~139px. The stacked padding alone costs 14 of them, so
       landscape trims its own rather than inheriting the portrait figure. */
    padding: 4px 6px calc(4px + env(safe-area-inset-bottom));
  }
  .rps-hud { grid-area: hud; }
  .rps-scene { grid-area: scene; }
  .rps-controls {
    grid-area: controls;
    grid-template-columns: 1fr;
    grid-template-rows: repeat(3, 1fr);
    align-content: stretch;
    gap: 4px;
  }
  /* Three rows at 38px plus two 4px gaps is 122px, which clears the box with room to spare;
     44px each overflowed it by 2. Still a comfortably tappable target at full row width. */
  .rps-hand { min-height: 38px; flex-direction: row; gap: 6px; }
  .rps-quit { display: none; }

  /* The scene is down to ~93px here, which is not enough for a reaction bubble AND a result
     banner without them sitting on top of each other. The bubbles win: the pips already show
     the score, so the banner is the redundant one. */
  .rps-banner { display: none; }
  .rps-bubble { font-size: 10px; padding: 3px 6px; }
  .rps-art { height: min(78%, 150px); }
  .rps-throw { height: clamp(22px, 6vw, 34px); }

  .rps-lobby { padding-top: 4px; }
  .rps-title { font-size: clamp(18px, 4vw, 26px); margin-bottom: 4px; }
  .rps-pick-art { height: clamp(48px, 9vw, 72px); }
  .rps-pick-tag { display: none; }
}

/* ── Rotate blocker ───────────────────────────────────────────────────────────────── */
.rps-rotate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: #10243a;
  color: #fff33b;
  text-align: center;
  padding: 24px;
}
/* A drawn phone rather than 📱, on the same reasoning as the hands: this screen exists to be
   understood on an unfamiliar device, which is the worst place to rely on font coverage. */
.rps-rotate-icon {
  display: block;
  width: 44px;
  height: 74px;
  border: 4px solid #fff33b;
  border-radius: 8px;
  position: relative;
  animation: rps-tilt 1.6s ease-in-out infinite;
}
.rps-rotate-icon::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 5px;
  width: 14px;
  height: 3px;
  border-radius: 2px;
  background: #fff33b;
  transform: translateX(-50%);
}
.rps-rotate-text { margin: 0; font-size: 20px; font-weight: 900; font-family: 'Trebuchet MS', sans-serif; }
@keyframes rps-tilt {
  0%, 100% { transform: rotate(-12deg); }
  50% { transform: rotate(12deg); }
}

@media (prefers-reduced-motion: reduce) {
  .rps-spinner, .rps-rotate-icon { animation: none; }
  .rps-throw, .rps-btn, .rps-hand { transition: none; }
}
</style>
