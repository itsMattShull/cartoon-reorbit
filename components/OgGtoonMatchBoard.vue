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
        <div class="font-bold">
          {{ roundLabel }}
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
            <img v-if="matchState.you.goalCard" :src="matchState.you.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.you.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.you.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in slotNumbers" :key="'you-'+n" @click="onSlotClick(n)">
              <OgGtoonCardTile
                :card="yourSlotCard(n)"
                :face-down="yourSlotFaceDown(n)"
                :label="n"
                :tone="yourSlotTone(n)"
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
            <template v-else>
              <button
                v-if="canCommit"
                @click="commit(matchState.round)"
                :disabled="matchState.suddenDeath && !placedCount"
                class="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
              >{{ commitLabel }}</button>
              <span v-else-if="matchState.you.ready" class="text-xs text-amber-300">Waiting for opponent...</span>
              <button
                v-if="canCommit && !matchState.you.swapUsed && matchState.you.undealtCount > 0"
                :disabled="!selectedHandCard"
                @click="openSwapSheet"
                class="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs"
              >{{ isPractice ? 'Swap (free)' : 'Swap (10 pts)' }}</button>
            </template>
          </div>
          <p class="text-[11px] text-gray-300 text-center max-w-xs">{{ helpText }}</p>
          <p v-if="lastError" class="text-[11px] text-red-300 text-center max-w-xs">{{ lastError.message }}</p>
        </div>

        <!-- Opponent side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <img v-if="matchState.opponent.goalCard" :src="matchState.opponent.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.opponent.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.opponent.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in slotNumbers" :key="'opp-'+n">
              <OgGtoonCardTile
                :card="oppSlotCard(n)"
                :face-down="oppSlotFaceDown(n)"
                :label="n"
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

      <!-- Collapsible match log drawer -->
      <div class="flex-shrink-0 border-t border-white/10">
        <button @click="logOpen = !logOpen" class="w-full text-xs px-3 py-1.5 bg-black/30 text-left">
          {{ logOpen ? '▼' : '▶' }} Match Log
        </button>
        <div v-if="logOpen" class="max-h-48 overflow-y-auto px-3 py-2 text-xs space-y-2 bg-black/20">
          <div v-for="(r, i) in matchLog" :key="i">
            Slot {{ r.slot }}: You {{ r.you }} vs Opp {{ r.opp }}
          </div>
          <p v-if="!matchLog.length" class="text-gray-400">No rounds revealed yet.</p>
          <div v-if="groupedEffectsLog.length" class="pt-2 mt-2 border-t border-white/10 space-y-1">
            <p class="text-gray-400 font-semibold">Effects (final scoring)</p>
            <div v-for="(g, gi) in groupedEffectsLog" :key="gi" class="text-gray-300">
              <span class="font-medium">{{ g.sourceName }}</span>:
              <span v-for="(line, li) in g.lines" :key="li">
                {{ line }}<span v-if="li < g.lines.length - 1">; </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Swap bottom sheet: confirm trading the selected hand card for a random undealt card -->
      <transition name="fade">
        <div v-if="swapSheetOpen" class="fixed inset-0 bg-black/50 z-40" @click="closeSwapSheet"></div>
      </transition>
      <transition name="slide-up">
        <div v-if="swapSheetOpen" class="fixed inset-x-0 bottom-0 bg-gray-900 border-t border-white/20 rounded-t-xl z-50 p-4 max-h-[70vh] overflow-y-auto">
          <h3 class="font-bold mb-3">Swap a card</h3>
          <div v-if="selectedHandCard" class="flex items-center gap-3 mb-3">
            <OgGtoonCardTile :card="selectedHandCard" size="hand" tone="selected" />
            <p class="text-xs text-gray-300">
              <strong>{{ selectedHandCard.name }}</strong> goes back into your undealt cards, and you draw a
              <strong>random</strong> undealt card in its place.
            </p>
          </div>
          <p class="text-xs text-gray-400 mb-3">{{ isPractice ? 'Free in practice.' : 'Costs 10 points.' }} You can only do this once per match, and only before you commit for the round.</p>
          <div class="flex justify-end gap-2">
            <button @click="closeSwapSheet" class="px-4 py-2 bg-gray-700 rounded text-sm">Cancel</button>
            <button
              :disabled="!selectedHandCard"
              @click="confirmSwap"
              class="px-4 py-2 bg-indigo-500 disabled:opacity-50 rounded text-sm"
            >{{ isPractice ? 'Swap' : 'Swap for 10 pts' }}</button>
          </div>
        </div>
      </transition>

      <!-- End-of-match result screen -->
      <transition name="fade">
        <div v-if="matchEnded && !flipping" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div class="bg-gray-900 border border-white/20 rounded-xl p-6 w-80 text-center">
            <h2 class="text-2xl font-bold mb-2" :class="matchEnded.won ? 'text-green-400' : (matchEnded.outcome === 'TIE' ? 'text-amber-300' : 'text-red-400')">
              {{ matchEnded.outcome === 'TIE' ? "It's a Tie!" : (matchEnded.won ? 'You Win!' : 'You Lose') }}
            </h2>
            <p class="text-sm text-gray-300 mb-1">Final Score: {{ matchEnded.player1Score }} - {{ matchEnded.player2Score }}</p>
            <p class="text-xs text-gray-400 mb-2">{{ endReasonLabel }}</p>
            <p v-if="isPractice" class="text-xs text-amber-300 mb-2">Practice match — no points were awarded or spent.</p>
            <div v-if="groupedEffectsLog.length" class="text-left max-h-32 overflow-y-auto bg-black/30 rounded p-2 mb-3 space-y-1">
              <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Powers that fired</p>
              <div v-for="(g, gi) in groupedEffectsLog" :key="gi" class="text-[11px] text-gray-300">
                <span class="font-medium">{{ g.sourceName }}</span>:
                <span v-for="(line, li) in g.lines" :key="li">
                  {{ line }}<span v-if="li < g.lines.length - 1">; </span>
                </span>
              </div>
            </div>
            <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">{{ isPractice ? 'Back to Practice' : 'Back to Lobby' }}</button>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'
