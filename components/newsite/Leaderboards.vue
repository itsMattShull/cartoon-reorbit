<template>
  <div class="leaderboards">
    <div class="lb-tabbar">
      <button
        class="lb-tab"
        :class="{ active: section === 'general' }"
        @click="section = 'general'"
      >General</button>
      <button
        class="lb-tab"
        :class="{ active: section === 'clash' }"
        @click="section = 'clash'"
      >gToons Clash</button>
    </div>

    <div v-show="section === 'general'" class="lb-body">
      <div class="lb-grid">
        <div v-for="card in generalCards" :key="card.title" class="lb-card">
          <div class="lb-card-head">
            <span class="lb-card-title">{{ card.title }}</span>
            <span v-if="card.subtitle" class="lb-card-subtitle">{{ card.subtitle }}</span>
          </div>
          <div v-if="generalLoading" class="lb-skeleton">
            <div v-for="i in 5" :key="i" class="lb-skel-row">
              <div class="lb-skel-name"></div>
              <div class="lb-skel-val"></div>
            </div>
          </div>
          <ul v-else class="lb-rows">
            <li v-for="(row, i) in card.rows" :key="row.username + i" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${encodeURIComponent(row.username)}`" class="lb-uname">{{ row.username }}</NuxtLink>
              <span class="lb-val">{{ Number(row.value).toLocaleString() }}</span>
            </li>
            <li v-if="!card.rows?.length" class="lb-empty">No data available.</li>
          </ul>
        </div>
      </div>
    </div>

    <div v-show="section === 'clash'" class="lb-body">
      <div class="lb-filters">
        <select v-model="clashMode" class="lb-select">
          <option value="all">All Modes</option>
          <option value="pve">PvE</option>
          <option value="pvp">PvP</option>
        </select>
        <select v-model="clashTimeframe" class="lb-select">
          <option value="1w">1 Week</option>
          <option value="1m">1 Month</option>
          <option value="3m">3 Months</option>
          <option value="6m">6 Months</option>
          <option value="1y">1 Year</option>
          <option value="all">All Time</option>
        </select>
      </div>
      <div class="lb-grid">
        <div v-for="card in clashCards" :key="card.title" class="lb-card">
          <div class="lb-card-head">
            <span class="lb-card-title">{{ card.title }}</span>
          </div>
          <div v-if="clashLoading" class="lb-skeleton">
            <div v-for="i in 5" :key="i" class="lb-skel-row">
              <div class="lb-skel-name"></div>
              <div class="lb-skel-val"></div>
            </div>
          </div>
          <ul v-else class="lb-rows">
            <li v-for="(row, i) in card.rows" :key="row.username + i" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${encodeURIComponent(row.username)}`" class="lb-uname">{{ row.username }}</NuxtLink>
              <span class="lb-val">
                <template v-if="card.valueType === 'percent'">
                  {{ Number(row.value || 0).toFixed(1) }}%
                  <span v-if="row.den > 0" class="lb-frac">({{ row.num }}/{{ row.den }})</span>
                </template>
                <template v-else>
                  {{ Number(row.value || 0).toLocaleString() }}<span v-if="card.suffix" class="lb-suffix"> {{ card.suffix }}</span>
                </template>
              </span>
            </li>
            <li v-if="!card.rows?.length" class="lb-empty">No data for this period.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const section = ref('general')

const generalLoading = ref(true)
const pointsLb   = ref([])
const activeLb   = ref([])
const earnerLb   = ref([])
const spenderLb  = ref([])
const uniqueLb   = ref([])
const totalLb    = ref([])

const generalCards = computed(() => [
  {
    title: 'Points',
    rows: pointsLb.value.map(r => ({ username: r.username, value: r.points }))
  },
  {
    title: 'Active cToon Acquirers',
    subtitle: 'Last 7 Days',
    rows: activeLb.value.map(r => ({ username: r.username, value: r.count }))
  },
  {
    title: 'Trending Earners',
    subtitle: 'Last 7 Days',
    rows: earnerLb.value.map(r => ({ username: r.username, value: r.points }))
  },
  {
    title: 'Trending Spenders',
    subtitle: 'Last 7 Days',
    rows: spenderLb.value.map(r => ({ username: r.username, value: r.points }))
  },
  {
    title: 'Unique cToon Count',
    rows: uniqueLb.value.map(r => ({ username: r.username, value: r.count }))
  },
  {
    title: 'Total cToon Count',
    rows: totalLb.value.map(r => ({ username: r.username, value: r.count }))
  },
])

