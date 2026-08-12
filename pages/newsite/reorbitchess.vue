<template>
  <div class="rc" ref="wrapper">

    <!-- ── Lobby ─────────────────────────────────────────────────────────────────── -->
    <div v-if="screen === 'lobby'" class="rc-lobby">
      <h1 class="rc-title">ReOrbit<span class="rc-title-big">CHESS!</span></h1>

      <h2 class="rc-h2">Pick your opponent</h2>
      <div class="rc-picks" role="radiogroup" aria-label="Choose an opponent">
        <button
          v-for="c in CHARACTERS"
          :key="c.id"
          type="button"
          role="radio"
          :aria-checked="character === c.id"
          class="rc-pick"
          :class="{ 'is-on': character === c.id }"
          :style="{ '--accent': c.accent }"
          @click="character = c.id"
        >
          <img :src="c.art" :alt="c.name" :width="c.width" :height="c.height" class="rc-pick-art" />
          <span class="rc-pick-name">{{ c.name }}</span>
          <span class="rc-pick-diff">{{ c.difficulty }} &middot; {{ c.elo }} ELO</span>
          <span class="rc-pick-tag">{{ c.tagline }}</span>
        </button>
      </div>

      <button class="rc-btn rc-btn--go" @click="startAi" :disabled="!character">
        Play {{ character ? characterById(character).name : 'the computer' }}
      </button>
      <p class="rc-note">Practice as much as you like. No points, no limits, every day.</p>

      <div class="rc-versus">
        <div class="rc-versus-head">
          <h2 class="rc-h2">Head to head</h2>
          <span class="rc-count">{{ rooms.length }} open</span>
        </div>

        <p v-if="pointsPerWin > 0" class="rc-note rc-note--tight">
          Winner takes <strong>{{ pointsPerWin }}</strong> points, from the same daily pool as
          TKO, gToons Clash and Ed, Edd n Eddy RPS. Draws pay nothing.
        </p>
        <p class="rc-note rc-note--tight">
          {{ Math.round(initialSeconds / 60) }} minutes each, plus {{ incrementSeconds }}s a move.
        </p>

        <button
          v-if="!myRoomId"
          class="rc-btn rc-btn--alt"
          @click="createRoom"
          :disabled="!connected"
        >
          Create a room
        </button>
        <div v-else class="rc-waiting">
          <span class="rc-spinner" aria-hidden="true"></span>
          Waiting for an opponent&hellip;
          <button class="rc-link" @click="leaveRoom">Cancel</button>
        </div>

        <ul v-if="rooms.length" class="rc-rooms">
          <li v-for="r in rooms" :key="r.id">
            <button class="rc-room" @click="joinRoom(r.id)" :disabled="!connected">
              <span class="rc-room-name">{{ r.owner }}</span>
              <span class="rc-room-go">Challenge &rarr;</span>
            </button>
          </li>
        </ul>
        <p v-else-if="!myRoomId" class="rc-empty">
          Nobody's waiting right now. Create a room and the Discord will hear about it.
        </p>
      </div>

      <p v-if="error" class="rc-error" role="alert">{{ error }}</p>
    </div>

    <!-- ── Game ──────────────────────────────────────────────────────────────────── -->
    <div v-else class="rc-game">
      <!-- Opponent HUD. Fixed height: nothing in this row may ever change the board's size. -->
      <header class="rc-hud">
        <img v-if="isAi" :src="oppChar.art" :alt="oppChar.name" class="rc-hud-face" />
        <span class="rc-hud-name">{{ oppName }}</span>
        <ChessClock :ms="oppClockMs" :running="!over && !myTurn" :low="oppClockMs < 30000" />
      </header>

      <!-- Reserved strip: shows captured material by default, the speech bubble when a
           character is talking. Fixed height by construction, so neither can reflow. -->
      <div class="rc-strip">
        <p v-if="bubble" class="rc-bubble">{{ bubble }}</p>
        <span v-else class="rc-material">{{ materialText }}</span>
      </div>

      <!-- One hit-test surface, not 64 buttons. The square is computed from the pointer
           position against this element's rect, which is what makes slide-to-correct
           possible and structurally removes the "tap landed on the art and was swallowed"
           bug the rest of this codebase has patched four times. -->
      <div
        class="rc-board"
        ref="boardEl"
        :style="{ width: boardPx + 'px', height: boardPx + 'px' }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <div
          v-for="(sq, i) in renderSquares"
          :key="sq.name"
          class="rc-sq"
          :class="{
            'is-dark': sq.dark,
            'is-sel': sq.name === selected,
            'is-legal': sq.legal,
            'is-target': sq.name === hoverSquare && selected,
            'is-last': sq.name === lastFrom || sq.name === lastTo,
            'is-check': sq.check
          }"
          :style="{ left: sq.x + 'px', top: sq.y + 'px', width: sqPx + 'px', height: sqPx + 'px' }"
        >
          <span v-if="sq.piece" class="rc-piece" :style="{ backgroundImage: `url(/games/chess/pieces/${sq.piece}.svg)` }"></span>
          <span v-if="sq.legal" class="rc-dot" :class="{ 'is-capture': sq.piece }"></span>
        </div>
      </div>

      <!-- Your HUD. -->
      <footer class="rc-hud rc-hud--mine">
        <span class="rc-hud-name">{{ myName }}</span>
        <ChessClock :ms="myClockMs" :running="!over && myTurn" :low="myClockMs < 30000" />
      </footer>

      <div class="rc-actions">
        <button v-if="!over && !isAi" class="rc-link" @click="offerDraw" :disabled="drawSent">
          {{ drawOfferFrom === 'opponent' ? 'Accept draw' : 'Offer draw' }}
        </button>
        <button v-if="!over" class="rc-link rc-link--warn" @click="confirmQuit = true">
          {{ isAi ? 'Give up' : 'Resign' }}
        </button>
        <button v-if="over" class="rc-btn rc-btn--go rc-btn--sm" @click="backToLobby">Back to the lobby</button>
      </div>

      <p v-if="error" class="rc-error" role="alert">{{ error }}</p>
    </div>

    <!-- Every overlay is teleported to <body>. .site-container carries a transform on
         desktop, which makes it the containing block for any position:fixed descendant and
         then clips it with overflow:hidden — a fixed overlay left inside the page renders
         trapped in the scaled box. -->
    <Teleport to="body">
      <div v-if="promotionFrom" class="rc-sheet" @click.self="cancelPromotion">
        <div class="rc-sheet-box">
          <p class="rc-sheet-title">Promote to&hellip;</p>
          <div class="rc-sheet-row">
            <button
              v-for="p in PROMOTION_PIECES"
              :key="p"
              class="rc-sheet-pick"
              @click="choosePromotion(p)"
            >
              <span class="rc-piece" :style="{ backgroundImage: `url(/games/chess/pieces/${myColor}${p}.svg)` }"></span>
            </button>
          </div>
          <button class="rc-link" @click="cancelPromotion">Cancel</button>
        </div>
      </div>

      <div v-if="confirmQuit" class="rc-sheet" @click.self="confirmQuit = false">
        <div class="rc-sheet-box">
          <p class="rc-sheet-title">{{ isAi ? 'Give up this game?' : 'Resign this game?' }}</p>
          <p class="rc-sheet-note" v-if="!isAi">Your opponent wins, and takes the points.</p>
          <div class="rc-sheet-row">
            <button class="rc-btn rc-btn--alt rc-btn--sm" @click="confirmQuit = false">Keep playing</button>
            <button class="rc-btn rc-btn--go rc-btn--sm" @click="doQuit">{{ isAi ? 'Give up' : 'Resign' }}</button>
          </div>
        </div>
      </div>

      <div v-if="over" class="rc-sheet rc-sheet--result">
        <div class="rc-sheet-box">
          <p class="rc-over-title" :class="resultClass">{{ resultTitle }}</p>
          <p class="rc-over-why">{{ resultWhy }}</p>
          <p v-if="pointsAwarded > 0" class="rc-over-points">+{{ pointsAwarded }} points</p>
          <p v-else-if="suppressReason" class="rc-over-note">{{ SUPPRESS_COPY[suppressReason] || 'No points for this one.' }}</p>
          <button class="rc-btn rc-btn--go" @click="backToLobby">Back to the lobby</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { io as ioClient } from 'socket.io-client'
