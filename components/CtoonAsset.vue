<template>
  <button
    type="button"
    :class="['ctoon-asset-button', buttonClass]"
    :aria-label="ariaLabel"
    @click="handleClick"
  >
    <div class="relative inline-flex items-center justify-center">
      <ProgressiveImage
        v-if="progressive"
        :src="src"
        :alt="alt"
        :image-class="imageClass"
        :placeholder-height="placeholderHeight"
      />
      <img v-else :src="src" :alt="alt" :class="imageClass" />
      <GtoonOverlay
        v-if="showGtoonOverlay"
        :power="power"
        :cost="cost"
      />
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import ProgressiveImage from '@/components/ProgressiveImage.vue'
import GtoonOverlay from '@/components/GtoonOverlay.vue'
import { useCtoonModal } from '@/composables/useCtoonModal'

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  name: { type: String, default: '' },
  ctoonId: { type: String, default: '' },
  userCtoonId: { type: String, default: '' },
  imageClass: { type: String, default: '' },
  buttonClass: { type: String, default: '' },
  progressive: { type: Boolean, default: false },
  placeholderHeight: { type: String, default: '8rem' },
  stopPropagation: { type: Boolean, default: false },
  isGtoon: { type: Boolean, default: false },
  power: { type: [Number, String], default: null },
  cost: { type: [Number, String], default: null }
})

const emit = defineEmits(['click'])
const { open } = useCtoonModal()

const ariaLabel = computed(() => props.alt || props.name || 'View cToon details')
const canOpen = computed(() => !!(props.ctoonId || props.userCtoonId))
const showGtoonOverlay = computed(() =>
  props.isGtoon && props.power != null && props.cost != null
)

function handleClick(event) {
  if (props.stopPropagation) event.stopPropagation()
  emit('click', event)
  if (!canOpen.value) return
  open({
    ctoonId: props.ctoonId || null,
    userCtoonId: props.userCtoonId || null,
    assetPath: props.src,
    name: props.name || props.alt
  })
}
</script>

<style scoped>
.ctoon-asset-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent !important;
  background-color: transparent !important;
  cursor: pointer;
}
</style>
