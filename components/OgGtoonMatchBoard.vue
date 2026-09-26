<!-- components/OgGtoonMatchBoard.vue -->
<template>
  <div class="oggtoons-board text-white h-full flex flex-col">
    <div v-if="!matchState" class="flex-1 flex items-center justify-center">
      <p class="text-gray-300 animate-pulse">Loading match...</p>
    </div>

    <template v-else>
      <!-- Top bar: round + goal colors + scores -->
      <div class="flex items-center justify-between px-3 py-2 bg-black/30 flex-shrink-0 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full border border-white/40" :style="{ background: colorHex(matchState.you.goalColor) }"></span>
          <span class="font-semibold">{{ matchState.you.username || 'You' }}</span>
          <span class="text-gray-300">({{ youScore }})</span>
        </div>
        <div class="font-bold">
          {{ matchState.suddenDeath ? 'Sudden Death' : `Batch ${matchState.currentBatch} / ${matchState.totalBatches}` }}
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

      <!-- Board: same layout scaled down for mobile, matching ClashGameBoard's approach -->
      <div class="flex-1 overflow-y-auto flex flex-col md:flex-row gap-4 p-3 transform scale-75 md:scale-100 origin-top">
        <!-- Your side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <img v-if="matchState.you.goalCard" :src="matchState.you.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.you.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.you.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in matchState.totalRounds" :key="'you-'+n" class="relative h-20 rounded border flex items-center justify-center bg-white/5"
                 :class="youRevealed[n-1] ? 'border-indigo-400' : 'border-dashed border-white/20'">
              <img v-if="youRevealed[n-1]" :src="youRevealed[n-1].assetPath" class="h-16 object-contain" :class="{ 'grayscale opacity-40': youRevealed[n-1].cancelled }" :title="`${youRevealed[n-1].name} (${youRevealed[n-1].finalValue})`" />
              <span v-else class="text-[10px] text-gray-400">{{ n }}</span>
              <span v-if="youRevealed[n-1]?.cancelled" class="absolute top-0 inset-x-0 text-center text-[8px] font-bold uppercase tracking-wide bg-red-600/80 text-white">Cancelled</span>
              <div v-if="youRevealed[n-1]" class="absolute bottom-0 inset-x-0 flex flex-wrap justify-center gap-0.5 px-0.5 pb-0.5">
                <span v-for="badge in cardBadges(youRevealed[n-1])" :key="badge" class="text-[8px] leading-none px-1 py-0.5 rounded bg-black/50 text-gray-100">{{ badge }}</span>
              </div>
            </div>
          </div>
          <div class="flex flex-col items-center gap-2 mt-1 w-full max-w-sm">
            <div v-if="matchState.you.ready" class="text-xs text-amber-300">
              Waiting for opponent... ({{ pendingCount }}/{{ batchQuota }} chosen)
            </div>
            <template v-else-if="hand.length">
              <p class="text-xs text-gray-300">Choose a card to play ({{ pendingCount }}/{{ batchQuota }} chosen this batch)</p>
              <div class="grid grid-cols-4 gap-1.5 w-full">
                <div
                  v-for="c in hand"
                  :key="c.ctoonId"
                  @click="selectCard(c.ctoonId)"
                  :class="[
                    'relative h-16 rounded border-2 flex items-center justify-center cursor-pointer bg-white/5',
                    selectedCtoonId === c.ctoonId ? 'border-amber-400 bg-amber-500/10' : 'border-white/20'
                  ]"
                >
                  <img :src="c.assetPath" :alt="c.name" class="h-12 object-contain" :title="`${c.name} (${c.value})`" />
                </div>
              </div>
              <button
                :disabled="!selectedCtoonId"
                @click="playSelected"
                class="bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-1.5 rounded text-sm"
              >Play Card</button>
            </template>
            <span v-else class="text-xs text-gray-400">No cards left to play.</span>
          </div>
        </div>

        <!-- Opponent side -->
        <div class="flex-1 flex flex-col items-center gap-2">
          <div class="flex items-center gap-2">
            <img v-if="matchState.opponent.goalCard" :src="matchState.opponent.goalCard.assetPath" class="h-10 w-10 object-contain rounded border border-amber-400" :title="matchState.opponent.goalCard.name" />
            <span class="text-xs text-gray-300">Goal: {{ matchState.opponent.goalColor }}</span>
          </div>
          <div class="grid grid-cols-4 gap-1.5 w-full max-w-sm">
            <div v-for="n in matchState.totalRounds" :key="'opp-'+n" class="relative h-20 rounded border flex items-center justify-center bg-white/5"
                 :class="oppRevealed[n-1] ? 'border-indigo-400' : 'border-dashed border-white/20'">
              <img v-if="oppRevealed[n-1]" :src="oppRevealed[n-1].assetPath" class="h-16 object-contain" :class="{ 'grayscale opacity-40': oppRevealed[n-1].cancelled }" :title="`${oppRevealed[n-1].name} (${oppRevealed[n-1].finalValue})`" />
              <span v-else class="text-[10px] text-gray-400">{{ n }}</span>
              <span v-if="oppRevealed[n-1]?.cancelled" class="absolute top-0 inset-x-0 text-center text-[8px] font-bold uppercase tracking-wide bg-red-600/80 text-white">Cancelled</span>
              <div v-if="oppRevealed[n-1]" class="absolute bottom-0 inset-x-0 flex flex-wrap justify-center gap-0.5 px-0.5 pb-0.5">
                <span v-for="badge in cardBadges(oppRevealed[n-1])" :key="badge" class="text-[8px] leading-none px-1 py-0.5 rounded bg-black/50 text-gray-100">{{ badge }}</span>
              </div>
            </div>
          </div>
          <span class="text-xs" :class="matchState.opponent.ready ? 'text-green-400' : 'text-gray-400'">
            {{ matchState.opponent.ready ? 'Committed' : `Picking (${matchState.opponent.pendingCount}/${batchQuota})` }}
          </span>
        </div>
      </div>

      <!-- Reveal flash: a whole batch reveals at once -->
      <transition name="fade">
        <div v-if="lastReveal" class="px-3 py-2 bg-black/40 text-xs flex flex-col items-center justify-center gap-1 flex-shrink-0">
          <div class="font-semibold text-gray-300">Batch {{ lastReveal.batch }} revealed</div>
          <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5">
            <span v-for="(c, i) in lastReveal.you" :key="'ly'+i">You: <strong>{{ c.name }}</strong> ({{ c.finalValue }})</span>
            <span v-for="(c, i) in lastReveal.opponent" :key="'lo'+i">Opp: <strong>{{ c.name }}</strong> ({{ c.finalValue }})</span>
          </div>
        </div>
      </transition>

      <!-- Collapsible match log drawer -->
      <div class="flex-shrink-0 border-t border-white/10">
        <button @click="logOpen = !logOpen" class="w-full text-xs px-3 py-1.5 bg-black/30 text-left">
          {{ logOpen ? '▼' : '▶' }} Match Log
        </button>
        <div v-if="logOpen" class="max-h-48 overflow-y-auto px-3 py-2 text-xs space-y-2 bg-black/20">
          <div v-for="(r, i) in matchLog" :key="i">
            R{{ i + 1 }}: You {{ r.you }} vs Opp {{ r.opp }}
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

      <!-- End-of-match result screen -->
      <transition name="fade">
        <div v-if="matchEnded" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div class="bg-gray-900 border border-white/20 rounded-xl p-6 w-80 text-center">
            <h2 class="text-2xl font-bold mb-2" :class="matchEnded.won ? 'text-green-400' : (matchEnded.outcome === 'TIE' ? 'text-amber-300' : 'text-red-400')">
              {{ matchEnded.outcome === 'TIE' ? "It's a Tie!" : (matchEnded.won ? 'You Win!' : 'You Lose') }}
            </h2>
            <p class="text-sm text-gray-300 mb-1">Final Score: {{ matchEnded.player1Score }} - {{ matchEnded.player2Score }}</p>
            <p class="text-xs text-gray-400 mb-2">{{ endReasonLabel }}</p>
            <div v-if="groupedEffectsLog.length" class="text-left max-h-32 overflow-y-auto bg-black/30 rounded p-2 mb-3 space-y-1">
              <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Powers that fired</p>
              <div v-for="(g, gi) in groupedEffectsLog" :key="gi" class="text-[11px] text-gray-300">
                <span class="font-medium">{{ g.sourceName }}</span>:
                <span v-for="(line, li) in g.lines" :key="li">
                  {{ line }}<span v-if="li < g.lines.length - 1">; </span>
                </span>
              </div>
            </div>
            <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">Back to Lobby</button>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

