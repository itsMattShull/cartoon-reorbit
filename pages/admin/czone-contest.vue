<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />
    <Toast v-if="toast" :message="toast.msg" :type="toast.type" />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 class="text-2xl font-semibold">cZone Contests</h1>
        <button class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700" @click="openCreate">
          Create Contest
        </button>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <input id="show-all" type="checkbox" v-model="showAll" class="h-4 w-4" @change="fetchContests" />
        <label for="show-all" class="text-sm text-gray-700">Show past contests</label>
      </div>

      <div v-if="loadingContests" class="text-gray-500">Loading...</div>
      <div v-else-if="contests.length === 0" class="text-gray-500 text-sm">No contests found.</div>

      <template v-else>
        <!-- Mobile cards -->
        <div class="space-y-4 sm:hidden">
          <div v-for="row in contests" :key="row.id" class="border rounded-lg p-4 bg-white">
            <div class="font-semibold text-gray-900">{{ row.name }}</div>
            <div class="text-xs text-gray-500 mt-1">
              {{ formatDate(row.startDate) }} → {{ formatDate(row.endDate) }}
            </div>
            <div class="text-xs text-gray-600 mt-1">
              <span class="font-medium">Submissions:</span> {{ row._count.submissions }} &nbsp;
              <span class="font-medium">Max votes:</span> {{ row.maxVotesPerUser }}
            </div>
            <div class="mt-1">
              <span :class="statusClass(row)">{{ statusLabel(row) }}</span>
            </div>
            <div class="mt-3 flex gap-3 flex-wrap text-sm">
              <button class="text-blue-600 hover:text-blue-800" @click="openEdit(row)">Edit</button>
              <button class="text-red-600 hover:text-red-800" @click="confirmDelete(row)">Delete</button>
              <button
                :disabled="!!row.distributedAt"
                class="hover:text-amber-800"
                :class="row.distributedAt ? 'text-gray-400 cursor-not-allowed' : 'text-amber-600'"
                @click="openDistribute(row)"
              >{{ row.distributedAt ? 'Distributed' : 'Distribute Prizes' }}</button>
            </div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Name</th>
                <th class="py-2 pr-4">Start</th>
                <th class="py-2 pr-4">End</th>
                <th class="py-2 pr-4">Submissions</th>
                <th class="py-2 pr-4">Votes/User</th>
                <th class="py-2 pr-4">Status</th>
                <th class="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in contests" :key="row.id" class="border-b last:border-b-0">
                <td class="py-3 pr-4 font-medium">{{ row.name }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatDate(row.startDate) }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatDate(row.endDate) }}</td>
                <td class="py-3 pr-4">{{ row._count.submissions }}</td>
                <td class="py-3 pr-4">{{ row.maxVotesPerUser }}</td>
                <td class="py-3 pr-4">
                  <span :class="statusClass(row)">{{ statusLabel(row) }}</span>
                </td>
                <td class="py-3 pr-4">
                  <div class="flex gap-3">
                    <button class="text-blue-600 hover:text-blue-800" @click="openEdit(row)">Edit</button>
                    <button class="text-red-600 hover:text-red-800" @click="confirmDelete(row)">Delete</button>
                    <button
                      :disabled="!!row.distributedAt"
                      class="hover:text-amber-800"
                      :class="row.distributedAt ? 'text-gray-400 cursor-not-allowed' : 'text-amber-600'"
                      @click="openDistribute(row)"
                    >{{ row.distributedAt ? 'Distributed' : 'Distribute Prizes' }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <!-- ── Create / Edit Modal ─────────────────────────────────────── -->
    <div v-if="showFormModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click.self="closeFormModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">{{ editingContest ? 'Edit Contest' : 'Create Contest' }}</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeFormModal">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <div class="space-y-4 text-sm">
            <!-- Name -->
            <div>
              <label class="block font-medium mb-1">Contest Name</label>
              <input v-model="form.name" class="w-full border rounded px-3 py-2" placeholder="Spring cZone Showdown" />
            </div>

            <!-- Dates -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-medium mb-1">Start Date</label>
                <input v-model="form.startDate" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block font-medium mb-1">End Date</label>
                <input v-model="form.endDate" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
            </div>

            <!-- Max votes -->
            <div>
              <label class="block font-medium mb-1">Max Votes Per User</label>
              <input v-model.number="form.maxVotesPerUser" type="number" min="1" class="w-full border rounded px-3 py-2" />
            </div>

            <!-- Winner prizes -->
            <div>
              <p class="font-semibold mb-2">Winner Prizes</p>
              <PrizeBuilder v-model="form.winnerPrizes" :ctoon-options="ctoonOptions" :bg-options="bgOptions" />
            </div>

            <!-- Participant prizes -->
            <div>
              <p class="font-semibold mb-2">Participant Prizes</p>
              <PrizeBuilder v-model="form.participantPrizes" :ctoon-options="ctoonOptions" :bg-options="bgOptions" />
            </div>

            <div v-if="formError" class="text-red-600 text-xs">{{ formError }}</div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="closeFormModal">Cancel</button>
          <button
            :disabled="formSaving"
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            @click="saveForm"
          >{{ formSaving ? 'Saving...' : (editingContest ? 'Save Changes' : 'Create') }}</button>
        </div>
      </div>
    </div>

    <!-- ── Delete Confirmation Modal ──────────────────────────────── -->
    <div v-if="showDeleteModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="showDeleteModal = false"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">Delete Contest</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="showDeleteModal = false">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <p class="text-gray-700 text-sm">
            Are you sure you want to delete <strong>{{ deletingContest?.name }}</strong>?
            This will also delete all submissions and votes.
          </p>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="showDeleteModal = false">Cancel</button>
          <button
            :disabled="deleteSaving"
            class="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            @click="doDelete"
          >{{ deleteSaving ? 'Deleting...' : 'Delete' }}</button>
        </div>
      </div>
    </div>

    <!-- ── Distribute Prizes Modal ─────────────────────────────────── -->
    <div v-if="showDistributeModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click.self="closeDistributeModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">Distribute Prizes — {{ distributingContest?.name }}</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeDistributeModal">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <div v-if="leaderboardLoading" class="text-gray-500 text-sm">Loading leaderboard...</div>
          <div v-else-if="leaderboard.length === 0" class="text-gray-500 text-sm">No submissions yet.</div>

          <template v-else>
            <p class="text-gray-600 text-sm mb-3">Select the winner from the leaderboard, then click Distribute.</p>

            <div class="space-y-2">
              <label
                v-for="(sub, i) in leaderboard"
                :key="sub.id"
                class="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-gray-50"
                :class="selectedWinnerId === sub.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'"
              >
                <input type="radio" v-model="selectedWinnerId" :value="sub.id" class="mt-0.5" />
                <img :src="sub.imageUrl" class="w-16 h-12 object-cover rounded" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">{{ sub.username }}</div>
                  <div class="text-xs text-gray-500">Zone {{ sub.zoneIndex + 1 }} &mdash; {{ sub.voteCount }} votes</div>
                </div>
                <span v-if="i === 0" class="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded font-semibold">#1</span>
              </label>
            </div>

            <div v-if="distributeError" class="text-red-600 text-xs mt-2">{{ distributeError }}</div>
          </template>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="closeDistributeModal">Cancel</button>
          <button
            :disabled="!selectedWinnerId || distributeSaving"
            class="px-4 py-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            @click="doDistribute"
          >{{ distributeSaving ? 'Distributing...' : 'Distribute Prizes' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth', 'admin'] })

// ── Data ──────────────────────────────────────────────────────────────────────
const contests = ref([])
const loadingContests = ref(false)
const showAll = ref(false)
const toast = ref(null)

const ctoonOptions = ref([])
const bgOptions = ref([])

// ── Create / Edit form ────────────────────────────────────────────────────────
const showFormModal = ref(false)
const editingContest = ref(null)
const formSaving = ref(false)
const formError = ref('')

function emptyPrizes() {
  return { ctoons: [], backgroundIds: [], points: 0 }
}

const form = ref({
  name: '',
  startDate: '',
  endDate: '',
  maxVotesPerUser: 5,
  winnerPrizes: emptyPrizes(),
  participantPrizes: emptyPrizes()
})

// ── Delete ─────────────────────────────────────────────────────────────────────
const showDeleteModal = ref(false)
const deletingContest = ref(null)
const deleteSaving = ref(false)

// ── Distribute ─────────────────────────────────────────────────────────────────
const showDistributeModal = ref(false)
const distributingContest = ref(null)
const leaderboard = ref([])
const leaderboardLoading = ref(false)
const selectedWinnerId = ref(null)
const distributeSaving = ref(false)
const distributeError = ref('')

// ── Helpers ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  toast.value = { msg, type }
  setTimeout(() => { toast.value = null }, 3000)
}

function formatDate(dt) {
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

function toDatetimeLocal(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusLabel(row) {
  if (row.distributedAt) return 'Ended'
  const now = new Date()
  if (new Date(row.startDate) > now) return 'Upcoming'
  if (new Date(row.endDate) < now) return 'Past'
  return 'Active'
}

function statusClass(row) {
  const s = statusLabel(row)
  return {
    Active: 'text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium',
    Upcoming: 'text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium',
    Past: 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium',
    Ended: 'text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium'
  }[s] || ''
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchContests() {
  loadingContests.value = true
  try {
    contests.value = await $fetch(`/api/admin/czone-contest?showAll=${showAll.value}`)
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Failed to load contests', 'error')
  } finally {
    loadingContests.value = false
  }
}

function openCreate() {
  editingContest.value = null
  form.value = { name: '', startDate: '', endDate: '', maxVotesPerUser: 5, winnerPrizes: emptyPrizes(), participantPrizes: emptyPrizes() }
  formError.value = ''
  showFormModal.value = true
}

function openEdit(row) {
  editingContest.value = row
  form.value = {
    name: row.name,
    startDate: toDatetimeLocal(row.startDate),
    endDate: toDatetimeLocal(row.endDate),
    maxVotesPerUser: row.maxVotesPerUser,
    winnerPrizes: JSON.parse(JSON.stringify(row.winnerPrizes || emptyPrizes())),
    participantPrizes: JSON.parse(JSON.stringify(row.participantPrizes || emptyPrizes()))
  }
  formError.value = ''
  showFormModal.value = true
}

function closeFormModal() {
  showFormModal.value = false
  editingContest.value = null
}

async function saveForm() {
  formError.value = ''
  if (!form.value.name.trim()) { formError.value = 'Name is required'; return }
  if (!form.value.startDate || !form.value.endDate) { formError.value = 'Both dates are required'; return }
  if (new Date(form.value.startDate) >= new Date(form.value.endDate)) { formError.value = 'End must be after start'; return }

  formSaving.value = true
  try {
    const payload = {
      name: form.value.name.trim(),
      startDate: new Date(form.value.startDate).toISOString(),
      endDate: new Date(form.value.endDate).toISOString(),
      maxVotesPerUser: form.value.maxVotesPerUser,
      winnerPrizes: form.value.winnerPrizes,
      participantPrizes: form.value.participantPrizes
    }
    if (editingContest.value) {
      await $fetch(`/api/admin/czone-contest/${editingContest.value.id}`, { method: 'PUT', body: payload })
      showToast('Contest updated')
    } else {
      await $fetch('/api/admin/czone-contest', { method: 'POST', body: payload })
      showToast('Contest created')
    }
    closeFormModal()
    await fetchContests()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    formSaving.value = false
  }
}

function confirmDelete(row) {
  deletingContest.value = row
  showDeleteModal.value = true
}

async function doDelete() {
  deleteSaving.value = true
  try {
    await $fetch(`/api/admin/czone-contest/${deletingContest.value.id}`, { method: 'DELETE' })
    showToast('Contest deleted')
    showDeleteModal.value = false
    deletingContest.value = null
    await fetchContests()
  } catch (e) {
    showToast(e?.data?.statusMessage || 'Delete failed', 'error')
  } finally {
    deleteSaving.value = false
  }
}

async function openDistribute(row) {
  distributingContest.value = row
  selectedWinnerId.value = null
  distributeError.value = ''
  leaderboard.value = []
  showDistributeModal.value = true
  leaderboardLoading.value = true
  try {
    const data = await $fetch(`/api/admin/czone-contest/${row.id}/leaderboard`)
    leaderboard.value = data.submissions
  } catch (e) {
    distributeError.value = e?.data?.statusMessage || 'Failed to load leaderboard'
  } finally {
    leaderboardLoading.value = false
  }
}

function closeDistributeModal() {
  showDistributeModal.value = false
  distributingContest.value = null
}

async function doDistribute() {
  if (!selectedWinnerId.value) return
  distributeError.value = ''
  distributeSaving.value = true
  try {
    await $fetch(`/api/admin/czone-contest/${distributingContest.value.id}/distribute`, {
      method: 'POST',
      body: { winnerId: selectedWinnerId.value }
    })
    showToast('Prizes distributed successfully!')
    closeDistributeModal()
    await fetchContests()
  } catch (e) {
    distributeError.value = e?.data?.statusMessage || 'Distribution failed'
  } finally {
    distributeSaving.value = false
  }
}

onMounted(async () => {
  await fetchContests()
  try {
    const [ct, bg] = await Promise.all([
      $fetch('/api/admin/list-ctoons'),
      $fetch('/api/admin/list-backgrounds')
    ])
    ctoonOptions.value = ct
    bgOptions.value = bg
  } catch {}
})
</script>
