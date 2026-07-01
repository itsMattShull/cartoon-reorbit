<template>
  <div class="sef">
    <label class="sef-checkbox">
      <input type="checkbox" :checked="modelValue.isSecondEdition" @change="setField('isSecondEdition', $event.target.checked)" />
      <span>Is Second Edition</span>
    </label>
    <p v-if="autoNote" class="sef-note">{{ autoNote }}</p>

    <!-- Related First Edition autocomplete -->
    <div v-if="modelValue.isSecondEdition" class="sef-related">
      <label class="sef-label">Related First Edition cToon</label>
      <div class="sef-autocomplete">
        <input
          v-model="query"
          type="text"
          class="sef-input"
          placeholder="Type a cToon name (3+ characters)..."
          @focus="showDropdown = true"
          @blur="onBlur"
        />
        <ul v-if="showDropdown && results.length" class="sef-dropdown">
          <li v-for="r in results" :key="r.id" class="sef-dropdown-item" @mousedown.prevent="selectResult(r)">
            <img v-if="r.assetPath" :src="r.assetPath" :alt="r.name" class="sef-dropdown-thumb" />
            <span class="sef-dropdown-name">{{ r.name }}</span>
          </li>
        </ul>
        <p v-else-if="showDropdown && query.trim().length >= 3 && !searching" class="sef-no-results">No matches.</p>
      </div>
    </div>

    <!-- Preview + position controls -->
    <div v-if="modelValue.isSecondEdition && showPositionEditor" class="sef-preview-wrap">
      <label class="sef-label">Second Edition Preview</label>
      <div
        ref="previewEl"
        class="sef-preview"
        :style="{ width: previewSize + 'px', height: previewSize + 'px' }"
        @pointerdown="startDrag"
      >
        <img v-if="ctoonImageSrc" :src="ctoonImageSrc" alt="cToon preview" class="sef-preview-img" draggable="false" />
        <SecondEditionOverlay v-if="overlay.path" ref="overlayComp" :ctoon="previewCtoon" />
        <p v-else class="sef-no-overlay">No Second Edition overlay image is set. Upload one in Global Settings → Second Editions.</p>
      </div>
      <p class="sef-hint">Drag the icon on the preview, or use the fine-tune controls below.</p>

      <div class="sef-controls">
        <div class="sef-control-row">
          <span class="sef-control-label">X Position</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlayX', -1)" @pointerup="stopRepeat" @pointerleave="stopRepeat">−</button>
          <span class="sef-control-value">{{ Math.round(modelValue.overlayX) }}%</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlayX', 1)" @pointerup="stopRepeat" @pointerleave="stopRepeat">+</button>
        </div>
        <div class="sef-control-row">
          <span class="sef-control-label">Y Position</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlayY', -1)" @pointerup="stopRepeat" @pointerleave="stopRepeat">−</button>
          <span class="sef-control-value">{{ Math.round(modelValue.overlayY) }}%</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlayY', 1)" @pointerup="stopRepeat" @pointerleave="stopRepeat">+</button>
        </div>
        <div class="sef-control-row">
          <span class="sef-control-label">Size</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlaySize', -5)" @pointerup="stopRepeat" @pointerleave="stopRepeat">−</button>
          <span class="sef-control-value">{{ Math.round(modelValue.overlaySize) }}%</span>
          <button type="button" class="sef-step-btn" @pointerdown="startRepeat('overlaySize', 5)" @pointerup="stopRepeat" @pointerleave="stopRepeat">+</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useSecondEditionOverlay, SECOND_EDITION_PREVIEW_SIZE } from '@/composables/useSecondEditionOverlay'

const props = defineProps({
  modelValue: { type: Object, required: true },
  ctoonImageSrc: { type: String, default: '' },
  excludeCtoonId: { type: String, default: '' },
  showPositionEditor: { type: Boolean, default: true },
  autoNote: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const { overlay, ensureLoaded } = useSecondEditionOverlay()
const previewSize = SECOND_EDITION_PREVIEW_SIZE
onMounted(ensureLoaded)

function setField(key, value) {
  const next = { ...props.modelValue, [key]: value }
  if (key === 'isSecondEdition' && value) {
    if (next.overlayX == null) next.overlayX = 85
    if (next.overlayY == null) next.overlayY = 85
    if (next.overlaySize == null) next.overlaySize = 100
  }
  emit('update:modelValue', next)
}

const previewCtoon = computed(() => ({
  isSecondEdition: true,
  secondEditionOverlayX: props.modelValue.overlayX,
  secondEditionOverlayY: props.modelValue.overlayY,
  secondEditionOverlaySize: props.modelValue.overlaySize
}))

/* ── Related First Edition autocomplete ── */
const query = ref(props.modelValue.relatedFirstEditionName || '')
const results = ref([])
const showDropdown = ref(false)
const searching = ref(false)
let searchTimer = null

watch(() => props.modelValue.relatedFirstEditionName, (next) => {
  if (next !== query.value) query.value = next || ''
})

watch(query, (next) => {
  if (searchTimer) clearTimeout(searchTimer)
  const trimmed = next.trim()
  if (trimmed !== (props.modelValue.relatedFirstEditionName || '')) {
    setField('relatedFirstEditionId', null)
    emit('update:modelValue', { ...props.modelValue, relatedFirstEditionId: null, relatedFirstEditionName: next })
  }
  if (trimmed.length < 3) { results.value = []; return }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const res = await $fetch('/api/admin/search-ctoons', {
        query: { q: trimmed, excludeSecondEdition: 'true', excludeId: props.excludeCtoonId || '' }
      })
      results.value = Array.isArray(res) ? res : []
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 300)
})

function selectResult(r) {
  query.value = r.name
  showDropdown.value = false
  emit('update:modelValue', { ...props.modelValue, relatedFirstEditionId: r.id, relatedFirstEditionName: r.name })
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false }, 150)
}

onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })

/* ── Drag-to-position on preview ── */
const previewEl = ref(null)
const overlayComp = ref(null)
let dragging = false

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)) }

function positionFromPointer(e) {
  const rect = previewEl.value.getBoundingClientRect()
  // Convert pointer position into the same reference frame the overlay
  // actually renders against — the cToon image's visible content rect
  // (which can be smaller than the full preview box if the image isn't
  // square), falling back to the full box before that's measured.
  const content = overlayComp.value?.contentRect
  const originX = content ? rect.left + content.left : rect.left
  const originY = content ? rect.top + content.top : rect.top
  const spanX = content ? content.width : rect.width
  const spanY = content ? content.height : rect.height
  const x = clamp(((e.clientX - originX) / spanX) * 100, 0, 100)
  const y = clamp(((e.clientY - originY) / spanY) * 100, 0, 100)
  emit('update:modelValue', { ...props.modelValue, overlayX: x, overlayY: y })
}

function startDrag(e) {
  dragging = true
  positionFromPointer(e)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', stopDrag, { once: true })
}
function onDragMove(e) {
  if (!dragging) return
  positionFromPointer(e)
}
function stopDrag() {
  dragging = false
  window.removeEventListener('pointermove', onDragMove)
}

/* ── Hold-to-repeat +/- controls ── */
let repeatTimeout = null
let repeatInterval = null

const STEP_LIMITS = {
  overlayX: [0, 100],
  overlayY: [0, 100],
  overlaySize: [10, 400]
}

function applyStep(key, delta) {
  const [min, max] = STEP_LIMITS[key]
  const next = clamp((props.modelValue[key] ?? 0) + delta, min, max)
  emit('update:modelValue', { ...props.modelValue, [key]: next })
}

function startRepeat(key, delta) {
  applyStep(key, delta)
  repeatTimeout = setTimeout(() => {
    repeatInterval = setInterval(() => applyStep(key, delta), 80)
  }, 350)
}
function stopRepeat() {
  if (repeatTimeout) { clearTimeout(repeatTimeout); repeatTimeout = null }
  if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null }
}

onBeforeUnmount(() => {
  stopRepeat()
  window.removeEventListener('pointermove', onDragMove)
})
</script>

<style scoped>
.sef { margin-top: 1rem; }
.sef-checkbox { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; cursor: pointer; }
.sef-note { font-size: 0.8rem; color: #6b7280; margin: 0.25rem 0 0; }
.sef-label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 500; }
.sef-related { margin-top: 0.5rem; }

.sef-autocomplete { position: relative; }
.sef-input { width: 100%; border: 1px solid #d1d5db; border-radius: 0.375rem; padding: 0.5rem; box-sizing: border-box; }
.sef-dropdown {
  position: absolute;
  z-index: 20;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 240px;
  overflow-y: auto;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  box-shadow: 0 4px 10px rgba(0,0,0,0.1);
}
.sef-dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  min-height: 44px;
  cursor: pointer;
  box-sizing: border-box;
}
.sef-dropdown-item:hover { background: #f3f4f6; }
.sef-dropdown-thumb { width: 32px; height: 32px; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; background: white; flex-shrink: 0; }
.sef-dropdown-name { font-size: 0.9rem; }
.sef-no-results { font-size: 0.8rem; color: #6b7280; margin: 0.25rem 0 0; }

.sef-preview-wrap { margin-top: 0.75rem; }
.sef-preview {
  position: relative;
  width: 220px;
  height: 220px;
  max-width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 20px 20px;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}
.sef-preview-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.sef-no-overlay { font-size: 0.78rem; color: #9ca3af; padding: 0.75rem; margin: 0; }
.sef-hint { font-size: 0.75rem; color: #6b7280; margin: 0.35rem 0 0; }

.sef-controls { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.6rem; max-width: 220px; }
.sef-control-row { display: flex; align-items: center; gap: 0.5rem; }
.sef-control-label { flex: 1; font-size: 0.8rem; color: #374151; }
.sef-control-value { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; font-size: 0.85rem; }
.sef-step-btn {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  background: #f9fafb;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  touch-action: manipulation;
}
.sef-step-btn:hover { background: #f3f4f6; }
.sef-step-btn:active { background: #e5e7eb; }
</style>
