<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />
    <Toast v-if="toast" :message="toast.msg" :type="toast.type" />

    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <h1 class="text-2xl font-semibold mb-1">Game Weekly Leaderboard Prizes</h1>
      <p class="text-sm text-gray-500 mb-4">
        Each game's #1 spot on its rolling 7-day leaderboard is awarded the configured cToon.
        If the winner already won that exact cToon from this schedule before (or it's sold out),
        they get the fallback points instead. gToons Clash isn't listed — its leaderboard is
        win/loss based and has no single weekly #1.
      </p>

      <div v-if="loading" class="text-gray-500">Loading…</div>

      <template v-else>
        <!-- Tabs -->
        <div
          ref="tabsScrollEl"
          class="border-b px-1 pt-2 overflow-x-auto no-scrollbar"
          role="tablist"
          aria-label="Game selection"
          @wheel="onTabsWheel"
        >
          <div class="flex gap-2 min-w-max">
            <button
              v-for="g in games"
              :key="g.game"
              :ref="el => setTabRef(g.game, el)"
              class="px-3 sm:px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 whitespace-nowrap min-h-[44px]"
              :class="activeGame === g.game
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'"
              role="tab"
              :aria-selected="activeGame === g.game"
              @click="switchTab(g.game)"
            >
              {{ g.label }}
              <span v-if="!g.config" class="ml-1 text-amber-500" title="Not configured">●</span>
            </button>
          </div>
        </div>

        <div v-if="current" class="p-4 sm:p-6 space-y-6">
          <!-- Config form -->
          <div class="border rounded-lg p-4">
            <h2 class="text-lg font-semibold mb-3">Schedule</h2>

            <CtoonPicker
              v-model="form.ctoon"
              label="Prize cToon"
              placeholder="Type a cToon name…"
            />
            <p v-if="form.ctoon && form.ctoon.quantity !== null && form.ctoon.totalMinted >= form.ctoon.quantity" class="text-xs text-red-600 mt-1">
              This cToon is sold out — winners will receive fallback points until you pick a different cToon.
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Fallback points</label>
                <input
                  type="number"
                  min="0"
                  v-model.number="form.fallbackPoints"
                  class="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p class="text-xs text-gray-500 mt-1">Given instead of the cToon on a repeat win or if it's sold out.</p>
              </div>

              <div class="flex items-end">
                <label class="inline-flex items-center gap-2 min-h-[44px]">
                  <input type="checkbox" v-model="form.isActive" class="h-5 w-5" />
                  <span class="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Day of week</label>
                <select
                  v-model.number="form.dayOfWeek"
                  class="w-full border border-gray-300 rounded-md px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option v-for="(d, i) in dayNames" :key="i" :value="i">{{ d }}</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Time (Central)</label>
                <input
                  type="time"
                  v-model="form.time"
                  class="w-full border border-gray-300 rounded-md px-3 py-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            <div class="mt-4 flex flex-col sm:flex-row gap-2">
              <button
                class="min-h-[44px] px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                :disabled="!canSave || saving"
                @click="saveConfig"
              >
                {{ saving ? 'Saving…' : 'Save schedule' }}
              </button>
              <button
                v-if="current.config"
                class="min-h-[44px] px-4 py-2 rounded border border-amber-400 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                :disabled="distributing"
                @click="distributeNow"
              >
                {{ distributing ? 'Distributing…' : 'Send test distribution now' }}
              </button>
            </div>
          </div>

          <!-- History -->
          <div>
            <h2 class="text-lg font-semibold mb-3">Distribution history</h2>
            <div v-if="historyLoading" class="text-gray-500 text-sm">Loading…</div>
            <div v-else-if="!history.items.length" class="text-gray-500 text-sm">No prizes distributed yet.</div>

            <template v-else>
              <!-- Mobile cards -->
              <div class="space-y-3 md:hidden">
                <div v-for="row in history.items" :key="row.id" class="border rounded-lg p-3 bg-white shadow-sm">
                  <div class="flex items-center gap-2">
                    <img v-if="row.ctoon" :src="row.ctoon.assetPath" alt="" class="w-10 h-10 rounded border object-cover shrink-0" />
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate">
                        {{ row.ctoon ? row.ctoon.name : `${row.pointsAwarded} points` }}
                      </p>
                      <p v-if="row.wasRepeatWinner" class="text-xs text-amber-600">Repeat-winner fallback</p>
                    </div>
                  </div>
                  <div class="mt-2 text-xs text-gray-600 space-y-0.5">
                    <div><span class="font-medium text-gray-700">Winner:</span> {{ row.winner.username }}</div>
                    <div><span class="font-medium text-gray-700">Week:</span> {{ formatDate(row.weekStart) }} – {{ formatDate(row.weekEnd) }}</div>
                    <div><span class="font-medium text-gray-700">Score:</span> {{ row.score }}</div>
                  </div>
                </div>
              </div>

              <!-- Desktop table -->
              <div class="hidden md:block overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead>
                    <tr class="text-left text-gray-500 border-b">
                      <th class="py-2 pr-4">Week</th>
                      <th class="py-2 pr-4">Winner</th>
                      <th class="py-2 pr-4">Score</th>
                      <th class="py-2 pr-4">Prize</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in history.items" :key="row.id" class="border-b last:border-0">
                      <td class="py-2 pr-4 whitespace-nowrap">{{ formatDate(row.weekStart) }} – {{ formatDate(row.weekEnd) }}</td>
                      <td class="py-2 pr-4">{{ row.winner.username }}</td>
                      <td class="py-2 pr-4">{{ row.score }}</td>
                      <td class="py-2 pr-4">
                        <span v-if="row.ctoon" class="inline-flex items-center gap-2">
                          <img :src="row.ctoon.assetPath" alt="" class="w-6 h-6 rounded border object-cover" />
                          {{ row.ctoon.name }}
                        </span>
                        <span v-else>
                          {{ row.pointsAwarded }} points
                          <span v-if="row.wasRepeatWinner" class="text-amber-600 text-xs">(repeat-winner fallback)</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth', 'admin'], layout: 'admin' })

import { ref, computed, reactive, onMounted, nextTick } from 'vue'
import Nav from '~/components/Nav.vue'
import CtoonPicker from '~/components/CtoonPicker.vue'

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const loading = ref(true)
const games = ref([])
const activeGame = ref(null)
const saving = ref(false)
const distributing = ref(false)
const toast = ref(null)

const historyLoading = ref(false)
const history = reactive({ items: [], total: 0, page: 1, pageSize: 20 })

const form = reactive({ ctoon: null, fallbackPoints: 0, dayOfWeek: 0, hour: 0, minute: 0, time: '00:00', isActive: true })

const current = computed(() => games.value.find(g => g.game === activeGame.value) || null)
const canSave = computed(() => !!form.ctoon && Number.isInteger(form.fallbackPoints) && form.fallbackPoints >= 0)

function showToast(msg, type = 'success') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function applyConfigToForm(entry) {
  const c = entry?.config
  if (c) {
    form.ctoon = c.ctoon
    form.fallbackPoints = c.fallbackPoints
    form.dayOfWeek = c.dayOfWeek
    form.hour = c.hour
    form.minute = c.minute
    form.time = `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`
    form.isActive = c.isActive
  } else {
    form.ctoon = null
    form.fallbackPoints = 0
    form.dayOfWeek = 0
    form.hour = 0
    form.minute = 0
    form.time = '00:00'
    form.isActive = true
  }
}

async function fetchConfigs() {
  loading.value = true
  try {
    games.value = await $fetch('/api/admin/game-weekly-leaderboard/configs')
    if (!activeGame.value && games.value.length) activeGame.value = games.value[0].game
    applyConfigToForm(current.value)
  } finally {
    loading.value = false
  }
}

async function fetchHistory() {
  if (!activeGame.value) return
  historyLoading.value = true
  try {
    const res = await $fetch(`/api/admin/game-weekly-leaderboard/${activeGame.value}/history`)
    Object.assign(history, res)
  } finally {
    historyLoading.value = false
  }
}

const tabRefs = {}
function setTabRef(game, el) { if (el) tabRefs[game] = el }
const tabsScrollEl = ref(null)
function onTabsWheel(e) {
  const el = tabsScrollEl.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

async function switchTab(game) {
  activeGame.value = game
  applyConfigToForm(current.value)
  await nextTick()
  tabRefs[game]?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  fetchHistory()
}

function parseTime() {
  const [h, m] = (form.time || '00:00').split(':').map(n => parseInt(n, 10))
  form.hour = Number.isInteger(h) ? h : 0
  form.minute = Number.isInteger(m) ? m : 0
}

async function saveConfig() {
  if (!canSave.value || !activeGame.value) return
  parseTime()
  saving.value = true
  try {
    await $fetch(`/api/admin/game-weekly-leaderboard/${activeGame.value}`, {
      method: 'PUT',
      body: {
        ctoonId: form.ctoon.id,
        fallbackPoints: form.fallbackPoints,
        dayOfWeek: form.dayOfWeek,
        hour: form.hour,
        minute: form.minute,
        isActive: form.isActive
      }
    })
    showToast('Schedule saved')
    await fetchConfigs()
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Failed to save schedule', 'error')
  } finally {
    saving.value = false
  }
}

async function distributeNow() {
  if (!activeGame.value) return
  if (!confirm('Send a real prize distribution for this game right now? This awards a live winner (or falls back to points) and cannot be undone.')) return
  distributing.value = true
  try {
    const res = await $fetch(`/api/admin/game-weekly-leaderboard/${activeGame.value}/distribute-now`, {
      method: 'POST',
      body: { force: true }
    })
    if (res.skipped) {
      showToast(`Skipped: ${res.reason}`, 'error')
    } else if (!res.winner) {
      showToast('No winner this week — nothing to distribute')
    } else {
      showToast(`Distributed to ${res.winner.username}`)
    }
    await fetchHistory()
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Distribution failed', 'error')
  } finally {
    distributing.value = false
  }
}

onMounted(async () => {
  await fetchConfigs()
  await fetchHistory()
})
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
