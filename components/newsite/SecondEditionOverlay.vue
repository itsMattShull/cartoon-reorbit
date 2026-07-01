<template>
  <img
    v-if="visible"
    ref="rootEl"
    :src="overlay.path"
    alt="Second Edition"
    class="se-overlay-icon"
    :style="pixelStyle"
    draggable="false"
  />
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useSecondEditionOverlay, SECOND_EDITION_PREVIEW_SIZE } from '@/composables/useSecondEditionOverlay'
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

// The wrapping container (e.g. a card thumbnail slot) isn't always the same
// aspect ratio as the cToon's own image — the image is rendered with
// object-fit:contain inside it, so it can be letterboxed. Measuring the
// sibling <img>'s actual visible content rect (not just the container box)
// keeps the overlay locked to the artwork itself — including when a cZone
// item is resized to small/normal/large — instead of drifting into the
// letterboxed empty space.
const rootEl = ref(null)
const contentRect = ref(null) // { left, top, width, height } in px, relative to the shared parent
let resizeObserver = null
let siblingImg = null

function findSiblingImg() {
  const parent = rootEl.value?.parentElement
  if (!parent) return null
  return parent.querySelector('img:not(.se-overlay-icon)')
}

function measure() {
  const img = siblingImg
  const parent = img?.parentElement
  if (!img || !parent || !img.naturalWidth || !img.naturalHeight) { contentRect.value = null; return }

  const box = parent.getBoundingClientRect()
  if (!box.width || !box.height) { contentRect.value = null; return }

  const boxAspect = box.width / box.height
  const imgAspect = img.naturalWidth / img.naturalHeight

  // When the container's aspect ratio matches the image's, the image fills the
  // box with no object-fit letterboxing — so the pixel-measured content rect is
  // identical to the simpler percentage-based styleFor(), and we defer to it.
  // This matters because getBoundingClientRect() above returns *transform-scaled*
  // pixels: inside a scaled ancestor (e.g. the cZone canvas's
  // `transform: scale()`), those px would be mis-applied in the un-scaled layout
  // space of the absolutely-positioned overlay, shrinking the icon and pulling
  // it toward the top-left by the scale factor. Percentages, by contrast, are
  // invariant to ancestor transforms, so styleFor() keeps the icon locked to the
  // artwork at every canvas scale. The pixel path is only needed where the image
  // is genuinely letterboxed (aspect mismatch), and those call sites are never
  // inside a transform.
  const ASPECT_EPSILON = 0.01
  if (Math.abs(boxAspect - imgAspect) < ASPECT_EPSILON) { contentRect.value = null; return }

  let width, height
  if (imgAspect > boxAspect) {
    // Image is relatively wider than the box: full width, letterboxed top/bottom.
    width = box.width
    height = box.width / imgAspect
  } else {
    // Image is relatively taller than the box: full height, letterboxed left/right.
    height = box.height
    width = box.height * imgAspect
  }

  contentRect.value = {
    left: (box.width - width) / 2,
    top: (box.height - height) / 2,
    width,
    height
  }
}

function attach() {
  siblingImg = findSiblingImg()
  if (!siblingImg) return
  if (siblingImg.complete) measure()
  siblingImg.addEventListener('load', measure)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(siblingImg.parentElement)
  }
}

function detach() {
  if (siblingImg) siblingImg.removeEventListener('load', measure)
  if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null }
  siblingImg = null
}

onMounted(async () => {
  if (!visible.value) return
  await nextTick()
  attach()
})

onBeforeUnmount(detach)

watch(visible, async (v) => {
  detach()
  if (!v) { contentRect.value = null; return }
  await nextTick()
  attach()
})

const pixelStyle = computed(() => {
  const rect = contentRect.value
  // Before the sibling image resolves its natural size (first paint), fall
  // back to the simple container-relative % so the icon isn't invisible.
  if (!rect) return styleFor(props.ctoon)

  const x = props.ctoon?.secondEditionOverlayX ?? 85
  const y = props.ctoon?.secondEditionOverlayY ?? 85
  const size = props.ctoon?.secondEditionOverlaySize ?? 100
  const naturalWidth = overlay.value.width || 32
  const widthPx = (naturalWidth / SECOND_EDITION_PREVIEW_SIZE) * (size / 100) * rect.width

  return {
    position: 'absolute',
    left: `${rect.left + (x / 100) * rect.width}px`,
    top: `${rect.top + (y / 100) * rect.height}px`,
    transform: 'translate(-50%, -50%)',
    width: `${widthPx}px`,
    height: 'auto',
    maxWidth: '60%',
    pointerEvents: 'none',
    objectFit: 'contain'
  }
})

// Exposed so callers that need to convert pointer coordinates into the same
// X/Y% reference frame (e.g. the admin drag-to-position preview) can read
// the currently-measured content rect instead of assuming the full container.
defineExpose({ contentRect })
</script>

<style scoped>
.se-overlay-icon {
  z-index: 5;
}
</style>
