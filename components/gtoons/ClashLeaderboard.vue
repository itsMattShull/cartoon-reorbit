<template>
  <div class="tab-content overflow-y-auto h-full px-4 py-3">
    <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
      <h2 class="text-xl font-bold">gToons Clash Leaderboards</h2>

      <div class="sm:ml-auto flex items-center gap-2">
        <select v-model="mode" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
          <option value="all">All</option>
          <option value="pve">PvE</option>
          <option value="pvp">PvP</option>
        </select>

        <select v-model="timeframe" class="border rounded px-2 py-1 text-sm text-gray-800 bg-white">
          <option value="1w">1 Week</option>
          <option value="1m">1 Month</option>
          <option value="3m">3 Months</option>
          <option value="6m">6 Months</option>
          <option value="1y">1 Year</option>
          <option value="all">All Time</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LeaderboardCard title="Total Games Won" :rows="wins" :loading="loading" />
      <LeaderboardCard title="Win Percentage" :rows="winPct" value-type="percent" :loading="loading" />
      <LeaderboardCard title="Stake Points Earned (Top 10)" :rows="earned" suffix="pts" :loading="loading" />
      <LeaderboardCard title="Total Games Played" :rows="played" :loading="loading" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import LeaderboardCard from '@/components/LeaderboardCard.vue'

const timeframe = ref('1m')
const mode = ref('all')
const loading = ref(true)

const wins = ref([])
const winPct = ref([])
const played = ref([])
const earned = ref([])

async function loadData() {
  loading.value = true
  try {
    const res = await fetch(
      `/api/game/clash/leaderboard?timeframe=${timeframe.value}&mode=${mode.value}`,
      { credentials: 'include' }
    )
    const data = await res.json()
    wins.value = data.wins || []
    winPct.value = data.winPct || []
    played.value = data.played || []
    earned.value = data.earned || []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch([timeframe, mode], loadData)
</script>
