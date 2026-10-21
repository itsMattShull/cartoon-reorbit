<!-- components/oggtoons/OgGtoonMeta.vue -->
<!-- The OG gToons Meta tab: which decks and which gToons are winning, from finished games between players.
     Mirrors gToons Clash's Meta tab. Differences that matter: OG decks have no names (a deck is its 12
     cards, in any order, labelled by its usual goal card), practice matches are never included, and the
     numbers are cached on the server for an hour. Rules: server/utils/ogGtoonBoards.js -->
<template>
  <div class="tab-content overflow-y-auto h-full px-4 py-3 text-white">
    <div class="flex flex-col lg:flex-row lg:items-end gap-3 mb-3">
      <div>
        <h2 class="text-xl font-bold">gToons Meta</h2>
        <p class="text-sm text-gray-300">Track the winning decks and the gToons shaping the current meta.</p>
        <p v-if="updatedText" class="text-xs text-gray-400">{{ updatedText }}</p>
      </div>

      <div class="lg:ml-auto flex flex-wrap items-end gap-2">
        <div class="flex flex-col">
          <label for="ogmeta-filter" class="text-[10px] uppercase tracking-wide text-gray-400">Match type</label>
          <select id="ogmeta-filter" v-model="filter" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="all">All Matches</option>
            <option value="non_tournament">Non-Tournament Only</option>
            <option value="tournament">Tournament Only</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label for="ogmeta-days" class="text-[10px] uppercase tracking-wide text-gray-400">Timeframe</label>
          <select id="ogmeta-days" v-model.number="days" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option :value="7">Last 7 Days</option>
            <option :value="14">Last 14 Days</option>
            <option :value="30">Last 30 Days</option>
            <option :value="60">Last 60 Days</option>
            <option :value="90">Last 90 Days</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label for="ogmeta-sort" class="text-[10px] uppercase tracking-wide text-gray-400">Sort decks</label>
          <select id="ogmeta-sort" v-model="sort" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
            <option value="winPct">Win %</option>
            <option value="wins">Wins</option>
            <option value="games">Games</option>
          </select>
        </div>
        <div class="flex flex-col">
          <label for="ogmeta-min" class="text-[10px] uppercase tracking-wide text-gray-400">Min games</label>
          <input
            id="ogmeta-min" v-model.number="minGames" type="number" min="2" max="100"
            class="w-16 border rounded px-2 py-1 text-sm text-gray-800 bg-white"
          />
        </div>
      </div>
    </div>

    <p class="text-xs text-gray-400 mb-3">
      Finished games between players only; practice matches are not included. Tournament decks are locked in before
      play, so their results can differ from queue play. Win % counts a tie as half a win.
    </p>

    <div v-if="error" class="mb-3 p-3 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
      {{ error }} <button type="button" class="underline ml-1" @click="loadData">Try again</button>
    </div>

    <div :class="{ 'opacity-60': refreshing }" class="transition-opacity" :aria-busy="loading || refreshing">
      <!-- Stat tiles -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div v-for="tile in tiles" :key="tile.label" class="bg-white/10 border border-white/20 rounded-lg p-3">
          <div class="text-xs uppercase tracking-wide text-gray-400">{{ tile.label }}</div>
          <div v-if="loading" class="h-6 w-12 bg-white/20 rounded animate-pulse mt-1"></div>
          <div v-else class="text-xl font-semibold">{{ tile.value.toLocaleString() }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Top decks -->
        <div class="lg:col-span-2">
          <div class="bg-white/10 border border-white/20 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-base font-semibold">Top Winning Decks</h3>
              <span class="text-xs text-gray-400">Select a deck for details</span>
            </div>

            <div v-if="loading" class="space-y-2 animate-pulse">
              <div v-for="i in 5" :key="`deck-skel-${i}`" class="grid grid-cols-5 gap-2">
                <div class="h-4 col-span-2 bg-white/20 rounded"></div>
                <div class="h-4 bg-white/20 rounded"></div>
                <div class="h-4 bg-white/20 rounded"></div>
                <div class="h-4 bg-white/20 rounded"></div>
              </div>
            </div>
            <p v-else-if="!decks.length" class="text-sm text-gray-400">
              No decks have played {{ minGames }}+ games with {{ filterText }} in the last {{ days }} days.
              Try lowering Min games or widening the timeframe.
            </p>
            <div v-else class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <caption class="sr-only">Top winning decks</caption>
                <thead>
                  <tr class="text-left text-gray-400 border-b border-white/20">
                    <th scope="col" class="py-2 pr-3">Deck</th>
                    <th scope="col" class="py-2 pr-3">Win %</th>
                    <th scope="col" class="py-2 pr-3">Wins</th>
                    <th scope="col" class="py-2 pr-3">Games</th>
                    <th scope="col" class="py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="deck in decks" :key="deck.deckId" class="border-b border-white/10 hover:bg-white/5">
                    <td class="py-2 pr-3">
                      <button type="button" class="text-left" :aria-label="`Show ${deck.deckName}`" @click="openDeck(deck, $event)">
                        <span class="font-semibold underline decoration-dotted underline-offset-2">{{ deck.deckName }}</span>
                        <span class="block text-xs text-gray-400">
                          {{ deck.wins }}-{{ deck.losses }}-{{ deck.ties }}
                          <span v-if="deck.mirrors"> · {{ deck.mirrors }} mirror{{ deck.mirrors === 1 ? '' : 's' }}</span>
                          <span v-if="deck.games < 10" class="ml-1 text-amber-300">small sample</span>
                        </span>
                      </button>
                    </td>
                    <td class="py-2 pr-3">{{ pct(deck.winPct) }}</td>
                    <td class="py-2 pr-3">{{ deck.wins }}</td>
                    <td class="py-2 pr-3">{{ deck.games }}</td>
                    <td class="py-2">{{ pct(deck.sharePct) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Winning gToons -->
        <div>
          <div class="bg-white/10 border border-white/20 rounded-lg p-3">
            <h3 class="text-base font-semibold mb-2">Winning gToons</h3>
            <div v-if="loading" class="space-y-2 animate-pulse">
              <div v-for="i in 5" :key="`gtoon-skel-${i}`" class="border border-white/10 rounded-lg px-3 py-2">
                <div class="h-4 w-28 bg-white/20 rounded mb-1"></div>
                <div class="h-3 w-20 bg-white/20 rounded"></div>
              </div>
            </div>
            <p v-else-if="!winningCards.length" class="text-sm text-gray-400">No winning data yet.</p>
            <ul v-else class="space-y-2 max-h-64 overflow-y-auto">
              <li
                v-for="card in winningCards" :key="card.ctoonId"
                class="flex items-center justify-between border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <div class="font-semibold truncate">{{ card.name }}</div>
                  <div class="text-xs text-gray-400">
                    <span :style="{ color: colorHex(card.color) }">{{ titleCase(card.color) }}</span>
                    · Value {{ card.value ?? '—' }} · {{ card.wins }} wins
                  </div>
                </div>
                <div class="text-xs text-gray-400 text-right shrink-0 pl-2">
                  {{ pct(card.winSharePct) }}
                  <div class="text-[11px]">of wins</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Card usage -->
      <div class="bg-white/10 border border-white/20 rounded-lg p-3 mt-4">
        <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
          <div>
            <h3 class="text-base font-semibold">Card Usage</h3>
            <p class="text-xs text-gray-400">How often each gToon is in a deck that plays, and how those decks do.</p>
          </div>
          <div class="sm:ml-auto flex flex-wrap items-end gap-2">
            <div class="flex flex-col">
              <label for="ogmeta-card-search" class="text-[10px] uppercase tracking-wide text-gray-400">Find a gToon</label>
              <input
                id="ogmeta-card-search" v-model="cardSearch" type="search" placeholder="Name"
                class="w-40 border rounded px-2 py-1 text-sm text-gray-800 bg-white"
              />
            </div>
            <div class="flex flex-col">
              <label for="ogmeta-card-sort" class="text-[10px] uppercase tracking-wide text-gray-400">Sort by</label>
              <select id="ogmeta-card-sort" v-model="cardSort" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
                <option value="appearances">Most used</option>
                <option value="winPct">Win %</option>
                <option value="name">Name</option>
              </select>
            </div>
          </div>
        </div>

        <div v-if="loading" class="space-y-2 animate-pulse">
          <div v-for="i in 5" :key="`card-skel-${i}`" class="h-4 bg-white/20 rounded"></div>
        </div>
        <p v-else-if="!shownCards.length" class="text-sm text-gray-400">
          {{ cardSearch ? 'No gToon matches that name.' : 'No card data for this selection.' }}
        </p>
        <div v-else class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <caption class="sr-only">Card usage</caption>
            <thead>
              <tr class="text-left text-gray-400 border-b border-white/20">
                <th scope="col" class="py-2 pr-3">gToon</th>
                <th scope="col" class="py-2 pr-3">In decks</th>
                <th scope="col" class="py-2 pr-3">Use %</th>
                <th scope="col" class="py-2 pr-3">Wins</th>
                <th scope="col" class="py-2">Win %</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="card in shownCards" :key="card.ctoonId" class="border-b border-white/10">
                <td class="py-1.5 pr-3">
                  <div class="flex items-center gap-2 min-w-[10rem]">
                    <img v-if="card.assetPath" :src="card.assetPath" alt="" class="w-7 h-7 object-contain rounded-full bg-black/30" loading="lazy" />
                    <span class="font-semibold truncate max-w-[14rem]">{{ card.name }}</span>
                    <span v-if="card.isSlam" class="text-[10px] font-bold text-yellow-300">SLAM</span>
                  </div>
                  <div class="text-[11px] ml-9 text-gray-400">
                    <span :style="{ color: colorHex(card.color) }">{{ titleCase(card.color) }}</span> · Value {{ card.value ?? '—' }}
                  </div>
                </td>
                <td class="py-1.5 pr-3 tabular-nums">{{ card.appearances }}</td>
                <td class="py-1.5 pr-3 tabular-nums">{{ pct(card.usePct) }}</td>
                <td class="py-1.5 pr-3 tabular-nums">{{ card.wins }}</td>
                <td class="py-1.5 tabular-nums">{{ pct(card.winPct) }}</td>
              </tr>
            </tbody>
          </table>
          <button
            v-if="filteredCards.length > CARD_PAGE && !showAllCards"
            type="button" class="mt-2 text-sm underline" @click="showAllCards = true"
          >Show all {{ filteredCards.length }} gToons</button>
        </div>
      </div>
    </div>

    <!-- Deck detail -->
    <Teleport to="body">
      <div v-if="selectedDeck" class="fixed inset-0 z-[1001] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/60" @click="closeDeck"></div>
        <div
          ref="dialogEl"
          class="relative w-full max-w-4xl max-h-[90vh] bg-gray-900 text-white border border-white/20 rounded-lg shadow-lg flex flex-col overflow-hidden"
          role="dialog" aria-modal="true" :aria-labelledby="'ogmeta-deck-title'"
        >
          <div class="flex items-start justify-between gap-4 px-4 py-3 border-b border-white/20">
            <div>
              <h3 id="ogmeta-deck-title" class="text-lg font-semibold">{{ selectedDeck.deckName }}</h3>
              <p class="text-xs text-gray-400">
                {{ selectedDeck.games }} games · {{ pct(selectedDeck.winPct) }} win rate ·
                {{ selectedDeck.wins }}-{{ selectedDeck.losses }}-{{ selectedDeck.ties }}
              </p>
            </div>
            <button ref="closeBtn" type="button" class="text-gray-300 hover:text-white text-2xl leading-none" aria-label="Close" @click="closeDeck">&times;</button>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-4">
            <ul class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <li v-for="card in selectedCards" :key="card.ctoonId" class="border border-white/10 rounded-lg p-2 text-sm flex flex-col items-center text-center">
                <div class="w-20">
                  <GtoonCard
                    v-if="card.assetPath"
                    :image-url="card.assetPath" :value="card.value ?? 0" :color="card.color || 'SILVER'"
                    :seed="String(card.ctoonId)" :alt="card.name" effects="static"
                  />
                </div>
                <div class="font-semibold mt-1 w-full truncate" :title="card.name">{{ card.name }}</div>
                <div class="text-xs text-gray-400">
                  <span :style="{ color: colorHex(card.color) }">{{ titleCase(card.color) }}</span> · Value {{ card.value ?? '—' }}
                </div>
                <div class="text-[10px] font-bold mt-0.5 flex gap-1.5">
                  <span v-if="card.isGoal" class="text-sky-300">GOAL CARD</span>
                  <span v-if="card.isSlam" class="text-yellow-300">SLAM</span>
                </div>
              </li>
            </ul>
          </div>

          <div class="border-t border-white/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
            <span>A deck is its 12 gToons in any order. The goal card shown is the one this deck most often had at the bottom.</span>
            <button type="button" class="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded" @click="closeDeck">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from '#imports'
import GtoonCard from '@/components/GtoonCard.vue'

const FILTERS = ['all', 'non_tournament', 'tournament']
const DAYS = [7, 14, 30, 60, 90]
const SORTS = ['winPct', 'wins', 'games']
const DEFAULTS = { filter: 'all', days: 30, sort: 'winPct', minGames: 3 }
const CARD_PAGE = 50

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
const colorHex = (c) => COLOR_HEX[c] || '#ffffff'
const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Unknown')
const pct = (v) => (Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}%` : '0%')

const route = useRoute()
const router = useRouter()

const urlDays = Number.parseInt(route.query.metaDays, 10)
const urlMin = Number.parseInt(route.query.metaMin, 10)
const filter = ref(FILTERS.includes(route.query.metaMatch) ? route.query.metaMatch : DEFAULTS.filter)
const days = ref(DAYS.includes(urlDays) ? urlDays : DEFAULTS.days)
const sort = ref(SORTS.includes(route.query.metaSort) ? route.query.metaSort : DEFAULTS.sort)
const minGames = ref(Number.isFinite(urlMin) ? Math.min(Math.max(urlMin, 2), 100) : DEFAULTS.minGames)

const loading = ref(true)
const refreshing = ref(false)
const error = ref('')
const stats = ref(null)

const decks = computed(() => stats.value?.decks || [])
const winningCards = computed(() => stats.value?.winningCards || [])
const dictionary = computed(() => stats.value?.cards || {})
const filterText = computed(() => ({ all: 'any match type', non_tournament: 'non-tournament games', tournament: 'tournament games' }[filter.value]))
const tiles = computed(() => [
  { label: 'Games Counted', value: stats.value?.totalGames ?? 0 },
  { label: 'Decks Tracked', value: stats.value?.totalDecks ?? 0 },
  { label: 'Games With A Winner', value: stats.value?.decidedGames ?? 0 }
])
const updatedText = computed(() => {
  const at = stats.value?.generatedAt ? new Date(stats.value.generatedAt) : null
  if (!at || Number.isNaN(at.getTime())) return ''
  return `Updated ${at.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · refreshes about once an hour`
})

/* Card usage table: search + sort happen here, on the (already capped) list the server sent. */
const cardSearch = ref('')
const cardSort = ref('appearances')
const showAllCards = ref(false)
const filteredCards = computed(() => {
  const q = cardSearch.value.trim().toLowerCase()
  const list = (stats.value?.cardUsage || []).filter(c => !q || String(c.name).toLowerCase().includes(q))
  const sorters = {
    appearances: (a, b) => (b.appearances - a.appearances) || (b.winPct - a.winPct),
    winPct: (a, b) => (b.winPct - a.winPct) || (b.appearances - a.appearances),
    name: (a, b) => String(a.name).localeCompare(String(b.name))
  }
  return [...list].sort(sorters[cardSort.value])
})
const shownCards = computed(() => (showAllCards.value ? filteredCards.value : filteredCards.value.slice(0, CARD_PAGE)))
watch([cardSearch, cardSort], () => { showAllCards.value = false })

/* Deck detail dialog */
const selectedDeckId = ref(null)
const dialogEl = ref(null)
const closeBtn = ref(null)
let opener = null
const selectedDeck = computed(() => decks.value.find(d => d.deckId === selectedDeckId.value) || null)
const selectedCards = computed(() => {
  const deck = selectedDeck.value
  if (!deck) return []
  return deck.cardIds
    .map(id => ({ ctoonId: id, ...(dictionary.value[id] || { name: 'Unknown gToon' }), isGoal: id === deck.goalCtoonId }))
    .sort((a, b) => (Number(b.isGoal) - Number(a.isGoal)) || ((b.value ?? 0) - (a.value ?? 0)) || String(a.name).localeCompare(String(b.name)))
})

function openDeck(deck, evt) {
  opener = evt?.currentTarget || null
  selectedDeckId.value = deck.deckId
  nextTick(() => closeBtn.value?.focus())
}
function closeDeck() {
  selectedDeckId.value = null
  nextTick(() => opener?.focus?.())
}
function onKeydown(e) {
  if (!selectedDeck.value) return
  if (e.key === 'Escape') { e.preventDefault(); closeDeck() }
  // Keep Tab inside the dialog.
  if (e.key === 'Tab' && dialogEl.value) {
    const focusable = [...dialogEl.value.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
}

let requestId = 0
let mounted = true
async function loadData() {
  const mine = ++requestId
  if (stats.value) refreshing.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/game/oggtoons/meta', {
      query: { days: days.value, filter: filter.value, sort: sort.value, minGames: minGames.value }
    })
    if (mine !== requestId || !mounted) return
    stats.value = res
  } catch (err) {
    if (mine !== requestId || !mounted) return
    error.value = err?.data?.statusMessage || err?.statusMessage || 'Could not load the meta.'
  } finally {
    if (mine === requestId && mounted) { loading.value = false; refreshing.value = false }
  }
}

function syncUrl() {
  const q = { ...route.query }
  const set = (key, value, def) => { if (value === def) delete q[key]; else q[key] = value }
  set('metaMatch', filter.value, DEFAULTS.filter)
  set('metaDays', days.value, DEFAULTS.days)
  set('metaSort', sort.value, DEFAULTS.sort)
  set('metaMin', minGames.value, DEFAULTS.minGames)
  router.replace({ query: q }).catch?.(() => {})
}

// Min games is typed, so wait a beat before refetching instead of firing on every keystroke.
let typingTimer = null
watch([filter, days, sort], () => { syncUrl(); loadData() })
watch(minGames, () => {
  clearTimeout(typingTimer)
  if (!Number.isFinite(Number(minGames.value)) || minGames.value === '') return // field cleared mid-edit
  typingTimer = setTimeout(() => { syncUrl(); loadData() }, 350)
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  loadData()
})
onBeforeUnmount(() => {
  mounted = false
  clearTimeout(typingTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>
