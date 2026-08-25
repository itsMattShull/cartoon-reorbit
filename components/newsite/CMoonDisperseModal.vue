<!-- components/newsite/CMoonDisperseModal.vue
     Admin tool: create a "pick one of these cToons" offer, live on one or more cMoons at once,
     that members opt into and claim from (see CMoonPage.vue for the member-facing side). Three
     views in one modal: list (existing offers for this cMoon) -> create (new offer) -> detail
     (manage one offer: live claim counts, on-demand claim list, close). -->
<template>
  <div class="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!busy && attemptClose()"></div>
    <div class="cmd relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold break-words min-w-0">
          {{ view === 'create' ? 'New cToon Offer' : (view === 'detail' ? 'Manage Offer' : `cToon Offers — ${cmoon.name}`) }}
        </h3>
        <button class="cmd-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" @click="attemptClose" :disabled="busy">✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <!-- ── List view: existing offers for this cMoon ── -->
        <template v-if="view === 'list'">
          <button type="button" class="cmd-tap w-full px-3 bg-indigo-600 text-white rounded text-xs font-semibold" @click="openCreate">
            + New Offer
          </button>

          <div v-if="listLoading" class="text-xs text-gray-600">Loading…</div>
          <div v-else-if="!offers.length" class="text-xs text-gray-500">No offers yet for this cMoon.</div>
          <div v-else class="space-y-2">
            <button
              type="button"
              v-for="o in offers" :key="o.id"
              class="cmd-tap w-full text-left border rounded p-2 hover:bg-gray-50"
              @click="openDetail(o.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-[11px] font-medium break-words min-w-0">
                  {{ o.options.map(opt => opt.name).join(' / ') }}
                </span>
                <span :class="offerStatusClass(o.status)">{{ o.status }}</span>
              </div>
              <p class="text-[11px] text-gray-500 mt-1">
                × {{ o.quantityPerMember }} per pick · {{ o.totalClaims }} claim{{ o.totalClaims === 1 ? '' : 's' }} ·
                {{ o.cMoons.length }} cMoon{{ o.cMoons.length === 1 ? '' : 's' }}
              </p>
            </button>
          </div>
        </template>

        <!-- ── Create view ── -->
        <template v-else-if="view === 'create'">
          <div>
            <label class="block text-xs font-medium mb-1">cMoons this offer is live on</label>
            <div class="border rounded divide-y max-h-40 overflow-y-auto">
              <label v-for="c in allCMoons" :key="c.id" class="cmd-tap flex items-center gap-2 px-2 text-[11px]">
                <input type="checkbox" :value="c.id" v-model="selectedCMoonIds" />
                <span class="break-words min-w-0">{{ c.name }} <span class="text-gray-500">({{ c.memberCount }})</span></span>
              </label>
            </div>
            <p v-if="!allCMoons.length" class="text-[11px] text-gray-500 mt-1">No cMoons available.</p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cToon options (members pick one)</label>
            <input
              v-model="ctoonSearch"
              class="cmd-field w-full border rounded px-2 py-1"
              style="font-size:16px"
              placeholder="Type 3+ characters"
              autocapitalize="none" autocorrect="off" spellcheck="false"
              role="combobox"
              :aria-expanded="ctoonSuggestions.length > 0"
              aria-controls="disperse-offer-ctoon-suggestions"
            />
            <div v-if="ctoonSuggestions.length" id="disperse-offer-ctoon-suggestions" class="mt-2 border rounded divide-y bg-white max-h-40 overflow-y-auto">
              <button
                v-for="c in ctoonSuggestions" :key="c.id"
                type="button"
                class="cmd-tap w-full text-left px-3 text-[11px] hover:bg-gray-100"
                @click="addOption(c)"
              >{{ c.name }}</button>
            </div>
            <div v-if="selectedOptions.length" class="mt-2 space-y-1">
              <div v-for="(opt, i) in selectedOptions" :key="opt.id" class="flex items-center gap-2 text-[11px]">
                <span class="break-words min-w-0">{{ opt.name }}</span>
                <button type="button" class="cmd-tap ml-auto flex-shrink-0 text-red-600" @click="selectedOptions.splice(i, 1)">Remove</button>
              </div>
            </div>
            <p class="text-[11px] text-gray-500 mt-1">At least {{ MIN_OPTIONS }} options, up to {{ MAX_OPTIONS }}.</p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Quantity per member</label>
            <input
              v-model.number="quantityPerMember"
              type="number" inputmode="numeric" min="1" :max="MAX_QUANTITY_PER_MEMBER"
              class="cmd-field w-24 border rounded px-2 py-1" style="font-size:16px"
            />
            <p class="text-[11px] text-gray-500 mt-1">How many copies of their chosen cToon each member gets. Max {{ MAX_QUANTITY_PER_MEMBER }}.</p>
          </div>

          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 space-y-1">
            <p>This offer stays open — visible to every current member of the selected cMoons — until you close it.</p>
            <p>Each member can claim only once, and their pick is final.</p>
          </div>

          <p v-if="formError" class="text-[11px] text-red-600">{{ formError }}</p>
        </template>

        <!-- ── Detail view: manage one offer ── -->
        <template v-else-if="view === 'detail'">
          <div v-if="detailLoading" class="text-xs text-gray-600">Loading…</div>
          <template v-else-if="detail">
            <div>
              <p class="text-[11px] text-gray-600">
                Linked to: <strong>{{ detail.cMoons.map(c => c.name).join(', ') }}</strong>
              </p>
              <p class="text-[11px] text-gray-600">× {{ detail.quantityPerMember }} per pick · <span :class="offerStatusClass(detail.status)">{{ detail.status }}</span></p>
            </div>

            <div class="space-y-1">
              <div v-for="opt in detail.options" :key="opt.id" class="flex items-center gap-2 text-[11px] border rounded px-2 py-1.5">
                <img v-if="opt.assetPath" :src="opt.assetPath" :alt="opt.name" class="h-8 w-auto flex-shrink-0" />
                <span class="break-words min-w-0 flex-1">{{ opt.name }}</span>
                <span class="flex-shrink-0 text-gray-600">{{ opt.claimCount }} pick{{ opt.claimCount === 1 ? '' : 's' }}</span>
              </div>
            </div>

            <p class="text-[11px] text-gray-600">
              {{ detail.totalClaims }} total claim{{ detail.totalClaims === 1 ? '' : 's' }}
              · {{ detail.completed }} minted
              <template v-if="detail.queued"> · {{ detail.queued }} queued</template>
              <template v-if="detail.failed"> · {{ detail.failed }} failed</template>
              <template v-if="detail.partial"> · {{ detail.partial }} partial</template>
            </p>

            <div>
              <button type="button" class="cmd-tap text-[11px] text-indigo-600 hover:underline" @click="toggleClaims">
                {{ claimsOpen ? 'Hide' : ((detail.failed || detail.partial) ? 'View failed/partial claims' : 'View claims') }}
              </button>
              <div v-if="claimsOpen" class="mt-2 border rounded divide-y max-h-48 overflow-y-auto">
                <div v-if="claimsLoading" class="p-2 text-[11px] text-gray-500">Loading…</div>
                <template v-else>
                  <div v-for="c in claims" :key="c.userId" class="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                    <span class="break-words min-w-0">{{ c.username }} → {{ c.ctoonName }}</span>
                    <span :class="claimBadgeClass(c.status)">{{ c.quantityMinted }}/{{ c.quantity }}</span>
                  </div>
                  <div v-if="!claims.length" class="p-2 text-[11px] text-gray-500">No claims to show.</div>
                </template>
              </div>
            </div>

            <p v-if="detailError" class="text-[11px] text-red-600">{{ detailError }}</p>

            <button
              v-if="detail.status === 'OPEN'"
              type="button"
              class="cmd-tap w-full border border-red-300 text-red-600 rounded text-xs font-semibold disabled:opacity-50"
              :disabled="closing"
              @click="closeOffer"
            >{{ closing ? 'Closing…' : 'Close this offer' }}</button>
          </template>
        </template>
      </div>

      <div class="flex items-center justify-between gap-2 px-4 py-3 border-t flex-shrink-0">
        <button
          v-if="view !== 'list'"
          type="button" class="cmd-tap px-3 border rounded"
          @click="backToList"
          :disabled="busy"
        >← Back</button>
        <span v-else></span>
        <div class="flex items-center gap-2">
          <button type="button" class="cmd-tap px-3 border rounded" @click="attemptClose" :disabled="busy">Close</button>
          <button
            v-if="view === 'create'"
            type="button"
            class="cmd-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
            :disabled="!canSubmit"
            @click="submitCreate"
          >{{ creating ? 'Creating…' : 'Create Offer' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  cmoon: { type: Object, required: true }, // { id, name, memberCount } — the row this was opened from
  allCMoons: { type: Array, default: () => [] }, // [{ id, name, memberCount }]
  ctoons: { type: Array, default: () => [] }, // [{ id, name, assetPath }]
})
const emit = defineEmits(['close'])

