<!-- components/newsite/CMoonPrizeRevokeModal.vue
     Admin tool: for every current cMoon member, claws back any rank-tier prize cToon they only
     received because of the old cMoonPoints bug (their corrected cMoonPoints no longer meets
     that rank's threshold), and resets the underlying achievement/claim so they can legitimately
     re-earn (and re-claim) it later. Run "Recalculate cMoon Points" first — this tool trusts
     cMoonPoints is already correct and only touches the achievement/claim/prize layer.

     Runs as a queue job (server/workers/cmoon-prize-revoke.worker.js) that processes members one
     at a time, so this modal is purely a progress viewer polling that job's status — closing it
     does not stop the run, and reopening the button will resume showing progress on the same
     in-flight job. Mirrors CMoonRecalcPointsModal.vue's shape closely.
-->
<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!running && $emit('close')"></div>
    <div class="crm relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Revoke Invalid cMoon Rank Prizes</h3>
        <button
          class="crm-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          @click="$emit('close')"
          :disabled="running"
          :title="running ? 'Running in the background — safe to close, it keeps going' : ''"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <div v-if="checkingExisting" class="text-xs text-gray-600">Checking for an in-progress run…</div>

        <template v-else>
          <p class="text-[11px] text-gray-600">
            For every member whose current (corrected) cMoon points no longer meet a rank they're
            credited with, this claws back any still-owned reward cToon from that rank to the
            official account and clears the achievement/claim so they can legitimately re-earn it
            later. A cToon already traded or auctioned away is left with its new owner. Run
            <strong>Recalculate cMoon Points</strong> first if you haven't already.
          </p>

          <div v-if="error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{{ error }}</div>

          <template v-if="status !== 'idle'">
            <div class="border rounded p-3 space-y-2">
              <div class="flex items-center justify-between text-[11px] text-gray-600">
                <span>{{ progressLabel }}</span>
                <span>{{ pct }}%</span>
              </div>
              <div class="w-full h-2 bg-gray-100 rounded overflow-hidden">
                <div class="h-full bg-indigo-600 transition-all" :style="{ width: pct + '%' }"></div>
              </div>
              <p v-if="current && current.revokedRanks && current.revokedRanks.length" class="text-[11px] text-gray-500 truncate">
                {{ current.username }}: revoked {{ current.revokedRanks.join(', ') }}
                ({{ current.ctoonsRevoked }} cToon{{ current.ctoonsRevoked === 1 ? '' : 's' }} reclaimed)
              </p>
            </div>

            <div v-if="recent.length" class="border rounded divide-y max-h-56 overflow-y-auto">
              <div v-for="(r, i) in recentReversed" :key="i" class="px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                <span class="break-words min-w-0">{{ r.username }}</span>
                <span class="flex-shrink-0 text-gray-500">
                  {{ r.revokedRanks.join(', ') }} · {{ r.ctoonsRevoked }} cToon{{ r.ctoonsRevoked === 1 ? '' : 's' }}
                </span>
              </div>
            </div>

            <div v-if="summary" class="text-xs bg-gray-50 border rounded p-3 space-y-1">
              <p class="font-medium">{{ status === 'failed' ? 'Run failed' : 'Revocation complete' }}</p>
              <p class="text-gray-600">
                Checked {{ summary.total }} member{{ summary.total === 1 ? '' : 's' }} —
                {{ summary.usersAffected }} affected,
                {{ summary.achievementsRevoked }} rank{{ summary.achievementsRevoked === 1 ? '' : 's' }} revoked,
                {{ summary.ctoonsClawedBack }} cToon{{ summary.ctoonsClawedBack === 1 ? '' : 's' }} reclaimed.
              </p>
            </div>
          </template>
        </template>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <button type="button" class="crm-tap px-3 border rounded" @click="$emit('close')" :disabled="running">
          {{ running ? 'Close (keeps running)' : 'Close' }}
        </button>
        <button
          v-if="!checkingExisting && !running"
          type="button"
          class="crm-tap px-3 bg-red-600 text-white rounded disabled:opacity-50"
          :disabled="starting"
          @click="start"
        >{{ starting ? 'Starting…' : (summary ? 'Run again' : 'Start Revocation') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['close', 'done'])

// Must match CMOON_PRIZE_REVOKE_JOB_ID in server/api/admin/cmoons/revoke-invalid-prizes.post.js.
const JOB_ID = 'cmoon-prize-revoke-all'

const checkingExisting = ref(true)
const starting = ref(false)
const error = ref('')
const status = ref('idle') // idle | waiting | active | completed | failed
const pct = ref(0)
const processed = ref(0)
const total = ref(0)
const recent = ref([])
const current = ref(null)
const summary = ref(null)

let pollTimer = null
let jobId = null

const running = computed(() => status.value === 'waiting' || status.value === 'active')
const recentReversed = computed(() => [...recent.value].reverse())
const progressLabel = computed(() => {
  if (status.value === 'completed') return `Done — ${processed.value}/${total.value}`
  if (status.value === 'failed') return `Stopped — ${processed.value}/${total.value}`
  if (!total.value) return 'Starting…'
  return `Processing ${processed.value}/${total.value}`
})

function applyStatus(data) {
  status.value = data.status
  pct.value = data.pct ?? 0
  processed.value = data.processed ?? 0
  total.value = data.total ?? 0
  recent.value = data.recent ?? []
  current.value = data.current ?? null
  if (data.status === 'completed') summary.value = data.summary || null
  if (data.status === 'failed') error.value = data.error || 'Revocation failed'
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function poll() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await $fetch('/api/admin/cmoons/revoke-invalid-prizes-status', { params: { jobId } })
      applyStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling()
        emit('done', data.summary || null)
      }
    } catch (e) {
      error.value = e?.data?.statusMessage || 'Lost connection to the revocation job'
      stopPolling()
    }
  }, 1000)
}

async function checkExisting() {
  checkingExisting.value = true
  try {
    const data = await $fetch('/api/admin/cmoons/revoke-invalid-prizes-status', { params: { jobId: JOB_ID } })
    if (data.status === 'waiting' || data.status === 'active') {
      jobId = JOB_ID
      applyStatus(data)
      poll()
    }
  } catch {
    // Transient lookup error — fall through to the idle "Start" screen rather than block on it.
  } finally {
    checkingExisting.value = false
  }
}

async function start() {
  if (!confirm('Revoke every rank prize members no longer qualify for under the corrected points? This sends still-owned reward cToons back to the official account.')) return
  starting.value = true
  error.value = ''
  summary.value = null
  try {
    const res = await $fetch('/api/admin/cmoons/revoke-invalid-prizes', { method: 'POST' })
    jobId = res.jobId
    status.value = 'waiting'
    poll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to start revocation'
  } finally {
    starting.value = false
  }
}

onMounted(checkExisting)
onBeforeUnmount(stopPolling)
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix AdminCMoon.vue/CMoonBalanceModal.vue use. */
.crm {
  color: #111;
  color-scheme: light;
}

@media (min-width: 640px) {
  .crm {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

.crm-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
