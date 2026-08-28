<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-3" @keydown.esc="onEsc">
    <div class="absolute inset-0 bg-black/50" @click="onBackdrop"></div>
    <div class="relative bg-white w-full max-w-lg rounded-lg shadow-lg flex flex-col max-h-[85vh]">
      <div class="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
        <h3 class="text-lg font-semibold">Transfer {{ sourceUser?.username || sourceUser?.discordTag || 'user' }}</h3>
        <button
          class="text-gray-400 hover:text-gray-600 text-xl leading-none"
          :disabled="phase === 'working'"
          @click="onBackdrop"
        >✕</button>
      </div>

      <div class="overflow-y-auto flex-1 px-5 py-4 text-sm">
        <!-- Phase: pick target -->
        <div v-if="phase === 'pick'" class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide">Source (from)</label>
            <div class="mt-1 border rounded-md px-3 py-2 bg-gray-50 text-gray-800 font-medium">
              {{ sourceUser?.username || sourceUser?.discordTag }}
            </div>
            <p v-if="sourceUser?.isAdmin" class="mt-1 text-xs text-amber-700">
              ⚠ This is an admin account. Transferring will still deactivate it.
            </p>
          </div>

          <div class="relative">
            <label class="block text-xs font-medium text-gray-500 uppercase tracking-wide">Target (to)</label>
            <input
              v-model="targetQuery"
              type="text"
              autocomplete="off"
              placeholder="Type 3+ characters of a username…"
              class="mt-1 w-full border rounded-md px-3 py-2 text-sm"
              @focus="targetDropdownOpen = true"
            />
            <div
              v-if="targetDropdownOpen && (targetResults.length || targetSearching)"
              class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border rounded-md shadow-lg"
            >
              <div v-if="targetSearching" class="px-3 py-2 text-xs text-gray-400">Searching…</div>
              <button
                v-for="u in targetResults"
                :key="u.id"
                type="button"
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-b-0"
                @click="pickTarget(u)"
              >
                <div class="font-medium">{{ u.username }}</div>
                <div class="text-xs text-gray-400">
                  {{ u.isAdmin ? 'Admin' : '' }}
                </div>
              </button>
            </div>
          </div>

          <div v-if="targetUser" class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            Selected target: <strong>{{ targetUser.username }}</strong>
          </div>

          <div v-if="pickError" class="text-sm text-red-600">{{ pickError }}</div>
        </div>

        <!-- Phase: confirm1 / confirm2 -->
        <div v-if="phase === 'confirm1' || phase === 'confirm2'" class="space-y-3">
          <div
            class="rounded-md border px-3 py-3"
            :class="phase === 'confirm2' ? 'border-rose-300 bg-rose-50' : 'border-amber-200 bg-amber-50'"
          >
            <p class="font-medium" :class="phase === 'confirm2' ? 'text-rose-800' : 'text-amber-800'">
              {{ phase === 'confirm2' ? 'Are you absolutely sure?' : 'Please review before continuing' }}
            </p>
            <ul class="mt-2 text-sm space-y-1" :class="phase === 'confirm2' ? 'text-rose-700' : 'text-amber-700'">
              <li><strong>{{ preview?.ctoonCount ?? 0 }}</strong> cToons will move from <strong>{{ preview?.source?.username }}</strong> to <strong>{{ preview?.target?.username }}</strong></li>
              <li><strong>{{ preview?.points ?? 0 }}</strong> points will move from <strong>{{ preview?.source?.username }}</strong> to <strong>{{ preview?.target?.username }}</strong></li>
              <li>After the transfer, <strong>{{ preview?.source?.username }}</strong> will be deactivated and can no longer log in.</li>
            </ul>
            <p v-if="phase === 'confirm2'" class="mt-2 text-xs text-rose-600">This action cannot be undone.</p>
          </div>
        </div>

        <!-- Phase: working -->
        <div v-if="phase === 'working'" class="space-y-2">
          <p class="text-sm text-gray-600">{{ step || 'Processing…' }}</p>
          <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div class="h-3 rounded-full bg-blue-500 transition-all duration-500" :style="{ width: pct + '%' }"></div>
          </div>
          <p class="text-xs text-gray-400 text-right">{{ pct }}%</p>
        </div>

        <!-- Phase: done -->
        <div v-if="phase === 'done'" class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 space-y-1">
          <p class="font-medium">Transfer complete</p>
          <ul v-if="summary" class="text-xs space-y-0.5 mt-1">
            <li>Points transferred: {{ summary.pointsTransferred }}</li>
            <li>cToons transferred: {{ summary.ctoonsTransferred }}</li>
            <li>{{ summary.sourceUsername }} has been deactivated</li>
          </ul>
        </div>

        <div v-if="error" class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
          <p class="font-medium">Transfer failed</p>
          <p>{{ error }}</p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 px-5 py-4 border-t flex-shrink-0">
        <button
          v-if="phase !== 'working'"
          class="px-3 py-1 text-sm border rounded-md"
          @click="onBackdrop"
        >{{ phase === 'done' ? 'Close' : 'Cancel' }}</button>

        <button
          v-if="phase === 'pick'"
          class="px-3 py-1 text-sm rounded-md text-white"
          :class="canPreview ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'"
          :disabled="!canPreview || previewLoading"
          @click="submitPreview"
        >{{ previewLoading ? 'Loading…' : 'Preview Transfer' }}</button>

        <button
          v-if="phase === 'confirm1'"
          class="px-3 py-1 text-sm rounded-md text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300"
          :disabled="confirmLocked"
          @click="goToConfirm2"
        >Confirm</button>

        <button
          v-if="phase === 'confirm2'"
          class="px-3 py-1 text-sm rounded-md text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300"
          :disabled="confirmLocked"
          @click="startTransfer"
        >Confirm &amp; Start Transfer</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  sourceUser: { type: Object, default: null },
})
const emit = defineEmits(['close', 'completed'])

