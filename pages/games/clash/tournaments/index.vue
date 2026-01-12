<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <div clas="mt-16">&nbsp;</div>
    <section class="mt-20 max-w-5xl mx-auto px-4 pb-10">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <h1 class="text-2xl font-bold">gToons Clash Tournaments</h1>
        <div class="text-sm text-gray-500 sm:ml-auto">Opt in and battle for the crown.</div>
      </div>

      <div v-if="loading" class="text-gray-500">Loading tournaments...</div>
      <div v-else-if="!tournaments.length" class="text-gray-500">No tournaments yet.</div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="t in tournaments"
          :key="t.id"
          class="bg-white border rounded-lg p-4 shadow-sm flex flex-col gap-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-lg font-semibold">{{ t.name }}</div>
            </div>
            <span class="text-xs px-2 py-1 rounded-full" :class="statusClass(t.status)">
              {{ statusLabel(t.status) }}
            </span>
          </div>

          <div class="text-sm text-gray-600">
            <div>Opt-in: {{ formatDate(t.optInStartAt) }} → {{ formatDate(t.optInEndAt) }}</div>
            <div class="mt-1">Opt-ins: <span class="font-semibold">{{ t.optInCount }}</span></div>
            <div v-if="t.format" class="mt-1">Format: {{ formatLabel(t.format) }}</div>
            <div v-if="t.status === 'COMPLETE' && t.winnerUsername" class="mt-1">
              Winner:
              <NuxtLink
                :to="`/czone/${t.winnerUsername}`"
                class="text-indigo-600 hover:text-indigo-700 underline"
              >
                {{ t.winnerUsername }}
              </NuxtLink>
            </div>
            <div v-if="countdownText(t)" class="mt-1 text-xs text-indigo-600">
              {{ countdownText(t) }}
            </div>
          </div>

          <NuxtLink
            :to="`/games/clash/tournaments/${t.id}`"
            class="mt-auto inline-flex items-center justify-center px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            View tournament
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({
  title: 'gToons Clash Tournaments',
  layout: 'default'
})

const tournaments = ref([])
const loading = ref(true)
const nowTs = ref(Date.now())
let timer = null

function formatDate(value) {
  if (!value) return 'TBD'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'TBD' : date.toLocaleString()
}

function statusLabel(status) {
  switch (status) {
    case 'OPT_IN_OPEN': return 'Opt-In Open'
    case 'OPT_IN_CLOSED': return 'Opt-In Closed'
    case 'SWISS_ACTIVE': return 'Swiss Active'
    case 'BRACKET_ACTIVE': return 'Bracket Active'
    case 'COMPLETE': return 'Complete'
    case 'CANCELLED': return 'Cancelled'
    default: return 'Draft'
  }
}

function statusClass(status) {
  switch (status) {
    case 'OPT_IN_OPEN': return 'bg-green-100 text-green-700'
    case 'SWISS_ACTIVE':
    case 'BRACKET_ACTIVE': return 'bg-blue-100 text-blue-700'
    case 'COMPLETE': return 'bg-green-100 text-green-700'
    case 'CANCELLED': return 'bg-red-100 text-red-700'
    default: return 'bg-yellow-100 text-yellow-700'
  }
}

function formatLabel(format) {
  return format === 'SWISS_THEN_TOP8' ? 'Swiss → Top 8' : 'Single Elimination'
}

function countdownText(t) {
  const now = nowTs.value
  if (t.status === 'DRAFT') {
    const start = new Date(t.optInStartAt).getTime()
    if (!Number.isFinite(start)) return ''
    const diff = start - now
    return diff > 0 ? `Opt-in opens in ${formatDuration(diff)}` : ''
  }
  if (t.status === 'OPT_IN_OPEN') {
    const end = new Date(t.optInEndAt).getTime()
    if (!Number.isFinite(end)) return ''
    const diff = end - now
    return diff > 0 ? `Opt-in closes in ${formatDuration(diff)}` : ''
  }
  return ''
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const parts = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return parts.join(' ')
}

async function load() {
  loading.value = true
  try {
    const data = await $fetch('/api/tournaments')
    tournaments.value = Array.isArray(data)
      ? data.filter(t => t.status !== 'CANCELLED')
      : []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(() => {
    nowTs.value = Date.now()
  }, 60000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>