import OgGtoonCardTile from '@/components/OgGtoonCardTile.vue'

defineEmits(['exit'])

const { matchState, lastReveal, matchEnded, lastError, commit, place, unplace, swap, discard } = useOgGtoonsSocket()

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
const roundLabel = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.suddenDeath) return 'Sudden Death'
  if (m.phase === 'discard') return 'Discard Phase'
  return `Round ${m.round} / ${m.totalRounds}`
})

/* ── Reveal animation ────────────────────────────────────────────────────────────────────────
 * The server reveals a whole round at once. The cards just placed stay face down and flip one
 * slot at a time (yours and your opponent's together), in slot order. */
const FLIP_FIRST_MS = 600
const FLIP_STEP_MS = 800
const pendingFlip = ref(new Set()) // slots of the current reveal still face down
const flipping = computed(() => pendingFlip.value.size > 0)
let flipTimer = null

watch(lastReveal, (rev) => {
  clearTimeout(flipTimer)
  const order = rev?.order || []
  pendingFlip.value = new Set(order)
  let i = 0
  const step = () => {
    if (i >= order.length) return
    const next = new Set(pendingFlip.value)
    next.delete(order[i])
    pendingFlip.value = next
    i += 1
    if (i < order.length) flipTimer = setTimeout(step, FLIP_STEP_MS)
  }
  if (order.length) flipTimer = setTimeout(step, FLIP_FIRST_MS)
})
onBeforeUnmount(() => clearTimeout(flipTimer))

/** Whether a revealed entry is still waiting to flip. */
function stillHidden(entry) {
  return !!entry && !!lastReveal.value && entry.round === lastReveal.value.round && pendingFlip.value.has(entry.slot)
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
const roundSlots = computed(() => matchState.value?.roundSlots || [])
const isOpenSlot = (slot) => canEdit.value && roundSlots.value.includes(slot)

function yourSlotCard(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return rev
  const idx = placementsBySlot.value.get(slot)
  return idx === undefined ? null : handById.value.get(idx) || null
}
function yourSlotFaceDown(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return stillHidden(rev)
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
  return rev && !stillHidden(rev) ? rev : null
}
function oppSlotFaceDown(slot) {
  const rev = revealedAt(oppRevealed.value, slot)
  if (rev) return stillHidden(rev)
  return (matchState.value?.opponent?.committedSlots || []).includes(slot)
}

const youScore = computed(() => youRevealed.value.filter(r => !stillHidden(r)).reduce((a, r) => a + (r.finalValue || 0), 0))
const oppScore = computed(() => oppRevealed.value.filter(r => !stillHidden(r)).reduce((a, r) => a + (r.finalValue || 0), 0))

/* ── Hand: selecting, placing, discarding ────────────────────────────────────────────────── */
const selectedCard = ref(null)   // deck index of the hand card chosen for placing/swapping
const discardPick = ref(new Set())

const selectedHandCard = computed(() => (selectedCard.value === null ? null : handById.value.get(selectedCard.value) || null))

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
  const n = placedCount.value
  if (matchState.value?.suddenDeath) return 'Play card'
  return n ? `Commit ${n} card${n === 1 ? '' : 's'}` : 'Commit with no cards'
})

