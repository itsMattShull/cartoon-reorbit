<template>
  <div class="ma">

    <!-- ── Header ────────────────────────────────────────────────── -->
    <div class="ma-header">Achievements</div>

    <!-- ── Grid ──────────────────────────────────────────────────── -->
    <div class="ma-grid-wrap">
      <div v-if="loading" class="ma-empty">Loading…</div>
      <div v-else-if="!achievements.length" class="ma-empty">No achievements found.</div>
      <div v-else class="ma-grid">
        <div
          v-for="a in achievements" :key="a.id"
          class="ma-card"
          :class="{ 'ma-card-achieved': a.achieved }"
          @click="selected = a"
        >
          <div class="ma-card-img-wrap">
            <img v-if="a.imagePath" :src="a.imagePath" class="ma-card-img" :alt="a.title" />
            <div v-else class="ma-card-img-ph">?</div>
            <span class="ma-card-status" :class="a.achieved ? 'ma-status-done' : 'ma-status-locked'">
              {{ a.achieved ? '✓' : '🔒' }}
            </span>
          </div>
          <div class="ma-card-body">
            <div class="ma-card-title">{{ a.title }}</div>
            <div v-if="a.description" class="ma-card-desc">{{ a.description }}</div>
            <div class="ma-card-footer">
              <span class="ma-achievers">{{ a.achievers }} achiever{{ a.achievers !== 1 ? 's' : '' }}</span>
              <span v-if="hasRewards(a)" class="ma-has-reward">★ Reward</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Detail modal ───────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="selected" class="ma-overlay" @click.self="selected = null">
        <div class="ma-modal">

          <div class="ma-modal-header">
            <div class="ma-modal-title-row">
              <img v-if="selected.imagePath" :src="selected.imagePath" class="ma-modal-img" :alt="selected.title" />
              <div>
                <div class="ma-modal-title">{{ selected.title }}</div>
                <span class="ma-modal-badge" :class="selected.achieved ? 'ma-status-done' : 'ma-status-locked'">
                  {{ selected.achieved ? 'Achieved' : 'Locked' }}
                </span>
              </div>
            </div>
            <button class="ma-modal-close" @click="selected = null">✕</button>
          </div>

          <div class="ma-modal-body">
            <p v-if="selected.description" class="ma-modal-desc">{{ selected.description }}</p>
            <div class="ma-modal-achievers">{{ selected.achievers }} achiever{{ selected.achievers !== 1 ? 's' : '' }}</div>

            <!-- Rewards -->
            <template v-if="hasRewards(selected)">
              <div class="ma-reward-heading">Rewards</div>

              <div v-if="selected.rewards.points" class="ma-reward-points">
                <span class="ma-reward-points-label">Points</span>
                <span class="ma-reward-points-val">{{ selected.rewards.points.toLocaleString() }}</span>
              </div>

              <div v-if="selected.rewards.ctoons?.length" class="ma-reward-section">
                <div class="ma-reward-section-label">cToons</div>
                <div class="ma-reward-ctoons">
                  <div v-for="(rc, i) in selected.rewards.ctoons" :key="i" class="ma-reward-ctoon">
                    <img v-if="rc.imagePath" :src="rc.imagePath" class="ma-reward-ctoon-img" :alt="rc.name" />
                    <div class="ma-reward-ctoon-name">{{ rc.name }}</div>
                    <div class="ma-reward-ctoon-qty">× {{ rc.quantity }}</div>
                  </div>
                </div>
              </div>

              <div v-if="selected.rewards.backgrounds?.length" class="ma-reward-section">
                <div class="ma-reward-section-label">Backgrounds</div>
                <div class="ma-reward-bgs">
                  <img
                    v-for="(rb, i) in selected.rewards.backgrounds" :key="i"
                    v-if="rb.imagePath"
                    :src="rb.imagePath"
                    class="ma-reward-bg"
                    :alt="rb.label || 'Background'"
                    :title="rb.label || 'Background'"
                  />
                </div>
              </div>
            </template>
            <div v-else class="ma-no-reward">No rewards for this achievement.</div>
          </div>

          <div class="ma-modal-footer">
            <button class="ma-close-btn" @click="selected = null">Close</button>
          </div>

        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
const achievements = ref([])
const loading      = ref(false)
const selected     = ref(null)

onMounted(loadAchievements)

async function loadAchievements() {
  loading.value = true
  try {
    achievements.value = await $fetch('/api/achievements')
  } catch (e) {
    console.error('MyAchievements: load failed', e)
  } finally {
    loading.value = false
  }
}

function hasRewards(a) {
  return a.rewards?.points || a.rewards?.ctoons?.length || a.rewards?.backgrounds?.length
}
</script>

