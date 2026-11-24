<template>
  <!-- Same Teleport-to-body reason as CMoonRankLadderModal/CMoonAffinityLadderModal/etc:
       .site-container carries a transform:scale() on desktop, which makes it the containing
       block for position:fixed descendants and clips them otherwise. -->
  <Teleport to="body">
    <div class="dsrm-overlay" role="dialog" aria-modal="true" aria-labelledby="dsrm-title" @click.self="$emit('close')">
      <div class="dsrm-card">
        <div class="dsrm-header">
          <h2 id="dsrm-title" class="dsrm-title">Daily Streak Rewards</h2>
          <button ref="closeBtn" type="button" class="dsrm-close" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <p class="dsrm-disclaimer">
          Complete every one of your daily tasks to keep your streak going — miss one and it
          resets to 0. Rewards below grant automatically the moment your streak reaches that day.
          <span v-if="repeatEnabled">Once you pass day {{ maxDay }}, the whole schedule repeats.</span>
        </p>

        <p class="dsrm-streak-count">🔥 Current streak: <strong>{{ streakCount }}</strong> day{{ streakCount === 1 ? '' : 's' }}</p>

        <div v-if="milestones.length" class="dsrm-list">
          <div
            v-for="m in milestones" :key="m.day"
            class="dsrm-tier" :class="{ 'dsrm-tier--reached': m.reached }"
          >
            <div class="dsrm-tier-head">
              <span class="dsrm-tier-name">Day {{ m.day }}</span>
              <span class="dsrm-tier-status">{{ m.reached ? '✓ Reached' : 'Locked' }}</span>
            </div>
            <div class="dsrm-tier-rewards">
              <div v-for="(r, i) in m.rewards" :key="i" class="dsrm-reward-chip">
                <CtoonImage
                  v-if="r.rewardType === 'CTOON' && r.ctoon?.assetPath" :ctoon="r.ctoon" :src="r.ctoon.assetPath" :alt="r.ctoon.name"
                  class="dsrm-reward-img" width="32" height="32" loading="lazy" decoding="async"
                />
                <img
                  v-else-if="r.rewardType === 'PACK' && r.pack?.imagePath" :src="r.pack.imagePath" :alt="r.pack.name"
                  class="dsrm-reward-img"
                />
                <span v-else class="dsrm-reward-swatch" aria-hidden="true">{{ r.rewardType === 'CMOON_POINTS' ? '🌙' : '✦' }}</span>
                <span class="dsrm-reward-label">{{ rewardLabel(r) }}</span>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="dsrm-empty">No Daily Streak rewards are configured yet.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import CtoonImage from '@/components/CtoonImage.vue'
// Read-only preview of the full Daily Streak milestone schedule, opened from the daily-tasks
// checklist panel (Onboarding.vue). Purely a display over data that panel already fetched from
// GET /api/daily-streak/status — no request of its own, same division of labor
// CMoonRankLadderModal has with its own page's rank-progress fetch.
import { onMounted, onBeforeUnmount, ref } from 'vue'

defineProps({
  streakCount: { type: Number, default: 0 },
  maxDay: { type: Number, default: 0 },
  repeatEnabled: { type: Boolean, default: false },
  milestones: { type: Array, default: () => [] },
})
const emit = defineEmits(['close'])

const closeBtn = ref(null)

function rewardLabel(r) {
  if (r.rewardType === 'CTOON') return `${r.ctoon?.name || 'Unknown cToon'} x${r.amount}`
  if (r.rewardType === 'PACK') return `${r.pack?.name || 'Unknown pack'} x${r.amount}`
  if (r.rewardType === 'CMOON_POINTS') return `${r.amount} cMoon points`
  return `${r.amount} points`
}

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  closeBtn.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.dsrm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  background: rgba(10, 14, 22, 0.82);
  backdrop-filter: blur(2px);
  box-sizing: border-box;
}

.dsrm-card {
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: linear-gradient(160deg, #1f1100 0%, #663300 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.dsrm-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.dsrm-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  word-break: break-word;
}

.dsrm-close {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  font-size: 1rem;
  cursor: pointer;
}
.dsrm-close:hover,
.dsrm-close:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  outline: none;
}

.dsrm-disclaimer {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.8rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
}

.dsrm-streak-count {
  margin: 0 0 14px;
  font-size: 0.9rem;
}

.dsrm-empty {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.dsrm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dsrm-tier {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.dsrm-tier--reached {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.dsrm-tier-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 2px;
}

.dsrm-tier-name {
  font-weight: 800;
  font-size: 0.9rem;
  min-width: 0;
  word-break: break-word;
}

.dsrm-tier-status {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.5);
}
.dsrm-tier--reached .dsrm-tier-status {
  color: #8CE046;
}

.dsrm-tier-rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.dsrm-reward-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px 3px 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.dsrm-reward-img {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.1);
}

.dsrm-reward-swatch {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 1rem;
}

.dsrm-reward-label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.85);
  min-width: 0;
  word-break: break-word;
}

@media (min-width: 640px) {
  .dsrm-card {
    padding: 24px;
  }
}
</style>