const helpText = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.phase === 'discard') {
    return 'Discard phase: tap any cards you want to throw away, then confirm. Your hand is refilled to 6 from your undealt cards.'
  }
  if (m.you.ready) return 'Your cards are face down. They flip, in slot order, when your opponent commits.'
  const slots = m.roundSlots
  const range = slots.length === 1 ? `slot ${slots[0]}` : `slots ${slots[0]}-${slots[slots.length - 1]}`
  if (m.suddenDeath) return `Sudden death: place one card in slot ${slots[0]} and play it.`
  return `Tap a card in your hand, then tap an open ${range} to place it (up to ${slots.length}). Tap a placed card to take it back.`
})

const oppStatusReady = computed(() => {
  const o = matchState.value?.opponent
  return inDiscardPhase.value ? o?.discardReady : o?.ready
})
const oppStatusLabel = computed(() => {
  if (inDiscardPhase.value) return oppStatusReady.value ? 'Done discarding' : 'Choosing discards...'
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

const matchLog = computed(() => {
  const slots = [...new Set([...youRevealed.value, ...oppRevealed.value].filter(r => !stillHidden(r)).map(r => r.slot))].sort((a, b) => a - b)
  return slots.map(slot => ({
    slot,
    you: fmt(revealedAt(youRevealed.value, slot)),
    opp: fmt(revealedAt(oppRevealed.value, slot))
  }))
})

const logOpen = ref(false)

/** Groups the final-board effectsResolved log (server/utils/ogGtoonEffects.js) by source card,
 *  turning each raw application into a short readable line instead of a JSON dump. */
const groupedEffectsLog = computed(() => {
  const log = matchEnded.value?.effectsResolved || []
  if (!log.length) return []
  const nameById = {}
  for (const r of [...youRevealed.value, ...oppRevealed.value]) nameById[r.ctoonId] = r.name
  const nameOf = (id) => nameById[id] || id
  const bySource = new Map()
  for (const e of log) {
    const key = `${e.source}:${e.sourceCtoonId}:${e.sourceRound}`
    if (!bySource.has(key)) bySource.set(key, { sourceName: nameOf(e.sourceCtoonId), lines: [] })
    const targetName = nameOf(e.targetCtoonId)
    let line
    if (e.action === 'negateEffect') {
      line = `negated ${targetName}'s effect`
    } else if (e.action === 'setColor') {
      line = `set ${targetName} to ${e.color}`
    } else if (e.operation === 'add') {
      line = `${targetName} ${e.amount >= 0 ? '+' : ''}${e.amount}${e.perMatchCount != null ? ` (${e.perMatchAmount} x ${e.perMatchCount} matches)` : ''}`
    } else if (e.operation === 'multiply') {
      line = `${targetName} x${e.amount}`
    } else {
      line = `${targetName} set to ${e.amount}`
    }
    bySource.get(key).lines.push(line)
  }
  return [...bySource.values()]
})

const endReasonLabel = computed(() => {
  const r = matchEnded.value?.endReason
  if (r === 'forfeit') return 'Your opponent left the match.'
  if (r === 'sweep') return 'The match timed out.'
  return ''
})

/* ── Swap: pick a hand card, then confirm in the sheet ───────────────────────────────────── */
const swapSheetOpen = ref(false)
function openSwapSheet() { if (selectedHandCard.value) swapSheetOpen.value = true }
function closeSwapSheet() { swapSheetOpen.value = false }
function confirmSwap() {
  if (selectedCard.value === null) return
  swap(selectedCard.value)
  selectedCard.value = null
  closeSwapSheet()
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.slide-up-enter-active, .slide-up-leave-active { transition: transform .25s ease }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%) }
</style>
