<!-- components/oggtoons/OgGtoonTournaments.vue -->
<!-- The Tournaments tab of the OG gToons hub: one sub-tab per ACTIVE tournament (opt-in open, starting,
     or running), plus a "Past" sub-tab for finished ones. With a lot of tournaments live the sub-tabs
     collapse into a dropdown. Deep-linkable with ?tab=tournaments&t=<id>. -->
<template>
  <div class="ogt-tabs h-full flex flex-col text-white">
    <div v-if="loading" class="p-4 text-gray-300" aria-busy="true">Loading tournaments…</div>
    <div v-else-if="loadError" class="m-3 p-3 rounded bg-red-500/20 border border-red-400 text-sm" role="alert">
      {{ loadError }} <button class="underline ml-1" @click="loadList()">Try again</button>
    </div>

    <template v-else>
      <!-- Sub-tabs -->
      <div class="ogt-subbar" :class="{ 'ogt-subbar-select': useSelect }">
        <template v-if="useSelect">
          <label for="ogt-pick" class="sr-only">Tournament</label>
          <select id="ogt-pick" class="ogt-select" :value="sel" @change="select($event.target.value)">
            <option v-for="x in active" :key="x.id" :value="x.id">{{ x.needsAction ? '● ' : '' }}{{ x.name }} — {{ statusText(x.status) }}</option>
            <option :value="PAST">Past tournaments</option>
          </select>
        </template>
        <div v-else role="tablist" aria-label="Tournaments" class="ogt-tablist" @keydown="onKey">
          <button
            v-for="x in active" :key="x.id" :id="'ogt-tab-' + x.id" role="tab" class="ogt-tab"
            :class="{ 'ogt-active': sel === x.id }" :aria-selected="sel === x.id" :tabindex="sel === x.id ? 0 : -1"
            aria-controls="ogt-body" @click="select(x.id)"
          >
            <span class="ogt-tab-name">{{ x.name }}</span>
            <span class="ogt-tab-status">{{ statusText(x.status) }}</span>
            <span v-if="x.needsAction" class="ogt-dot" title="You have a match to play"><span class="sr-only">You have a match to play</span></span>
          </button>
          <button id="ogt-tab-past" role="tab" class="ogt-tab" :class="{ 'ogt-active': sel === PAST }" :aria-selected="sel === PAST"
            :tabindex="sel === PAST ? 0 : -1" aria-controls="ogt-body" @click="select(PAST)">
            <span class="ogt-tab-name">Past</span>
          </button>
        </div>
      </div>

      <div id="ogt-body" role="tabpanel" :aria-labelledby="sel === PAST ? 'ogt-tab-past' : 'ogt-tab-' + sel" class="flex-1 overflow-y-auto">
        <!-- Nothing running -->
        <div v-if="sel === PAST" class="px-3 py-3 max-w-5xl mx-auto">
          <template v-if="pastOpenId">
            <button class="text-sm text-indigo-300 hover:text-indigo-200 underline mb-2" @click="pastOpenId = null">← All past tournaments</button>
            <OgGtoonTournamentPanel :key="pastOpenId" :tournament-id="pastOpenId" @switch-tab="$emit('switch-tab', $event)" @open-match="openMatch" />
          </template>
          <template v-else>
            <p v-if="!active.length" class="mb-4 p-3 rounded bg-white/10 border border-white/20 text-sm">
              There are no tournaments running right now. When one is announced it will appear here as its own tab.
            </p>
            <h2 class="text-lg font-bold mb-2">Past tournaments</h2>
            <p v-if="!past.length" class="text-sm text-gray-400">No finished tournaments yet.</p>
            <ul v-else class="grid gap-2 sm:grid-cols-2">
              <li v-for="x in past" :key="x.id">
                <button class="w-full text-left p-3 rounded bg-white/10 hover:bg-white/15 border border-white/15" @click="pastOpenId = x.id">
                  <span class="font-semibold">{{ x.name }}</span>
                  <span class="block text-xs text-gray-400">
                    {{ x.status === 'CANCELLED' ? 'Cancelled' : 'Won by ' + (x.winnerUsername || 'unknown') }}
                    · {{ x.optInCount }} entrants
                    <template v-if="x.tournamentCompletedAt"> · {{ dateOnly(x.tournamentCompletedAt) }}</template>
                  </span>
                </button>
              </li>
            </ul>
          </template>
        </div>

        <OgGtoonTournamentPanel v-else-if="sel" :key="sel" :tournament-id="sel" @switch-tab="$emit('switch-tab', $event)" @open-match="openMatch" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from '#imports'