defineEmits(['exit'])

const { matchState, lastReveal, matchEnded, commit } = useOgGtoonsSocket()

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
function colorHex(c) { return COLOR_HEX[c] || '#ffffff' }

const GROUP_LABELS = {
  BEAN_SCOUTS: 'Bean Scouts', DAILY_PLANET: 'Daily Planet', GLOBAL: 'G.L.O.B.A.L.',
  IMAGINARY_FRIEND: 'Imaginary Friend', INJUSTICE_GANG: 'Injustice Gang', JUSTICE_FRIENDS: 'Justice Friends',
  JUSTICE_LEAGUE: 'Justice League', MUCHA_LUCHA: 'Mucha Lucha', MYSTERY_INC: 'Mystery, Inc.',
  POWERPUFF_GIRLS: 'Powerpuff Girls', SQUIRREL_SCOUTS: 'Squirrel Scouts', TEEN_TITANS: 'Teen Titans',
  TIME_SQUAD: 'Time Squad', WOOHP: 'WOOHP'
}
function titleCase(s) { return s ? s.charAt(0) + s.slice(1).toLowerCase() : s }
/** Small badge strings (type1/2/3 + group) for a revealed card entry. */
function cardBadges(card) {
  if (!card) return []
  const out = [card.type1, card.type2, card.type3].filter(Boolean).map(titleCase)
  if (card.group) out.push(GROUP_LABELS[card.group] || card.group)
  return out
}

