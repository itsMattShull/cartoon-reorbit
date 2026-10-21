<template>
  <button
    @click="disabled ? undefined : $emit('toggle')"
    :disabled="disabled"
    :aria-pressed="selected ? 'true' : 'false'"
    :class="['tc', 'pc', { 'tc--selected': selected, 'tc--disabled': disabled }]"
  >
    <div class="tc-header">
      <img v-if="pack.imagePath" :src="pack.imagePath" :alt="pack.name" class="tc-img" loading="lazy" draggable="false" />
      <span v-if="disabled && !selected" class="tc-in-trade">{{ disabledLabel }}</span>
      <span v-if="selected" class="tc-selected-pip">✓</span>
    </div>
    <div class="tc-middle">
      <span class="tc-name">{{ pack.name }}</span>
    </div>
  </button>
</template>

<script setup>
defineProps({
  pack: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  disabledLabel: { type: String, default: 'Unavailable' },
})
defineEmits(['toggle'])
</script>

<style scoped>
/* Same shell as CtoonCard.vue (.tc) — kept visually consistent with the cToon
   picker. Packs have no rarity/mint/edition, so .tc-footer is simply omitted. */
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
.tc:hover:not(.tc--disabled) { border-color: rgba(51,153,204,0.6); }
.tc--selected {
  border-color: var(--OrbitLightBlue, #3399CC);
  box-shadow: 0 0 0 1px var(--OrbitLightBlue, #3399CC);
}
.tc--disabled { cursor: not-allowed; }
.tc--disabled .tc-img,
.tc--disabled .tc-middle { opacity: 0.45; }
.tc--disabled .tc-header { filter: grayscale(0.65); }
.tc-header {
  position: relative;
  flex: 1;
  min-height: 0;
  background: url('/images/newsite/infocardSplash.png') top / 100% 100% no-repeat;
  overflow: hidden;
  padding: 8px;
  box-sizing: border-box;
}
.tc-img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
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
.tc-middle {
  height: 24px;
  min-height: 24px;
  max-height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
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
</style>
