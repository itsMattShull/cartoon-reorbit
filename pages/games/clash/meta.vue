<template>
  <div class="mt-8">&nbsp;</div>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <section class="mt-20 max-w-6xl mx-auto px-4 pb-12 space-y-6">
      <div class="flex flex-col md:flex-row md:items-end gap-4">
        <div>
          <h1 class="text-2xl font-bold">gToons Clash Meta</h1>
          <p class="text-sm text-gray-600">
            Track winning decks and the gToons shaping the current meta.
          </p>
        </div>

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <select v-model="filter" class="border rounded px-2 py-1 text-sm">
            <option value="all">All Matches</option>
            <option value="non_tournament">Non-Tournament Only</option>
            <option value="tournament">Tournament Only</option>
          </select>

          <select v-model.number="days" class="border rounded px-2 py-1 text-sm">
            <option :value="7">Last 7 Days</option>
            <option :value="14">Last 14 Days</option>
            <option :value="30">Last 30 Days</option>
            <option :value="60">Last 60 Days</option>
            <option :value="90">Last 90 Days</option>
          </select>

          <select v-model="sort" class="border rounded px-2 py-1 text-sm">
            <option value="winPct">Sort: Win %</option>
            <option value="wins">Sort: Wins</option>
            <option value="games">Sort: Games</option>
          </select>

          <div class="flex items-center gap-2 text-xs text-gray-600">
            <span>Min games</span>
            <input
              v-model.number="minGames"
              type="number"
              min="0"
              class="w-16 border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      </div>

      <div class="bg-white border rounded-lg p-4 shadow-sm lg:hidden">
        <h2 class="text-lg font-semibold mb-2">About This View</h2>
        <p class="text-xs text-gray-600">
          Deck stats are based on PvP matches with saved deck snapshots. Tournament filters
          reflect matches paired under gToons tournament rounds.
        </p>
      </div>

      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white border rounded-lg p-4 shadow-sm animate-pulse">
          <div class="h-3 w-28 bg-gray-200 rounded mb-3"></div>
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
        </div>
        <div class="bg-white border rounded-lg p-4 shadow-sm animate-pulse">
          <div class="h-3 w-24 bg-gray-200 rounded mb-3"></div>
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
        </div>
        <div class="bg-white border rounded-lg p-4 shadow-sm animate-pulse">
          <div class="h-3 w-28 bg-gray-200 rounded mb-3"></div>
          <div class="h-7 w-16 bg-gray-200 rounded"></div>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white border rounded-lg p-4 shadow-sm">
          <div class="text-xs uppercase tracking-wide text-gray-500">Games Counted</div>
          <div class="text-2xl font-semibold">{{ stats?.totalGames ?? 0 }}</div>
        </div>
        <div class="bg-white border rounded-lg p-4 shadow-sm">
          <div class="text-xs uppercase tracking-wide text-gray-500">Decks Tracked</div>
          <div class="text-2xl font-semibold">{{ stats?.totalDecks ?? 0 }}</div>
        </div>
        <div class="bg-white border rounded-lg p-4 shadow-sm">
          <div class="text-xs uppercase tracking-wide text-gray-500">Winning Games</div>
          <div class="text-2xl font-semibold">{{ stats?.totalWins ?? 0 }}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 space-y-4">
          <div class="bg-white border rounded-lg p-4 shadow-sm">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold">Top Winning Decks</h2>
              <span class="text-xs text-gray-500">Click a deck for details</span>
            </div>

            <div v-if="loading" class="space-y-2 animate-pulse">
              <div class="h-4 w-40 bg-gray-200 rounded"></div>
              <div v-for="i in 5" :key="`deck-skel-${i}`" class="grid grid-cols-5 gap-2">
                <div class="h-4 col-span-2 bg-gray-200 rounded"></div>
                <div class="h-4 bg-gray-200 rounded"></div>
                <div class="h-4 bg-gray-200 rounded"></div>
                <div class="h-4 bg-gray-200 rounded"></div>
                <div class="h-4 bg-gray-200 rounded"></div>
              </div>
            </div>
            <div v-else-if="!decks.length" class="text-sm text-gray-500">No deck data for this timeframe.</div>
            <div v-else class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500 border-b">
                    <th class="py-2 pr-3">Deck</th>
                    <th class="py-2 pr-3">Win %</th>
                    <th class="py-2 pr-3">Wins</th>
                    <th class="py-2 pr-3">Games</th>
                    <th class="py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="deck in decks"
                    :key="deck.deckKey"
                    class="border-b cursor-pointer hover:bg-gray-50"
                    :class="deck.deckKey === selectedDeckKey ? 'bg-indigo-50' : ''"
                    @click="selectDeck(deck)"
                  >
                    <td class="py-2 pr-3">
                      <div class="font-semibold">{{ deck.deckName }}</div>
                      <div class="text-xs text-gray-500">
                        {{ deck.wins }}-{{ deck.losses }}-{{ deck.ties }}
                      </div>
                    </td>
                    <td class="py-2 pr-3">{{ formatPct(deck.winPct) }}</td>
                    <td class="py-2 pr-3">{{ deck.wins }}</td>
                    <td class="py-2 pr-3">{{ deck.games }}</td>
                    <td class="py-2">{{ formatPct(deck.sharePct) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <div class="space-y-4">
          <div class="bg-white border rounded-lg p-4 shadow-sm hidden lg:block">
            <h2 class="text-lg font-semibold mb-2">About This View</h2>
            <p class="text-xs text-gray-600">
              Deck stats are based on PvP matches with saved deck snapshots. Tournament filters
              reflect matches paired under gToons tournament rounds.
            </p>
          </div>

          <div class="bg-white border rounded-lg p-4 shadow-sm">
            <h2 class="text-lg font-semibold mb-3">Winning gToons</h2>
            <div v-if="loading" class="space-y-2 animate-pulse">
              <div v-for="i in 5" :key="`gtoon-skel-${i}`" class="border rounded-lg px-3 py-2">
                <div class="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                <div class="h-3 w-24 bg-gray-200 rounded"></div>
              </div>
            </div>
            <div v-else-if="!winningCtoons.length" class="text-sm text-gray-500">No winning data yet.</div>
            <div v-else class="space-y-2">
              <div
                v-for="ctoon in winningCtoons"
                :key="ctoon.ctoonId"
                class="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
              >
                <div>
                  <div class="font-semibold">{{ ctoon.name }}</div>
                  <div class="text-xs text-gray-500">
                    {{ ctoon.gtoonType || 'Unknown type' }} - {{ ctoon.deckWins }} wins
                  </div>
                </div>
                <div class="text-xs text-gray-500 text-right">
                  {{ formatPct(ctoon.winSharePct) }}
                  <div class="text-[11px]">share</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="isDeckModalOpen && selectedDeck"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/50" @click="closeDeckModal"></div>
      <div
        class="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-lg flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div class="flex items-start justify-between gap-4 px-4 py-3 border-b bg-white">
          <div>
            <h3 class="text-lg font-semibold">{{ selectedDeck.deckName }}</h3>
            <p class="text-xs text-gray-500">
              {{ selectedDeck.games }} games - {{ formatPct(selectedDeck.winPct) }} win rate
            </p>
          </div>
          <button
            type="button"
            class="text-gray-500 hover:text-gray-800 text-xl font-bold leading-none"
            @click="closeDeckModal"
            aria-label="Close deck details"
          >
            &times;
          </button>
        </div>

        <div class="flex-1 overflow-y-auto px-4 py-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="card in selectedDeck.cards"
              :key="`${selectedDeck.deckKey}-${card.ctoonId}`"
              class="border rounded-lg p-3 text-sm flex gap-3"
            >
              <div class="w-16 h-16 shrink-0 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                <img
                  v-if="card.assetPath"
                  :src="card.assetPath"
                  :alt="card.name || 'gToon image'"
                  class="w-full h-full object-contain"
                  loading="lazy"
                />
                <div v-else class="text-[10px] text-gray-400">No image</div>
              </div>
              <div class="min-w-0">
                <div class="text-xs uppercase tracking-wide text-gray-500">x{{ card.quantity }}</div>
                <div class="font-semibold truncate">{{ card.name || 'Unknown' }}</div>
                <div class="text-xs text-gray-500">
                  {{ card.gtoonType || 'Unknown type' }}
                  <span v-if="card.cost !== null">- Cost {{ card.cost }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t bg-gray-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          <div>
            {{ selectedDeck.wins }} wins / {{ selectedDeck.losses }} losses / {{ selectedDeck.ties }} ties
          </div>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium bg-gray-900 text-white rounded"
            @click="closeDeckModal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({
  title: 'gToons Clash Meta',
  middleware: 'auth',
  layout: 'default'
})

const days = ref(30)
const filter = ref('all')
const sort = ref('winPct')
const minGames = ref(3)

const loading = ref(true)
const stats = ref(null)
const selectedDeckKey = ref(null)
const isDeckModalOpen = ref(false)

const decks = computed(() => stats.value?.decks || [])
const winningCtoons = computed(() => stats.value?.winningCtoons || [])
const selectedDeck = computed(() => decks.value.find(d => d.deckKey === selectedDeckKey.value) || null)

function formatPct(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return '0%'
  return `${num.toFixed(1)}%`
}

function selectDeck(deck) {
  selectedDeckKey.value = deck.deckKey
  isDeckModalOpen.value = true
}

function closeDeckModal() {
  isDeckModalOpen.value = false
}

async function loadData() {
  loading.value = true
  try {
    const res = await fetch(
      `/api/game/clash/meta?days=${days.value}&filter=${filter.value}&sort=${sort.value}&minGames=${minGames.value}`,
      { credentials: 'include' }
    )
    const data = await res.json()
    stats.value = data
    if (!selectedDeckKey.value && data.decks?.length) {
      selectedDeckKey.value = data.decks[0].deckKey
    } else if (selectedDeckKey.value && data.decks?.length) {
      const exists = data.decks.some(d => d.deckKey === selectedDeckKey.value)
      if (!exists) selectedDeckKey.value = data.decks[0].deckKey
    }
  } catch (err) {
    console.error('Failed to load clash meta:', err)
    stats.value = { decks: [], winningCtoons: [], totalGames: 0, totalWins: 0, totalDecks: 0 }
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch([days, filter, sort, minGames], loadData)
</script>
