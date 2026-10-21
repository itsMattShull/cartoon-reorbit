<!-- components/oggtoons/OgGtoonLeaderboard.vue -->
<!-- The OG gToons Leaderboard tab. Two modes: Human Matches (players against each other; filter by
     tournament or not) and Practice Matches (finished matches against the bot; filter by difficulty).
     Filters live in the address bar (?lbMode=…) so a view can be shared. The numbers are cached on the
     server for an hour; the "Updated" time says how fresh they are. Rules: server/utils/ogGtoonBoards.js -->
<template>
  <div class="tab-content overflow-y-auto h-full px-4 py-3">
    <div class="flex flex-col md:flex-row md:items-end gap-3 mb-3">
      <div>
        <h2 class="text-xl font-bold">gToons Leaderboard</h2>
        <p v-if="updatedText" class="text-xs text-gray-400">{{ updatedText }}</p>
      </div>

      <div class="md:ml-auto flex flex-wrap items-end gap-2">
        <div class="flex flex-col">
          <label for="oglb-mode" class="text-[10px] uppercase tracking-wide text-gray-400">Matches</label>
          <select id="oglb-mode" v-model="mode" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="human">Human Matches</option>
            <option value="practice">Practice Matches</option>
          </select>
        </div>

        <div v-if="mode === 'human'" key="human-filter" class="flex flex-col">
          <label for="oglb-filter" class="text-[10px] uppercase tracking-wide text-gray-400">Match type</label>
          <select id="oglb-filter" v-model="filter" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="all">All</option>
            <option value="non_tournament">Non-tournament</option>
            <option value="tournament">Tournament</option>
          </select>
        </div>
        <div v-else key="practice-filter" class="flex flex-col">
          <label for="oglb-difficulty" class="text-[10px] uppercase tracking-wide text-gray-400">Difficulty</label>
          <select id="oglb-difficulty" v-model="difficulty" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="all">All</option>
            <option value="easy">{{ DIFFICULTY_LABELS.easy }}</option>
            <option value="normal">{{ DIFFICULTY_LABELS.normal }}</option>
            <option value="hard">{{ DIFFICULTY_LABELS.hard }}</option>
          </select>
        </div>

        <div class="flex flex-col">
          <label for="oglb-timeframe" class="text-[10px] uppercase tracking-wide text-gray-400">Timeframe</label>
          <select id="oglb-timeframe" v-model="timeframe" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="1w">1 Week</option>
            <option value="1m">1 Month</option>
            <option value="3m">3 Months</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="error" class="mb-3 p-3 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
      {{ error }} <button type="button" class="underline ml-1" @click="loadData">Try again</button>
    </div>

    <p class="text-xs text-gray-400 mb-3">{{ blurb }}</p>

    <div
      class="grid grid-cols-1 md:grid-cols-2 gap-4 transition-opacity"
      :class="{ 'opacity-60': refreshing }"
      :aria-busy="loading || refreshing"
    >
      <LeaderboardCard title="Total Games Won" subtitle="(Win-Loss-Tie)" :rows="wins" :loading="loading" show-record selectable :empty-text="emptyText" @select="openPlayer" />
      <LeaderboardCard title="Win Percentage" subtitle="(Win-Loss-Tie)" :rows="winPct" value-type="percent" :loading="loading" show-record selectable :empty-text="winPctEmptyText" @select="openPlayer" />
      <LeaderboardCard v-if="showEarned" title="Stake Points Earned (Top 10)" :rows="earned" suffix="pts" :loading="loading" selectable :empty-text="emptyText" @select="openPlayer" />
      <LeaderboardCard title="Total Games Played" subtitle="(Win-Loss-Tie)" :rows="played" :loading="loading" show-record selectable :empty-text="emptyText" @select="openPlayer" />
    </div>

    <p class="text-xs text-gray-400 mt-3">
      Win % counts a tie as half a win and needs {{ minGamesShown }}+ games. Select a player's name to see their gToons stats.
    </p>

    <OgGtoonPlayerStats
      v-if="playerOpen"
      :key="playerOpen"
      :username="playerOpen"
      :initial-timeframe="timeframe"
      @close="closePlayer"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from '#imports'
import LeaderboardCard from '@/components/LeaderboardCard.vue'
import OgGtoonPlayerStats from '@/components/oggtoons/OgGtoonPlayerStats.vue'
import { DIFFICULTY_LABELS } from '@/utils/ogGtoonDifficulty'

const MODES = ['human', 'practice']
const FILTERS = ['all', 'non_tournament', 'tournament']
const DIFFICULTIES = ['all', 'easy', 'normal', 'hard']
const TIMEFRAMES = ['1w', '1m', '3m', '6m', '1y', 'all']
const DEFAULTS = { mode: 'human', filter: 'all', difficulty: 'all', timeframe: '1m' }