const MAX_QUANTITY_PER_MEMBER = 10
const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
const POLL_MS = 4000

const view = ref('list') // 'list' | 'create' | 'detail'
const busy = computed(() => creating.value || closing.value)

// ── list ──
const listLoading = ref(true)
const offers = ref([])

async function loadList() {
  listLoading.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-dispersal-offers', { params: { cMoonId: props.cmoon.id } })
    offers.value = res.offers || []
  } catch {
    offers.value = []
  } finally {
    listLoading.value = false
  }
}

function offerStatusClass(status) {
  return status === 'OPEN' ? 'text-[10px] font-semibold text-green-600 flex-shrink-0' : 'text-[10px] font-semibold text-gray-500 flex-shrink-0'
}

// ── create ──
const selectedCMoonIds = ref([props.cmoon.id])
const ctoonSearch = ref('')
const selectedOptions = ref([])
const quantityPerMember = ref(1)
const formError = ref('')
const creating = ref(false)

const ctoonSuggestions = computed(() => {
  const v = String(ctoonSearch.value || '').trim().toLowerCase()
  if (v.length < 3) return []
  const chosenIds = new Set(selectedOptions.value.map(o => o.id))
  return props.ctoons.filter(c => !chosenIds.has(c.id) && c.name?.toLowerCase().includes(v)).slice(0, 20)
})

