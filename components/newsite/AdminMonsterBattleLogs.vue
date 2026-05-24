<template>
  <div class="admin-monster-battle-logs bg-gray-50">
    <div class="p-2 text-xs">
      <div class="flex items-center justify-between mb-2">
        <h1 class="text-base font-bold">Monster Battles</h1>
        <div class="text-[11px] text-gray-500">Showing {{ showingRange }}</div>
      </div>

      <div class="bg-white rounded shadow p-2 mb-2">
        <div class="flex flex-wrap items-end gap-2">
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Search by username..."
            class="flex-1 min-w-[180px] border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div class="flex items-center">
            <label for="fromDate" class="mr-1 text-[11px] font-medium">Start</label>
            <input id="fromDate" v-model="fromDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
          <div class="flex items-center">
            <label for="toDate" class="mr-1 text-[11px] font-medium">End</label>
            <input id="toDate" v-model="toDate" type="date" class="border rounded px-1.5 py-0.5 text-xs" />
          </div>
        </div>
      </div>

      <div class="bg-white rounded shadow p-2">
        <div v-if="loading" class="text-gray-500">Loading...</div>
        <div v-else-if="battles.length === 0" class="text-gray-500">No battles found.</div>
        <div v-else>
          <!-- Desktop table -->
          <div class="hidden lg:block overflow-auto">
            <table class="min-w-full w-full border rounded text-[11px]">
              <thead class="bg-gray-50 text-left">
                <tr>
                  <th class="px-1.5 py-1 border-b">Created At (CDT)</th>
                  <th class="px-1.5 py-1 border-b">User</th>
                  <th class="px-1.5 py-1 border-b">Selected Monster</th>
                  <th class="px-1.5 py-1 border-b">AI Monster</th>
                  <th class="px-1.5 py-1 border-b">Outcome</th>
                  <th class="px-1.5 py-1 border-b"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="battle in battles" :key="battle.id" class="border-b">
                  <td class="px-1.5 py-1 whitespace-nowrap">{{ formatDate(battle.startedAt) }}</td>
                  <td class="px-1.5 py-1">
                    <div class="font-medium">{{ displayUser(battle.player) }}</div>
                    <div class="text-[10px] text-gray-500">{{ battle.player?.id || '-' }}</div>
                  </td>
                  <td class="px-1.5 py-1">{{ monsterName(battle.playerMonster) }}</td>
                  <td class="px-1.5 py-1">{{ battle.aiMonsterName || '-' }}</td>
                  <td class="px-1.5 py-1">{{ outcomeLabel(battle) }}</td>
                  <td class="px-1.5 py-1">
                    <button
                      class="px-2 py-0.5 border rounded text-[11px] text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                      :disabled="isDeleting(battle.id)"
                      @click="deleteBattle(battle)"
                    >
                      {{ isDeleting(battle.id) ? 'Deleting...' : 'Delete' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="lg:hidden space-y-2">
            <div v-for="battle in battles" :key="battle.id" class="border rounded bg-white p-2 text-[11px]">
              <div class="flex items-center justify-between text-[10px] text-gray-500">
                <span>{{ formatDate(battle.startedAt) }}</span>
                <span>{{ outcomeLabel(battle) }}</span>
              </div>
              <div class="mt-1">
                <div class="font-semibold">{{ displayUser(battle.player) }}</div>
                <div class="text-[10px] text-gray-500">{{ battle.player?.id || '-' }}</div>
              </div>
              <div class="mt-1.5 space-y-0.5">
                <div><span class="text-gray-500">Selected:</span> {{ monsterName(battle.playerMonster) }}</div>
                <div><span class="text-gray-500">AI:</span> {{ battle.aiMonsterName || '-' }}</div>
              </div>
              <div class="mt-1.5">
                <button
                  class="px-2 py-0.5 border rounded text-[11px] text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                  :disabled="isDeleting(battle.id)"
                  @click="deleteBattle(battle)"
                >
                  {{ isDeleting(battle.id) ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between">
          <div class="text-[11px] text-gray-600">
            Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
          </div>
          <div class="space-x-1">
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page <= 1" @click="prevPage">Prev</button>
            <button class="px-2 py-0.5 border rounded text-[11px]" :disabled="page >= totalPages" @click="nextPage">Next</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const battles = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = 100
const searchTerm = ref('')
const fromDate = ref('')
const toDate = ref('')
const deletingIds = ref(new Set())

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const showingRange = computed(() => {
  if (!total.value) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, total.value)
  return `${start}-${end} of ${total.value}`
})

function normalizeDateRange() {
  if (!fromDate.value || !toDate.value) return
  if (new Date(fromDate.value) > new Date(toDate.value)) {
    const tmp = fromDate.value
    fromDate.value = toDate.value
    toDate.value = tmp
  }
}

function formatDate(dt) {
  if (!dt) return '-'
  return new Date(dt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Chicago',
    timeZoneName: 'short'
  })
}

function displayUser(user) {
  return user?.username || user?.discordTag || user?.id || '-'
}

function monsterName(monster) {
  return monster?.customName || monster?.name || '-'
}

function outcomeLabel(battle) {
  if (!battle.endedAt) return 'In Progress'
  const reason = battle.endReason || '-'
  if (battle.winnerIsAi) return `AI Win (${reason})`
  if (battle.winnerUserId) {
    if (battle.player?.id && battle.winnerUserId !== battle.player.id) {
      return `Opponent Win (${reason})`
    }
    return `User Win (${reason})`
  }
  return reason
}

function isDeleting(id) {
  return deletingIds.value.has(id)
}

function setDeleting(id, nextVal) {
  const next = new Set(deletingIds.value)
  if (nextVal) next.add(id)
  else next.delete(id)
  deletingIds.value = next
}

async function fetchBattles() {
  if (loading.value) return
  normalizeDateRange()
  loading.value = true
  try {
    const res = await $fetch('/api/admin/monster-battles', {
      query: {
        page: page.value,
        limit: pageSize,
        username: searchTerm.value.trim() || undefined,
        from: fromDate.value || undefined,
        to: toDate.value || undefined
      }
    })
    battles.value = res.items || []
    total.value = res.total || 0
    if (res.page) page.value = res.page
  } catch (e) {
    console.error('Failed to load monster battles', e)
    battles.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function deleteBattle(battle) {
  if (!battle?.id) return
  if (!confirm('Delete this battle? This cannot be undone.')) return
  setDeleting(battle.id, true)
  try {
    await $fetch(`/api/admin/monster-battles/${battle.id}`, { method: 'DELETE' })
    battles.value = battles.value.filter(row => row.id !== battle.id)
    total.value = Math.max(0, total.value - 1)
    if (battles.value.length === 0 && page.value > 1) {
      page.value -= 1
      await fetchBattles()
    }
  } catch (e) {
    console.error('Failed to delete battle', e)
    alert(e?.data?.statusMessage || e?.message || 'Failed to delete battle')
  } finally {
    setDeleting(battle.id, false)
  }
}

async function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
  await fetchBattles()
}

async function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
  await fetchBattles()
}

let filterDebounceId = null
watch([searchTerm, fromDate, toDate], () => {
  if (filterDebounceId) clearTimeout(filterDebounceId)
  filterDebounceId = setTimeout(() => {
    page.value = 1
    fetchBattles()
  }, 300)
})

onMounted(fetchBattles)
</script>

<style scoped>
.admin-monster-battle-logs {
  width: 100%;
  min-height: 100%;
  color: #111;
}
</style>
