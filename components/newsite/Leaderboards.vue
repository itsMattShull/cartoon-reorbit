<template>
  <div class="leaderboards">
    <div class="lb-nav">
      <GreenButton :active="activeTab === 'users'" @click="activeTab = 'users'">Users</GreenButton>
      <GreenButton :active="activeTab === 'games'" @click="activeTab = 'games'">Games</GreenButton>
      <NuxtLink to="/newsite/games" class="lb-nav-link">
        <GreenButton>Games Home</GreenButton>
      </NuxtLink>
    </div>

    <!-- Users Tab -->
    <div v-if="activeTab === 'users'" class="lb-content">
      <div class="lb-grid">
        <div class="lb-card">
          <div class="lb-card-header lb-card-header--points">Top Points</div>
          <div v-if="pointsPending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in pointsData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ row.points.toLocaleString() }}</span>
            </li>
            <li v-if="!pointsData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--earners">Top Earners (7d)</div>
          <div v-if="earnersPending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in earnersData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">+{{ Number(row.points).toLocaleString() }}</span>
            </li>
            <li v-if="!earnersData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--spenders">Top Spenders (7d)</div>
          <div v-if="spendersPending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in spendersData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ Number(row.points).toLocaleString() }}</span>
            </li>
            <li v-if="!spendersData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--acquirers">cToon Acquirers (7d)</div>
          <div v-if="acquirersPending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in acquirersData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ Number(row.count).toLocaleString() }}</span>
            </li>
            <li v-if="!acquirersData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--unique">Unique cToons</div>
          <div v-if="uniquePending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in uniqueData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ Number(row.count).toLocaleString() }}</span>
            </li>
            <li v-if="!uniqueData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--total">Total cToons</div>
          <div v-if="totalPending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in totalData" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ Number(row.count).toLocaleString() }}</span>
            </li>
            <li v-if="!totalData?.length" class="lb-empty">No data yet</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Games Tab -->
    <div v-else-if="activeTab === 'games'" class="lb-content">
      <div class="lb-games-header">
        <span class="lb-games-title">ReOrbit Match</span>
      </div>
      <div class="lb-grid">
        <div class="lb-card">
          <div class="lb-card-header lb-card-header--alltime">All Time</div>
          <div v-if="gamePending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in gameData?.allTime" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ row.score.toLocaleString() }}</span>
            </li>
            <li v-if="!gameData?.allTime?.length" class="lb-empty">No scores yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--monthly">This Month</div>
          <div v-if="gamePending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in gameData?.monthly" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ row.score.toLocaleString() }}</span>
            </li>
            <li v-if="!gameData?.monthly?.length" class="lb-empty">No scores yet</li>
          </ul>
        </div>

        <div class="lb-card">
          <div class="lb-card-header lb-card-header--weekly">This Week</div>
          <div v-if="gamePending" class="lb-loading">Loading…</div>
          <ul v-else class="lb-list">
            <li v-for="(row, i) in gameData?.weekly" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ i + 1 }}</span>
              <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
              <span class="lb-value">{{ row.score.toLocaleString() }}</span>
            </li>
            <li v-if="!gameData?.weekly?.length" class="lb-empty">No scores yet</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const activeTab = ref('users')

const { data: pointsData, pending: pointsPending } = useFetch('/api/points-leaderboard', { default: () => [] })
const { data: earnersData, pending: earnersPending } = useFetch('/api/leaderboard/trending-earners', { default: () => [] })
const { data: spendersData, pending: spendersPending } = useFetch('/api/leaderboard/trending-spenders', { default: () => [] })
const { data: acquirersData, pending: acquirersPending } = useFetch('/api/leaderboard/active-ctoon-acquirers', { default: () => [] })
const { data: uniqueData, pending: uniquePending } = useFetch('/api/leaderboard/unique-ctoons', { default: () => [] })
const { data: totalData, pending: totalPending } = useFetch('/api/leaderboard/total-ctoons', { default: () => [] })
const { data: gameData, pending: gamePending } = useFetch('/api/game/reorbitmatch/leaderboard', { default: () => null })
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

.lb-games-title {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  background: linear-gradient(135deg, #4fc3f7, #ab47bc);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

.lb-rank {
  width: 16px;
  flex-shrink: 0;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 700;
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