async function fetchGeneral() {
  generalLoading.value = true
  try {
    const [pts, active, earners, spenders, unique, total] = await Promise.all([
      fetch('/api/points-leaderboard', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/leaderboard/active-ctoon-acquirers', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/leaderboard/trending-earners', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/leaderboard/trending-spenders', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/leaderboard/unique-ctoons', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/leaderboard/total-ctoons', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ])
    pointsLb.value  = pts     || []
    activeLb.value  = active  || []
    earnerLb.value  = earners || []
    spenderLb.value = spenders || []
    uniqueLb.value  = unique  || []
    totalLb.value   = total   || []
  } finally {
    generalLoading.value = false
  }
}

const clashLoading   = ref(true)
const clashMode      = ref('all')
const clashTimeframe = ref('1m')
const clashWins      = ref([])
const clashWinPct    = ref([])
const clashPlayed    = ref([])
const clashEarned    = ref([])

const clashCards = computed(() => [
  { title: 'Total Games Won',             rows: clashWins.value },
  { title: 'Win Percentage',              rows: clashWinPct.value, valueType: 'percent' },
  { title: 'Stake Points Earned (Top 10)', rows: clashEarned.value, suffix: 'pts' },
  { title: 'Total Games Played',          rows: clashPlayed.value },
])

async function fetchClash() {
  clashLoading.value = true
  try {
    const res = await fetch(
      `/api/game/clash/leaderboard?timeframe=${clashTimeframe.value}&mode=${clashMode.value}`,
      { credentials: 'include' }
    )
    const data = await res.json()
    clashWins.value   = data.wins   || []
    clashWinPct.value = data.winPct || []
    clashPlayed.value = data.played || []
    clashEarned.value = data.earned || []
  } finally {
    clashLoading.value = false
  }
}

onMounted(() => {
  fetchGeneral()
  fetchClash()
})

watch([clashMode, clashTimeframe], fetchClash)
</script>

<style scoped>
.leaderboards {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
  font-family: inherit;
}

.lb-tabbar {
  display: flex;
  gap: 2px;
  padding: 6px 6px 0;
  background: var(--OrbitDarkBlue);
  border-bottom: 2px solid var(--OrbitLightBlue);
  flex-shrink: 0;
}

.lb-tab {
  padding: 5px 16px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.72rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}

.lb-tab.active {
  background: var(--OrbitLightBlue);
  color: #fff;
}

.lb-tab:not(.active):hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.lb-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  box-sizing: border-box;
}

.lb-filters {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.lb-select {
  border: 1px solid rgba(51, 153, 204, 0.5);
  border-radius: 5px;
  padding: 4px 10px;
  font-size: 0.75rem;
  background: rgba(0, 30, 80, 0.9);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  outline: none;
}

.lb-select:focus {
  border-color: var(--OrbitLightBlue);
}

.lb-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.lb-card {
  background: rgba(0, 20, 70, 0.55);
  border: 1px solid rgba(51, 153, 204, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

.lb-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 10px;
  background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.lb-card-title {
  font-size: 0.75rem;
  font-weight: bold;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lb-card-subtitle {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}

.lb-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  transition: background 0.1s;
}

.lb-row:last-child {
  border-bottom: none;
}

.lb-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.lb-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  min-width: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 0.62rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.65);
}

.lb-uname {
  flex: 1;
  font-size: 0.75rem;
  color: var(--OrbitGreen);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  min-width: 0;
}

.lb-uname:hover {
  text-decoration: underline;
}

.lb-val {
  font-size: 0.72rem;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.lb-suffix,
.lb-frac {
  font-weight: normal;
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.65rem;
}

.lb-empty {
  padding: 18px 10px;
  text-align: center;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
}

.lb-skeleton {
  padding: 6px 10px;
}

.lb-skel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  gap: 8px;
}

.lb-skel-name {
  height: 11px;
  width: 60%;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  animation: lb-pulse 1.4s ease-in-out infinite;
}

.lb-skel-val {
  height: 11px;
  width: 18%;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  animation: lb-pulse 1.4s ease-in-out infinite;
}

@keyframes lb-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@media (max-width: 600px) {
  .lb-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .lb-tabbar {
    padding: 5px 5px 0;
  }

  .lb-tab {
    font-size: 0.68rem;
    padding: 4px 12px;
  }

  .lb-body {
    padding: 8px;
  }

  .lb-card-title {
    font-size: 0.7rem;
  }

  .lb-uname,
  .lb-val {
    font-size: 0.7rem;
  }
}
</style>
