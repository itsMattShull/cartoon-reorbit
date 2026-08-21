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
        <GreenButton v-if="cMoonEnabled" :active="activeTab === 'cmoons'" @click="activeTab = 'cmoons'">cMoons</GreenButton>
      </div>
    </div>

    <!-- cMoons Tab: weekly team-score standings, plus each cMoon's top individual point
         contributors (a different, complementary metric — see the script section) -->
    <div v-if="activeTab === 'cmoons'" class="lb-content">
      <div class="lb-card lb-cmoons-card">
        <div class="lb-card-header lb-card-header--cmoons">cMoon Team Leaderboard</div>
        <div v-if="cmoonsPending" class="lb-loading">Loading…</div>
        <ul v-else class="lb-list">
          <li v-for="row in cmoonsData" :key="row.id" class="lb-row">
            <span class="lb-rank">{{ row.rank }}</span>
            <span class="lb-cmoon-swatch" :style="{ background: safeCMoonColor(row.color) }"></span>
            <div class="lb-user-col">
              <NuxtLink :to="`/newsite/cmoon/${row.id}`" class="lb-username">{{ row.name }}</NuxtLink>
              <span class="lb-cmoon-members">{{ row.memberCount }} member{{ row.memberCount === 1 ? '' : 's' }}</span>
            </div>
            <span class="lb-value">{{ Number(row.teamScore).toLocaleString() }}</span>
          </li>
          <li v-if="!cmoonsData?.length" class="lb-empty">No cMoons yet</li>
        </ul>
      </div>

      <div v-if="cmoonsData?.length" class="cmoon-contributors">
        <div v-for="team in cmoonsData" :key="'contrib-' + team.id" class="lb-card cmoon-team-card">
          <div class="lb-card-header cmoon-team-header" :style="cMoonPillStyle(team.color)">
            <span class="cmoon-team-name">{{ team.name }} — Top Contributors</span>
          </div>
          <ul v-if="contributorsByCMoonId[team.id]?.length" class="lb-list">
            <li v-for="(row, ci) in contributorsByCMoonId[team.id]" :key="row.username" class="lb-row">
              <span class="lb-rank">{{ ci + 1 }}</span>
              <img class="lb-avatar" :src="`/avatars/${row.avatar || 'default.png'}`" alt="" />
              <div class="lb-user-col">
                <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
                <span v-if="row.rankName" class="cmoon-rank-badge">{{ row.rankName }}</span>
              </div>
              <span class="lb-value">{{ row.points.toLocaleString() }}</span>
            </li>
          </ul>
          <div v-else class="lb-empty">No contributions yet</div>
        </div>
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
              <div class="lb-user-col">
                <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
                <span v-if="cMoonForRow(row)" class="lb-cmoon" :style="cMoonPillStyle(cMoonForRow(row).color)">{{ cMoonForRow(row).name }}</span>
              </div>
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
              <div class="lb-user-col">
                <NuxtLink :to="`/newsite/czone/${row.username}`" class="lb-username">{{ row.username }}</NuxtLink>
                <span v-if="cMoonForRow(row)" class="lb-cmoon" :style="cMoonPillStyle(cMoonForRow(row).color)">{{ cMoonForRow(row).name }}</span>
              </div>
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
import { isSafeCMoonColor } from '~/utils/cmoonColor'

const activeTab = ref('users')
const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const cMoonEnabled = ref(false)
const { data: cmoonsData, pending: cmoonsPending } = useFetch('/api/leaderboard/cmoons', { default: () => [], headers })
onMounted(async () => {
  try {
    const data = await $fetch('/api/cmoons')
    cMoonEnabled.value = !!data?.cMoonEnabled
  } catch {
    cMoonEnabled.value = false
  }
})
function safeCMoonColor(color) {
  return isSafeCMoonColor(color) ? color : '#3a4a63'
}

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
  { key: 'tower',        label: 'Tower Stack',   endpoint: '/api/game/tower/leaderboard' },
  { key: 'reorbitmemory', label: 'ReOrbit Memory', endpoint: '/api/game/reorbitmemory/leaderboard', lowerIsBetter: true },
  { key: 'guessctoon',   label: 'Guess cToon',    endpoint: '/api/game/guessctoon/leaderboard' },
  { key: 'asteroid',     label: 'Op. A.S.T.E.R.O.I.D.', endpoint: '/api/game/asteroid/leaderboard' },
  { key: 'flappy',       label: 'Flappy Powerpuff', endpoint: '/api/game/flappypowerpuff/leaderboard' },
  { key: 'fruitsamurai', label: 'Fruit Samurai', endpoint: '/api/game/fruitsamurai/leaderboard' },
  { key: 'edrps',        label: 'Ed, Edd n Eddy RPS', endpoint: '/api/game/edrps/leaderboard', unit: 'win' },
  { key: 'pokemonbattle', label: 'Pokemon: Fire, Water, Grass!', endpoint: '/api/game/pokemonbattle/leaderboard', unit: 'win' }
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