const phase = ref('pick')
const pickError = ref('')
const error = ref('')

const targetQuery = ref('')
const targetResults = ref([])
const targetSearching = ref(false)
const targetDropdownOpen = ref(false)
const targetUser = ref(null)

let searchTimer = null
let searchAbort = null
let searchToken = 0

watch(targetQuery, (q) => {
  targetUser.value = null
  pickError.value = ''
  if (searchTimer) clearTimeout(searchTimer)
  const query = q.trim()
  if (query.length < 3) {
    targetResults.value = []
    targetSearching.value = false
    if (searchAbort) searchAbort.abort()
    return
  }
  targetSearching.value = true
  searchTimer = setTimeout(() => runSearch(query), 250)
})

async function runSearch(query) {
  if (searchAbort) searchAbort.abort()
  const abort = new AbortController()
  searchAbort = abort
  const token = ++searchToken
  try {
    const res = await $fetch('/api/admin/users/search', { params: { q: query }, signal: abort.signal })
    if (token !== searchToken) return // a newer search superseded this one
    targetResults.value = (res?.users || []).filter(u => u.id !== props.sourceUser?.id && !u.banned && u.active)
  } catch (e) {
    if (token !== searchToken) return
    targetResults.value = []
  } finally {
    if (token === searchToken) targetSearching.value = false
  }
}

function pickTarget(u) {
  targetUser.value = u
  targetQuery.value = u.username
  targetDropdownOpen.value = false
  targetResults.value = []
}

const canPreview = computed(() => !!targetUser.value && !!props.sourceUser?.id)

const preview = ref(null)
const previewLoading = ref(false)

async function submitPreview() {
  if (!canPreview.value) return
  previewLoading.value = true
  pickError.value = ''
  try {
    const res = await $fetch('/api/admin/users/transfer-preview', {
      params: { sourceUserId: props.sourceUser.id, targetUserId: targetUser.value.id }
    })
    preview.value = res
    phase.value = 'confirm1'
    lockConfirmBriefly()
  } catch (e) {
    pickError.value = e?.data?.statusMessage || e?.message || 'Failed to preview transfer.'
  } finally {
    previewLoading.value = false
  }
}

// Brief disable window after each phase transition so two fast taps can't
// blow through both confirmation screens as one accidental double-click.
const confirmLocked = ref(false)
function lockConfirmBriefly() {
  confirmLocked.value = true
  setTimeout(() => { confirmLocked.value = false }, 500)
}

function goToConfirm2() {
  if (confirmLocked.value) return
  phase.value = 'confirm2'
  lockConfirmBriefly()
}

const pct = ref(0)
const step = ref('')
const summary = ref(null)
let poller = null

onBeforeUnmount(() => {
  if (poller) { clearInterval(poller); poller = null }
})

async function startTransfer() {
  if (confirmLocked.value || !preview.value) return
  error.value = ''
  try {
    const res = await $fetch('/api/admin/users/transfer', {
      method: 'POST',
      body: { sourceUserId: preview.value.source.id, targetUserId: preview.value.target.id }
    })
    phase.value = 'working'
    pct.value = 0
    step.value = 'Queued…'
    startPolling(res.jobId)
  } catch (e) {
    error.value = e?.data?.statusMessage || e?.message || 'Failed to start transfer.'
    phase.value = 'confirm2'
  }
}

function startPolling(jobId) {
  poller = setInterval(async () => {
    try {
      const status = await $fetch('/api/admin/users/transfer-status', { params: { jobId } })
      pct.value = status.pct ?? 0
      step.value = status.step ?? ''
      if (status.status === 'completed') {
        clearInterval(poller); poller = null
        summary.value = status.summary || null
        phase.value = 'done'
        emit('completed', status.summary)
      } else if (status.status === 'failed') {
        clearInterval(poller); poller = null
        error.value = status.error || 'Transfer job failed. Contact engineering.'
        phase.value = 'confirm2'
      }
    } catch {}
  }, 1500)
}

function reset() {
  phase.value = 'pick'
  pickError.value = ''
  error.value = ''
  targetQuery.value = ''
  targetResults.value = []
  targetSearching.value = false
  targetDropdownOpen.value = false
  targetUser.value = null
  preview.value = null
  previewLoading.value = false
  confirmLocked.value = false
  pct.value = 0
  step.value = ''
  summary.value = null
  if (poller) { clearInterval(poller); poller = null }
}

watch(() => props.show, (isShown) => {
  if (isShown) reset()
})

function onBackdrop() {
  if (phase.value === 'working') return
  emit('close')
}
function onEsc() {
  if (phase.value === 'working') return
  emit('close')
}
</script>
