<template>
  <div class="min-h-screen bg-gray-50">
    <Nav />
    <section class="pt-20 max-w-5xl mx-auto px-4 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 class="text-2xl font-bold">gToons Clash Leaderboards</h1>

        <div class="ml-auto flex items-center gap-2">
          <select v-model="mode" class="border rounded px-2 py-1">
            <option value="all">All</option>
            <option value="pve">PvE</option>
            <option value="pvp">PvP</option>
          </select>

          <select v-model="timeframe" class="border rounded px-2 py-1">
            <option value="1w">1 Week</option>
            <option value="1m">1 Month</option>
            <option value="3m">3 Months</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LeaderboardCard title="Total Games Won" :rows="wins" :loading="loading" />
        <LeaderboardCard title="Win Percentage" :rows="winPct" value-type="percent" :loading="loading" />
        <LeaderboardCard title="Total Games Lost" :rows="losses" :loading="loading" />
        <LeaderboardCard title="Loss Percentage" :rows="lossPct" value-type="percent" :loading="loading" />
        <LeaderboardCard class="md:col-span-2" title="Total Games Played" :rows="played" :loading="loading" />
      </div>
    </section>
  </div>
</template>

<script setup>
import Nav from '@/components/Nav.vue'
import LeaderboardCard from '@/components/LeaderboardCard.vue'
import { ref, onMounted, watch } from 'vue'

const timeframe = ref('1m') // '1w','1m','3m','6m','1y','all'
const mode = ref('all')     // 'all' | 'pve' | 'pvp'
const loading = ref(true)
const wins = ref([]), winPct = ref([])
const losses = ref([]), lossPct = ref([]), played = ref([])

async function loadData() {
  loading.value = true
  try {
    const res = await fetch(
      `/api/game/clash/leaderboard?timeframe=${timeframe.value}&mode=${mode.value}`,
      { credentials: 'include' }
    )
    const data = await res.json()
    wins.value    = data.wins || []
    winPct.value  = data.winPct || []
    losses.value  = data.losses || []
    lossPct.value = data.lossPct || []
    played.value  = data.played || []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch([timeframe, mode], loadData)
</script>
