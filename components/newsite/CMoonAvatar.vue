<template>
  <span class="cma-root">
    <img
      v-if="avatarPath && !imgError"
      :src="avatarPath"
      alt=""
      width="128"
      height="128"
      loading="eager"
      class="cma-img"
      @error="imgError = true"
    />
    <span v-else class="cma-fallback" :style="fallbackStyle" aria-hidden="true">{{ initial }}</span>
  </span>
</template>

<script setup>
// Shared "cMoon logo" presentation: an uploaded avatar image, or a color-swatch-with-initial
// fallback when none is uploaded (or it fails to load). Used by the cMoons navigation grid;
// pulled out on its own rather than re-implemented per consumer (CMoonNavModal.vue and
// CMoonSelectModal.vue each hand-roll their own color-swatch fallback today).
import { ref, computed, watch } from 'vue'
import { cMoonPillStyle } from '~/utils/cmoonColor'

const props = defineProps({
  avatarPath: { type: String, default: '' },
  color: { type: String, default: '' },
  name: { type: String, default: '' },
})

const imgError = ref(false)
watch(() => props.avatarPath, () => { imgError.value = false })

const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase() || '?')

// Reuses the same contrast-safe pill styling as everywhere else a cMoon's admin-chosen color
// renders behind text (utils/cmoonColor.js) — never a raw `:style` string built from `color`.
const fallbackStyle = computed(() => cMoonPillStyle(props.color))
</script>

<style scoped>
.cma-root {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.cma-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cma-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-weight: 800;
  font-size: 2.2rem;
  line-height: 1;
  user-select: none;
}
</style>