<style scoped>
.ma {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* ── Header ── */
.ma-header {
  flex-shrink: 0;
  background: var(--OrbitLightBlue);
  border-bottom: 2px solid var(--OrbitDarkBlue);
  text-align: center;
  font-size: 1.6rem;
  font-weight: bold;
  color: #fff;
  height: 34px;
  line-height: 32px;
  padding-bottom: 2px;
  letter-spacing: 0.03em;
}

/* ── Grid wrap ── */
.ma-grid-wrap {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 10px;
}

.ma-empty {
  font-size: 0.8rem;
  color: rgba(255,255,255,0.45);
  font-style: italic;
  text-align: center;
  padding: 20px 0;
}

.ma-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  align-content: start;
}

/* ── Card ── */
.ma-card {
  display: flex;
  flex-direction: column;
  background: var(--OrbitDarkBlue);
  border: 2px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, filter 0.15s;
}
.ma-card:hover { border-color: rgba(255,165,0,0.6); filter: brightness(1.08); }
.ma-card-achieved { border-color: rgba(46,160,67,0.5); }
.ma-card-achieved:hover { border-color: #2ea843; }

.ma-card-img-wrap {
  position: relative;
  background: rgba(0,0,0,0.3);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ma-card-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 8px;
  box-sizing: border-box;
}
.ma-card-img-ph {
  font-size: 2rem;
  color: rgba(255,255,255,0.2);
}
.ma-card-status {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 0.65rem;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.4;
}
.ma-status-done   { background: #2ea843; color: #fff; }
.ma-status-locked { background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.5); }

.ma-card-body {
  padding: 6px 7px 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
}
.ma-card-title {
  font-size: 0.72rem;
  font-weight: bold;
  color: #fff;
  line-height: 1.3;
}
.ma-card-desc {
  font-size: 0.62rem;
  color: rgba(255,255,255,0.55);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ma-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 4px;
}
.ma-achievers {
  font-size: 0.58rem;
  color: rgba(255,255,255,0.4);
}
.ma-has-reward {
  font-size: 0.58rem;
  color: #f4a800;
  font-weight: bold;
}
</style>

<style>
/* ── Modal (global for Teleport) ── */
.ma-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ma-modal {
  background: var(--OrbitDarkBlue, #003466);
  border: 2px solid var(--OrbitLightBlue, #1a5a9a);
  border-radius: 8px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}

.ma-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
  gap: 10px;
}
.ma-modal-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.ma-modal-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
  background: rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 4px;
}
.ma-modal-title {
  font-size: 0.95rem;
  font-weight: bold;
  color: #fff;
  line-height: 1.3;
}
.ma-modal-badge {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: bold;
  padding: 1px 6px;
  border-radius: 3px;
  margin-top: 3px;
}
.ma-modal-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  font-size: 1rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.ma-modal-close:hover { color: #fff; }

.ma-modal-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ma-modal-desc {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.75);
  line-height: 1.5;
  margin: 0;
}
.ma-modal-achievers {
  font-size: 0.65rem;
  color: rgba(255,255,255,0.4);
}

.ma-reward-heading {
  font-size: 0.72rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #f4a800;
  border-top: 1px solid rgba(255,255,255,0.1);
  padding-top: 8px;
}
.ma-reward-points {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  padding: 6px 10px;
}
.ma-reward-points-label { font-size: 0.72rem; color: rgba(255,255,255,0.6); }
.ma-reward-points-val   { font-size: 0.85rem; font-weight: bold; color: #f4a800; }

.ma-reward-section { display: flex; flex-direction: column; gap: 6px; }
.ma-reward-section-label {
  font-size: 0.68rem;
  font-weight: bold;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ma-reward-ctoons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ma-reward-ctoon {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0,0,0,0.25);
  border-radius: 4px;
  padding: 6px;
  width: 80px;
}
.ma-reward-ctoon-img {
  width: 60px;
  height: 60px;
  object-fit: contain;
  image-rendering: pixelated;
}
.ma-reward-ctoon-name {
  font-size: 0.6rem;
  color: #fff;
  text-align: center;
  margin-top: 3px;
  line-height: 1.2;
}
.ma-reward-ctoon-qty {
  font-size: 0.58rem;
  color: rgba(255,255,255,0.5);
}

.ma-reward-bgs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ma-reward-bg {
  width: 120px;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.15);
}

.ma-no-reward {
  font-size: 0.7rem;
  color: rgba(255,255,255,0.35);
  font-style: italic;
}

.ma-modal-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(255,255,255,0.1);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}
.ma-close-btn {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: #fff;
  font-size: 0.75rem;
  padding: 5px 16px;
  border-radius: 4px;
  cursor: pointer;
}
.ma-close-btn:hover { background: rgba(255,255,255,0.18); }
</style>
