<template>
  <button
    @click="disabled ? undefined : $emit('toggle')"
    :disabled="disabled"
    :aria-pressed="selected ? 'true' : 'false'"
    :class="['tc', { 'tc--selected': selected, 'tc--disabled': disabled }]"
  >
    <!-- Header: splash bg + image -->
    <div class="tc-header">
      <img
        :src="ctoon.assetPath"
        :alt="ctoon.name"
        class="tc-img"
        loading="lazy"
        draggable="false"
      />
      <SecondEditionOverlay :ctoon="ctoon" />
      <!-- Owned / Unowned badge -->
      <span v-if="badge" class="tc-badge" :class="badgeClassComputed">{{ badge }}</span>
      <!-- In Trade overlay -->
      <span v-if="disabled" class="tc-in-trade">In Trade</span>
      <!-- Selected indicator -->
      <span v-if="selected" class="tc-selected-pip">✓</span>
    </div>

    <!-- Middle: name + rarity -->
    <div class="tc-middle">
      <span class="tc-name">{{ ctoon.name }}</span>
      <span class="tc-rarity" :class="`r-${rarityKey}`">{{ rarityShort }}</span>
    </div>

    <!-- Footer: mint info -->
    <div class="tc-footer">
      <span v-if="ctoon.mintNumber != null" class="tc-mint">
        #{{ ctoon.mintNumber }}<template v-if="quantityDisplay"> / {{ quantityDisplay }}</template>
      </span>
      <span v-if="hasEdition" class="tc-edition">{{ editionLabel }}</span>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { formatQuantity } from '~/utils/formatQuantity'

const props = defineProps({
  ctoon: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  badge: { type: String, default: '' },
  badgeClassOwned: { type: String, default: 'tc-badge--owned' },
  badgeClassUnowned: { type: String, default: 'tc-badge--unowned' },
})

defineEmits(['toggle'])

const badgeClassComputed = computed(() => {
  const b = String(props.badge).toLowerCase()
  return b.includes('unowned') ? props.badgeClassUnowned : props.badgeClassOwned
})

const hasEdition = computed(() => typeof props.ctoon.isFirstEdition === 'boolean')
const editionLabel = computed(() =>
  props.ctoon.isFirstEdition ? '1st Ed' : 'Unlim'
)

const quantityDisplay = computed(() => {
  if (!('quantity' in props.ctoon)) return ''
  return formatQuantity(props.ctoon.quantity)
})

const RARITY_MAP = {
  'common': 'C', 'uncommon': 'U', 'rare': 'R', 'very rare': 'VR',
  'crazy rare': 'CR', 'prize only': 'PO', 'code only': 'CO', 'auction only': 'AO',
}
const rarityShort = computed(() => RARITY_MAP[(props.ctoon.rarity || '').toLowerCase()] || props.ctoon.rarity || '?')
const rarityKey = computed(() => (props.ctoon.rarity || '').toLowerCase().replace(/\s+/g, '-'))
</script>

<style scoped>
/* ── Card shell ── */
.tc {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  background: var(--OrbitDarkBlue, #336699);
  border: 2px solid #1a4a7a;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
  text-align: left;
  padding: 0;
}

.tc:hover:not(.tc--disabled) {
  border-color: rgba(51,153,204,0.6);
}

.tc--selected {
  border-color: var(--OrbitLightBlue, #3399CC);
  box-shadow: 0 0 0 1px var(--OrbitLightBlue, #3399CC);
}

.tc--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ── Header (splash + image) ── */
.tc-header {
  position: relative;
  flex: 1;
  min-height: 0;
  background: url('/images/newsite/infocardSplash.png') top / 100% 100% no-repeat;
  overflow: hidden;
  /* Inset padding lets the splash show as a frame without shrinking the image via transform */
  padding: 8px;
  box-sizing: border-box;
}

.tc-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  /* No transform — padding on the header creates the splash border effect instead */
}

/* ── Overlays ── */
.tc-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  font-size: 0.52rem;
  font-weight: bold;
  padding: 1px 5px;
  border-radius: 9999px;
  white-space: nowrap;
}

.tc-badge--owned {
  background: #16a34a;
  color: #fff;
  border: 1px solid #15803d;
}

.tc-badge--unowned {
  background: #dc2626;
  color: #fff;
  border: 1px solid #b91c1c;
}

.tc-badge--blue {
  background: #16a34a;
  color: #fff;
  border: 1px solid #15803d;
}

.tc-in-trade {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 0.52rem;
  font-weight: bold;
  padding: 1px 4px;
  border-radius: 9999px;
  background: rgba(251,191,36,0.25);
  color: #fbbf24;
  border: 1px solid rgba(251,191,36,0.35);
}

.tc-selected-pip {
  position: absolute;
  top: 3px;
  left: 3px;
  font-size: 0.7rem;
  font-weight: bold;
  color: #fff;
  background: #7c3aed;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  box-shadow: 0 0 0 2px rgba(124,58,237,0.4), 0 1px 4px rgba(0,0,0,0.5);
}

/* ── Middle: name + rarity ── */
.tc-middle {
  height: 18px;
  min-height: 18px;
  max-height: 18px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  gap: 3px;
  overflow: hidden;
}

.tc-name {
  font-size: 0.6rem;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

.tc-rarity {
  flex-shrink: 0;
  font-size: 0.52rem;
  font-weight: bold;
  padding: 1px 3px;
  border-radius: 3px;
  white-space: nowrap;
}

/* ── Footer: mint + edition ── */
.tc-footer {
  height: 20px;
  min-height: 20px;
  max-height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 4px;
  overflow: hidden;
}

.tc-mint {
  font-size: 0.52rem;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-edition {
  font-size: 0.5rem;
  color: rgba(255,255,255,0.38);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Rarity colour badges (match AuctionHouse) ── */
.r-common        { background: #6b7280; color: #fff; }
.r-uncommon      { background: #e5e7eb; color: #111; }
.r-rare          { background: #16a34a; color: #fff; }
.r-very-rare     { background: #2563eb; color: #fff; }
.r-crazy-rare    { background: #7c3aed; color: #fff; }
.r-prize-only    { background: #111;    color: #e5e7eb; }
.r-code-only     { background: #ea580c; color: #fff; }
.r-auction-only  { background: #eab308; color: #111; }
</style>
