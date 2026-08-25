<!-- components/newsite/CMoonDisperseModal.vue
     Admin tool: mint one cToon to every current member of a cMoon, in randomized mint order.
     Two steps in one modal: setup (pick cToon + quantity, confirm) -> progress (poll a
     lightweight summary while jobs drain, with an on-demand full/failed recipient list). -->
<template>
  <div class="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!submitting && attemptClose()"></div>
    <div class="cmd relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Disperse cToons — {{ cmoon.name }}</h3>
        <button class="cmd-tap text-gray-400 hover:text-gray-600 text-xl leading-none" @click="attemptClose" :disabled="submitting">✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <!-- ── Resume check while we determine whether one is already running ── -->
        <div v-if="checkingActive" class="text-xs text-gray-600">Checking for an in-progress dispersal…</div>

        <!-- ── Progress / result view ── -->
        <template v-else-if="active">
          <div class="flex items-center gap-3">
            <img v-if="active.ctoonAssetPath" :src="active.ctoonAssetPath" :alt="active.ctoonName" class="h-14 w-auto rounded flex-shrink-0" />
            <div class="min-w-0">
              <p class="font-medium break-words">{{ active.ctoonName }}</p>
              <p class="text-[11px] text-gray-500">× {{ active.quantityPerMember }} per member · {{ active.totalMembers }} member{{ active.totalMembers === 1 ? '' : 's' }}</p>
            </div>
          </div>

          <div>
            <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                class="h-3 rounded-full transition-all"
                :class="active.failedJobs > 0 ? 'bg-amber-500' : 'bg-indigo-600'"
                :style="{ width: progressPct + '%' }"
              ></div>
            </div>
            <p class="text-[11px] text-gray-600 mt-1">
              {{ active.completedJobs }} minted<template v-if="active.failedJobs"> · {{ active.failedJobs }} failed</template>
              of {{ active.totalJobs }}
              <span class="ml-1 font-medium" :class="statusColorClass">{{ statusLabel }}</span>
            </p>
          </div>

          <p v-if="active.status === 'PROCESSING'" class="text-[11px] text-gray-500">
            Minting in the background — safe to close this and check back later.
          </p>

          <div>
            <button
              type="button"
              class="cmd-tap text-[11px] text-indigo-600 hover:underline"
              @click="toggleRecipients"
            >{{ recipientsOpen ? 'Hide' : (active.failedJobs > 0 ? 'View failed members' : 'View members') }}</button>

            <div v-if="recipientsOpen" class="mt-2 border rounded divide-y max-h-56 overflow-y-auto">
              <div v-if="recipientsLoading" class="p-2 text-[11px] text-gray-500">Loading…</div>
              <template v-else>
                <div v-for="r in recipients" :key="r.userId" class="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px]">
                  <span class="break-words min-w-0">{{ r.username }}</span>
                  <span :class="recipientBadgeClass(r.status)">{{ recipientLabel(r) }}</span>
                </div>
                <div v-if="!recipients.length" class="p-2 text-[11px] text-gray-500">No members to show.</div>
                <p v-if="recipientsTruncated" class="p-2 text-[11px] text-gray-500">Showing the first {{ recipients.length }} — narrow with "failed only" to see everything relevant.</p>
              </template>
            </div>
          </div>

          <div class="pt-2 border-t">
            <p class="text-[11px] font-medium mb-1">Recent dispersals for this cMoon</p>
            <div v-if="history.length" class="space-y-1 max-h-32 overflow-y-auto">
              <div v-for="h in history" :key="h.id" class="text-[11px] text-gray-600 flex items-center justify-between gap-2">
                <span class="break-words min-w-0">{{ h.ctoonName }} × {{ h.quantityPerMember }}</span>
                <span :class="statusColorClassFor(h.status)">{{ statusLabelFor(h.status) }}</span>
              </div>
            </div>
            <p v-else class="text-[11px] text-gray-500">None yet.</p>
          </div>
        </template>

        <!-- ── Setup step ── -->
        <template v-else>
          <div>
            <label class="block text-xs font-medium mb-1">cToon to disperse</label>
            <input
              v-model="ctoonSearch"
              class="cmd-field w-full border rounded px-2 py-1"
              style="font-size:16px"
              placeholder="Type 3+ characters"
              autocapitalize="none" autocorrect="off" spellcheck="false"
              role="combobox"
              :aria-expanded="ctoonSuggestions.length > 0"
              aria-controls="disperse-ctoon-suggestions"
              @focus="selectedCtoon = null"
            />
            <div v-if="ctoonSuggestions.length" id="disperse-ctoon-suggestions" class="mt-2 border rounded divide-y bg-white max-h-48 overflow-y-auto">
              <button
                v-for="c in ctoonSuggestions" :key="c.id"
                type="button"
                class="cmd-tap w-full text-left px-3 text-[11px] hover:bg-gray-100"
                @click="pickCtoon(c)"
              >{{ c.name }}</button>
            </div>
            <p v-if="selectedCtoon" class="text-[11px] text-gray-600 mt-1">Selected: <strong>{{ selectedCtoon.name }}</strong></p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Quantity per member</label>
            <input
              v-model.number="quantityPerMember"
              type="number" inputmode="numeric" min="1" :max="MAX_QUANTITY_PER_MEMBER"
              class="cmd-field w-24 border rounded px-2 py-1" style="font-size:16px"
            />
            <p class="text-[11px] text-gray-500 mt-1">Max {{ MAX_QUANTITY_PER_MEMBER }} per member.</p>
          </div>

          <p class="text-[11px] text-gray-700">
            This will mint to <strong>{{ cmoon.memberCount }}</strong> current member{{ cmoon.memberCount === 1 ? '' : 's' }}
            × <strong>{{ safeQuantity }}</strong> = <strong>{{ totalMintsPreview }}</strong> total cToons.
          </p>

          <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-800 space-y-1">
            <p>Mint order is randomized — the first member to join this cMoon is not guaranteed the first mint.</p>
            <p class="font-semibold">This action cannot be undone once started.</p>
          </div>

          <label class="flex items-start gap-2 text-[11px] text-gray-700 cmd-tap">
            <input type="checkbox" v-model="acknowledged" class="mt-0.5" />
            <span>I understand this will mint cToons to every current member and cannot be undone.</span>
          </label>

          <p v-if="formError" class="text-[11px] text-red-600">{{ formError }}</p>

          <div v-if="history.length" class="pt-2 border-t">
            <p class="text-[11px] font-medium mb-1">Recent dispersals for this cMoon</p>
            <div class="space-y-1 max-h-32 overflow-y-auto">
              <div v-for="h in history" :key="h.id" class="text-[11px] text-gray-600 flex items-center justify-between gap-2">
                <span class="break-words min-w-0">{{ h.ctoonName }} × {{ h.quantityPerMember }}</span>
                <span :class="statusColorClassFor(h.status)">{{ statusLabelFor(h.status) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
        <button type="button" class="cmd-tap px-3 border rounded" @click="attemptClose" :disabled="submitting">
          {{ active ? 'Close' : 'Cancel' }}
        </button>
        <button
          v-if="!active && !checkingActive"
          type="button"
          class="cmd-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="!canSubmit"
          @click="submit"
        >{{ submitting ? 'Starting…' : 'Disperse' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  cmoon: { type: Object, required: true }, // { id, name, memberCount }
  ctoons: { type: Array, default: () => [] }, // [{ id, name, assetPath }]
})
const emit = defineEmits(['close'])

const MAX_QUANTITY_PER_MEMBER = 10
const POLL_MS = 3000

const checkingActive = ref(true)
const history = ref([])
const active = ref(null) // dispersal summary once one exists (in-progress or just-finished)
const submitting = ref(false)
const formError = ref('')

const ctoonSearch = ref('')
const selectedCtoon = ref(null)
const quantityPerMember = ref(1)
const acknowledged = ref(false)

const recipientsOpen = ref(false)
const recipientsLoading = ref(false)
const recipients = ref([])
const recipientsTruncated = ref(false)

let pollTimer = null

const safeQuantity = computed(() => {
  const n = Math.floor(Number(quantityPerMember.value))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_QUANTITY_PER_MEMBER) : 1
})
const totalMintsPreview = computed(() => (props.cmoon.memberCount || 0) * safeQuantity.value)
const canSubmit = computed(() => !!selectedCtoon.value && acknowledged.value && !submitting.value)

const ctoonSuggestions = computed(() => {
  const v = String(ctoonSearch.value || '').trim().toLowerCase()
  if (v.length < 3 || selectedCtoon.value) return []
  return props.ctoons.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
})

function pickCtoon(c) {
  selectedCtoon.value = c
  ctoonSearch.value = c.name
}

const progressPct = computed(() => {
  if (!active.value || !active.value.totalJobs) return 0
  return Math.min(100, Math.round(((active.value.completedJobs + active.value.failedJobs) / active.value.totalJobs) * 100))
})

const STATUS_LABELS = { PROCESSING: 'In progress', COMPLETED: 'Completed', COMPLETED_WITH_ERRORS: 'Completed (with errors)' }
const statusLabel = computed(() => STATUS_LABELS[active.value?.status] || active.value?.status || '')
function statusLabelFor(s) { return STATUS_LABELS[s] || s }
const statusColorClass = computed(() => statusColorClassFor(active.value?.status))
function statusColorClassFor(s) {
  if (s === 'PROCESSING') return 'text-indigo-600'
  if (s === 'COMPLETED_WITH_ERRORS') return 'text-amber-600'
  if (s === 'COMPLETED') return 'text-green-600'
  return 'text-gray-500'
}

const RECIPIENT_LABELS = { QUEUED: 'queued', COMPLETED: 'minted', PARTIAL: 'partial', FAILED: 'failed' }
function recipientLabel(r) {
  if (r.status === 'COMPLETED' || r.status === 'PARTIAL') return `${r.quantityMinted}/${r.quantityRequested} minted`
  return RECIPIENT_LABELS[r.status] || r.status
}
function recipientBadgeClass(status) {
  if (status === 'COMPLETED') return 'text-green-600 flex-shrink-0'
  if (status === 'FAILED') return 'text-red-600 flex-shrink-0'
  if (status === 'PARTIAL') return 'text-amber-600 flex-shrink-0'
  return 'text-gray-500 flex-shrink-0'
}

async function loadHistory() {
  try {
    const res = await $fetch(`/api/admin/cmoons/${props.cmoon.id}/dispersals`)
    history.value = res.dispersals || []
    return history.value
  } catch {
    history.value = []
    return []
  }
}

async function pollActive() {
  if (!active.value) return
  try {
    const res = await $fetch(`/api/admin/cmoons/${props.cmoon.id}/dispersals/${active.value.id}`)
    active.value = res
    if (res.status !== 'PROCESSING') {
      stopPolling()
      await loadHistory()
      if (res.failedJobs > 0) await fetchRecipients()
    }
  } catch {
    // transient — next tick retries
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(pollActive, POLL_MS)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}
function handleVisibility() {
  if (document.hidden) {
    stopPolling()
  } else if (active.value?.status === 'PROCESSING') {
    pollActive()
    startPolling()
  }
}

async function fetchRecipients() {
  if (!active.value) return
  recipientsLoading.value = true
  try {
    const onlyFailed = active.value.failedJobs > 0 ? '?onlyFailed=1' : ''
    const res = await $fetch(`/api/admin/cmoons/${props.cmoon.id}/dispersals/${active.value.id}/recipients${onlyFailed}`)
    recipients.value = res.recipients || []
    recipientsTruncated.value = !!res.truncated
  } catch {
    recipients.value = []
  } finally {
    recipientsLoading.value = false
  }
}

async function toggleRecipients() {
  recipientsOpen.value = !recipientsOpen.value
  if (recipientsOpen.value && !recipients.value.length) await fetchRecipients()
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  formError.value = ''
  try {
    const res = await $fetch(`/api/admin/cmoons/${props.cmoon.id}/dispersals`, {
      method: 'POST',
      body: { ctoonId: selectedCtoon.value.id, quantityPerMember: safeQuantity.value },
    })
    active.value = {
      id: res.dispersalId,
      ctoonId: selectedCtoon.value.id,
      ctoonName: selectedCtoon.value.name,
      ctoonAssetPath: selectedCtoon.value.assetPath || null,
      quantityPerMember: safeQuantity.value,
      status: 'PROCESSING',
      totalMembers: res.totalMembers,
      totalJobs: res.totalJobs,
      completedJobs: 0,
      failedJobs: 0,
    }
    startPolling()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to start dispersal'
  } finally {
    submitting.value = false
  }
}

function attemptClose() {
  if (submitting.value) return
  emit('close')
}

onMounted(async () => {
  checkingActive.value = true
  const list = await loadHistory()
  const inProgress = list.find(d => d.status === 'PROCESSING')
  if (inProgress) {
    active.value = inProgress
    startPolling()
  }
  checkingActive.value = false
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