import { Chess } from 'chess.js'
import {
  CHARACTERS, PROMOTION_PIECES, characterById, pickLine
} from '~/lib/reorbitChess'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  // The board is square and HEIGHT-bound, not width-bound: on a 360x640 phone the layout
  // leaves ~396px, and a board sized from the width would be 336px tall with 60px left for
  // two clocks, a bubble and a resign control. Hiding the sidebar and footer is worth ~67px;
  // the page CSS below reclaims the topbar too, which is worth far more.
  showSidebar: false,
  showFooter: false,
  mainContentBorder: false,
  ssr: false,
  title: 'ReOrbit Chess!',
  description: 'Play chess against Ed, Courage\'s computer and Mandark, or take on another player for points on Cartoon ReOrbit.'
})

useHead({
  htmlAttrs: { class: 'rc-page' },
  meta: [{
    name: 'viewport',
    // viewport-fit=cover so env(safe-area-inset-*) resolves to something other than 0 — the
    // site-wide viewport in nuxt.config omits it. Deliberately NOT user-scalable=no: on a
    // board with ~37px squares, pinch is the player's only recourse and disabling it is a
    // WCAG 1.4.4 failure. touch-action on the board blocks the gestures that actually hurt.
    content: 'width=device-width, initial-scale=1, viewport-fit=cover'
  }]
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const runtime = useRuntimeConfig()

const SUPPRESS_COPY = {
  cap_exhausted: "You've hit today's PvP points cap. Still counts as a win!",
  pair_limit: "You've already traded points with this player today.",
  same_device: 'No points: you and your opponent look like the same device.',
  too_short: 'No points — that game was too short to count.',
  forfeit: 'No points — your opponent left.',
  abandoned: 'No points — the game was abandoned.',
  draw: 'Draws pay no points.',
  banned: 'No points awarded.'
}

/* ── State ───────────────────────────────────────────────────────────────────────── */
const screen = ref('lobby')
const character = ref('ed')
const rooms = ref([])
const myRoomId = ref(null)
const connected = ref(false)
const error = ref('')
const wrapper = ref(null)
const boardEl = ref(null)

const isAi = ref(false)
const chess = ref(new Chess())
const fen = ref(chess.value.fen())
const myColor = ref('w')
const myName = ref('You')
const oppName = ref('Opponent')
const ply = ref(0)
const lastFrom = ref(null)
const lastTo = ref(null)
const selected = ref(null)
const hoverSquare = ref(null)
const legalTargets = ref([])
const promotionFrom = ref(null)
const promotionTo = ref(null)
const confirmQuit = ref(false)
const bubble = ref('')
const lastLine = ref('')
const over = ref(false)
const resultTitle = ref('')
const resultWhy = ref('')
const resultClass = ref('')
const pointsAwarded = ref(0)
const suppressReason = ref(null)
const drawSent = ref(false)
const drawOfferFrom = ref(null)
const thinking = ref(false)

const pointsPerWin = ref(0)
const initialSeconds = ref(300)
const incrementSeconds = ref(3)

// Clocks. The server is the authority and sends absolute values; these are interpolated for
// display only and resynced on every position.
const clockBase = ref({ mine: 0, theirs: 0, turnStartedAt: 0, skew: 0 })
const nowMs = ref(Date.now())

const oppChar = computed(() => characterById(character.value))
const myTurn = computed(() => chess.value.turn() === myColor.value)

const myClockMs = computed(() => clockMs(true))
const oppClockMs = computed(() => clockMs(false))

function clockMs (mine) {
  const b = clockBase.value
  const base = mine ? b.mine : b.theirs
  if (over.value || !b.turnStartedAt) return Math.max(0, base)
  const isTicking = mine ? myTurn.value : !myTurn.value
  if (!isTicking) return Math.max(0, base)
  return Math.max(0, base - (nowMs.value + b.skew - b.turnStartedAt))
}

/* ── Board geometry ──────────────────────────────────────────────────────────────────
 * The board is sized from a MEASURED height, never from a viewport unit. `dvh` reflows
 * continuously as the URL bar slides, which would resize the board under a finger mid-move;
 * `svh` throws away ~60px; and a percentage resolves against .main-content, which is
 * height:auto on mobile. visualViewport reports the height actually visible and fires resize
 * when that changes, which is what makes it immune to the toolbar sliding in and out. */
const boardPx = ref(320)
// boardPx is always a multiple of 8, so this is an integer and every square is identical.
const sqPx = computed(() => boardPx.value / 8)

// A pending resize is held while a piece is selected: if the URL bar collapses mid-move,
// every legal-move dot would relocate out from under a finger already travelling.
let pendingResize = false

function measure () {
  if (selected.value) { pendingResize = true; return }
  const el = wrapper.value
  if (!el) return
  const vv = window.visualViewport
  const viewportH = vv ? vv.height : window.innerHeight
  const top = el.getBoundingClientRect().top
  const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rc-safe-b')) || 0
  // Chrome reserved by this page's own furniture: two 34px HUD rows, the 26px strip, the
  // 34px action row, gaps and padding.
  const FURNITURE = 34 + 34 + 26 + 34 + 22
  const availH = viewportH - top - FURNITURE - safeBottom
  const availW = el.clientWidth - 8
  // Snapped to a multiple of 8. Browsers round fractional grid tracks inconsistently, which
  // leaves 1px seams and a last file a pixel narrower than the rest — and every hit-test here
  // is computed from the rect, so an uneven track means taps near a boundary resolve wrong.
  boardPx.value = Math.max(160, Math.floor(Math.min(availW, availH) / 8) * 8)
}

let resizeTimer = null
function onResize () {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(measure, 100)
}

/* ── Rendering ───────────────────────────────────────────────────────────────────────
 * The flip for Black is an index transform, never a CSS rotation: a rotated board would
 * invalidate the getBoundingClientRect() maths every pointer handler depends on. */
const FILES = 'abcdefgh'

const renderSquares = computed(() => {
  const board = chess.value.board()
  const flip = myColor.value === 'b'
  const out = []
  const size = sqPx.value
  const checkSq = chess.value.inCheck() ? kingSquare(chess.value.turn()) : null
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rank = flip ? r : 7 - r
      const file = flip ? 7 - f : f
      const cell = board[7 - rank][file]
      const name = FILES[file] + (rank + 1)
      out.push({
        name,
        x: f * size,
        y: r * size,
        dark: (rank + file) % 2 === 0,
        piece: cell ? (cell.color + cell.type) : null,
        legal: legalTargets.value.includes(name),
        check: name === checkSq
      })
    }
  }
  return out
})

