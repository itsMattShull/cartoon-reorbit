<!-- components/OgGtoonMatchBoard.vue -->
<template>
  <div class="oggtoons-board text-white h-full flex flex-col">
    <div v-if="!matchState" class="flex-1 flex items-center justify-center">
      <p class="text-gray-300 animate-pulse">Loading match...</p>
    </div>

    <template v-else>
      <!-- Practice banner: makes it unmistakable nothing here earns or costs points -->
      <div v-if="isPractice" class="flex items-center justify-between gap-2 px-3 py-1 bg-amber-500/90 text-black text-xs font-semibold flex-shrink-0">
        <span>PRACTICE MODE · No points won or lost · Bot: {{ difficultyLabel }}</span>
        <button v-if="!matchEnded" @click="$emit('exit')" class="px-2 py-0.5 rounded bg-black/20 hover:bg-black/30">Exit Practice</button>
      </div>

      <!-- Top bar: round + goal colors + scores -->
      <div class="flex items-center justify-between px-3 py-2 bg-black/30 flex-shrink-0 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex(matchState.you.goalColor) }"></span>
          <span class="font-semibold">{{ matchState.you.username || 'You' }}</span>
          <span class="text-gray-300">({{ youScore }})</span>
        </div>
        <div class="font-bold text-center">
          {{ roundLabel }}
          <span v-if="secondsLeft !== null && !matchEnded" class="ml-2 font-mono text-xs px-1.5 py-0.5 rounded" :class="secondsLeft <= 10 ? 'bg-red-600' : 'bg-white/10'">{{ secondsLeft }}s</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-gray-300">({{ oppScore }})</span>
          <span class="font-semibold">{{ matchState.opponent.username }}</span>
          <span class="w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex(matchState.opponent.goalColor) }"></span>
        </div>
      </div>

      <div v-if="matchState.opponentDropped" class="bg-amber-500/80 text-black text-xs text-center py-1">
        Opponent disconnected — waiting for them to reconnect...
      </div>

      <div class="flex-1 overflow-y-auto flex flex-col md:flex-row gap-4 p-3">
        <!-- Your side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <div v-if="matchState.you.goalCard" class="h-10 w-10 flex-shrink-0 rounded-full border border-amber-400" :title="matchState.you.goalCard.name">
              <GtoonCard :image-url="matchState.you.goalCard.assetPath" :value="matchState.you.goalCard.value ?? 0" :color="matchState.you.goalCard.color || 'SILVER'" :card-style="matchState.you.goalCard.cardStyle" :alt="matchState.you.goalCard.name" effects="static" />
            </div>
            <span class="text-xs text-gray-300">Goal: {{ matchState.you.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in slotNumbers" :key="'you-'+n" @click="onSlotClick(n)">
              <OgGtoonCardTile
                :card="yourSlotCard(n)"
                :face-down="yourSlotFaceDown(n)"
                :label="n"
                :tone="yourSlotTone(n)"
                :marker="markerFor(youSide, n, yourSlotCard(n), yourSlotFaceDown(n))"
              />
            </div>
          </div>

          <!-- Hand -->
          <div class="w-full max-w-sm">
            <p class="text-[11px] text-gray-300 mb-1 flex justify-between">
              <span>Your hand ({{ unplacedHand.length }})</span>
              <span class="text-gray-400">Undealt {{ matchState.you.undealtCount }} · Discarded {{ matchState.you.discardedCount }}</span>
            </p>
            <div class="flex flex-wrap gap-1.5 min-h-[6rem]">
              <div v-for="c in handTray" :key="c.idx" @click="onHandClick(c.idx)" class="cursor-pointer">
                <OgGtoonCardTile
                  :card="c"
                  size="hand"
                  :tone="handTone(c.idx)"
                />
              </div>
              <p v-if="!handTray.length" class="text-[11px] text-gray-400 self-center">No cards left in hand.</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-2 items-center justify-center mt-1">
            <template v-if="inDiscardPhase">
              <button
                v-if="!matchState.you.discardReady"
                @click="confirmDiscard"
                class="bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded text-sm"
              >{{ discardPick.size ? `Discard ${discardPick.size} & draw` : 'Keep my hand' }}</button>
              <span v-else class="text-xs text-amber-300">Waiting for opponent to finish discarding...</span>
            </template>
            <template v-else-if="inSwapPhase">
              <template v-if="matchState.you.maySwap">
                <button
                  @click="openSwapSheet"
                  class="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-1.5 rounded text-sm"
                >{{ isPractice ? 'Swap slot 7 (free)' : 'Swap slot 7 (10 pts)' }}</button>
                <button
                  @click="swapSkip"
                  class="bg-gray-600 hover:bg-gray-500 text-white px-4 py-1.5 rounded text-sm"
                >Keep slot 7</button>
              </template>
              <span v-else class="text-xs text-amber-300">Waiting for opponent...</span>
            </template>
            <template v-else>
              <button
                v-if="canCommit"
                @click="commit(matchState.round)"
                :disabled="!slotsFilled"
                class="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
              >{{ commitLabel }}</button>
              <span v-else-if="matchState.you.ready" class="text-xs text-amber-300">Waiting for opponent...</span>
            </template>
          </div>
          <p class="text-[11px] text-gray-300 text-center max-w-xs">{{ helpText }}</p>
          <p v-if="lastError" class="text-[11px] text-red-300 text-center max-w-xs">{{ lastError.message }}</p>
        </div>

        <!-- Opponent side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <div v-if="matchState.opponent.goalCard" class="h-10 w-10 flex-shrink-0 rounded-full border border-amber-400" :title="matchState.opponent.goalCard.name">
              <GtoonCard :image-url="matchState.opponent.goalCard.assetPath" :value="matchState.opponent.goalCard.value ?? 0" :color="matchState.opponent.goalCard.color || 'SILVER'" :card-style="matchState.opponent.goalCard.cardStyle" :alt="matchState.opponent.goalCard.name" effects="static" />
            </div>
            <span class="text-xs text-gray-300">Goal: {{ matchState.opponent.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in slotNumbers" :key="'opp-'+n">
              <OgGtoonCardTile
                :card="oppSlotCard(n)"
                :face-down="oppSlotFaceDown(n)"
                :label="n"
                :marker="markerFor(oppSide, n, oppSlotCard(n), oppSlotFaceDown(n))"
              />
            </div>
          </div>
          <span class="text-xs" :class="oppStatusReady ? 'text-green-400' : 'text-gray-400'">{{ oppStatusLabel }}</span>
        </div>
      </div>

      <!-- Reveal flash -->
      <transition name="fade">
        <div v-if="lastReveal && !flipping" class="px-3 py-2 bg-black/40 text-xs space-y-0.5 flex-shrink-0">
          <p class="text-center text-gray-400">Round {{ lastReveal.round }} revealed</p>
          <p v-for="row in lastRevealRows" :key="row.slot" class="text-center">
            Slot {{ row.slot }}: <strong>{{ row.you }}</strong> <span class="text-gray-400">vs</span> <strong>{{ row.opp }}</strong>
          </p>
        </div>
      </transition>

      <!-- Game Log: everything that happens in the match, as it happens -->
      <div class="flex-shrink-0 border-t border-white/10">
        <button @click="toggleLog" class="w-full text-xs px-3 py-1.5 bg-black/30 text-left flex items-center gap-2">
          <span>{{ logOpen ? '▼' : '▶' }} Game Log ({{ gameLog.length }})</span>
          <span v-if="!logOpen && unreadLog > 0" class="bg-amber-500 text-black rounded-full px-1.5 text-[10px] font-bold">{{ unreadLog }} new</span>
        </button>
        <div v-if="logOpen" ref="logScroller" class="max-h-56 overflow-y-auto px-3 py-2 text-xs space-y-2 bg-black/20">
          <OgGtoonGameLog :entries="gameLog" />
        </div>
      </div>

      <!-- Swap bottom sheet: confirm replacing slot 7 with a random undealt card -->
      <transition name="fade">
        <div v-if="swapSheetOpen" class="fixed inset-0 bg-black/50 z-40" @click="closeSwapSheet"></div>
      </transition>
      <transition name="slide-up">
        <div v-if="swapSheetOpen" class="fixed inset-x-0 bottom-0 bg-gray-900 border-t border-white/20 rounded-t-xl z-50 p-4 max-h-[70vh] overflow-y-auto">
          <h3 class="font-bold mb-3">Swap your slot 7 card</h3>
          <div v-if="slotSevenCard" class="flex items-center gap-3 mb-3">
            <OgGtoonCardTile :card="slotSevenCard" size="hand" tone="selected" :animate="false" />
            <p class="text-xs text-gray-300">
              <strong>{{ slotSevenCard.name }}</strong> goes back into your undealt cards, and a
              <strong>random</strong> undealt card takes slot 7.
            </p>
          </div>
          <p class="text-xs text-gray-400 mb-3">{{ isPractice ? 'Free in practice.' : 'Costs 10 points.' }} You can only do this once per match. Both players choose before the new cards are revealed.</p>
          <div class="flex justify-end gap-2">
            <button @click="closeSwapSheet" class="px-4 py-2 bg-gray-700 rounded text-sm">Cancel</button>
            <button @click="confirmSwap" class="px-4 py-2 bg-indigo-500 rounded text-sm">{{ isPractice ? 'Swap' : 'Swap for 10 pts' }}</button>
          </div>
        </div>
      </transition>

      <!-- End-of-match result screen -->
      <transition name="fade">
        <div v-if="matchEnded && !flipping" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div class="bg-gray-900 border border-white/20 rounded-xl p-6 w-[26rem] max-w-[95vw] text-center">
            <h2 class="text-2xl font-bold mb-2" :class="matchEnded.won ? 'text-green-400' : (matchEnded.outcome === 'TIE' ? 'text-amber-300' : 'text-red-400')">
              {{ matchEnded.outcome === 'TIE' ? "It's a Tie!" : (matchEnded.won ? 'You Win!' : 'You Lose') }}
            </h2>
            <p class="text-sm text-gray-300 mb-1">Final Score: {{ matchEnded.player1Score }} - {{ matchEnded.player2Score }}</p>
            <p class="text-xs text-gray-400 mb-2">{{ endReasonLabel }}</p>
            <p v-if="isPractice" class="text-xs text-amber-300 mb-2">Practice match — no points were awarded or spent.</p>
            <div class="text-left max-h-56 overflow-y-auto bg-black/30 rounded p-2 mb-3 text-xs">
              <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Game Log</p>
              <OgGtoonGameLog :entries="gameLog" />
            </div>
            <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">{{ isPractice ? 'Back to Practice' : 'Back to Lobby' }}</button>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'
import OgGtoonCardTile from '@/components/OgGtoonCardTile.vue'
import GtoonCard from '@/components/GtoonCard.vue'
import { REVEAL_FIRST_MS, REVEAL_CARD_MS, REVEAL_EFFECTS_MS, REVEAL_QUIET_MS } from '@/utils/ogGtoonReveal'
import OgGtoonGameLog from '@/components/OgGtoonGameLog.vue'

defineEmits(['exit'])

const { matchState, lastReveal, matchEnded, lastError, commit, place, unplace, swap, swapSkip, discard } = useOgGtoonsSocket()

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
function colorHex(c) { return COLOR_HEX[c] || '#ffffff' }

const isPractice = computed(() => !!matchState.value?.practice)
const difficultyLabel = computed(() => {
  const d = matchState.value?.difficulty
  return d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Normal'
})

const inDiscardPhase = computed(() => matchState.value?.phase === 'discard')
const inSwapPhase = computed(() => matchState.value?.phase === 'swap')
const roundLabel = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.suddenDeath) return 'Sudden Death'
  if (m.phase === 'discard') return 'Discard Phase'
  if (m.phase === 'swap') return `Round ${m.round} / ${m.totalRounds} · Swap`
  return `Round ${m.round} / ${m.totalRounds}`
})

/* ── Reveal playback ─────────────────────────────────────────────────────────────────────────
 * The server resolves the board after EACH card lands — player 1's slot 1, player 2's slot 1, player 1's
 * slot 2, ... — and sends those snapshots as `reveal.steps`. We replay them one at a time: the card flips
 * face-up showing its printed value, then its powers land and every visible card's value / color / knock-out,
 * the markers and both totals update before the next card flips. The last step equals the real board. */
const playback = ref(null) // { hidden:Set, shown:Map, markers:Map } while a reveal is replaying
const flipping = computed(() => !!playback.value)
let playToken = 0
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const cardKey = (side, slot) => `${side}:${slot}`
const toShown = (board) => new Map((board?.cards || []).map(c => [cardKey(c.side, c.slot), { finalValue: c.finalValue, color: c.color, cancelled: c.cancelled }]))
const toMarkers = (board) => new Map((board?.markers || []).map(m => [cardKey(m.side, m.slot), m]))

watch(lastReveal, async (rev) => {
  const token = ++playToken
  playback.value = null
  const steps = rev?.steps || []
  if (!steps.length) return
  playback.value = {
    hidden: new Set(steps.map(st => cardKey(st.side, st.slot))),
    shown: toShown(rev.before),
    markers: toMarkers(rev.before)
  }
  await sleep(REVEAL_FIRST_MS)
  for (const step of steps) {
    if (token !== playToken) return
    // 1) the card flips face-up showing its printed value; nothing else has changed yet.
    const hidden = new Set(playback.value.hidden)
    hidden.delete(cardKey(step.side, step.slot))
    const shown = new Map(playback.value.shown)
    shown.set(cardKey(step.side, step.slot), { finalValue: step.baseValue, color: step.baseColor, cancelled: false })
    playback.value = { ...playback.value, hidden, shown }
    await sleep(REVEAL_CARD_MS)
    if (token !== playToken) return
    // 2) its powers land: values, colors, knock-outs, markers and totals all update together.
    playback.value = { hidden, shown: toShown(step), markers: toMarkers(step) }
    await sleep(step.changed ? REVEAL_EFFECTS_MS : REVEAL_QUIET_MS)
  }
  if (token === playToken) playback.value = null
})
onBeforeUnmount(() => { playToken += 1 })

/* ── Phase countdown ─────────────────────────────────────────────────────────────────────────
 * The server owns the deadline (`phaseEndsAt`) and acts for anyone who has not when it passes;
 * this is only the display. Hidden once the player has finished their part of the phase. */
const nowMs = ref(Date.now())
let tickTimer = null
onMounted(() => { tickTimer = setInterval(() => { nowMs.value = Date.now() }, 500) })
onBeforeUnmount(() => clearInterval(tickTimer))
const secondsLeft = computed(() => {
  const m = matchState.value
  if (!m?.phaseEndsAt) return null
  return Math.max(0, Math.ceil((m.phaseEndsAt - nowMs.value) / 1000))
})

/** Whether a revealed entry is still face down, waiting for its turn in the reveal playback. */
function stillHidden(entry, side) {
  return !!entry && !!playback.value && playback.value.hidden.has(cardKey(side, entry.slot))
}

/** Latest resolved values from the server between reveals (and after a reconnect). */
const boardValues = computed(() => toShown(matchState.value?.board))
/** An entry with the value / color / cancelled state the board should be showing right now. */
function displayed(entry, side) {
  if (!entry) return null
  const o = (playback.value ? playback.value.shown : boardValues.value).get(cardKey(side, entry.slot))
  return o ? { ...entry, ...o } : entry
}

/* ── Slots ───────────────────────────────────────────────────────────────────────────────── */
const youRevealed = computed(() => matchState.value?.you?.revealed || [])
const oppRevealed = computed(() => matchState.value?.opponent?.revealed || [])
const slotNumbers = computed(() => {
  const m = matchState.value
  const max = Math.max(7, ...(m?.roundSlots || []), ...youRevealed.value.map(r => r.slot), ...oppRevealed.value.map(r => r.slot))
  return Array.from({ length: max }, (_, i) => i + 1)
})
const revealedAt = (list, slot) => list.find(r => r.slot === slot) || null

const handById = computed(() => new Map((matchState.value?.you?.hand || []).map(c => [c.idx, c])))
const placementsBySlot = computed(() => new Map((matchState.value?.you?.placements || []).map(p => [p.slot, p.cardIdx])))
const placedIds = computed(() => new Set((matchState.value?.you?.placements || []).map(p => p.cardIdx)))
const placedCount = computed(() => placedIds.value.size)
const unplacedHand = computed(() => (matchState.value?.you?.hand || []).filter(c => !placedIds.value.has(c.idx)))
// In the discard phase every hand card is shown; while placing, placed cards leave the tray.
const handTray = computed(() => (inDiscardPhase.value ? (matchState.value?.you?.hand || []) : unplacedHand.value))

const canEdit = computed(() => !!matchState.value && !matchEnded.value && matchState.value.phase === 'play' && !matchState.value.you.ready)
const canCommit = computed(() => canEdit.value)
// The server rejects a short commit; this just keeps the button honest.
const slotsFilled = computed(() => {
  const m = matchState.value
  if (!m) return false
  return placedCount.value >= Math.min((m.roundSlots || []).length, (m.you.hand || []).length)
})
const slotSevenCard = computed(() => youRevealed.value.find(r => r.slot === 7) || null)
const roundSlots = computed(() => matchState.value?.roundSlots || [])
const isOpenSlot = (slot) => canEdit.value && roundSlots.value.includes(slot)

function yourSlotCard(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return displayed(rev, youSide.value)
  const idx = placementsBySlot.value.get(slot)
  return idx === undefined ? null : handById.value.get(idx) || null
}
function yourSlotFaceDown(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return stillHidden(rev, youSide.value)
  // Committed (not yet revealed) cards show their back, even to their owner.
  return matchState.value?.you?.ready && placementsBySlot.value.has(slot)
}
function yourSlotTone(slot) {
  if (isOpenSlot(slot) && !placementsBySlot.value.has(slot)) return 'open'
  if (isOpenSlot(slot)) return 'filled'
  return 'idle'
}
function oppSlotCard(slot) {
  const rev = revealedAt(oppRevealed.value, slot)
  return rev && !stillHidden(rev, oppSide.value) ? displayed(rev, oppSide.value) : null
}
function oppSlotFaceDown(slot) {
  const rev = revealedAt(oppRevealed.value, slot)
  if (rev) return stillHidden(rev, oppSide.value)
  return (matchState.value?.opponent?.committedSlots || []).includes(slot)
}

const scoreOf = (list, side) => list.filter(r => !stillHidden(r, side)).reduce((a, r) => a + (displayed(r, side)?.finalValue || 0), 0)
const youScore = computed(() => scoreOf(youRevealed.value, youSide.value))
const oppScore = computed(() => scoreOf(oppRevealed.value, oppSide.value))

/* ── Hand: selecting, placing, discarding ────────────────────────────────────────────────── */
const selectedCard = ref(null)   // deck index of the hand card chosen for placing/swapping
const discardPick = ref(new Set())


function handTone(idx) {
  if (inDiscardPhase.value) return discardPick.value.has(idx) ? 'discard' : 'idle'
  return selectedCard.value === idx ? 'selected' : 'idle'
}

function onHandClick(idx) {
  if (inDiscardPhase.value) {
    if (matchState.value?.you?.discardReady) return
    const next = new Set(discardPick.value)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    discardPick.value = next
    return
  }
  if (!canEdit.value) return
  selectedCard.value = selectedCard.value === idx ? null : idx
}

function onSlotClick(slot) {
  if (!isOpenSlot(slot)) return
  if (selectedCard.value !== null) {
    place(selectedCard.value, slot)
    selectedCard.value = null
  } else if (placementsBySlot.value.has(slot)) {
    unplace(slot)
  }
}

function confirmDiscard() {
  discard([...discardPick.value])
  discardPick.value = new Set()
}

// A new round/phase (or a card leaving the hand) invalidates whatever was selected.
watch(() => [matchState.value?.round, matchState.value?.phase], () => {
  selectedCard.value = null
  discardPick.value = new Set()
})
// An error belongs to the action that caused it; any fresh state supersedes it.
watch(matchState, () => { lastError.value = null })
watch(handById, (hand) => {
  if (selectedCard.value !== null && !hand.has(selectedCard.value)) selectedCard.value = null
})

const commitLabel = computed(() => {
  const m = matchState.value
  const need = Math.min((m?.roundSlots || []).length, (m?.you?.hand || []).length)
  if (m?.suddenDeath) return 'Play card'
  if (placedCount.value < need) return `Fill all slots (${placedCount.value}/${need})`
  return `Commit ${need} card${need === 1 ? '' : 's'}`
})

const helpText = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.phase === 'discard') {
    return 'Discard phase: tap any cards you want to throw away, then confirm. Your hand is refilled to 6 from your undealt cards. If time runs out you keep your hand.'
  }
  if (m.phase === 'swap') {
    return m.you.maySwap
      ? 'Last chance: swap the card in slot 7 for a random undealt card, or keep it. If time runs out you keep it.'
      : (m.you.swapReady ? 'Waiting for your opponent to choose...' : 'You have no undealt cards left to swap with.')
  }
  if (m.you.ready) return 'Your cards are face down. They flip, in slot order, when your opponent commits.'
  const slots = m.roundSlots
  const range = slots.length === 1 ? `slot ${slots[0]}` : `slots ${slots[0]}-${slots[slots.length - 1]}`
  if (m.suddenDeath) return `Sudden death: place one card in slot ${slots[0]} and play it.`
  return `Tap a card in your hand, then tap an open ${range} to place it. Fill all ${slots.length} slot${slots.length === 1 ? '' : 's'} to commit. If time runs out, random cards fill the empty slots. Tap a placed card to take it back.`
})

