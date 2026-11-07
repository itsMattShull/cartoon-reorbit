<!-- components/oggtoons/OgGtoonTournaments.vue -->
<!-- The Tournaments tab of the OG gToons hub: every tournament as a card that links to its OWN page
     (/newsite/gtoons-classic/tournaments/<id>) — that page has opt in/out, your next match, Start next game, standings
     and prizes. Running ones come first; finished ones are listed under "Past". The card says what you can do right now
     ("Opt-in is open — enter", "Your match is ready"), so nothing needs hunting for. -->
<template>
  <div class="ogt-list h-full overflow-y-auto text-white">
    <div v-if="loading" class="p-4 text-gray-300" aria-busy="true">Loading tournaments…</div>
    <div v-else-if="loadError" class="m-3 p-3 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
      {{ loadError }} <button class="underline ml-1" @click="loadList()">Try again</button>
    </div>

    <div v-else class="px-3 py-3 max-w-5xl mx-auto">
      <h2 class="text-lg font-bold mb-2">Tournaments</h2>
      <p v-if="!active.length" class="mb-4 p-3 rounded bg-white/10 border border-white/20 text-sm">
        There are no tournaments running right now. When one is announced it will appear here.
      </p>
      <ul v-else class="grid gap-3 sm:grid-cols-2" aria-label="Current tournaments">
        <li v-for="x in active" :key="x.id">
          <NuxtLink :to="pageFor(x.id)" class="ogt-card block h-full" :class="{ 'ogt-card-action': x.needsAction }">
            <span class="flex items-start justify-between gap-2">
              <span class="font-semibold text-base">{{ x.name }}</span>
              <span class="ogt-badge" :class="statusClass(x.status)">{{ statusText(x.status) }}</span>
            </span>
            <span class="block text-xs text-gray-300 mt-1">
              {{ x.optInCount }} {{ x.optInCount === 1 ? 'entrant' : 'entrants' }}
              <template v-if="x.status === 'DRAFT' || x.status === 'OPT_IN_OPEN'"> · opt-in {{ x.status === 'DRAFT' ? 'opens' : 'closes' }} {{ when(x.status === 'DRAFT' ? x.optInStartAt : x.optInEndAt) }}</template>
              <template v-if="x.hasPrizes"> · 🎁 prizes</template>
            </span>
            <span class="ogt-cta" :class="cta(x).cls">{{ cta(x).text }}</span>
          </NuxtLink>
        </li>
      </ul>

      <h2 class="text-lg font-bold mt-6 mb-2">Past tournaments</h2>
      <p v-if="!past.length" class="text-sm text-gray-400">No finished tournaments yet.</p>
      <ul v-else class="grid gap-2 sm:grid-cols-2" aria-label="Past tournaments">
        <li v-for="x in past" :key="x.id">
          <NuxtLink :to="pageFor(x.id)" class="ogt-card block h-full">
            <span class="font-semibold">{{ x.name }}</span>
            <span class="block text-xs text-gray-400">
              {{ x.status === 'CANCELLED' ? 'Cancelled' : 'Won by ' + (x.winnerUsername || 'unknown') }}
              · {{ x.optInCount }} entrants
              <template v-if="x.tournamentCompletedAt"> · {{ dateOnly(x.tournamentCompletedAt) }}</template>
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from '#imports'

// The hub passes @switch-tab to every tab; this one never asks for another tab (the tournament page does).
defineEmits(['switch-tab'])

const route = useRoute()
const router = useRouter()

const list = ref([])
const loading = ref(true)
const loadError = ref('')
let timer = null

const pageFor = (id) => `/newsite/gtoons-classic/tournaments/${id}`

const ACTIVE = new Set(['DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE'])
// Needs-your-action first, then open-for-entry, then by start time.
const active = computed(() => list.value.filter(x => ACTIVE.has(x.status)).sort((a, b) =>
  Number(b.needsAction) - Number(a.needsAction) ||
  Number(b.status === 'OPT_IN_OPEN') - Number(a.status === 'OPT_IN_OPEN') ||
  new Date(a.optInStartAt) - new Date(b.optInStartAt)))
const past = computed(() => list.value.filter(x => !ACTIVE.has(x.status)))

const LABELS = { DRAFT: 'Coming soon', OPT_IN_OPEN: 'Opt-in open', OPT_IN_CLOSED: 'Starting soon', SWISS_ACTIVE: 'Swiss', BRACKET_ACTIVE: 'Bracket', COMPLETE: 'Complete', CANCELLED: 'Cancelled' }
const statusText = (s) => LABELS[s] || s
const statusClass = (s) => (s === 'OPT_IN_OPEN' ? 'bg-green-300/20 text-green-200' : s === 'SWISS_ACTIVE' || s === 'BRACKET_ACTIVE' ? 'bg-blue-300/20 text-blue-200' : 'bg-yellow-200/20 text-yellow-200')
const dateOnly = (v) => new Date(v).toLocaleDateString()
const when = (v) => new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The one thing worth doing on this tournament right now. */
function cta(x) {
  if (x.disqualified) return { text: 'You were removed from this tournament', cls: 'ogt-cta-muted' }
  if (x.needsAction) return { text: 'Your match is ready — open it →', cls: 'ogt-cta-go' }
  if (x.status === 'OPT_IN_OPEN') return x.isOptedIn
    ? { text: '✅ You\'re entered — view tournament →', cls: 'ogt-cta-ok' }
    : { text: 'Opt-in is open — enter with a deck →', cls: 'ogt-cta-go' }
  if (x.isOptedIn) return { text: '✅ You\'re in — view tournament →', cls: 'ogt-cta-ok' }
  return { text: 'View tournament →', cls: 'ogt-cta-muted' }
}

async function loadList({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch('/api/game/oggtoons/tournaments')
    list.value = Array.isArray(data) ? data : []
  } catch (e) {
    if (!quiet) loadError.value = e?.data?.statusMessage || 'Could not load tournaments.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // A link from before tournaments had their own page (?tab=tournaments&t=<id>) goes to that tournament's page.
  const legacy = route.query.t
  if (typeof legacy === 'string' && /^[0-9a-f-]{8,}$/i.test(legacy)) {
    router.replace(pageFor(legacy))
    return
  }
  loadList()
  const schedule = () => {
    timer = setTimeout(() => {
      if (document.visibilityState === 'visible') loadList({ quiet: true })
      schedule()
    }, 60000 + Math.floor(Math.random() * 15000))
  }
  schedule()
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.ogt-card {
  padding: 0.85rem 1rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  color: #fff;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s;
}
.ogt-card:hover, .ogt-card:focus-visible { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.4); }
.ogt-card:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.ogt-card-action { border-color: rgba(251, 146, 60, 0.8); }
.ogt-badge { font-size: 0.7rem; padding: 0.15rem 0.55rem; border-radius: 9999px; white-space: nowrap; }
.ogt-cta { display: block; margin-top: 0.6rem; font-size: 0.8rem; font-weight: 600; }
.ogt-cta-go { color: #86efac; }
.ogt-cta-ok { color: #a5b4fc; }
.ogt-cta-muted { color: rgba(255, 255, 255, 0.6); }
</style>
