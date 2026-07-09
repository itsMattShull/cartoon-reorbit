<template>
  <div class="leaderboards">
    <div class="lb-nav">
      <NuxtLink to="/newsite/games" class="lb-nav-link">
        <GreenButton>Games Home</GreenButton>
      </NuxtLink>
      <GreenButton :active="true">Leaderboards</GreenButton>
      <div class="lb-nav-right">
        <GreenButton :active="activeTab === 'users'" @click="activeTab = 'users'">Users</GreenButton>
        <GreenButton :active="activeTab === 'games'" @click="activeTab = 'games'">Games</GreenButton>
      </div>
    </div>

    <!-- Users Tab -->
    <div v-if="activeTab === 'users'" class="lb-content">
      <div class="lb-grid">
        <div v-for="board in usersBoards" :key="board.key" class="lb-card">
          <div class="lb-card-header" :class="board.headerClass">{{ board.title }}</div>
          <div v-if="board.pending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li
              v-for="row in board.rows"
              :key="row.username"
              class="lb-row"
              :class="{ 'lb-row--self': row.isSelf }"
            >
              <span class="lb-rank">{{ row.rank }}</span>
              <img class="lb-avatar" :src="`/avatars/${row.avatar || 'default.png'}`" alt="" />
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ board.formatValue(row) }}</span>
            </li>
            <li v-if="!board.rows?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Games Tab -->
    <div v-else-if="activeTab === 'games'" class="lb-content">
      <div class="lb-games-header">
        <div class="lb-game-switcher">
          <button
            v-for="g in gameOptions"
            :key="g.key"
            type="button"
            class="lb-game-pill"
            :class="{ 'lb-game-pill--active': selectedGame === g.key }"
            @click="selectedGame = g.key"
          >{{ g.label }}</button>
        </div>
      </div>
      <div class="lb-grid">
        <div v-for="board in gamesBoards" :key="board.key" class="lb-card">
          <div class="lb-card-header" :class="board.headerClass">{{ board.title }}</div>
          <div v-if="board.pending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li
              v-for="row in board.rows"
              :key="row.username"
              class="lb-row"
              :class="{ 'lb-row--self': row.isSelf }"
            >
              <span class="lb-rank">{{ row.rank }}</span>
              <img class="lb-avatar" :src="`/avatars/${row.avatar || 'default.png'}`" alt="" />
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ board.formatValue(row) }}</span>
            </li>
            <li v-if="!board.rows?.length" class="lb-empty">No scores yet</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRequestHeaders } from '#app'

const activeTab = ref('users')
const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const { data: pointsData, pending: pointsPending } = useFetch('/api/points-leaderboard', { default: () => [], headers })
const { data: earnersData, pending: earnersPending } = useFetch('/api/leaderboard/trending-earners', { default: () => [], headers })
const { data: spendersData, pending: spendersPending } = useFetch('/api/leaderboard/trending-spenders', { default: () => [], headers })
const { data: acquirersData, pending: acquirersPending } = useFetch('/api/leaderboard/active-ctoon-acquirers', { default: () => [], headers })
const { data: uniqueData, pending: uniquePending } = useFetch('/api/leaderboard/unique-ctoons', { default: () => [], headers })
const { data: totalData, pending: totalPending } = useFetch('/api/leaderboard/total-ctoons', { default: () => [], headers })

// Games tab: multiple games now share this leaderboard view. Only the selected game's
// leaderboard is fetched, and only once the Games tab is actually opened, so visiting the
// Users tab (the default) never pulls either game's leaderboard data.
const gameOptions = [
  { key: 'reorbitmatch', label: 'ReOrbit Match', endpoint: '/api/game/reorbitmatch/leaderboard' },
  { key: 'tower',        label: 'Tower Stack',   endpoint: '/api/game/tower/leaderboard' }
]
const selectedGame = ref('reorbitmatch')
const gameDataCache = ref({})
const gamePendingKey = ref(null)

async function loadGameLeaderboard(key) {
  if (Object.prototype.hasOwnProperty.call(gameDataCache.value, key)) return
  gamePendingKey.value = key
  try {
    const opt = gameOptions.find(g => g.key === key)
    gameDataCache.value[key] = await $fetch(opt.endpoint, { headers })
  } catch {
    gameDataCache.value[key] = null
  } finally {
    if (gamePendingKey.value === key) gamePendingKey.value = null
  }
}

watch([activeTab, selectedGame], ([tab, game]) => {
  if (tab === 'games') loadGameLeaderboard(game)
}, { immediate: true })

const gameData    = computed(() => gameDataCache.value[selectedGame.value] || null)
const gamePending = computed(() => gamePendingKey.value === selectedGame.value)

