<template>
  <!-- Teleported to body for the same reason as CMoonSelectModal/CtoonInfoCard: .site-container
       carries a `transform: scale()` on desktop, which traps position:fixed descendants inside
       its own clipped box unless they're teleported out. -->
  <Teleport to="body">
    <div v-if="isOpen && data" class="crm-overlay" role="dialog" aria-modal="true" aria-labelledby="crm-title" @click.self="close">
      <div class="crm-card">
        <button type="button" class="crm-close" aria-label="Close" @click="close">✕</button>

        <p v-if="data.eyebrow" class="crm-eyebrow">{{ data.eyebrow }}</p>
        <h2 id="crm-title" class="crm-title">{{ data.title || 'Nice!' }}</h2>
        <p v-if="data.subtitle" class="crm-subtitle">{{ data.subtitle }}</p>

        <div v-if="data.pointsAwarded" class="crm-points">
          <span class="crm-points-label">Points</span>
          <span class="crm-points-val">{{ data.pointsAwarded.toLocaleString() }}</span>
        </div>

        <div v-if="items.length" class="crm-rewards">
          <p class="crm-rewards-label">Rewards</p>
          <div class="crm-rewards-grid">
            <div v-for="it in items" :key="it.id" class="crm-reward-item">
              <img
                v-if="it.imagePath" :src="it.imagePath" :alt="it.label"
                class="crm-reward-img" :class="`crm-reward-img--${it.variant || 'ctoon'}`" loading="eager"
              />
              <span v-else class="crm-reward-swatch" aria-hidden="true">{{ it.icon || '★' }}</span>
              <span class="crm-reward-name">{{ it.label }}<template v-if="it.qty > 1"> × {{ it.qty }}</template></span>
            </div>
          </div>
        </div>
        <p v-else-if="!data.pointsAwarded" class="crm-no-rewards">{{ data.emptyText || 'Nothing else to show here.' }}</p>

        <p v-if="data.note" class="crm-note">{{ data.note }}</p>

        <button type="button" class="crm-ok" @click="close">Nice!</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Shared reveal modal for everything a player can receive from their team's cMoon — an affinity
// rank-up, a cMoon rank promotion, a claimed cToon offer, or a join prize. One component instead
// of four so all four moments share the same dark tutorial-page palette and layout instead of
// drifting apart over time. Driven by the useCMoonRewardModal() singleton and mounted once in
// layouts/newsite-template.vue, matching how CtoonInfoCard/AuctionModal/CMoonSelectModal work.
import { computed } from 'vue'
import { useCMoonRewardModal } from '@/composables/useCMoonRewardModal'

const { isOpen, data, close } = useCMoonRewardModal()

const items = computed(() => data.value?.items || [])
</script>

<style scoped>
.crm-overlay {
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
}

.crm-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  max-height: 85dvh;
  overflow-y: auto;
  background: linear-gradient(160deg, #00111f 0%, #003466 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  padding: 28px 20px 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.crm-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.1rem;
  cursor: pointer;
}
.crm-close:hover,
.crm-close:focus-visible {
  color: #fff;
}

.crm-eyebrow {
  margin: 10px 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--OrbitLightBlue, #3399CC);
}

.crm-title {
  margin: 0 0 6px;
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  word-break: break-word;
}

.crm-subtitle {
  margin: 0 0 10px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
}

.crm-points {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 4px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.crm-points-label {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.crm-points-val {
  font-size: 0.95rem;
  font-weight: 800;
  color: #fff;
}

.crm-rewards {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.crm-rewards-label {
  margin: 0 0 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
}

.crm-no-rewards {
  margin: 16px 0 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
}

.crm-rewards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 12px;
}

.crm-reward-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.crm-reward-img {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  background: rgba(255, 255, 255, 0.06);
}
.crm-reward-img--avatar {
  border-radius: 50%;
}
.crm-reward-img--background,
.crm-reward-img--ctoon {
  border-radius: 8px;
}

.crm-reward-swatch {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid var(--OrbitLightBlue, #3399CC);
}

.crm-reward-name {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.85);
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.crm-note {
  margin: 14px 0 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.6);
}

.crm-ok {
  margin-top: 22px;
  width: 100%;
  min-height: 44px;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #00111f;
  background: var(--OrbitLightBlue, #3399CC);
  cursor: pointer;
}

@media (min-width: 640px) {
  .crm-ok {
    width: auto;
    padding: 10px 32px;
  }
}
</style>