function addOption(c) {
  if (selectedOptions.value.length >= MAX_OPTIONS) return
  if (selectedOptions.value.find(o => o.id === c.id)) return
  selectedOptions.value.push(c)
  ctoonSearch.value = ''
}

const safeQuantity = computed(() => {
  const n = Math.floor(Number(quantityPerMember.value))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_QUANTITY_PER_MEMBER) : 1
})

const canSubmit = computed(() =>
  selectedCMoonIds.value.length > 0 &&
  selectedOptions.value.length >= MIN_OPTIONS &&
  !creating.value
)

function openCreate() {
  selectedCMoonIds.value = [props.cmoon.id]
  ctoonSearch.value = ''
  selectedOptions.value = []
  quantityPerMember.value = 1
  formError.value = ''
  view.value = 'create'
}

async function submitCreate() {
  if (!canSubmit.value) return
  creating.value = true
  formError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-dispersal-offers', {
      method: 'POST',
      body: {
        cMoonIds: selectedCMoonIds.value,
        ctoonIds: selectedOptions.value.map(o => o.id),
        quantityPerMember: safeQuantity.value,
      },
    })
    await loadList()
    await openDetail(res.offerId)
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to create offer'
  } finally {
    creating.value = false
  }
}

// ── detail ──
const detailLoading = ref(true)
const detail = ref(null)
const detailError = ref('')
const closing = ref(false)
const claimsOpen = ref(false)
const claimsLoading = ref(false)
const claims = ref([])
let pollTimer = null
let currentOfferId = null

async function loadDetail(offerId) {
  try {
    detail.value = await $fetch(`/api/admin/cmoon-dispersal-offers/${offerId}`)
  } catch (e) {
    detailError.value = e?.data?.statusMessage || 'Failed to load offer'
  }
}

async function openDetail(offerId) {
  view.value = 'detail'
  currentOfferId = offerId
  detailLoading.value = true
  detailError.value = ''
  claimsOpen.value = false
  claims.value = []
  await loadDetail(offerId)
  detailLoading.value = false
  startPolling()
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => { if (currentOfferId) loadDetail(currentOfferId) }, POLL_MS)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
function handleVisibility() {
  if (document.hidden) stopPolling()
  else if (view.value === 'detail' && currentOfferId) { loadDetail(currentOfferId); startPolling() }
}

async function fetchClaims() {
  if (!currentOfferId) return
  claimsLoading.value = true
  try {
    const onlyFailed = (detail.value?.failed || detail.value?.partial) ? '?onlyFailed=1' : ''
    const res = await $fetch(`/api/admin/cmoon-dispersal-offers/${currentOfferId}/claims${onlyFailed}`)
    claims.value = res.claims || []
  } catch {
    claims.value = []
  } finally {
    claimsLoading.value = false
  }
}

async function toggleClaims() {
  claimsOpen.value = !claimsOpen.value
  if (claimsOpen.value && !claims.value.length) await fetchClaims()
}

function claimBadgeClass(status) {
  if (status === 'COMPLETED') return 'text-green-600 flex-shrink-0'
  if (status === 'FAILED') return 'text-red-600 flex-shrink-0'
  if (status === 'PARTIAL') return 'text-amber-600 flex-shrink-0'
  return 'text-gray-500 flex-shrink-0'
}

async function closeOffer() {
  if (!currentOfferId || closing.value) return
  if (!confirm('Close this offer? Members will no longer be able to claim from it.')) return
  closing.value = true
  detailError.value = ''
  try {
    await $fetch(`/api/admin/cmoon-dispersal-offers/${currentOfferId}/close`, { method: 'POST' })
    await loadDetail(currentOfferId)
  } catch (e) {
    detailError.value = e?.data?.statusMessage || 'Failed to close offer'
  } finally {
    closing.value = false
  }
}

function backToList() {
  stopPolling()
  currentOfferId = null
  detail.value = null
  view.value = 'list'
  loadList()
}

function attemptClose() {
  if (busy.value) return
  emit('close')
}

onMounted(() => {
  loadList()
  document.addEventListener('visibilitychange', handleVisibility)
})
onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', handleVisibility)
})
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix AdminCMoon.vue uses — this modal is mounted
   inside that same dark-body context but is its own SFC, so scoped styles don't inherit. */
.cmd {
  color: #111;
  color-scheme: light;
}
.cmd input:not([type='checkbox']):not([type='radio']),
.cmd select {
  color: #111;
  background: #fff;
  -webkit-text-fill-color: #111;
}

@media (min-width: 640px) {
  .cmd {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

/* 44px minimum touch target, matching AdminCMoon.vue's .cm-tap/.cm-field convention. */
.cmd-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
.cmd-field {
  min-height: 44px;
}
</style>