const youRevealed = computed(() => matchState.value?.you?.revealed || [])
const oppRevealed = computed(() => matchState.value?.opponent?.revealed || [])
const youScore = computed(() => youRevealed.value.reduce((a, r) => a + (r.finalValue || 0), 0))
const oppScore = computed(() => oppRevealed.value.reduce((a, r) => a + (r.finalValue || 0), 0))

// Hand selection (feature 1): pick one of your own remaining cards, then confirm; the server
// buffers each pick and only reveals once both sides have filled the current batch's quota.
const hand = computed(() => matchState.value?.you?.hand || [])
const pendingCount = computed(() => matchState.value?.you?.pendingCount || 0)
const batchQuota = computed(() => matchState.value?.batchQuota || 0)
const selectedCtoonId = ref(null)

function selectCard(ctoonId) {
  if (matchState.value?.you?.ready) return
  selectedCtoonId.value = selectedCtoonId.value === ctoonId ? null : ctoonId
}
function playSelected() {
  if (!selectedCtoonId.value) return
  commit(selectedCtoonId.value)
  selectedCtoonId.value = null
}

const matchLog = computed(() => {
  const n = Math.min(youRevealed.value.length, oppRevealed.value.length)
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({ you: `${youRevealed.value[i].name} (${youRevealed.value[i].finalValue})`, opp: `${oppRevealed.value[i].name} (${oppRevealed.value[i].finalValue})` })
  }
  return out
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
    if (e.action === 'cancel') {
      line = `cancelled (duplicate of ${targetName})`
    } else if (e.action === 'negateEffect') {
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
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