const oppStatusReady = computed(() => {
  const o = matchState.value?.opponent
  return inDiscardPhase.value ? o?.discardReady : o?.ready
})
const oppStatusLabel = computed(() => {
  if (inDiscardPhase.value) return oppStatusReady.value ? 'Done discarding' : 'Choosing discards...'
  if (inSwapPhase.value) return matchState.value?.opponent?.swapReady ? 'Swap decided' : 'Deciding on a swap...'
  return oppStatusReady.value ? 'Committed' : 'Thinking...'
})

/* ── Logs ────────────────────────────────────────────────────────────────────────────────── */
const fmt = (r) => (r ? `${r.name} (${r.finalValue})` : '—')

const lastRevealRows = computed(() => {
  const rev = lastReveal.value
  if (!rev) return []
  return (rev.order || []).map(slot => ({
    slot,
    you: fmt(rev.you.find(e => e.slot === slot)),
    opp: fmt(rev.opponent.find(e => e.slot === slot))
  }))
})

const logOpen = ref(false)

/* ── Game Log ────────────────────────────────────────────────────────────────────────────────
 * The server keeps one ordered log of the whole match (reveals, commits, timeouts, discards, swaps,
 * and what every power is doing / not doing). The drawer follows it live; the end screen shows it
 * in full. Card markers come from the newest preview/scoring entry. */
