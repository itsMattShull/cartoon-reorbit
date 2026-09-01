<template>
  <!-- Teleported to body: .site-container carries a `transform: scale()` on desktop (see
       layouts/newsite-template.vue and components/effects/FullscreenEffectHost.vue's identical
       note), which makes it the containing block for `position: fixed` descendants and traps
       them inside its own clipped box. Without this the overlay renders offset/clipped instead
       of covering the real viewport. Same approach as settings.vue's modals and
       FullscreenEffectHost. -->
  <Teleport to="body">
    <div class="calu-overlay" role="dialog" aria-modal="true" aria-labelledby="calu-title" @click.self="$emit('close')">
      <div class="calu-card" :style="accentStyle">
        <button type="button" class="calu-close" aria-label="Close" @click="$emit('close')">✕</button>

        <p class="calu-eyebrow">{{ cmoonName }} Affinity — Rank Up!</p>
        <h2 id="calu-title" class="calu-title">{{ level.name }}</h2>
        <p v-if="level.levelNames && level.levelNames.length > 1" class="calu-multi">
          You jumped {{ level.levelNames.length }} ranks in one contribution: {{ level.levelNames.join(' → ') }}
        </p>

        <div v-if="hasRewards" class="calu-rewards">
          <p class="calu-rewards-label">Rewards unlocked</p>
          <div class="calu-rewards-grid">
            <div v-for="av in level.rewards.avatars" :key="`av-${av.id}`" class="calu-reward-item">
              <img :src="av.imagePath" :alt="av.label || 'Avatar'" class="calu-reward-avatar" />
              <span class="calu-reward-name">{{ av.label || 'Avatar' }}</span>
            </div>
            <div v-for="bg in level.rewards.backgrounds" :key="`bg-${bg.id}`" class="calu-reward-item">
              <img :src="bg.imagePath" :alt="bg.label || 'Background'" class="calu-reward-bg" />
              <span class="calu-reward-name">{{ bg.label || 'Background' }}</span>
            </div>
            <div v-if="level.rewards.border" class="calu-reward-item">
              <span class="calu-reward-swatch" :style="swatchStyle">🔲</span>
              <span class="calu-reward-name">cZone Border</span>
            </div>
            <div v-if="level.rewards.glow" class="calu-reward-item">
              <span class="calu-reward-swatch" :style="swatchStyle">✨</span>
              <span class="calu-reward-name">cZone Glow</span>
            </div>
          </div>
        </div>
        <p v-else class="calu-no-rewards">This rank is a milestone — no cosmetic reward attached.</p>

        <button type="button" class="calu-ok" :style="okStyle" @click="$emit('close')">Nice!</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Full-screen reveal shown when a "contribute to cMoon" call crosses one or more affinity
// levels — replaces the old small corner toast (which only ever named the rank, never what was
// actually granted) with the rank title plus every reward the contribution unlocked. `level` is
// the `leveledUpTo` object server/api/cmoon/[id]/contribute.post.js returns: it already
// aggregates rewards across every level crossed in one contribution, not just the highest, since
// a large lump-sum contribution can cross several thresholds at once.
import { computed } from 'vue'
import { isSafeCMoonColor } from '~/utils/cmoonColor'

const props = defineProps({
  level: { type: Object, required: true },
  cmoonName: { type: String, default: '' },
  cmoonColor: { type: String, default: '' },
})
defineEmits(['close'])

const hasRewards = computed(() => {
  const r = props.level?.rewards
  if (!r) return false
  return !!(r.avatars?.length || r.backgrounds?.length || r.border || r.glow)
})

const accentColor = computed(() => (isSafeCMoonColor(props.cmoonColor) ? props.cmoonColor : '#336699'))
const accentStyle = computed(() => ({ '--calu-accent': accentColor.value }))
const swatchStyle = computed(() => ({ background: accentColor.value }))
const okStyle = computed(() => ({ background: accentColor.value }))
</script>

<style scoped>
.calu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(10, 14, 22, 0.82);
  backdrop-filter: blur(2px);
}

.calu-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 14px;
  padding: 28px 20px 20px;
  text-align: center;
  border-top: 6px solid var(--calu-accent, #336699);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

.calu-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #888;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.calu-eyebrow {
  margin: 0 0 4px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--calu-accent, #336699);
}

.calu-title {
  margin: 0 0 6px;
  font-size: 1.6rem;
  font-weight: 800;
  color: #1a1a1a;
  word-break: break-word;
}

.calu-multi {
  margin: 0 0 10px;
  font-size: 0.75rem;
  color: #666;
}

.calu-rewards {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #eee;
}

.calu-rewards-label {
  margin: 0 0 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #555;
}

.calu-no-rewards {
  margin: 16px 0 0;
  font-size: 0.8rem;
  color: #777;
}

.calu-rewards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 12px;
}

.calu-reward-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.calu-reward-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--calu-accent, #336699);
}

.calu-reward-bg {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  border: 2px solid var(--calu-accent, #336699);
}

.calu-reward-swatch {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
}

.calu-reward-name {
  font-size: 0.68rem;
  color: #444;
  text-align: center;
  word-break: break-word;
}

.calu-ok {
  margin-top: 22px;
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
}

@media (min-width: 640px) {
  .calu-ok { width: auto; padding: 10px 32px; }
}
</style>