const route = useRoute()
const router = useRouter()

// Restore a shared view from the address bar, ignoring anything that isn't a known value.
const fromUrl = (key, allowed, fallback) => (allowed.includes(route.query[key]) ? route.query[key] : fallback)
const mode = ref(fromUrl('lbMode', MODES, DEFAULTS.mode))
const filter = ref(mode.value === 'human' ? fromUrl('lbMatch', FILTERS, DEFAULTS.filter) : DEFAULTS.filter)
const difficulty = ref(mode.value === 'practice' ? fromUrl('lbDiff', DIFFICULTIES, DEFAULTS.difficulty) : DEFAULTS.difficulty)
const timeframe = ref(fromUrl('lbTime', TIMEFRAMES, DEFAULTS.timeframe))

const loading = ref(true)     // first load: skeleton rows
const refreshing = ref(false) // later loads: keep the old rows, dimmed
const error = ref('')
const data = ref(null)

const wins = computed(() => data.value?.wins || [])
const winPct = computed(() => data.value?.winPct || [])
const played = computed(() => data.value?.played || [])
const earned = computed(() => data.value?.earned || [])
const showEarned = computed(() => mode.value === 'human' && filter.value !== 'tournament')
const minGamesShown = computed(() => data.value?.minGames ?? (mode.value === 'practice' ? 10 : 3))

const emptyText = computed(() => (mode.value === 'practice'
  ? 'No practice results yet for this selection.'
  : 'No data for this timeframe.'))
const winPctEmptyText = computed(() => (mode.value === 'practice'
  ? `Nobody has played ${minGamesShown.value}+ practice matches here yet.`
  : `Nobody has played ${minGamesShown.value}+ games for this selection yet.`))

const blurb = computed(() => {
  if (mode.value === 'practice') {
    return 'Matches played to the end against the computer. Practice results are counted from the day this launched, and matches you leave early aren\'t recorded.'
  }
  if (filter.value === 'tournament') return 'Tournament games are zero-stake and played with decks locked at opt-in.'
  if (filter.value === 'all') return 'Every finished game between players, tournament games included.'
  return 'Finished games between players, not counting tournament games.'
})

const updatedText = computed(() => {
  const at = data.value?.generatedAt ? new Date(data.value.generatedAt) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  return `Updated ${at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · refreshes about once an hour`
})

// The player-stats modal: remember what opened it so closing puts focus back there.
const playerOpen = ref('')
let playerOpener = null
function openPlayer(username, evt) {
  playerOpener = evt?.currentTarget || null
  playerOpen.value = username
}
function closePlayer() {
  playerOpen.value = ''
  nextTick(() => playerOpener?.focus?.())
}

let requestId = 0
let mounted = true
async function loadData() {
  const mine = ++requestId
  if (data.value) refreshing.value = true
  error.value = ''
  try {
    const query = { mode: mode.value, timeframe: timeframe.value }
    if (mode.value === 'human') query.filter = filter.value
    else query.difficulty = difficulty.value
    const res = await $fetch('/api/game/oggtoons/leaderboard', { query })
    if (mine !== requestId || !mounted) return // a newer selection is already on its way
    data.value = res
  } catch (err) {
    if (mine !== requestId || !mounted) return
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load the leaderboard.'
  } finally {
    if (mine === requestId && mounted) { loading.value = false; refreshing.value = false }
  }
}

// Only non-default choices go in the URL, so a plain tab visit stays clean.
function syncUrl() {
  const q = { ...route.query }
  const set = (key, value, def) => { if (value === def) delete q[key]; else q[key] = value }
  set('lbMode', mode.value, DEFAULTS.mode)
  set('lbMatch', mode.value === 'human' ? filter.value : DEFAULTS.filter, DEFAULTS.filter)
  set('lbDiff', mode.value === 'practice' ? difficulty.value : DEFAULTS.difficulty, DEFAULTS.difficulty)
  set('lbTime', timeframe.value, DEFAULTS.timeframe)
  router.replace({ query: q }).catch?.(() => {})
}

// Each mode has its own sub-filter, so switching starts that one from its default rather than carrying
// a value (say "Hard") invisibly into a mode where it doesn't apply.
watch(mode, (m) => {
  if (m === 'human') filter.value = DEFAULTS.filter
  else difficulty.value = DEFAULTS.difficulty
})
watch([mode, filter, difficulty, timeframe], () => { syncUrl(); loadData() })

onMounted(loadData)
onBeforeUnmount(() => { mounted = false })
</script>
