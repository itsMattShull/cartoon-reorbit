<template>
  <!-- Same Teleport-to-body reason as CMoonAffinityLadderModal/CMoonRewardModal/CMoonSelectModal:
       .site-container carries a transform:scale() on desktop, which makes it the containing block
       for position:fixed descendants and clips them otherwise. -->
  <Teleport to="body">
    <div class="com-overlay" role="dialog" aria-modal="true" aria-labelledby="com-title" @click.self="$emit('close')">
      <div class="com-card">
        <div class="com-header">
          <h2 id="com-title" class="com-title">{{ cmoonName }} Offers</h2>
          <button ref="closeBtn" type="button" class="com-close" aria-label="Close" @click="$emit('close')">✕</button>
        </div>

        <template v-if="currentOffers.length || pastOffers.length">
          <section v-if="currentOffers.length" class="com-section">
            <h3 class="com-section-title">Current</h3>
            <div v-for="o in currentOffers" :key="o.id" class="com-offer">
              <p class="com-offer-meta">
                <span v-if="o.myClaim">You claimed this offer.</span>
                <span v-else-if="!eligible">Join this cMoon to claim a reward here.</span>
                <span v-else-if="o.options.length > 1">Pick one — you'll get {{ o.quantityPerMember }} cop{{ o.quantityPerMember === 1 ? 'y' : 'ies' }}.</span>
                <span v-else>You'll get {{ o.quantityPerMember }} cop{{ o.quantityPerMember === 1 ? 'y' : 'ies' }}.</span>
              </p>
              <div class="com-grid">
                <button
                  v-for="opt in o.options" :key="opt.id"
                  type="button"
                  class="com-card com-offer-option"
                  :class="{
                    'com-offer-option--picked': o.myClaim && o.myClaim.optionId === opt.id,
                    'com-offer-option--selected': !o.myClaim && selections[o.id] === opt.id,
                  }"
                  :disabled="!!o.myClaim || o.status !== 'OPEN' || !eligible || claiming[o.id]"
                  @click="selections[o.id] = opt.id"
                >
                  <CtoonImage v-if="opt.kind !== 'PACK'" :ctoon="opt" :alt="opt.name" class="com-card-img" loading="lazy" />
                  <img v-else :src="opt.assetPath" :alt="opt.name" class="com-card-img" loading="lazy" />
                  <span class="com-card-name">{{ opt.name }}</span>
                  <span v-if="o.myClaim && o.myClaim.optionId === opt.id" class="com-offer-picked-badge">Your pick</span>
                </button>
              </div>
              <button
                v-if="!o.myClaim && o.status === 'OPEN' && eligible"
                type="button"
                class="com-offer-claim-btn"
                :disabled="!selections[o.id] || claiming[o.id]"
                @click="$emit('claim', o)"
              >{{ claiming[o.id] ? 'Claiming…' : 'Claim' }}</button>
              <p v-if="errors[o.id]" class="com-offer-error">{{ errors[o.id] }}</p>
            </div>
          </section>

          <section v-if="pastOffers.length" class="com-section">
            <h3 class="com-section-title">Past</h3>
            <div v-for="o in pastOffers" :key="o.id" class="com-offer com-offer--past">
              <p class="com-offer-meta">
                <span>Available {{ formatDateRange(o) }}</span>
                <span v-if="o.myClaim"> — you claimed this offer.</span>
                <span v-else-if="eligible"> — you didn't claim this offer.</span>
              </p>
              <div class="com-grid">
                <div
                  v-for="opt in o.options" :key="opt.id"
                  class="com-card com-offer-option com-offer-option--readonly"
                  :class="{ 'com-offer-option--picked': o.myClaim && o.myClaim.optionId === opt.id }"
                >
                  <CtoonImage v-if="opt.kind !== 'PACK'" :ctoon="opt" :alt="opt.name" class="com-card-img" loading="lazy" />
                  <img v-else :src="opt.assetPath" :alt="opt.name" class="com-card-img" loading="lazy" />
                  <span class="com-card-name">{{ opt.name }}</span>
                  <span v-if="o.myClaim && o.myClaim.optionId === opt.id" class="com-offer-picked-badge">Your pick</span>
                </div>
              </div>
            </div>
          </section>
        </template>
        <p v-else class="com-empty">No offers have been made on this cMoon yet.</p>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Consolidates the cMoon page's "Offers" section (previously inline, see CMoonPage.vue) into a
// clickable "cMoon Offers" button + modal — the inline block grew too tall once several offers
// piled up on one page. Claim state (selections/claiming/errors) and the claim action itself stay
// owned by CMoonPage.vue; this component only renders them and relays clicks via `claim`, same
// split CMoonAffinityLadderModal/CMoonRankLadderModal use for their own page-owned data.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'

const props = defineProps({
  cmoonName: { type: String, default: 'this cMoon' },
  offers: { type: Array, default: () => [] },
  eligible: { type: Boolean, default: false },
  selections: { type: Object, default: () => ({}) },
  claiming: { type: Object, default: () => ({}) },
  errors: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close', 'claim'])

const closeBtn = ref(null)

// `offers` already arrives newest-first (dispersal-offers.get.js orders by createdAt desc), so
// each bucket keeps that order rather than re-sorting.
const currentOffers = computed(() => props.offers.filter(o => o.status === 'OPEN'))
const pastOffers = computed(() => props.offers.filter(o => o.status !== 'OPEN'))

function formatDateRange(o) {
  const fmt = d => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  const start = fmt(o.createdAt)
  return o.closedAt ? `${start} – ${fmt(o.closedAt)}` : start
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
.com-overlay {
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

.com-card {
  width: 100%;
  max-width: 560px;
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

.com-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.com-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  word-break: break-word;
}

.com-close {
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
.com-close:hover,
.com-close:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  outline: none;
}

.com-empty {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.com-section + .com-section {
  margin-top: 18px;
}

.com-section-title {
  margin: 0 0 8px;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.65);
}

.com-offer {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  margin-bottom: 10px;
}
.com-offer--past {
  opacity: 0.85;
}

.com-offer-meta {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.75);
}

.com-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 8px;
}

.com-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  color: #fff;
  font-family: inherit;
  min-height: 44px;
  box-sizing: border-box;
  position: relative;
}
@media (hover: hover) and (pointer: fine) {
  .com-offer-option:not(.com-offer-option--readonly):not(:disabled):hover { opacity: 0.85; }
}
.com-card:focus-visible { outline: 2px solid var(--OrbitLightBlue, #3399CC); outline-offset: 1px; }

.com-offer-option--readonly {
  cursor: default;
}

.com-offer-option:disabled {
  opacity: 0.55;
  cursor: default;
}

.com-offer-option--selected {
  outline: 2px solid var(--OrbitLightBlue, #3399CC);
}

.com-offer-option--picked {
  outline: 2px solid #8CE046;
}

.com-offer-picked-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  right: 2px;
  font-size: 0.6rem;
  font-weight: 700;
  text-align: center;
  color: #8CE046;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  padding: 1px 2px;
}

.com-card-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}

.com-card-name {
  font-size: 0.75rem;
  text-align: center;
  overflow-wrap: anywhere;
}

.com-offer-claim-btn {
  margin-top: 8px;
  min-height: 40px;
  padding: 0 16px;
  border: none;
  border-radius: 8px;
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.com-offer-claim-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .com-offer-claim-btn:not(:disabled):hover { opacity: 0.9; }
}

.com-offer-error {
  margin: 6px 0 0;
  font-size: 0.78rem;
  color: #ff8080;
}

@media (min-width: 640px) {
  .com-card {
    padding: 24px;
  }
}
</style>