const gameLog = computed(() => matchState.value?.gameLog || [])
const unreadLog = computed(() => Math.max(0, gameLog.value.length - seenLogCount.value))
const seenLogCount = ref(0)
const logScroller = ref(null)
function scrollLogToEnd() {
  nextTick(() => { if (logScroller.value) logScroller.value.scrollTop = logScroller.value.scrollHeight })
}
function toggleLog() {
  logOpen.value = !logOpen.value
  if (logOpen.value) { seenLogCount.value = gameLog.value.length; scrollLogToEnd() }
}
watch(() => gameLog.value.length, (n) => {
  if (logOpen.value) { seenLogCount.value = n; scrollLogToEnd() }
})

const youSide = computed(() => matchState.value?.you?.sideIndex ?? 0)
const oppSide = computed(() => (youSide.value === 0 ? 1 : 0))
const markerMap = computed(() => {
  // While a reveal replays the markers follow the step being shown; otherwise the server's live board,
  // falling back to the newest preview/scoring entry in the log for older payloads.
  if (playback.value) return playback.value.markers
  const board = matchState.value?.board
  if (board?.markers) return toMarkers(board)
  const latest = [...gameLog.value].reverse().find(e => e.data?.markers)
  const map = new Map()
  for (const m of latest?.data?.markers || []) map.set(`${m.side}:${m.slot}`, m)
  return map
})
/** The marker for a card at `slot` on `side`, only once that card is actually face up. */
function markerFor(side, slot, card, faceDown) {
  if (!card || faceDown) return null
  return markerMap.value.get(`${side}:${slot}`) || null
}

const endReasonLabel = computed(() => {
  const r = matchEnded.value?.endReason
  if (r === 'forfeit') return 'Your opponent left the match.'
  if (r === 'sweep') return 'The match timed out.'
  return ''
})

/* ── Round-3 swap: confirm in the sheet ─────────────────────────────────────────────────── */
const swapSheetOpen = ref(false)
function openSwapSheet() { swapSheetOpen.value = true }
function closeSwapSheet() { swapSheetOpen.value = false }
function confirmSwap() {
  swap()
  closeSwapSheet()
}
// The sheet belongs to the swap phase; close it if the phase moves on (e.g. the clock ran out).
watch(inSwapPhase, (on) => { if (!on) swapSheetOpen.value = false })
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.slide-up-enter-active, .slide-up-leave-active { transition: transform .25s ease }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%) }
</style>
