<!-- components/oggtoons/OgGtoonPlayerStats.vue -->
<!-- The modal opened by clicking a username on the OG gToons Leaderboard: that player's deeper stats —
     how they do in Human Matches (tournament vs. not, how they win, most-played decks, recent form) and
     in Practice Matches (by difficulty). Cached on the server for an hour. Rules: server/utils/ogGtoonBoards.js -->
<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[1001] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="$emit('close')"></div>
      <div
        ref="dialogEl"
        class="relative w-full max-w-2xl max-h-[90vh] bg-gray-900 text-white border border-white/20 rounded-lg shadow-lg flex flex-col overflow-hidden"
        role="dialog" aria-modal="true" aria-labelledby="ogps-title"
      >
        <div class="flex items-start justify-between gap-4 px-4 py-3 border-b border-white/20">
          <div class="min-w-0">
            <h3 id="ogps-title" class="text-lg font-semibold truncate">{{ username }}</h3>
            <p class="text-xs text-gray-400">
              gToons stats ·
              <NuxtLink :to="`/czone/${encodeURIComponent(username)}`" class="underline hover:text-white">View cZone</NuxtLink>
            </p>
          </div>
          <div class="flex items-start gap-3 shrink-0">
            <div class="flex flex-col">
              <label for="ogps-timeframe" class="text-[10px] uppercase tracking-wide text-gray-400">Timeframe</label>
              <select id="ogps-timeframe" v-model="timeframe" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
                <option value="1w">1 Week</option>
                <option value="1m">1 Month</option>
                <option value="3m">3 Months</option>
                <option value="6m">6 Months</option>
                <option value="1y">1 Year</option>
                <option value="all">All Time</option>
              </select>
            </div>
            <button ref="closeBtn" type="button" class="text-gray-300 hover:text-white text-2xl leading-none" aria-label="Close" @click="$emit('close')">&times;</button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-6" :class="{ 'opacity-60': refreshing }" :aria-busy="loading || refreshing">
          <div v-if="error" class="p-3 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
            {{ error }} <button type="button" class="underline ml-1" @click="loadData">Try again</button>
          </div>

          <div v-else-if="loading" class="space-y-3 animate-pulse" aria-label="Loading stats">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div v-for="i in 4" :key="i" class="h-14 bg-white/10 rounded-lg"></div>
            </div>
            <div class="h-4 bg-white/10 rounded"></div>
            <div class="h-24 bg-white/10 rounded"></div>
          </div>

          <template v-else-if="stats">
            <!-- Human Matches -->
            <section aria-labelledby="ogps-human">
              <h4 id="ogps-human" class="text-base font-semibold mb-2">Human Matches</h4>
              <p v-if="!stats.human.played" class="text-sm text-gray-400">No finished human matches in this timeframe.</p>
              <template v-else>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div v-for="tile in humanTiles" :key="tile.label" class="bg-white/10 border border-white/20 rounded-lg p-3">
                    <div class="text-[11px] uppercase tracking-wide text-gray-400">{{ tile.label }}</div>
                    <div class="text-lg font-semibold">{{ tile.value }}</div>
                    <div v-if="tile.note" class="text-[11px] text-gray-400">{{ tile.note }}</div>
                  </div>
                </div>

                <h5 class="text-sm font-semibold mb-1">How they win</h5>
                <WinMethod :method="stats.human.winMethod" :wins="stats.human.wins" other-label="Other (forfeits and earlier games)" />

                <h5 class="text-sm font-semibold mt-4 mb-1">Tournament vs. other games</h5>
                <table class="min-w-full text-sm">
                  <caption class="sr-only">Record in tournament and non-tournament games</caption>
                  <thead>
                    <tr class="text-left text-gray-400 border-b border-white/20">
                      <th scope="col" class="py-1 pr-3 font-normal">Games</th>
                      <th scope="col" class="py-1 pr-3 font-normal">Played</th>
                      <th scope="col" class="py-1 pr-3 font-normal">Win-Loss-Tie</th>
                      <th scope="col" class="py-1 font-normal">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in splitRows" :key="row.label" class="border-b border-white/10">
                      <th scope="row" class="py-1 pr-3 text-left font-normal">{{ row.label }}</th>
                      <td class="py-1 pr-3 tabular-nums">{{ row.rec.played }}</td>
                      <td class="py-1 pr-3 tabular-nums">{{ recordText(row.rec) }}</td>
                      <td class="py-1 tabular-nums">{{ row.rec.played ? pct(row.rec.winPct) : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-if="stats.human.gamesLeft" class="text-xs text-gray-400 mt-2">
                  Left {{ stats.human.gamesLeft }} {{ stats.human.gamesLeft === 1 ? 'game' : 'games' }} early (counted as a loss).
                </p>

                <template v-if="stats.human.recent.length">
                  <h5 class="text-sm font-semibold mt-4 mb-1">Last {{ stats.human.recent.length }} games <span class="font-normal text-xs text-gray-400">(newest first)</span></h5>
                  <ul class="flex flex-wrap gap-1.5" aria-label="Recent results">
                    <li
                      v-for="(r, i) in stats.human.recent" :key="i"
                      class="w-7 h-7 rounded flex items-center justify-center text-xs font-bold relative"
                      :class="r.result === 'W' ? 'bg-emerald-600' : r.result === 'L' ? 'bg-rose-600' : 'bg-gray-500'"
                      :title="`${resultWord(r.result)}${r.tournament ? ' (tournament)' : ''}`"
                    >
                      <span aria-hidden="true">{{ r.result }}</span>
                      <span class="sr-only">{{ resultWord(r.result) }}{{ r.tournament ? ' (tournament)' : '' }}</span>
                      <span v-if="r.tournament" aria-hidden="true" class="absolute -top-1 -right-1 text-[10px] text-yellow-300">★</span>
                    </li>
                  </ul>
                  <p class="text-[11px] text-gray-500 mt-1">★ marks a tournament game.</p>
                </template>

                <template v-if="stats.human.topDecks.length">
                  <h5 class="text-sm font-semibold mt-4 mb-1">Most-played decks</h5>
                  <ul class="space-y-1.5">
                    <li v-for="deck in stats.human.topDecks" :key="deck.deckId" class="flex items-center justify-between border border-white/10 rounded-lg px-3 py-2 text-sm">
                      <span class="font-semibold truncate pr-2">{{ deck.deckName }}</span>
                      <span class="text-xs text-gray-300 shrink-0 tabular-nums">
                        {{ deck.games }} games · {{ deck.wins }}-{{ deck.losses }}-{{ deck.ties }} · {{ pct(deck.winPct) }}
                      </span>
                    </li>
                  </ul>
                  <p class="text-[11px] text-gray-500 mt-1">A deck is its 12 gToons in any order; forfeited games aren't counted here.</p>
                </template>
              </template>
            </section>

            <!-- Practice Matches -->
            <section aria-labelledby="ogps-practice">
              <h4 id="ogps-practice" class="text-base font-semibold mb-2">Practice Matches</h4>
              <p v-if="!stats.practice.played" class="text-sm text-gray-400">No practice matches played to the end in this timeframe.</p>
              <template v-else>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  <div v-for="tile in practiceTiles" :key="tile.label" class="bg-white/10 border border-white/20 rounded-lg p-3">
                    <div class="text-[11px] uppercase tracking-wide text-gray-400">{{ tile.label }}</div>
                    <div class="text-lg font-semibold">{{ tile.value }}</div>
                  </div>
                </div>

                <h5 class="text-sm font-semibold mb-1">How they win</h5>
                <WinMethod :method="stats.practice.winMethod" :wins="stats.practice.wins" other-label="Other (earlier matches)" />

                <h5 class="text-sm font-semibold mt-4 mb-1">By difficulty</h5>
                <table class="min-w-full text-sm">
                  <caption class="sr-only">Practice record by difficulty</caption>
                  <thead>
                    <tr class="text-left text-gray-400 border-b border-white/20">
                      <th scope="col" class="py-1 pr-3 font-normal">Difficulty</th>
                      <th scope="col" class="py-1 pr-3 font-normal">Played</th>
                      <th scope="col" class="py-1 pr-3 font-normal">Win-Loss-Tie</th>
                      <th scope="col" class="py-1 font-normal">Win %</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in stats.practice.byDifficulty" :key="row.difficulty" class="border-b border-white/10">
                      <th scope="row" class="py-1 pr-3 text-left font-normal">{{ DIFFICULTY_LABELS[row.difficulty] }}</th>
                      <td class="py-1 pr-3 tabular-nums">{{ row.played }}</td>
                      <td class="py-1 pr-3 tabular-nums">{{ recordText(row) }}</td>
                      <td class="py-1 tabular-nums">{{ row.played ? pct(row.winPct) : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </section>

            <p class="text-xs text-gray-500">
              Win % counts a tie as half a win. Updated {{ updatedText }} · refreshes about once an hour.
            </p>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineComponent, h } from 'vue'
import { DIFFICULTY_LABELS } from '@/utils/ogGtoonDifficulty'

const props = defineProps({
  username: { type: String, required: true },
  initialTimeframe: { type: String, default: 'all' }
})
const emit = defineEmits(['close'])

/** The Goal colors / Points / Other split: a bar plus a legend with counts, so it never relies on colour alone. */
const WinMethod = defineComponent({
  props: { method: { type: Object, required: true }, wins: { type: Number, default: 0 }, otherLabel: { type: String, default: 'Other' } },
  setup(p) {
    return () => {
      if (!p.wins) return h('p', { class: 'text-sm text-gray-400' }, 'No wins in this timeframe yet.')
      const parts = [
        { label: 'Goal colors', count: p.method.color, pct: p.method.colorPct, bar: 'bg-sky-500' },
        { label: 'Points', count: p.method.points, pct: p.method.pointsPct, bar: 'bg-amber-500' },
        { label: p.otherLabel, count: p.method.other, pct: p.method.otherPct, bar: 'bg-gray-500' }
      ].filter(x => x.count > 0)
      return h('div', [
        h('div', { class: 'flex h-2.5 w-full rounded overflow-hidden bg-white/10', 'aria-hidden': 'true' },
          parts.map(x => h('span', { class: x.bar, style: { width: `${x.pct}%` } }))),
        h('ul', { class: 'mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-300' },
          parts.map(x => h('li', [
            h('span', { class: ['inline-block w-2 h-2 rounded-sm mr-1 align-middle', x.bar], 'aria-hidden': 'true' }),
            `${x.label}: ${x.count} (${x.pct.toFixed(0)}%)`
          ])))
      ])
    }
  }
})

const timeframe = ref(props.initialTimeframe)
const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const stats = ref(null)
const dialogEl = ref(null)
const closeBtn = ref(null)

const pct = (v) => `${Number(v || 0).toFixed(1)}%`
const recordText = (r) => `${r.wins}-${r.losses}-${r.ties}`
const resultWord = (r) => ({ W: 'Win', L: 'Loss', T: 'Tie' }[r] || r)

const humanTiles = computed(() => {
  const hm = stats.value?.human
  if (!hm) return []
  return [
    { label: 'Games', value: hm.played.toLocaleString() },
    { label: 'Win-Loss-Tie', value: recordText(hm) },
    { label: 'Win %', value: pct(hm.winPct) },
    { label: 'Stake points won', value: stats.value.human.stakePointsWon.toLocaleString(), note: 'from opponents' }
  ]
})
const practiceTiles = computed(() => {
  const p = stats.value?.practice
  if (!p) return []
  return [
    { label: 'Played', value: p.played.toLocaleString() },
    { label: 'Win-Loss-Tie', value: recordText(p) },
    { label: 'Win %', value: pct(p.winPct) }
  ]
})
const splitRows = computed(() => {
  const hm = stats.value?.human
  return hm ? [{ label: 'Non-tournament', rec: hm.casual }, { label: 'Tournament', rec: hm.tournament }] : []
})
const updatedText = computed(() => {
  const at = stats.value?.generatedAt ? new Date(stats.value.generatedAt) : null
  return at && !Number.isNaN(at.getTime())
    ? at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''
})

let requestId = 0
let mounted = true
async function loadData() {
  const mine = ++requestId
  if (stats.value) refreshing.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/game/oggtoons/player', { query: { username: props.username, timeframe: timeframe.value } })
    if (mine !== requestId || !mounted) return
    stats.value = res
  } catch (err) {
    if (mine !== requestId || !mounted) return
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load this player\'s stats.'
  } finally {
    if (mine === requestId && mounted) { loading.value = false; refreshing.value = false }
  }
}

function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); emit('close'); return }
  if (e.key === 'Tab' && dialogEl.value) {
    const focusable = [...dialogEl.value.querySelectorAll('button, [href], select, input, [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

watch(timeframe, loadData)
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  loadData()
  nextTick(() => closeBtn.value?.focus())
})
onBeforeUnmount(() => {
  mounted = false
  window.removeEventListener('keydown', onKeydown)
})
</script>
