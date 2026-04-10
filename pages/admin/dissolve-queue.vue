<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto mt-6 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold">Dissolve Queue</h1>
        <button @click="loadData" class="text-sm text-blue-600 underline">Refresh</button>
      </div>

      <!-- Summary cards -->
      <div v-if="stats" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div v-for="cat in categories" :key="cat.key"
             class="bg-white rounded-lg shadow p-4">
          <div class="text-sm font-semibold text-gray-500 mb-1">{{ cat.label }}</div>
          <div class="text-2xl font-bold">{{ stats.byCategory[cat.key]?.total ?? 0 }}</div>
          <div class="text-xs text-gray-500 mt-1">
            <span class="text-emerald-600">{{ stats.byCategory[cat.key]?.scheduled ?? 0 }} scheduled</span>
            <span class="mx-1">·</span>
            <span class="text-orange-500">{{ stats.byCategory[cat.key]?.unscheduled ?? 0 }} unscheduled</span>
          </div>
        </div>
      </div>

      <!-- Upcoming scheduled auctions -->
      <div class="bg-white rounded-lg shadow">
        <div class="p-4 border-b">
          <h2 class="font-semibold">Upcoming Scheduled Auctions</h2>
          <p class="text-xs text-gray-500 mt-0.5">Next 20 entries, times in CST</p>
        </div>
        <div v-if="upcoming.length" class="divide-y">
          <div v-for="entry in upcoming" :key="entry.id"
               class="flex items-center gap-3 px-4 py-3 text-sm">
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ entry.ctoonName || '—' }}</div>
              <div class="text-xs text-gray-500">
                {{ entry.rarity }}
                <span v-if="entry.mintNumber != null"> · Mint #{{ entry.mintNumber }}</span>
                <span class="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                      :class="categoryChip(entry.category)">{{ entry.category }}</span>
                <span v-if="entry.isFeatured" class="ml-1 px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Featured</span>
              </div>
            </div>
            <div class="text-xs text-gray-600 shrink-0">{{ fmtCST(entry.scheduledFor) }}</div>
            <button
              @click="cancelEntry(entry.id)"
              class="text-xs text-red-500 hover:text-red-700 shrink-0"
              :disabled="cancellingId === entry.id"
            >{{ cancellingId === entry.id ? '…' : 'Unschedule' }}</button>
          </div>
        </div>
        <div v-else class="p-6 text-center text-sm text-gray-400">No upcoming scheduled auctions</div>
      </div>

      <!-- Reschedule All form -->
      <div class="bg-white rounded-lg shadow p-5">
        <h2 class="font-semibold mb-1">Reschedule All</h2>
        <p class="text-xs text-gray-500 mb-4">
          Set a new schedule for all unscheduled entries. Toggle "Reschedule all" to also reset existing scheduled entries.
        </p>

        <div class="space-y-3 max-w-sm">
          <div class="flex items-center gap-2">
            <label class="w-40 text-xs text-gray-600 shrink-0">Start date (local)</label>
            <input v-model="form.startAtLocal" type="datetime-local"
                   class="flex-1 text-xs border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <label class="w-40 text-xs text-gray-600 shrink-0">Cadence (days)</label>
            <input v-model.number="form.cadenceDays" type="number" min="1"
                   class="w-24 text-xs border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <label class="w-40 text-xs text-gray-600 shrink-0">Pokémon / cadence</label>
            <input v-model.number="form.pokemonPerCadence" type="number" min="1"
                   class="w-24 text-xs border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <label class="w-40 text-xs text-gray-600 shrink-0">Crazy Rare / cadence</label>
            <input v-model.number="form.crazyRarePerCadence" type="number" min="1"
                   class="w-24 text-xs border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <label class="w-40 text-xs text-gray-600 shrink-0">Other / cadence</label>
            <input v-model.number="form.otherPerCadence" type="number" min="1"
                   class="w-24 text-xs border rounded px-2 py-1" />
          </div>
          <div class="flex items-center gap-2">
            <input v-model="form.reschedule" type="checkbox" id="reschedule-all"
                   class="rounded border-gray-300" />
            <label for="reschedule-all" class="text-xs text-gray-600">
              Reschedule all (including already-scheduled entries)
            </label>
          </div>
        </div>

        <div v-if="scheduleError" class="mt-3 text-xs text-red-600">{{ scheduleError }}</div>
        <div v-if="scheduleSuccess" class="mt-3 text-xs text-emerald-600">{{ scheduleSuccess }}</div>

        <div class="mt-4">
          <button
            @click="applySchedule"
            :disabled="scheduling"
            class="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
          >{{ scheduling ? 'Scheduling…' : 'Apply Schedule' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRequestHeaders } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({ title: 'Admin - Dissolve Queue', middleware: ['auth', 'admin'], layout: 'default' })

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const stats    = ref(null)
const upcoming = ref([])

const categories = [
  { key: 'POKEMON',    label: 'Pokémon' },
  { key: 'CRAZY_RARE', label: 'Crazy Rare' },
  { key: 'OTHER',      label: 'Other' },
]

function defaultStartLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const form = ref({
  startAtLocal:        defaultStartLocal(),
  cadenceDays:         7,
  pokemonPerCadence:   2,
  crazyRarePerCadence: 1,
  otherPerCadence:     10,
  reschedule:          false,
})

const scheduling    = ref(false)
const scheduleError = ref('')
const scheduleSuccess = ref('')
const cancellingId  = ref(null)

async function loadData() {
  try {
    const data = await $fetch('/api/admin/dissolve-queue', { headers })
    stats.value    = data
    upcoming.value = data.upcoming || []
  } catch (e) {
    console.error('Failed to load dissolve queue', e)
  }
}

onMounted(loadData)

async function applySchedule() {
  scheduling.value    = true
  scheduleError.value = ''
  scheduleSuccess.value = ''
  try {
    const f = form.value
    const res = await $fetch('/api/admin/dissolve-queue/schedule', {
      method: 'POST',
      body: {
        startAtUtc:          new Date(f.startAtLocal).toISOString(),
        cadenceDays:         f.cadenceDays,
        pokemonPerCadence:   f.pokemonPerCadence,
        crazyRarePerCadence: f.crazyRarePerCadence,
        otherPerCadence:     f.otherPerCadence,
        reschedule:          f.reschedule,
      }
    })
    scheduleSuccess.value = `Scheduled ${res.scheduled} entries.`
    await loadData()
  } catch (e) {
    scheduleError.value = e?.data?.statusMessage || 'Failed to apply schedule.'
  } finally {
    scheduling.value = false
  }
}

async function cancelEntry(id) {
  cancellingId.value = id
  try {
    await $fetch(`/api/admin/dissolve-queue/${id}`, { method: 'DELETE' })
    upcoming.value = upcoming.value.filter(e => e.id !== id)
    await loadData()
  } catch (e) {
    console.error('Failed to unschedule entry', e)
  } finally {
    cancellingId.value = null
  }
}

function fmtCST(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    timeZone: 'America/Chicago',
    hour12: true,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' CST'
}

function categoryChip(cat) {
  if (cat === 'POKEMON')    return 'bg-blue-100 text-blue-700'
  if (cat === 'CRAZY_RARE') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}
</script>