function kingSquare (color) {
  for (const row of chess.value.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square
    }
  }
  return null
}

const materialText = computed(() => {
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 }
  let diff = 0
  for (const row of chess.value.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue
      diff += (cell.color === myColor.value ? 1 : -1) * (VAL[cell.type] || 0)
    }
  }
  if (diff === 0) return 'Material even'
  return diff > 0 ? `You're up ${diff}` : `You're down ${-diff}`
})

/* ── Pointer input ───────────────────────────────────────────────────────────────────
 * Tap-to-select then tap-to-move, with slide-to-correct: the destination follows the finger
 * while it is down and only commits on release. At ~37px squares a fat-fingered tap onto an
 * adjacent LEGAL square is an instantly committed blunder with points on the line, and being
 * able to slide before letting go is what makes squares below the 44px touch minimum
 * survivable. */
function squareAt (clientX, clientY) {
  const rect = boardEl.value?.getBoundingClientRect()
  if (!rect) return null
  const size = rect.width / 8
  const f = Math.floor((clientX - rect.left) / size)
  const r = Math.floor((clientY - rect.top) / size)
  if (f < 0 || f > 7 || r < 0 || r > 7) return null
  const flip = myColor.value === 'b'
  const rank = flip ? r : 7 - r
  const file = flip ? 7 - f : f
  return FILES[file] + (rank + 1)
}

function onPointerDown (e) {
  if (over.value || !myTurn.value || thinking.value) return
  const name = squareAt(e.clientX, e.clientY)
  if (!name) return
  boardEl.value.setPointerCapture?.(e.pointerId)

  if (selected.value && legalTargets.value.includes(name)) {
    hoverSquare.value = name
    return
  }
  const piece = chess.value.get(name)
  if (piece && piece.color === myColor.value) {
    selected.value = name
    hoverSquare.value = null
    legalTargets.value = chess.value.moves({ square: name, verbose: true }).map(m => m.to)
  } else {
    clearSelection()
  }
}