import OgGtoonTournamentPanel from '@/components/oggtoons/OgGtoonTournamentPanel.vue'

defineEmits(['switch-tab'])

const PAST = '__past'
const route = useRoute()
const router = useRouter()

const list = ref([])
const loading = ref(true)
const loadError = ref('')
const sel = ref('')
const pastOpenId = ref(null)
let timer = null

const ACTIVE = new Set(['DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE'])
const active = computed(() => list.value.filter(x => ACTIVE.has(x.status)).sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || new Date(a.optInStartAt) - new Date(b.optInStartAt)))
const past = computed(() => list.value.filter(x => !ACTIVE.has(x.status)))
// Many live tournaments: a dropdown reads better than a wall of tiny tabs.
const useSelect = computed(() => active.value.length >= 5)

const LABELS = { DRAFT: 'Soon', OPT_IN_OPEN: 'Opt-in open', OPT_IN_CLOSED: 'Starting', SWISS_ACTIVE: 'Swiss', BRACKET_ACTIVE: 'Bracket', COMPLETE: 'Complete', CANCELLED: 'Cancelled' }
const statusText = (s) => LABELS[s] || s
const dateOnly = (v) => new Date(v).toLocaleDateString()

function select(id, { push = true } = {}) {
  sel.value = id
  pastOpenId.value = null
  if (!push) return
  // Keep the address bar in step so a tournament can be linked to (and survives a refresh).
  router.replace({ query: { ...route.query, tab: 'tournaments', t: id === PAST ? undefined : id } }).catch?.(() => {})
}

function onKey(e) {
  const ids = [...active.value.map(x => x.id), PAST]
  const i = ids.indexOf(sel.value)
  let next = -1
  if (e.key === 'ArrowRight') next = (i + 1) % ids.length
  else if (e.key === 'ArrowLeft') next = (i - 1 + ids.length) % ids.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = ids.length - 1
  if (next < 0) return
  e.preventDefault()
  select(ids[next])
  document.getElementById(ids[next] === PAST ? 'ogt-tab-past' : `ogt-tab-${ids[next]}`)?.focus()
}

function openMatch(id) {
  if (id) router.push(`/newsite/gtoons-classic/${id}`)
}

async function loadList({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  loadError.value = ''
  try {
    const data = await $fetch('/api/game/oggtoons/tournaments')
    list.value = Array.isArray(data) ? data : []
    if (!sel.value) {
      const want = route.query.t
      const wanted = typeof want === 'string' && list.value.find(x => x.id === want)
      if (wanted) {
        if (ACTIVE.has(wanted.status)) sel.value = wanted.id
        else { sel.value = PAST; pastOpenId.value = wanted.id }
      } else {
        sel.value = active.value[0]?.id || PAST
      }
    } else if (sel.value !== PAST && !list.value.some(x => x.id === sel.value)) {
      sel.value = active.value[0]?.id || PAST
    }
  } catch (e) {
    if (!quiet) loadError.value = e?.data?.statusMessage || 'Could not load tournaments.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
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
watch(() => route.query.t, (t) => {
  // Back/forward or a link from a Discord message while the tab is open.
  if (typeof t === 'string' && t !== sel.value && list.value.some(x => x.id === t && ACTIVE.has(x.status))) select(t, { push: false })
})
</script>

<style scoped>
.ogt-subbar {
  display: flex;
  align-items: flex-end;
  padding: 6px 8px 0;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}
.ogt-subbar-select { padding-bottom: 6px; }
.ogt-tablist { display: flex; gap: 3px; flex-wrap: wrap; width: 100%; }
.ogt-tab {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  max-width: 16rem;
  padding: 6px 12px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: rgba(0, 0, 0, 0.3);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.ogt-tab:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.ogt-tab:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
.ogt-active { background: var(--OrbitLightBlue); color: #fff; }
.ogt-tab-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ogt-tab-status { font-size: 0.68rem; font-weight: 500; opacity: 0.8; white-space: nowrap; }
.ogt-dot { width: 9px; height: 9px; border-radius: 9999px; background: #fb923c; align-self: center; flex-shrink: 0; }
.ogt-select {
  width: 100%;
  max-width: 28rem;
  padding: 6px 8px;
  border-radius: 6px;
  color: #1f2937;
  background: #fff;
  font-size: 0.85rem;
}
</style>
