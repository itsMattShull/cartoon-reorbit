<!-- components/newsite/CMoonHpCatchUpModal.vue
     Admin tool: "HP Catch Up". There is no stored HP value anywhere to patch — a player's cMoon
     Enemy Battle max HP is read live off their current rank's HP bonus the moment a NEW battle
     starts (see getPlayerCombatMaxHp() in server/utils/cmoon.js), so "catching up" HP really means
     two things, run in order, as a queue job (server/workers/cmoon-hp-catchup.worker.js):
       1. Repair any cMoon whose rank ladder never fully wired up (re-runs the same provisioning
          every rank-tier edit already performs, safe to repeat).
       2. Recompute every current cMoon member's correct rank from their real points — the exact
          same safe correction "Recalculate cMoon Points" already performs (they share
          server/utils/cmoonRankRecalc.js); this tool exists mainly for step 1, and includes step 2
          so it's a complete, standalone fix rather than requiring the admin to also run the other
          tool afterward.
     Purely a progress viewer polling that job's status — closing it does not stop the run, and
     reopening the button will resume showing progress on the same in-flight job. Does NOT touch
     any already-in-progress battle's snapshotted max HP — only a player's next new battle picks up
     a corrected bonus. -->
<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!running && $emit('close')"></div>
    <div class="chc relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">HP Catch Up</h3>
        <button
          class="chc-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          @click="$emit('close')"
          :disabled="running"
          :title="running ? 'HP Catch Up is running in the background — safe to close, it keeps going' : ''"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <div v-if="checkingExisting" class="text-xs text-gray-600">Checking for an in-progress run…</div>

        <template v-else>
          <p class="text-[11px] text-gray-600">
            Repairs any cMoon whose rank ladder failed to fully set up (so its members were never
            able to rank up or earn an HP bonus at all), then recomputes every current cMoon
            member's rank — the same safe correction "Recalculate cMoon Points" performs — so each
            member's HP bonus is correct the next time they start a new battle.
          </p>
          <p class="text-[11px] text-gray-600">
            Does not change anything about a battle already in progress — HP for a fight already
            underway stays as it was when that fight started, by design.
          </p>

          <div v-if="error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{{ error }}</div>

          <template v-if="status !== 'idle'">
            <div class="border rounded p-3 space-y-2">
              <div class="flex items-center justify-between text-[11px] text-gray-600">
                <span>{{ progressLabel }}</span>
                <span v-if="phase === 'ranks'">{{ pct }}%</span>
              </div>
              <div v-if="phase === 'ranks'" class="w-full h-2 bg-gray-100 rounded overflow-hidden">
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
              <p class="font-medium">{{ status === 'failed' ? 'Run failed' : 'HP Catch Up complete' }}</p>
              <p class="text-gray-600">
                Checked {{ summary.cmoonsTotal }} cMoon{{ summary.cmoonsTotal === 1 ? '' : 's' }} —
                {{ summary.cmoonsRepaired }} repaired.
              </p>
              <p class="text-gray-600">
                Checked {{ summary.membersChecked }} member{{ summary.membersChecked === 1 ? '' : 's' }} —
                {{ summary.ranksCorrected }} corrected
                ({{ summary.upgraded }} up, {{ summary.downgraded }} down, {{ summary.cleared }} cleared).
              </p>
              <p v-if="summary.provisioningFailures?.length" class="text-red-600">
                {{ summary.provisioningFailures.length }} cMoon{{ summary.provisioningFailures.length === 1 ? '' : 's' }}
                still failed to provision — run this again, or check server logs:
                {{ summary.provisioningFailures.map(f => f.cMoonName).join(', ') }}
              </p>
            </div>
          </template>
        </template>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <button type="button" class="chc-tap px-3 border rounded" @click="$emit('close')" :disabled="running">
          {{ running ? 'Close (keeps running)' : 'Close' }}
        </button>
        <button
          v-if="!checkingExisting && !running"
          type="button"
          class="chc-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="starting"
          @click="start"
        >{{ starting ? 'Starting…' : (summary ? 'Run again' : 'Start HP Catch Up') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['close', 'done'])

// Must match CMOON_HP_CATCHUP_JOB_ID in server/api/admin/cmoons/hp-catch-up.post.js — a fixed
// jobId so re-opening this modal can resume polling an already-running job.
const JOB_ID = 'cmoon-hp-catchup-all'

const checkingExisting = ref(true)
const starting = ref(false)
const error = ref('')
const status = ref('idle') // idle | waiting | active | completed | failed
const phase = ref('provisioning') // provisioning | ranks
const pct = ref(0)
const processed = ref(0)
const total = ref(0)
const cmoonsProcessed = ref(0)
const cmoonsTotal = ref(0)
const recent = ref([])
const current = ref(null)
const summary = ref(null)

let pollTimer = null
let jobId = null

const running = computed(() => status.value === 'waiting' || status.value === 'active')
const recentReversed = computed(() => [...recent.value].reverse())
const progressLabel = computed(() => {
  if (status.value === 'completed') return `Done — ${processed.value}/${total.value} members, ${cmoonsProcessed.value}/${cmoonsTotal.value} cMoons`
  if (status.value === 'failed') return `Stopped — ${processed.value}/${total.value}`
  if (phase.value === 'provisioning') return `Repairing cMoons ${cmoonsProcessed.value}/${cmoonsTotal.value || '…'}…`
  if (!total.value) return 'Starting…'
  return `Processing ${processed.value}/${total.value}`
})

function applyStatus(data) {
  status.value = data.status
  phase.value = data.phase ?? 'provisioning'
  pct.value = data.pct ?? 0
  processed.value = data.processed ?? 0
  total.value = data.total ?? 0
  cmoonsProcessed.value = data.cmoonsProcessed ?? 0
  cmoonsTotal.value = data.cmoonsTotal ?? 0
  recent.value = data.recent ?? []
  current.value = data.current ?? null
  if (data.status === 'completed') summary.value = data.summary || null
  if (data.status === 'failed') error.value = data.error || 'HP Catch Up failed'
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function poll() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await $fetch('/api/admin/cmoons/hp-catch-up-status', { params: { jobId } })
      applyStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling()
        emit('done', data.summary || null)
      }
    } catch (e) {
      error.value = e?.data?.statusMessage || 'Lost connection to the HP Catch Up job'
      stopPolling()
    }
  }, 1000)
}

async function checkExisting() {
  checkingExisting.value = true
  try {
    const data = await $fetch('/api/admin/cmoons/hp-catch-up-status', { params: { jobId: JOB_ID } })
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
    const res = await $fetch('/api/admin/cmoons/hp-catch-up', { method: 'POST' })
    jobId = res.jobId
    status.value = 'waiting'
    poll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to start HP Catch Up'
  } finally {
    starting.value = false
  }
}

onMounted(checkExisting)
onBeforeUnmount(stopPolling)
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix AdminCMoon.vue/CMoonRecalcPointsModal.vue use. */
.chc {
  color: #111;
  color-scheme: light;
}

@media (min-width: 640px) {
  .chc {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

.chc-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