function onPointerMove (e) {
  if (!selected.value) return
  const name = squareAt(e.clientX, e.clientY)
  hoverSquare.value = name && legalTargets.value.includes(name) ? name : null
}

function onPointerUp (e) {
  if (!selected.value) return
  const name = squareAt(e.clientX, e.clientY) || hoverSquare.value
  if (!name) return
  if (name === selected.value) {
    // Tapping the selected piece again deselects. The large-target affordance for "I picked
    // the wrong piece" is anywhere that is not a legal destination.
    clearSelection()
    return
  }
  if (legalTargets.value.includes(name)) {
    attemptMove(selected.value, name)
  } else {
    const piece = chess.value.get(name)
    if (piece && piece.color === myColor.value) {
      // Re-selecting another of your own pieces never requires a deselect tap first.
      selected.value = name
      legalTargets.value = chess.value.moves({ square: name, verbose: true }).map(m => m.to)
      hoverSquare.value = null
      return
    }
    clearSelection()
  }
}

function onPointerCancel () { clearSelection() }

function clearSelection () {
  selected.value = null
  hoverSquare.value = null
  legalTargets.value = []
  if (pendingResize) { pendingResize = false; nextTick(measure) }
}

function attemptMove (from, to) {
  const moves = chess.value.moves({ square: from, verbose: true })
  const match = moves.find(m => m.to === to)
  if (!match) { clearSelection(); return }
  if (match.promotion) {
    promotionFrom.value = from
    promotionTo.value = to
    return
  }
  commitMove(from, to, null)
}

function choosePromotion (piece) {
  const from = promotionFrom.value
  const to = promotionTo.value
  promotionFrom.value = null
  promotionTo.value = null
  commitMove(from, to, piece)
}

function cancelPromotion () {
  promotionFrom.value = null
  promotionTo.value = null
  clearSelection()
}

function commitMove (from, to, promotion) {
  let applied = null
  try {
    applied = chess.value.move({ from, to, promotion: promotion || undefined })
  } catch { applied = null }
  if (!applied) { clearSelection(); return }

  clearSelection()
  lastFrom.value = applied.from
  lastTo.value = applied.to
  fen.value = chess.value.fen()
  ply.value++

  if (isAi.value) {
    if (applied.promotion) say('playerPromote')
    else if (chess.value.inCheck()) say('inCheck')
    else if (applied.captured) say('lostPiece')
    if (checkAiGameOver()) return
    scheduleAiMove()
  } else {
    // The server is the authority. The local board is applied optimistically so the piece
    // moves under the finger that moved it rather than after a round trip; if the server
    // disagrees it sends a sync, which replaces the board wholesale. That sync is the only
    // rollback needed — trying to also unwind locally would fight it.
    socket?.emit('reorbitchess:move', { ply: ply.value - 1, from, to, promotion: promotion || undefined })
  }
}

/* ── Dialogue ────────────────────────────────────────────────────────────────────── */
let bubbleTimer = null
function say (event) {
  if (!isAi.value) return
  const line = pickLine(character.value, event, lastLine.value)
  if (!line) return
  lastLine.value = line
  bubble.value = line
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => { bubble.value = '' }, 2800)
}

/* ── AI mode ─────────────────────────────────────────────────────────────────────── */
let worker = null
let workerSeq = 0
let slowTimer = null
const aiHistory = []

