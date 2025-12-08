<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Admin Changes</h1>

    <div class="bg-white rounded-lg shadow-md p-4 md:p-6 max-w-6xl mx-auto">
      <!-- Filters -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">User</label>
          <select v-model="filters.userId" class="input">
            <option value="">All admins</option>
            <option v-for="u in adminUsers" :key="u.id" :value="u.id">{{ u.username || u.discordTag || u.id }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Start date</label>
          <input type="date" v-model="filters.startDate" class="input" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">End date</label>
          <input type="date" v-model="filters.endDate" class="input" />
        </div>
        <div class="flex items-end gap-2">
          <button class="btn-primary w-full" @click="applyFilters">Apply</button>
        </div>
      </div>

      <!-- Desktop table -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left text-gray-600 border-b">
              <th class="px-3 py-2">When (CDT)</th>
              <th class="px-3 py-2">User</th>
              <th class="px-3 py-2">Area</th>
              <th class="px-3 py-2">Key</th>
              <th class="px-3 py-2">Previous</th>
              <th class="px-3 py-2">New</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b align-top">
              <td class="px-3 py-2 whitespace-nowrap">{{ row.createdAtCdt }}</td>
              <td class="px-3 py-2">{{ labelUser(row.user) }}</td>
              <td class="px-3 py-2">{{ row.area }}</td>
              <td class="px-3 py-2">{{ row.key }}</td>
              <td class="px-3 py-2 text-gray-700 break-all">
                <pre class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre>
              </td>
              <td class="px-3 py-2 text-gray-900 break-all">
                <pre class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="px-3 py-6 text-center text-gray-500">No changes found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards -->
      <div class="md:hidden space-y-3">
        <div v-for="row in rows" :key="row.id" class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div class="text-xs text-gray-500">{{ row.createdAtCdt }}</div>
          <div class="font-medium">{{ labelUser(row.user) }}</div>
          <div class="text-sm text-gray-700">{{ row.area }} · {{ row.key }}</div>
          <div class="mt-2 grid grid-cols-1 gap-2">
            <div>
              <div class="text-xs text-gray-500">Previous</div>
              <div class="text-sm break-words"><pre class="whitespace-pre-wrap">{{ row.prevValue ?? '—' }}</pre></div>
            </div>
            <div>
              <div class="text-xs text-gray-500">New</div>
              <div class="text-sm break-words"><pre class="whitespace-pre-wrap">{{ row.newValue ?? '—' }}</pre></div>
            </div>
          </div>
        </div>
        <div v-if="!rows.length" class="text-center text-gray-500 py-4">No changes found.</div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const rows = ref([])
const adminUsers = ref([])
const loading = ref(false)
const filters = ref({ userId: '', startDate: '', endDate: '' })

function buildQuery() {
  const q = {}
  if (filters.value.userId) q.userId = filters.value.userId
  // pass ISO strings if dates present, covering the whole day
  if (filters.value.startDate) q.start = `${filters.value.startDate}T00:00:00`
  if (filters.value.endDate)   q.end   = `${filters.value.endDate}T23:59:59.999`
  return q
}

function labelUser(u) {
  return u?.username || u?.discordTag || u?.id || 'Unknown'
}

async function loadAdmins() {
  try {
    const list = await $fetch('/api/admin/users')
    adminUsers.value = (list || []).filter(u => u.isAdmin)
  } catch {}
}

async function loadRows() {
  loading.value = true
  try {
    rows.value = await $fetch('/api/admin/admin-changes', { params: buildQuery() })
  } catch (e) {
    console.error('Failed to load admin changes', e)
    rows.value = []
  } finally {
    loading.value = false
  }
}

function applyFilters() { loadRows() }

onMounted(async () => {
  await loadAdmins()
  await loadRows()
})
</script>

<style scoped>
.input { width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
</style>

