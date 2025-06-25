// pages/admin/points-log.vue
<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-semibold">Points Log</h1>
      </div>

      <!-- FILTER BAR -->
      <div class="flex mb-6">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="Search by username…"
          class="flex-1 border border-gray-300 rounded px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <!-- TABLE VIEW (desktop) -->
      <div class="overflow-x-auto hidden sm:block">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">User</th>
              <th class="px-4 py-2 text-left">Direction</th>
              <th class="px-4 py-2 text-right">Points</th>
              <th class="px-4 py-2 text-left">Method</th>
              <th class="px-4 py-2 text-left">Created At (CDT)</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in displayedLogs"
              :key="log.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2">{{ log.user.username }}</td>
              <td class="px-4 py-2 capitalize">{{ log.direction }}</td>
              <td class="px-4 py-2 text-right">{{ log.points }}</td>
              <td class="px-4 py-2">{{ log.method || '—' }}</td>
              <td class="px-4 py-2 whitespace-nowrap">
                {{ new Date(log.createdAt).toLocaleString('en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                  timeZone: 'America/Chicago', timeZoneName: 'short'
                }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- CARD VIEW (mobile) -->
      <div class="space-y-4 block sm:hidden">
        <div
          v-for="log in displayedLogs"
          :key="log.id"
          class="bg-gray-100 rounded-lg p-4 flex flex-col"
        >
          <div class="flex justify-between">
            <div>
              <p class="font-semibold">{{ log.user.username }}</p>
              <p class="text-sm capitalize">{{ log.direction }}</p>
              <p class="text-sm">Points: {{ log.points }}</p>
              <p class="text-sm">Method: {{ log.method || '—' }}</p>
            </div>
            <p class="text-xs whitespace-nowrap">
              {{ new Date(log.createdAt).toLocaleString('en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
                timeZone: 'America/Chicago'
              }) }}
            </p>
          </div>
        </div>
      </div>

      <!-- infinite scroll sentinel -->
      <div ref="sentinel" class="h-2"></div>
      <div v-if="loading" class="text-center py-4">Loading more…</div>
      <div v-if="finished" class="text-center py-4 text-gray-500">No more logs.</div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })
import { ref, onMounted, computed } from 'vue'
import { getQuery } from 'h3'
import Nav from '~/components/Nav.vue'

const take      = 50
const skip      = ref(0)
const rawLogs   = ref([])
const loading   = ref(false)
const finished  = ref(false)
const sentinel  = ref(null)

// FILTER STATE
const searchTerm = ref('')

const displayedLogs = computed(() => {
  return rawLogs.value.filter(l =>
    l.user.username.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

async function loadNext() {
  if (loading.value || finished.value) return
  loading.value = true
  const res = await fetch(
    `/api/admin/points-log?skip=${skip.value}&take=${take}`,
    { credentials: 'include' }
  )
  if (!res.ok) { loading.value=false; return }
  const page = await res.json()
  if (page.length < take) finished.value = true
  rawLogs.value.push(...page)
  skip.value += take
  loading.value = false
}

onMounted(() => {
  loadNext()
  const obs = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadNext() },
    { rootMargin: '200px' }
  )
  if (sentinel.value) obs.observe(sentinel.value)
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>