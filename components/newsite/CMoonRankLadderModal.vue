<template>
  <!-- Same Teleport-to-body reason as CMoonAffinityLadderModal/CMoonRewardModal/CMoonSelectModal:
       .site-container carries a transform:scale() on desktop, which makes it the containing
       block for position:fixed descendants and clips them otherwise. -->
  <Teleport to="body">
    <div class="crlm-overlay" role="dialog" aria-modal="true" aria-labelledby="crlm-title" @click.self="$emit('close')">
      <div class="crlm-card">
        <div class="crlm-header">
          <h2 id="crlm-title" class="crlm-title">{{ cmoonName }} Rank Rewards</h2>
          <button ref="closeBtn" type="button" class="crlm-close" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <p class="crlm-disclaimer">
          Ranks are earned automatically from cMoon points — no spending required. When you reach a
          rank, you'll pick <strong>one</strong> of its reward cToons to add to your collection.
        </p>

        <div v-if="tiers.length" class="crlm-list">
          <div
            v-for="tier in tiers" :key="tier.id"
            class="crlm-tier" :class="{ 'crlm-tier--reached': isReached(tier) }"
          >
            <div class="crlm-tier-head">
              <span class="crlm-tier-name">{{ tier.name }}</span>
              <span class="crlm-tier-threshold">{{ tier.pointThreshold.toLocaleString() }} pts</span>
              <span class="crlm-tier-status">{{ isReached(tier) ? '✓ Reached' : 'Locked' }}</span>
            </div>
            <template v-if="tier.rewardChoices.length">
              <p class="crlm-tier-note">Choose 1 of {{ tier.rewardChoices.length }}:</p>
              <div class="crlm-tier-rewards">
                <div v-for="c in tier.rewardChoices" :key="c.id" class="crlm-reward-chip">
                  <img
                    v-if="c.imagePath" :src="c.imagePath" :alt="c.name"
                    class="crlm-reward-img" width="32" height="32" loading="lazy" decoding="async"
                  />
                  <span v-else class="crlm-reward-swatch" aria-hidden="true">★</span>
                  <span class="crlm-reward-label">{{ c.name }}</span>
                </div>
              </div>
            </template>
            <p v-else class="crlm-tier-empty">Milestone — no cToon reward configured yet.</p>
          </div>
        </div>
        <p v-else class="crlm-empty">No ranks are configured for this cMoon yet.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Lets a player preview the FULL rank ladder for this cMoon (and each rank's reward-cToon
// choices) before they've earned it, opened from the "?" next to "Your Rank" (see CMoonPage.vue).
// Purely a read-only view over data the page already fetched from
// GET /api/cmoon/[id]/rank-progress — no request of its own.
import { onMounted, onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  cmoonName: { type: String, default: 'this cMoon' },
  tiers: { type: Array, default: () => [] },
  cMoonPoints: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const closeBtn = ref(null)

function isReached(tier) {
  return tier.pointThreshold <= props.cMoonPoints
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
.crlm-overlay {
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

.crlm-card {
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

.crlm-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.crlm-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  word-break: break-word;
}

.crlm-close {
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
.crlm-close:hover,
.crlm-close:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  outline: none;
}

.crlm-disclaimer {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.8rem;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
}
.crlm-disclaimer strong {
  color: #fff;
}

.crlm-empty {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.crlm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.crlm-tier {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.crlm-tier--reached {
  border-color: var(--OrbitLightBlue, #3399CC);
  background: rgba(51, 153, 204, 0.12);
}

.crlm-tier-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  row-gap: 2px;
}

.crlm-tier-name {
  font-weight: 800;
  font-size: 0.9rem;
  min-width: 0;
  word-break: break-word;
}

.crlm-tier-threshold {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.crlm-tier-status {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.5);
}
.crlm-tier--reached .crlm-tier-status {
  color: #8CE046;
}

.crlm-tier-note {
  margin: 6px 0 0;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.55);
}

.crlm-tier-rewards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.crlm-reward-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px 3px 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.crlm-reward-img {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.1);
}

.crlm-reward-swatch {
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

.crlm-reward-label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.85);
  min-width: 0;
  word-break: break-word;
}

.crlm-tier-empty {
  margin: 8px 0 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

@media (min-width: 640px) {
  .crlm-card {
    padding: 24px;
  }
}
</style>
