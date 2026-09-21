<!-- components/newsite/CMoonRecalcPointsModal.vue
     Admin tool: recalculates cMoonPoints for every current cMoon member using the current logic,
     then redoes each member's displayed rank from that corrected number. Every member is
     checked, not just those still showing a high point total — the periodic aggregate cron keeps
     cMoonPoints itself correct on its own, but only this tool ever lowers a stale rank, so a
     member whose points the cron already quietly fixed still needs their rank re-derived here.
     Runs as a queue job (server/workers/
     cmoon-rank-recalc.worker.js) that processes members one at a time, so this modal is purely a
     progress viewer polling that job's status — closing it does not stop the run, and reopening
     the button will resume showing progress on the same in-flight job.
-->
<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!running && $emit('close')"></div>
    <div class="crm relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Recalculate cMoon Points</h3>
        <button
          class="crm-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          @click="$emit('close')"
          :disabled="running"
          :title="running ? 'Recalculation is running in the background — safe to close, it keeps going' : ''"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <div v-if="checkingExisting" class="text-xs text-gray-600">Checking for an in-progress run…</div>

        <template v-else>
          <p class="text-[11px] text-gray-600">
            Recomputes <code>cMoonPoints</code> for every current cMoon member, from the current
            logic (weekly High Score / Top 10 / Daily Task awards only), then redoes each member's
            rank to match. Members are processed one at a time; this can lower a rank if the
            corrected total no longer qualifies. Already-claimed rank rewards are never revoked.
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
              <p v-if="current" class="text-[11px] text-gray-500 truncate">
                {{ current.username }}<span v-if="current.cMoonName"> — {{ current.cMoonName }}</span>:
                {{ current.oldPoints }} → {{ current.newPoints }} pts
                <span v-if="current.oldRank !== current.newRank">
                  ({{ current.oldRank || 'no rank' }} → {{ current.newRank || 'no rank' }})
                </span>
              </p>
            </div>

            <div v-if="recent.length" class="border rounded divide-y max-h-56 overflow-y-auto">
              <div v-for="(r, i) in recentReversed" :key="i" class="px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                <span class="break-words min-w-0">{{ r.username }}</span>
                <span class="flex-shrink-0 text-gray-500">
                  {{ r.oldPoints }}→{{ r.newPoints }} pts
                  <template v-if="r.oldRank !== r.newRank"> · {{ r.oldRank || '—' }}→{{ r.newRank || '—' }}</template>
                </span>
              </div>
            </div>

            <div v-if="summary" class="text-xs bg-gray-50 border rounded p-3 space-y-1">
              <p class="font-medium">{{ status === 'failed' ? 'Run failed' : 'Recalculation complete' }}</p>
              <p class="text-gray-600">
                Checked {{ summary.total }} member{{ summary.total === 1 ? '' : 's' }} —
                {{ summary.changed }} changed
                ({{ summary.upgraded }} up, {{ summary.downgraded }} down, {{ summary.cleared }} cleared).
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
          class="crm-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="starting"
          @click="start"
        >{{ starting ? 'Starting…' : (summary ? 'Run again' : 'Start Recalculation') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['close', 'done'])

// Must match CMOON_RANK_RECALC_JOB_ID in server/api/admin/cmoons/recalculate-points.post.js — a
// fixed jobId so re-opening this modal can resume polling an already-running job.
const JOB_ID = 'cmoon-rank-recalc-all'

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
  if (data.status === 'failed') error.value = data.error || 'Recalculation failed'
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function poll() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await $fetch('/api/admin/cmoons/recalculate-points-status', { params: { jobId } })
      applyStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling()
        emit('done', data.summary || null)
      }
    } catch (e) {
      error.value = e?.data?.statusMessage || 'Lost connection to the recalculation job'
      stopPolling()
    }
  }, 1000)
}

async function checkExisting() {
  checkingExisting.value = true
  try {
    const data = await $fetch('/api/admin/cmoons/recalculate-points-status', { params: { jobId: JOB_ID } })
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
  starting.value = true
  error.value = ''
  summary.value = null
  try {
    const res = await $fetch('/api/admin/cmoons/recalculate-points', { method: 'POST' })
    jobId = res.jobId
    status.value = 'waiting'
    poll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to start recalculation'
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
