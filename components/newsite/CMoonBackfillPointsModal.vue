<!-- components/newsite/CMoonBackfillPointsModal.vue
     Admin tool: grants a flat, one-time bonus to every current cMoon member (optionally skipping
     anyone who already has cMoon points), logged as a CMoonScoreLog row so it counts toward both
     the member's own rank progress and their team's score exactly like an organic award would.
     Runs as a queue job (server/workers/cmoon-daily-task-backfill.worker.js) that processes
     members one at a time, so this modal is purely a progress viewer polling that job's status —
     closing it does not stop the run, and reopening resumes showing progress on the same
     in-flight job (auto-discovered with no jobId needed, see backfill-points-status.get.js).
-->
<template>
  <div class="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4">
    <div class="absolute inset-0 bg-black/60" @click="!running && $emit('close')"></div>
    <div class="cbm relative bg-white w-full sm:max-w-lg flex flex-col text-gray-900" style="height:100dvh; max-height:100dvh;">
      <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h3 class="text-sm font-semibold">Backfill cMoon Points</h3>
        <button
          class="cbm-tap text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0"
          @click="$emit('close')"
          :disabled="running"
          :title="running ? 'Backfill is running in the background — safe to close, it keeps going' : ''"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
        <div v-if="checkingExisting" class="text-xs text-gray-600">Checking for an in-progress run…</div>

        <template v-else>
          <p class="text-[11px] text-gray-600">
            Grants a flat bonus to every current cMoon member, logged the same way any other award
            is — it counts toward the member's own rank progress and their team's score. Use this to
            catch up members who were blocked from earning anything live (e.g. by a minimum-account-age
            setting that was set too high). Members are processed one at a time.
          </p>

          <div v-if="error" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{{ error }}</div>

          <template v-if="!running && status === 'idle'">
            <div class="border rounded p-3 space-y-3">
              <div>
                <label class="block text-xs font-medium mb-1">Points to grant each member</label>
                <input
                  v-model.number="amount" type="number" min="1" max="100000" inputmode="numeric"
                  class="cbm-field w-full sm:w-40 border rounded px-2 py-1" style="font-size:16px"
                />
                <p v-if="loadingDefault" class="text-[11px] text-gray-500 mt-1">Loading current Daily Task points…</p>
              </div>
              <label class="flex items-start gap-2">
                <input type="checkbox" v-model="excludeAlreadyScored" class="mt-0.5" />
                <span class="text-[11px] text-gray-600">
                  Skip members who already have cMoon points — so a member who already earned this
                  organically doesn't get it a second time on top.
                </span>
              </label>
            </div>
          </template>

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
                {{ current.awarded ? `+${current.points} pts` : 'skipped (already has points)' }}
              </p>
            </div>

            <div v-if="recent.length" class="border rounded divide-y max-h-56 overflow-y-auto">
              <div v-for="(r, i) in recentReversed" :key="i" class="px-2 py-1.5 text-[11px] flex items-center justify-between gap-2">
                <span class="break-words min-w-0">{{ r.username }}</span>
                <span class="flex-shrink-0 text-gray-500">
                  {{ r.awarded ? `+${r.points} pts` : 'skipped' }}
                </span>
              </div>
            </div>

            <div v-if="summary" class="text-xs bg-gray-50 border rounded p-3 space-y-1">
              <p class="font-medium">{{ status === 'failed' ? 'Run failed' : 'Backfill complete' }}</p>
              <p class="text-gray-600">
                Checked {{ summary.total }} member{{ summary.total === 1 ? '' : 's' }} —
                {{ summary.awarded }} awarded {{ summary.amount }} pts each, {{ summary.skipped }} skipped.
              </p>
            </div>
          </template>
        </template>
      </div>

      <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <button type="button" class="cbm-tap px-3 border rounded" @click="$emit('close')" :disabled="running">
          {{ running ? 'Close (keeps running)' : 'Close' }}
        </button>
        <button
          v-if="!checkingExisting && !running"
          type="button"
          class="cbm-tap px-3 bg-indigo-600 text-white rounded disabled:opacity-50"
          :disabled="starting || !amount"
          @click="start"
        >{{ starting ? 'Starting…' : (summary ? 'Run again' : 'Start Backfill') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['close', 'done'])

const checkingExisting = ref(true)
const loadingDefault = ref(false)
const starting = ref(false)
const error = ref('')
const status = ref('idle') // idle | waiting | active | completed | failed
const pct = ref(0)
const processed = ref(0)
const total = ref(0)
const recent = ref([])
const current = ref(null)
const summary = ref(null)

const amount = ref(null)
const excludeAlreadyScored = ref(true)

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
  if (data.status === 'failed') error.value = data.error || 'Backfill failed'
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

function poll() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const data = await $fetch('/api/admin/cmoons/backfill-points-status', { params: { jobId } })
      applyStatus(data)
      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling()
        emit('done', data.summary || null)
      }
    } catch (e) {
      error.value = e?.data?.statusMessage || 'Lost connection to the backfill job'
      stopPolling()
    }
  }, 1000)
}

async function checkExisting() {
  checkingExisting.value = true
  try {
    // No jobId: the endpoint scans the queue for any in-flight run on its own.
    const data = await $fetch('/api/admin/cmoons/backfill-points-status')
    if (data.status === 'waiting' || data.status === 'active') {
      jobId = data.jobId
      applyStatus(data)
      poll()
    }
  } catch {
    // Transient lookup error — fall through to the idle "Start" screen rather than block on it.
  } finally {
    checkingExisting.value = false
  }
}

async function loadDefaultAmount() {
  loadingDefault.value = true
  try {
    const data = await $fetch('/api/admin/cmoon-scoring')
    if (amount.value == null) amount.value = data?.dailyTaskPoints || null
  } catch {
    // Leave the field blank — the admin can still type a value.
  } finally {
    loadingDefault.value = false
  }
}

async function start() {
  starting.value = true
  error.value = ''
  summary.value = null
  try {
    const res = await $fetch('/api/admin/cmoons/backfill-points', {
      method: 'POST',
      body: { amount: amount.value, excludeAlreadyScored: excludeAlreadyScored.value },
    })
    jobId = res.jobId
    status.value = 'waiting'
    poll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to start backfill'
  } finally {
    starting.value = false
  }
}

onMounted(async () => {
  await checkExisting()
  if (status.value === 'idle') await loadDefaultAmount()
})
onBeforeUnmount(stopPolling)
</script>

<style scoped>
/* Same "opt out of the newsite dark body" fix AdminCMoon.vue/CMoonRecalcPointsModal.vue use. */
.cbm {
  color: #111;
  color-scheme: light;
}

@media (min-width: 640px) {
  .cbm {
    height: auto !important;
    max-height: 92vh;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.25);
  }
}

.cbm-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}
</style>