// Not every board's "score" column is a points-style total. ReOrbit Memory's holds moves taken
// (lower is better) and Ed, Edd n Eddy RPS's holds match wins, so both get a unit rather than
// a bare number.
const gameValueLabel = computed(() => {
  const opt = gameOptions.find(g => g.key === selectedGame.value)
  const unit = opt?.lowerIsBetter ? 'move' : opt?.unit
  if (!unit) return row => Number(row.score).toLocaleString()
  return row => `${Number(row.score).toLocaleString()} ${unit}${row.score === 1 ? '' : 's'}`
})

const gamesBoards = computed(() => [
  {
    key: 'alltime', title: 'All Time', headerClass: 'lb-card-header--alltime',
    rows: gameData.value?.allTime, pending: gamePending.value,
    formatValue: gameValueLabel.value
  },
  {
    key: 'monthly', title: 'This Month', headerClass: 'lb-card-header--monthly',
    rows: gameData.value?.monthly, pending: gamePending.value,
    formatValue: gameValueLabel.value
  },
  {
    key: 'weekly', title: 'This Week', headerClass: 'lb-card-header--weekly',
    rows: gameData.value?.weekly, pending: gamePending.value,
    formatValue: gameValueLabel.value
  },
])

// cMoon badges: one batched lookup per visible row set instead of joining
// cMoon into every one of the ~10 separate leaderboard endpoints above.
const cMoonBadges = ref({})
const fetchedUsernames = new Set()

async function loadCMoonBadges(usernames) {
  const toFetch = usernames.filter(u => u && !fetchedUsernames.has(u))
  if (!toFetch.length) return
  toFetch.forEach(u => fetchedUsernames.add(u))
  try {
    const map = await $fetch('/api/leaderboard/cmoon-badges', { method: 'POST', body: { usernames: toFetch } })
    cMoonBadges.value = { ...cMoonBadges.value, ...map }
  } catch {}
}

watch([usersBoards, gamesBoards], ([users, games]) => {
  const names = [...users, ...games].flatMap(b => (b.rows || []).map(r => r.username))
  if (names.length) loadCMoonBadges(names)
}, { immediate: true })

function cMoonForRow(row) {
  return cMoonBadges.value[row.username] || null
}

// Top individual point contributors per cMoon — a different, complementary metric from the
// team-score standings above (row.teamScore, from weekly bonus categories): this is each
// member's own lifetime point contribution (User.cMoonPoints, feeds the cMoon rank/achievement
// system). Fetched eagerly like the boards above — cheap, reads a denormalized column.
const { data: cMoonContributorsData } = useFetch('/api/leaderboard/cmoon-standings', { default: () => ({ cMoonEnabled: false, contributorsByCMoonId: {} }), headers })
const contributorsByCMoonId = computed(() => cMoonContributorsData.value?.contributorsByCMoonId || {})
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
.lb-card-header--cmoons   { background: linear-gradient(90deg, #3a1a5a 0%, transparent 100%); border-bottom: 1px solid rgba(180,74,226,0.3); }

.lb-cmoons-card { max-width: 420px; margin: 0 auto; }

.lb-cmoon-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.lb-cmoon-members {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
}

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

.lb-user-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.15;
}

.lb-username {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #7ec8f0;
  text-decoration: none;
  font-weight: 600;
}
.lb-username:hover { color: #b3e0ff; text-decoration: underline; }

.lb-cmoon {
  align-self: flex-start;
  margin-top: 1px;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

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

.cmoon-contributors {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
}

.cmoon-team-card {
  /* Inline style sets background+color for the team's own color; everything else here
     matches .lb-card-header's existing look. */
}

.cmoon-team-header {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: none !important;
}

.cmoon-team-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmoon-rank-badge {
  align-self: flex-start;
  font-size: 0.62rem;
  color: #ffd75e;
  font-weight: 600;
}
</style>
