<template>
  <div class="enroster">
    <h1 class="enroster-title">Enemy Roster</h1>
    <p class="enroster-subtitle">
      Every faction cMoon Enemy Battles has to offer — locked members stay hidden until you've
      beaten enough of them to unlock the next tier.
    </p>

    <p v-if="loadError" class="enroster-error">{{ loadError }}</p>

    <template v-else-if="!loading">
      <!-- Personal summary — every number here is already returned by the same request that
           loads the roster below, nothing extra fetched for this. -->
      <div class="enroster-stats-strip">
        <div class="enroster-stat"><span class="enroster-stat-value">{{ personalWinCount }}</span><span class="enroster-stat-label">Wins</span></div>
        <div class="enroster-stat"><span class="enroster-stat-value">{{ personalLossCount }}</span><span class="enroster-stat-label">Losses</span></div>
        <div v-if="favoriteEnemy" class="enroster-stat">
          <span class="enroster-stat-value">{{ favoriteEnemy.wins }}x</span>
          <span class="enroster-stat-label">vs. {{ favoriteEnemy.name }}</span>
        </div>
      </div>

      <!-- Recently-defeated community bosses, server-wide — a small "hype feed" off the same
           permanent battle log the admin page reads, not anything tracked live. -->
      <div v-if="recentCommunityKills.length" class="enroster-ticker">
        <span class="enroster-ticker-label">Recently defeated:</span>
        <span v-for="(k, i) in recentCommunityKills" :key="i" class="enroster-ticker-item">
          <strong>{{ k.enemyName }}</strong> by {{ k.username }}<span v-if="i < recentCommunityKills.length - 1">, </span>
        </span>
      </div>

      <div v-for="f in factions" :key="f.id" class="enroster-faction">
        <div class="enroster-faction-header">
          <img v-if="f.bannerImagePath" :src="f.bannerImagePath" alt="" class="enroster-faction-banner" />
          <div>
            <h2 class="enroster-faction-name">{{ f.name }}</h2>
            <p v-if="f.description" class="enroster-faction-desc">{{ f.description }}</p>
          </div>
        </div>

        <div class="enroster-grid">
          <div v-for="m in f.members" :key="m.id" class="enroster-card" :class="{ 'enroster-card-locked': m.locked }">
            <template v-if="m.locked">
              <div class="enroster-portrait enroster-portrait-locked">
                <span class="enroster-lock-icon" aria-hidden="true">🔒</span>
              </div>
              <span class="enroster-name enroster-name-locked">???</span>
              <span v-if="m.rank" class="enroster-rank-badge" :class="'enroster-rank-' + m.rank">{{ RANK_LABELS[m.rank] }}</span>
              <p class="enroster-unlock-req">{{ m.unlockRequirement }}</p>
            </template>
            <template v-else>
              <div class="enroster-portrait">
                <img v-if="m.imagePath" :src="m.imagePath" alt="" />
                <span v-else class="enroster-no-art">No art</span>
                <span v-if="m.defeated" class="enroster-defeated-badge" title="Defeated">✔</span>
                <span v-if="m.isRaidBoss" class="enroster-raid-badge" title="Raid boss">⚔</span>
              </div>
              <span class="enroster-name">{{ m.name }}</span>
              <span v-if="m.rank" class="enroster-rank-badge" :class="'enroster-rank-' + m.rank">{{ RANK_LABELS[m.rank] }}</span>
              <p class="enroster-stats">{{ m.maxHp }} HP · +{{ m.cMoonPointsReward }} pts</p>
              <p v-if="m.timesDefeated > 0" class="enroster-tally">Defeated {{ m.timesDefeated }}x</p>
            </template>
          </div>
        </div>
      </div>

      <p v-if="!factions.length" class="enroster-empty">No enemies have been set up yet — check back soon.</p>
    </template>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  title: 'Enemy Roster',
  description: 'Browse every faction and enemy in cMoon Enemy Battles.',
  mainContentScrollY: true,
})

// Mirrors components/CMoonBattlePopupHost.vue's own RANK_LABELS — same client-duplication
// reasoning that component's own copy already follows (no shared import path between pages and
// that component).
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }

const factions = ref([])
const loading = ref(true)
const loadError = ref('')
const personalWinCount = ref(0)
const personalLossCount = ref(0)
const favoriteEnemy = ref(null)
const recentCommunityKills = ref([])

const { data, error } = await useFetch('/api/cmoon/enemies')
if (error.value) {
  loadError.value = 'Could not load the enemy roster right now.'
} else {
  factions.value = data.value?.factions || []
  personalWinCount.value = data.value?.personalWinCount || 0
  personalLossCount.value = data.value?.personalLossCount || 0
  favoriteEnemy.value = data.value?.favoriteEnemy || null
  recentCommunityKills.value = data.value?.recentCommunityKills || []
}
loading.value = false
</script>

<style scoped>
.enroster {
  width: 100%;
  max-width: var(--main-content-width, 900px);
  min-width: 0;
  margin: 0 auto;
  padding: 16px;
  box-sizing: border-box;
  color: #fff;
}

.enroster-title { font-size: 1.6rem; font-weight: 800; margin: 0 0 4px; }
.enroster-subtitle { font-size: 0.9rem; color: rgba(255, 255, 255, 0.65); margin: 0 0 20px; }
.enroster-error, .enroster-empty { font-size: 0.9rem; color: rgba(255, 255, 255, 0.65); }

.enroster-stats-strip {
  display: flex;
  gap: 18px;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.enroster-stat { display: flex; flex-direction: column; }
.enroster-stat-value { font-size: 1.15rem; font-weight: 800; }
.enroster-stat-label { font-size: 0.68rem; color: rgba(255, 255, 255, 0.55); white-space: nowrap; }

.enroster-ticker {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 20px;
  padding: 6px 10px;
  background: rgba(74, 222, 128, 0.06);
  border: 1px solid rgba(74, 222, 128, 0.15);
  border-radius: 8px;
}
.enroster-ticker-label { font-weight: 700; color: #4ade80; margin-right: 6px; }
.enroster-ticker-item strong { color: #fff; }

.enroster-faction { margin-bottom: 28px; }
.enroster-faction-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.enroster-faction-banner {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}
.enroster-faction-name { font-size: 1.1rem; font-weight: 700; margin: 0; }
.enroster-faction-desc { font-size: 0.8rem; color: rgba(255, 255, 255, 0.6); margin: 2px 0 0; }

.enroster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.enroster-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 10px 8px;
}
.enroster-card-locked { background: rgba(255, 255, 255, 0.03); border-color: rgba(255, 255, 255, 0.08); }

.enroster-portrait {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
}
.enroster-portrait img { width: 100%; height: 100%; object-fit: contain; }
.enroster-no-art { font-size: 9px; color: rgba(255, 255, 255, 0.4); }
.enroster-portrait-locked { background: rgba(0, 0, 0, 0.45); }
.enroster-lock-icon { font-size: 22px; filter: grayscale(1) brightness(0.7); }

.enroster-defeated-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #16a34a;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.enroster-raid-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  padding: 1px 3px;
}

.enroster-name { font-size: 0.82rem; font-weight: 700; word-break: break-word; }
.enroster-name-locked { color: rgba(255, 255, 255, 0.45); font-style: italic; }

.enroster-rank-badge {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
}
/* Same per-rank colors as components/CMoonBattlePopupHost.vue's cbp-rank-* badges — kept in sync
   so a member's tier reads identically wherever it shows up. */
.enroster-rank-GOON { background: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.85); }
.enroster-rank-ENFORCER { background: #1d4ed8; color: #dbeafe; }
.enroster-rank-UNDERBOSS { background: #7e22ce; color: #f3e8ff; }
.enroster-rank-FINAL_BOSS { background: #b91c1c; color: #fee2e2; }

.enroster-stats, .enroster-tally, .enroster-unlock-req {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
  margin: 4px 0 0;
}
.enroster-tally { color: #4ade80; font-weight: 600; }
.enroster-unlock-req { color: rgba(255, 255, 255, 0.4); font-style: italic; }
</style>
