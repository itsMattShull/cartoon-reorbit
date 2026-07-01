<template>
  <img
    v-if="visible"
    :src="overlay.path"
    alt="Second Edition"
    class="se-overlay-icon"
    :style="styleFor(ctoon)"
    draggable="false"
  />
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useSecondEditionOverlay } from '@/composables/useSecondEditionOverlay'
import { useArtMode } from '@/composables/useArtMode'

const props = defineProps({
  ctoon: { type: Object, default: null },
  // Only cZone views should respect the viewer's Art Mode toggle
  respectArtMode: { type: Boolean, default: false }
})

const { overlay, ensureLoaded, styleFor } = useSecondEditionOverlay()
const artMode = useArtMode()

onMounted(ensureLoaded)

const visible = computed(() => {
  if (!props.ctoon?.isSecondEdition) return false
  if (!overlay.value.path) return false
  if (props.respectArtMode && artMode.value) return false
  return true
})
</script>

<style scoped>
.se-overlay-icon {
  z-index: 5;
}
</style>
