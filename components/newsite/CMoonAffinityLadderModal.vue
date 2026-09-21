<template>
  <!-- Same Teleport-to-body reason as CMoonRewardModal/CMoonSelectModal/EconomyIndexModal:
       .site-container carries a transform:scale() on desktop, which makes it the containing
       block for position:fixed descendants and clips them otherwise. -->
  <Teleport to="body">
    <div class="calm-overlay" role="dialog" aria-modal="true" aria-labelledby="calm-title" @click.self="$emit('close')">
      <div class="calm-card">
        <div class="calm-header">
          <h2 id="calm-title" class="calm-title">{{ cmoonName }} Affinity Rewards</h2>
          <button ref="closeBtn" type="button" class="calm-close" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <p class="calm-disclaimer">
          These are <strong>cosmetic rewards only</strong> — a cZone border, glow, or avatar. They
          can't be traded, sold, or transferred to another account or player.
        </p>

        <div v-if="levels.length" class="calm-list">
          <div
            v-for="level in levels" :key="level.id"
            class="calm-level" :class="{ 'calm-level--reached': isReached(level) }"
          >
            <div class="calm-level-head">
              <span class="calm-level-name">{{ level.name }}</span>
              <span class="calm-level-threshold">{{ level.threshold.toLocaleString() }} pts</span>
              <span class="calm-level-status">{{ isReached(level) ? '✓ Reached' : 'Locked' }}</span>
            </div>
            <div v-if="levelItems(level).length" class="calm-level-rewards">
              <div v-for="it in levelItems(level)" :key="it.id" class="calm-reward-chip">
                <img
                  v-if="it.imagePath" :src="it.imagePath" :alt="it.label"
                  class="calm-reward-img" width="32" height="32" loading="lazy" decoding="async"
                />
                <span v-else class="calm-reward-swatch" aria-hidden="true">{{ it.icon }}</span>
                <span class="calm-reward-label">{{ it.label }}</span>
              </div>
            </div>
            <p v-else class="calm-level-empty">Milestone — no cosmetic reward attached.</p>
          </div>
        </div>
        <p v-else class="calm-empty">No affinity rewards are configured for this cMoon yet.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Lets a player preview the FULL affinity ladder for this cMoon before spending points, opened
// from the "?" next to "Contribute to {cmoon.name}" (see CMoonPage.vue). Purely a read-only view
// over data the page already fetched from GET /api/cmoon/[id]/affinity — no request of its own.
import { onMounted, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  cmoonName: { type: String, default: 'this cMoon' },
  levels: { type: Array, default: () => [] },
  affinitySpent: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const closeBtn = ref(null)

function isReached(level) {
  return level.threshold <= props.affinitySpent
}

// Mirrors the {id, imagePath, label, icon} shape CMoonRewardModal's reward chips already use,
// built straight from the raw level fields affinity.get.js returns (grantsBorder/grantsGlow are
// booleans, rewardBackground/rewardAvatars are the resolved image records) — no per-level API
// call, this just re-shapes what's already in `levels`.
function levelItems(level) {
  const items = []
  if (level.grantsBorder) items.push({ id: 'border', imagePath: null, label: 'cZone Border', icon: '🔲' })
  if (level.grantsGlow) items.push({ id: 'glow', imagePath: null, label: 'cZone Glow', icon: '✨' })
  if (level.rewardBackground) {
    items.push({ id: `bg-${level.rewardBackground.id}`, imagePath: level.rewardBackground.imagePath, label: level.rewardBackground.label || 'Background' })
  }
  for (const av of level.rewardAvatars || []) {
    items.push({ id: `av-${av.id}`, imagePath: av.imagePath, label: av.label || 'Avatar' })
  }
  return items
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
.calm-overlay {
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

.calm-card {
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  box-sizing: border-box;
  background: linear-gradient(160deg, #00111f 0%, #003466 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.calm-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.calm-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  word-break: break-word;
}

.calm-close {
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
.calm-close:hover,
.calm-close:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  outline: none;
}

.calm-disclaimer {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.8rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
}
.calm-disclaimer strong {
  color: #fff;
}

.calm-empty {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.calm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.calm-level {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.calm-level--reached {
  border-color: var(--OrbitLightBlue, #3399CC);
  background: rgba(51, 153, 204, 0.12);
}

.calm-level-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 2px;
}

.calm-level-name {
  font-weight: 800;
  font-size: 0.9rem;
  min-width: 0;
  word-break: break-word;
}

.calm-level-threshold {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.calm-level-status {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.5);
}
.calm-level--reached .calm-level-status {
  color: #8CE046;
}

.calm-level-rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.calm-reward-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px 3px 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.calm-reward-img {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.1);
}

.calm-reward-swatch {
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

.calm-reward-label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.85);
  min-width: 0;
  word-break: break-word;
}

.calm-level-empty {
  margin: 8px 0 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

@media (min-width: 640px) {
  .calm-card {
    padding: 24px;
  }
}
</style>