const usersBoards = computed(() => [
  {
    key: 'points', title: 'Top Points', headerClass: 'lb-card-header--points',
    rows: pointsData.value, pending: pointsPending.value,
    formatValue: row => Number(row.points).toLocaleString()
  },
  {
    key: 'earners', title: 'Top Earners (7d)', headerClass: 'lb-card-header--earners',
    rows: earnersData.value, pending: earnersPending.value,
    formatValue: row => `+${Number(row.points).toLocaleString()}`
  },
  {
    key: 'spenders', title: 'Top Spenders (7d)', headerClass: 'lb-card-header--spenders',
    rows: spendersData.value, pending: spendersPending.value,
    formatValue: row => Number(row.points).toLocaleString()
  },
  {
    key: 'acquirers', title: 'cToon Acquirers (7d)', headerClass: 'lb-card-header--acquirers',
    rows: acquirersData.value, pending: acquirersPending.value,
    formatValue: row => Number(row.count).toLocaleString()
  },
  {
    key: 'unique', title: 'Unique cToons', headerClass: 'lb-card-header--unique',
    rows: uniqueData.value, pending: uniquePending.value,
    formatValue: row => Number(row.count).toLocaleString()
  },
  {
    key: 'total', title: 'Total cToons', headerClass: 'lb-card-header--total',
    rows: totalData.value, pending: totalPending.value,
    formatValue: row => Number(row.count).toLocaleString()
  },
])

const gamesBoards = computed(() => [
  {
    key: 'alltime', title: 'All Time', headerClass: 'lb-card-header--alltime',
    rows: gameData.value?.allTime, pending: gamePending.value,
    formatValue: row => Number(row.score).toLocaleString()
  },
  {
    key: 'monthly', title: 'This Month', headerClass: 'lb-card-header--monthly',
    rows: gameData.value?.monthly, pending: gamePending.value,
    formatValue: row => Number(row.score).toLocaleString()
  },
  {
    key: 'weekly', title: 'This Week', headerClass: 'lb-card-header--weekly',
    rows: gameData.value?.weekly, pending: gamePending.value,
    formatValue: row => Number(row.score).toLocaleString()
  },
])
</script>

<style scoped>
.leaderboards {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #001230;
  color: #fff;
}

.lb-nav {
  display: flex;
  flex-direction: row;
  gap: 6px;
  padding: 6px 6px 0;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.lb-nav::-webkit-scrollbar { display: none; }

.lb-nav-link {
  text-decoration: none;
}

.lb-nav-right {
  display: flex;
  flex-direction: row;
  gap: 6px;
  margin-left: auto;
}

.lb-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 8px;
}

.lb-games-header {
  text-align: center;
  margin-bottom: 10px;
}

.lb-game-switcher {
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.lb-game-pill {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.lb-game-pill:hover { color: rgba(255, 255, 255, 0.85); }

.lb-game-pill--active {
  color: #fff;
  background: linear-gradient(135deg, #4fc3f7, #ab47bc);
  border-color: transparent;
}

.lb-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.lb-card {
  background: rgba(10, 25, 55, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.lb-card-header {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 7px 10px;
  color: #fff;
}

.lb-card-header--points   { background: linear-gradient(90deg, #1a4a8a 0%, transparent 100%); border-bottom: 1px solid rgba(74,144,226,0.3); }
.lb-card-header--earners  { background: linear-gradient(90deg, #1a5a2a 0%, transparent 100%); border-bottom: 1px solid rgba(74,200,100,0.3); }
.lb-card-header--spenders { background: linear-gradient(90deg, #5a1a2a 0%, transparent 100%); border-bottom: 1px solid rgba(226,74,100,0.3); }
.lb-card-header--acquirers{ background: linear-gradient(90deg, #4a2a1a 0%, transparent 100%); border-bottom: 1px solid rgba(226,144,74,0.3); }
.lb-card-header--unique   { background: linear-gradient(90deg, #2a1a5a 0%, transparent 100%); border-bottom: 1px solid rgba(144,74,226,0.3); }
.lb-card-header--total    { background: linear-gradient(90deg, #1a3a5a 0%, transparent 100%); border-bottom: 1px solid rgba(74,180,226,0.3); }
.lb-card-header--alltime  { background: linear-gradient(90deg, #5a4a00 0%, transparent 100%); border-bottom: 1px solid rgba(226,200,0,0.3); }
.lb-card-header--monthly  { background: linear-gradient(90deg, #1a4a5a 0%, transparent 100%); border-bottom: 1px solid rgba(74,200,226,0.3); }
.lb-card-header--weekly   { background: linear-gradient(90deg, #1a3a4a 0%, transparent 100%); border-bottom: 1px solid rgba(74,150,200,0.3); }

.lb-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.75rem;
}
.lb-row:last-child { border-bottom: none; }

.lb-row--self {
  background: rgba(126, 200, 240, 0.16);
  border-left: 2px solid #7ec8f0;
  border-bottom: 1px solid rgba(126, 200, 240, 0.2);
}

.lb-rank {
  width: 16px;
  flex-shrink: 0;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
}

.lb-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.lb-username {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7ec8f0;
  text-decoration: none;
  font-weight: 600;
}
.lb-username:hover { color: #b3e0ff; text-decoration: underline; }

.lb-value {
  flex-shrink: 0;
  font-weight: 700;
  color: #fff;
  font-size: 0.75rem;
}

.lb-empty {
  padding: 12px 10px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

.lb-loading {
  padding: 12px 10px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
}

@media (max-width: 480px) {
  .lb-grid {
    grid-template-columns: 1fr;
  }
}
</style>
