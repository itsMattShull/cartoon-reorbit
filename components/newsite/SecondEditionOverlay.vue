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

  // Measure the *image's own layout box* (offset* metrics) rather than the parent
  // box. These are LAYOUT pixels — immune to ancestor CSS transforms such as the
  // cZone canvas's `.cz-canvas-inner { transform: scale() }` — so measurement and
  // the overlay's absolute placement below share one coordinate frame (the
  // ancestor transform then scales the overlay and artwork together, uniformly).
  // Using the image's box (not the parent's) also honours any padding on the
  // parent: some cards inset the art with padding (e.g. the trade card's
  // `.tc-header`), and the image is laid out inside that padding. offset* are
  // relative to offsetParent, which for a positioned parent is the same element
  // the absolutely-positioned overlay resolves left/top against, so they align.
  const sameFrame = img.offsetParent === parent
  const boxLeft = sameFrame ? img.offsetLeft : 0
  const boxTop  = sameFrame ? img.offsetTop  : 0
  const boxW = img.offsetWidth
  const boxH = img.offsetHeight
  if (!boxW || !boxH) { contentRect.value = null; return }

  const boxAspect = boxW / boxH
  const imgAspect = img.naturalWidth / img.naturalHeight

  // object-fit: contain letterbox of the artwork within the image's layout box.
  let width, height
  if (imgAspect > boxAspect) {
    // Image is relatively wider than the box: full width, letterboxed top/bottom.
    width = boxW
    height = boxW / imgAspect
  } else {
    // Image is relatively taller than the box: full height, letterboxed left/right.
    height = boxH
    width = boxH * imgAspect
  }
  let left = boxLeft + (boxW - width) / 2
  let top  = boxTop + (boxH - height) / 2

  // Honour the image's own CSS transform. Card thumbnails shrink the art with
  // `transform: scale(0.7)` while keeping the wrapper full-size for corner badges;
  // the overlay is a sibling without that transform, so bake the scale into the
  // content rect — scaling about the image-box centre (the default
  // transform-origin) — so the icon tracks the visibly-shrunk artwork rather than
  // the full box. Elements without an own transform (czone, modals, admin) read
  // scale 1 and are unaffected.
  const { sx, sy } = readImageScale(img)
  if (sx !== 1 || sy !== 1) {
    const cx = boxLeft + boxW / 2
    const cy = boxTop + boxH / 2
    left = cx + (left - cx) * sx
    top  = cy + (top - cy) * sy
    width *= sx
    height *= sy
  }

  contentRect.value = { left, top, width, height }
}

// Reads the element's own CSS transform scale (default 1×1) from its computed
// style. Client-only (called from measure()); guarded so a missing DOMMatrix or
// an unparseable value degrades to no scaling rather than throwing.
function readImageScale(img) {
  try {
    const t = getComputedStyle(img).transform
    if (!t || t === 'none') return { sx: 1, sy: 1 }
    const m = new DOMMatrix(t)
    return { sx: m.a, sy: m.d }
  } catch {
    return { sx: 1, sy: 1 }
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