function ensureWorker () {
  if (worker) return worker
  // new URL(..., import.meta.url) is the form Vite statically analyses, so the engine ships
  // as its own chunk rather than in the bundle for every other route.
  worker = new Worker(new URL('../../lib/reorbitChessWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const { id, move } = e.data || {}
    if (id !== workerSeq) return // a stale reply from a game we already left
    applyAiMove(move)
  }
  return worker
}

function scheduleAiMove () {
  thinking.value = true
  const persona = character.value
  const started = Date.now()
  const seq = ++workerSeq
  const w = ensureWorker()
  w.postMessage({ id: seq, fen: chess.value.fen(), persona, history: aiHistory.slice(-8) })

  // A character that answers instantly reads as a lookup table rather than an opponent, so
  // the reply is held back to a minimum think time. The engine's own budget usually covers
  // this on a phone; on a fast desktop it rarely does.
  pendingThinkStart = started
}

let pendingThinkStart = 0
// The AI's evaluation at its previous turn, used to notice when the PLAYER blunders.
let lastAiScore = null

function applyAiMove (move) {
  const persona = characterById(character.value)
  const [minMs, maxMs] = { ed: [500, 1400], computer: [700, 1800], mandark: [900, 2200] }[persona.id] || [700, 1800]
  const target = minMs + Math.random() * (maxMs - minMs)
  const wait = Math.max(0, target - (Date.now() - pendingThinkStart))

  setTimeout(() => {
    thinking.value = false
    let applied = null
    if (move) {
      try {
        applied = chess.value.move({ from: move.from, to: move.to, promotion: move.promotion || undefined })
      } catch { applied = null }
    }
    if (!applied) {
      // The engine is only ever a suggestion; chess.js is what actually moves the piece. A
      // null or illegal suggestion degrades to a random legal move rather than wedging the
      // game — see the header of lib/reorbitChessEngine.js.
      const legal = chess.value.moves({ verbose: true })
      if (!legal.length) { checkAiGameOver(); return }
      applied = chess.value.move(legal[Math.floor(Math.random() * legal.length)])
    }

    aiHistory.push(applied.from + applied.to)
    lastFrom.value = applied.from
    lastTo.value = applied.to
    fen.value = chess.value.fen()
    ply.value++

    if (checkAiGameOver()) return

    const meta = move && move.meta
    // The AI's own evaluation, tracked across its turns, is what detects a PLAYER blunder:
    // if its position improved sharply since its last move, the swing came from the move the
    // player just made. `bestScore` rather than `score` so a persona's own deliberate
    // blunder on the previous turn doesn't read as the player having done something good.
    const jumped = meta && lastAiScore !== null && (meta.bestScore - lastAiScore) > 200
    if (meta) lastAiScore = meta.bestScore

    if (applied.promotion) say('aiPromote')
    else if (chess.value.inCheck()) say('check')
    else if (jumped) say('playerBlunder')
    else if (applied.captured) say('capture')
    else {
      // The AI's own telemetry drives self-aware lines: a persona that just threw a piece
      // away on purpose says so, which is most of what makes Ed feel like a person.
      if (meta && meta.deliberateBlunder) say('losing')
      else say(evalMood(meta))
    }
    armSlowNudge()
  }, wait)
}

function evalMood (meta) {
  if (!meta) return 'move'
  if (meta.score > 400) return 'winning'
  if (meta.score < -400) return 'losing'
  return 'move'
}

function armSlowNudge () {
  clearTimeout(slowTimer)
  slowTimer = setTimeout(() => { if (!over.value && myTurn.value) say('slow') }, 25000)
}

function checkAiGameOver () {
  const c = chess.value
  if (!c.isGameOver()) return false
  clearTimeout(slowTimer)
  if (c.isCheckmate()) {
    const iWon = c.turn() !== myColor.value
    finishAi(iWon ? 'You win!' : 'You lose!', 'Checkmate.', iWon ? 'is-win' : 'is-loss')
    say(iWon ? 'loss' : 'win')
  } else if (c.isStalemate()) {
    finishAi('Draw', 'Stalemate — no legal moves.', 'is-draw'); say('draw')
  } else if (c.isInsufficientMaterial()) {
    finishAi('Draw', 'Not enough material to mate.', 'is-draw'); say('draw')
  } else if (c.isThreefoldRepetition()) {
    finishAi('Draw', 'Threefold repetition.', 'is-draw'); say('draw')
  } else {
    finishAi('Draw', 'Fifty-move rule.', 'is-draw'); say('draw')
  }
  return true
}

function finishAi (title, why, cls) {
  over.value = true
  resultTitle.value = title
  resultWhy.value = why
  resultClass.value = cls
  pointsAwarded.value = 0
  // Practice games never pay, so there is no suppression to explain — saying "no points"
  // after every friendly game would read as a punishment rather than a rule.
  suppressReason.value = null
}

function startAi () {
  if (!character.value) return
  isAi.value = true
  screen.value = 'game'
  chess.value = new Chess()
  fen.value = chess.value.fen()
  // The player is always White against the AI: an opponent that opens before you have looked
  // at the board is a bad first impression, and this is the mode people meet first.
  myColor.value = 'w'
  myName.value = 'You'
  oppName.value = characterById(character.value).name
  resetGameState()
  clockBase.value = { mine: 0, theirs: 0, turnStartedAt: 0, skew: 0 }
  nextTick(measure)
  say('greeting')
  armSlowNudge()
}

function resetGameState () {
  ply.value = 0
  lastFrom.value = null
  lastTo.value = null
  over.value = false
  pointsAwarded.value = 0
  suppressReason.value = null
  drawSent.value = false
  drawOfferFrom.value = null
  thinking.value = false
  aiHistory.length = 0
  lastAiScore = null
  clearSelection()
}

/* ── Socket ──────────────────────────────────────────────────────────────────────── */
let socket = null

function applyServerView (v) {
  myColor.value = v.youAreWhite ? 'w' : 'b'
  myName.value = v.you.username
  oppName.value = v.opponent.username
  chess.value = new Chess(v.fen)
  fen.value = v.fen
  ply.value = v.ply
  lastFrom.value = v.lastMove?.from || null
  lastTo.value = v.lastMove?.to || null
  drawOfferFrom.value = v.drawOfferFrom
  initialSeconds.value = v.initialSeconds
  incrementSeconds.value = v.incrementSeconds
  clockBase.value = {
    mine: v.you.ms,
    theirs: v.opponent.ms,
    turnStartedAt: v.turnStartedAt,
    // The server's clock and the browser's can differ by seconds. Everything is measured
    // against the server's own `now`, so a skewed device still counts down to the same
    // instant the server will flag on.
    skew: v.serverNow - Date.now()
  }
  // A fresh position from the server supersedes anything applied optimistically.
  clearSelection()
}

function connectSocket () {
  const url = import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`
  socket = ioClient(url, { withCredentials: true, reconnectionDelayMax: 5000 })

  socket.on('connect', () => {
    connected.value = true
    socket.emit('reorbitchess:subscribe')
  })
  socket.on('disconnect', () => { connected.value = false })

  socket.on('reorbitchess:rooms', (list) => { rooms.value = list })
  socket.on('reorbitchess:roomAdded', (r) => {
    if (!rooms.value.some(x => x.id === r.id)) rooms.value = [r, ...rooms.value]
  })
  socket.on('reorbitchess:roomRemoved', ({ id }) => {
    rooms.value = rooms.value.filter(r => r.id !== id)
    if (myRoomId.value === id) myRoomId.value = null
  })
  socket.on('reorbitchess:config', (cfg) => {
    pointsPerWin.value = cfg?.pointsPerWin ?? 0
    initialSeconds.value = cfg?.initialSeconds ?? 300
    incrementSeconds.value = cfg?.incrementSeconds ?? 3
  })
  socket.on('reorbitchess:roomCreated', ({ id }) => { myRoomId.value = id })

  socket.on('reorbitchess:gameStart', (v) => {
    isAi.value = false
    screen.value = 'game'
    myRoomId.value = null
    resetGameState()
    applyServerView(v)
    nextTick(measure)
  })
  socket.on('reorbitchess:position', (v) => { applyServerView(v) })
  socket.on('reorbitchess:sync', (v) => { applyServerView(v) })
  socket.on('reorbitchess:drawOffered', () => { drawOfferFrom.value = 'opponent' })
  socket.on('reorbitchess:drawDeclined', () => { drawSent.value = false; error.value = 'Draw declined.' })
  socket.on('reorbitchess:opponentDropped', ({ graceMs }) => {
    error.value = `Opponent disconnected — they have ${Math.round(graceMs / 1000)}s to return.`
  })
  socket.on('reorbitchess:opponentReturned', () => { error.value = '' })

  socket.on('reorbitchess:gameEnd', (v) => {
    applyServerView(v)
    over.value = true
    pointsAwarded.value = v.pointsAwarded || 0
    suppressReason.value = v.suppressReason || null
    if (v.drawn) {
      resultTitle.value = 'Draw'
      resultClass.value = 'is-draw'
    } else {
      resultTitle.value = v.won ? 'You win!' : 'You lose!'
      resultClass.value = v.won ? 'is-win' : 'is-loss'
    }
    resultWhy.value = END_COPY[v.endReason] || ''
  })

  socket.on('reorbitchess:error', (e) => { error.value = e?.message || 'Something went wrong.' })
}

const END_COPY = {
  checkmate: 'Checkmate.',
  resign: 'By resignation.',
  flag: 'On time.',
  stalemate: 'Stalemate — no legal moves.',
  threefold: 'Threefold repetition.',
  fiftymove: 'Fifty-move rule.',
  insufficient: 'Not enough material to mate.',
  agreement: 'By agreement.',
  forfeit: 'Your opponent left the game.',
  sweep: 'The game was abandoned.'
}

function createRoom () { error.value = ''; socket?.emit('reorbitchess:createRoom') }
function joinRoom (id) { error.value = ''; socket?.emit('reorbitchess:joinRoom', { roomId: id }) }
function leaveRoom () { socket?.emit('reorbitchess:leave'); myRoomId.value = null }

function offerDraw () {
  if (drawOfferFrom.value === 'opponent') {
    socket?.emit('reorbitchess:respondDraw', { accept: true })
    return
  }
  drawSent.value = true
  socket?.emit('reorbitchess:offerDraw')
}

function doQuit () {
  confirmQuit.value = false
  if (isAi.value) { backToLobby(); return }
  socket?.emit('reorbitchess:resign')
}

function backToLobby () {
  if (!isAi.value && !over.value) socket?.emit('reorbitchess:leave')
  screen.value = 'lobby'
  over.value = false
  isAi.value = false
  bubble.value = ''
  clearTimeout(slowTimer)
  clearTimeout(bubbleTimer)
  workerSeq++ // orphan any in-flight AI reply
  socket?.emit('reorbitchess:listRooms')
}

/* ── Lifecycle ───────────────────────────────────────────────────────────────────── */
let tick = null
let wakeLock = null

async function requestWakeLock () {
  // A player can legitimately think for 40 seconds. Without this the screen sleeps and they
  // lose on time to their own phone.
  try { wakeLock = await navigator.wakeLock?.request('screen') } catch { wakeLock = null }
}

function onVisibility () {
  if (document.visibilityState === 'visible') {
    // A backgrounded tab's timers are throttled, so the local clock drifts. Ask the server
    // for the truth rather than trusting what is on screen.
    if (screen.value === 'game' && !isAi.value && !over.value) socket?.emit('reorbitchess:sync')
    if (screen.value === 'game') requestWakeLock()
  }
}

onMounted(() => {
  connectSocket()
  measure()
  window.addEventListener('orientationchange', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  tick = setInterval(() => { nowMs.value = Date.now() }, 200)
  document.documentElement.style.setProperty('--rc-safe-b', 'env(safe-area-inset-bottom, 0px)')
})

onBeforeUnmount(() => {
  clearInterval(tick)
  clearTimeout(resizeTimer)
  clearTimeout(slowTimer)
  clearTimeout(bubbleTimer)
  window.removeEventListener('orientationchange', onResize)
  window.visualViewport?.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
  worker?.terminate()
  wakeLock?.release?.().catch(() => {})
  socket?.emit('reorbitchess:leave')
  socket?.disconnect()
})

watch(screen, (s) => { if (s === 'game') { requestWakeLock(); nextTick(measure) } })
</script>

<style>
/* Gated on the html class set by useHead above. An ungated global rule here would leak to
   every other page the moment this route's chunk loads. */
html.rc-page {
  background: #0b1b2b !important;
}
/* showAdbar/showNav only set visibility:hidden, which keeps the layout box — ~244px of blank
   space on a phone. The board is height-bound, so reclaiming this is worth more than every
   other sizing fix combined. */
html.rc-page .topbar { display: none !important; }
html.rc-page body { background: transparent !important; }
</style>

<style scoped>
/* ── Early-2000s Cartoon Network Flash palette ──────────────────────────────────────
   Saturated primaries, heavy black keylines, chunky bevels and a chrome-gradient title —
   the look of a game embedded in a portal page around 2003. Fonts are system stacks only:
   a webfont that fails to load leaves an unstyled board with no fallback to notice. */
.rc {
  --ink: #14110d;
  --board-light: #e8d6a8;
  --board-dark: #7a5c3a;
  --frame: #3b2a17;
  --panel: #12314f;
  --panel-2: #0b2238;
  --hot: #f5a623;
  --hot-2: #d97b0d;
  --go: #58b830;
  --go-2: #3d8a1f;
  --warn: #d8412f;
  --sel: #f5e04a;
  --legal: #4fd1e0;
  --font-head: 'Arial Black', 'Arial Bold', Gadget, Impact, sans-serif;
  --font-body: Verdana, Geneva, Tahoma, sans-serif;

  font-family: var(--font-body);
  color: #fff;
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
  padding-left: calc(4px + env(safe-area-inset-left, 0px));
  padding-right: calc(4px + env(safe-area-inset-right, 0px));
  max-width: 760px;
  margin: 0 auto;
  /* Blocks pan and double-tap zoom — select-then-tap-adjacent within 300ms IS a double tap,
     and Safari would zoom. Pinch is deliberately still allowed. */
  touch-action: pinch-zoom;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
/* Safari ignores the unprefixed property, so the prefixed one is not optional: a drag that
   starts on the board otherwise leaves a live selection that swallows the next tap. */
.rc ::selection { background: transparent; }

/* ── Lobby ─────────────────────────────────────────────────────────────────────── */
.rc-title {
  font-family: var(--font-head);
  text-align: center;
  line-height: 0.88;
  margin: 4px 0 10px;
  font-size: clamp(20px, 7vw, 34px);
  color: #bfe3ff;
  text-transform: uppercase;
  letter-spacing: 1px;
  text-shadow: 0 2px 0 #06121f, 0 4px 0 rgba(0, 0, 0, 0.4);
}
.rc-title-big {
  display: block;
  font-size: clamp(34px, 13vw, 64px);
  background: linear-gradient(#fff 8%, var(--hot) 45%, var(--hot-2) 55%, #fff5cf 96%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-stroke: 2px var(--ink);
  paint-order: stroke fill;
  filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.45));
}
.rc-h2 {
  font-family: var(--font-head);
  font-size: 15px;
  text-transform: uppercase;
  margin: 12px 0 6px;
  color: #ffe9b8;
}
.rc-picks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.rc-pick {
  position: relative;
  background: linear-gradient(var(--panel), var(--panel-2));
  border: 3px solid var(--ink);
  border-radius: 10px;
  padding: 6px 4px 8px;
  color: #fff;
  text-align: center;
  cursor: pointer;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.22), 0 3px 0 var(--ink);
  min-height: 44px;
}
.rc-pick.is-on {
  background: linear-gradient(var(--accent), #000);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35), 0 0 0 3px var(--hot), 0 3px 0 var(--ink);
}
/* pointer-events off so a tap landing on the sprite still reaches the button. */
.rc-pick-art { display: block; margin: 0 auto; height: 74px; width: auto; pointer-events: none; }
.rc-pick-name { display: block; font-family: var(--font-head); font-size: 12px; margin-top: 4px; }
.rc-pick-diff { display: block; font-size: 9px; color: var(--hot); font-weight: bold; }
.rc-pick-tag { display: none; }

.rc-btn {
  display: block;
  width: 100%;
  margin: 10px 0 4px;
  padding: 12px 14px;
  font-family: var(--font-head);
  font-size: 16px;
  text-transform: uppercase;
  color: #fff;
  border: 3px solid var(--ink);
  border-radius: 10px;
  cursor: pointer;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 4px 0 var(--ink);
  min-height: 46px;
}
.rc-btn--go { background: linear-gradient(var(--go), var(--go-2)); }
.rc-btn--alt { background: linear-gradient(var(--hot), var(--hot-2)); }
.rc-btn--sm { font-size: 13px; padding: 9px 12px; width: auto; min-height: 44px; }
.rc-btn:active { transform: translateY(3px); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.3), 0 1px 0 var(--ink); }
.rc-btn:disabled { opacity: 0.5; cursor: default; }

.rc-note { font-size: 11px; color: #b9d4ea; text-align: center; margin: 2px 0 8px; }
.rc-note--tight { margin: 2px 0 4px; }
.rc-versus { margin-top: 14px; border-top: 3px solid rgba(255, 255, 255, 0.15); padding-top: 6px; }
.rc-versus-head { display: flex; align-items: baseline; justify-content: space-between; }
.rc-count { font-size: 11px; color: var(--hot); font-weight: bold; }
.rc-rooms { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 6px; }
.rc-room {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px;
  min-height: 46px;
  background: linear-gradient(var(--panel), var(--panel-2));
  border: 3px solid var(--ink);
  border-radius: 8px;
  color: #fff;
  font-family: var(--font-body);
  cursor: pointer;
}
.rc-room-name { font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rc-room-go { color: var(--hot); font-size: 11px; white-space: nowrap; }
.rc-empty { font-size: 11px; color: #91b2cc; text-align: center; margin-top: 8px; }
.rc-waiting { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 12px; margin: 10px 0; }
.rc-spinner {
  width: 12px; height: 12px; border: 3px solid var(--hot); border-top-color: transparent;
  border-radius: 50%; animation: rc-spin 0.8s linear infinite;
}
@keyframes rc-spin { to { transform: rotate(360deg); } }
.rc-link { background: none; border: none; color: var(--hot); font-size: 12px; text-decoration: underline; cursor: pointer; padding: 10px 8px; min-height: 44px; }
.rc-link--warn { color: #ff9a8f; }
.rc-error { color: #ffd4cf; background: rgba(216, 65, 47, 0.25); border: 2px solid var(--warn); border-radius: 6px; font-size: 11px; padding: 6px 8px; margin-top: 8px; text-align: center; }

/* ── Game ──────────────────────────────────────────────────────────────────────── */
.rc-game { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rc-hud {
  height: 34px;
  width: 100%;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px;
  background: linear-gradient(var(--panel), var(--panel-2));
  border: 3px solid var(--ink);
  border-radius: 8px;
  box-sizing: border-box;
}
.rc-hud-face { height: 26px; width: auto; }
.rc-hud-name { font-weight: bold; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

/* Fixed height by construction. A bubble that grows would shrink the board, and on a board
   being tapped that means the destination square slides out from under a moving finger. */
.rc-strip {
  height: 26px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.rc-bubble {
  margin: 0;
  max-width: 100%;
  padding: 3px 10px;
  background: #fffbe8;
  color: var(--ink);
  border: 2px solid var(--ink);
  border-radius: 12px;
  font-size: 11px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.rc-material { font-size: 11px; color: #9fc3dd; }

.rc-board {
  position: relative;
  border: 4px solid var(--frame);
  border-radius: 4px;
  box-shadow: 0 0 0 3px var(--ink), 0 6px 0 rgba(0, 0, 0, 0.35);
  box-sizing: content-box;
  flex: none;
  background: var(--board-light);
}
/* Squares are absolutely positioned from a computed px offset rather than a grid, and carry
   no border: 64 x 1px borders would add 8px across the board and break the hit-test maths,
   which is derived from the rect. */
.rc-sq {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rc-sq.is-dark { background: var(--board-dark); }
.rc-sq:not(.is-dark) { background: var(--board-light); }
.rc-sq.is-last { box-shadow: inset 0 0 0 3px rgba(245, 224, 74, 0.55); }
.rc-sq.is-sel { box-shadow: inset 0 0 0 4px var(--sel); }
.rc-sq.is-target { box-shadow: inset 0 0 0 4px var(--legal); }
/* Check is signalled by a ring AND a colour wash, never colour alone. */
.rc-sq.is-check { background: #e0553f; box-shadow: inset 0 0 0 4px #ffdc6b; }

.rc-piece {
  width: 92%;
  height: 92%;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  pointer-events: none;
}
/* Two-tone so the dot never disappears against one of the square colours. */
.rc-dot {
  position: absolute;
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: rgba(20, 17, 13, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.65);
  pointer-events: none;
}
.rc-dot.is-capture {
  width: 92%;
  height: 92%;
  background: none;
  border: 4px solid rgba(79, 209, 224, 0.9);
  border-radius: 50%;
}

.rc-actions { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 34px; }

/* ── Sheets ────────────────────────────────────────────────────────────────────── */
.rc-sheet {
  position: fixed;
  inset: 0;
  background: rgba(4, 12, 20, 0.82);
  z-index: 9999;
  display: flex;
  /* flex-start, not center: a sheet taller than the screen would otherwise push its own top
     out of the scroll range where it can never be reached. */
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 16px;
}
.rc-sheet-box {
  /* Teleported to <body>, so the tokens defined on .rc are out of scope and are restated. */
  --ink: #14110d;
  --hot: #f5a623;
  margin: auto;
  background: linear-gradient(#12314f, #0b2238);
  border: 4px solid var(--ink);
  border-radius: 12px;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.5);
  padding: 16px;
  max-width: 340px;
  width: 100%;
  text-align: center;
  color: #fff;
  font-family: Verdana, Geneva, Tahoma, sans-serif;
}
.rc-sheet-title { font-family: 'Arial Black', Impact, sans-serif; font-size: 16px; margin: 0 0 10px; text-transform: uppercase; }
.rc-sheet-note { font-size: 11px; color: #b9d4ea; margin: 0 0 10px; }
.rc-sheet-row { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.rc-sheet-pick {
  width: 64px; height: 64px;
  background: #e8d6a8;
  border: 3px solid var(--ink);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.rc-over-title { font-family: 'Arial Black', Impact, sans-serif; font-size: 26px; margin: 0 0 6px; text-transform: uppercase; }
.rc-over-title.is-win { color: #8ff06a; }
.rc-over-title.is-loss { color: #ff8f7f; }
.rc-over-title.is-draw { color: #ffd98a; }
.rc-over-why { font-size: 12px; color: #cfe4f5; margin: 0 0 8px; }
.rc-over-points { font-family: 'Arial Black', Impact, sans-serif; color: var(--hot); font-size: 18px; margin: 0 0 8px; }
.rc-over-note { font-size: 11px; color: #b9d4ea; margin: 0 0 8px; }

/* Hover is emulated on touch and latches after a tap — on a chess board a stuck hover
   highlight reads as "this square is selected", which is actively misleading. */
@media (hover: hover) {
  .rc-room:hover, .rc-pick:hover { filter: brightness(1.15); }
}
@media (prefers-reduced-motion: reduce) {
  .rc-spinner { animation: none; }
  .rc-btn:active { transform: none; }
}
@media (min-width: 620px) {
  .rc-pick-tag { display: block; font-size: 10px; color: #b9d4ea; margin-top: 2px; }
  .rc-pick-art { height: 110px; }
}
</style>
