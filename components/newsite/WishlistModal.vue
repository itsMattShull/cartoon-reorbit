<template>
  <Teleport to="body">
    <div class="wm-overlay" @mousedown.self="$emit('close')">
      <div class="wm-modal">

        <!-- Header -->
        <div class="wm-header">
          <span class="wm-title">Add to Wishlist</span>
          <button class="wm-close" @click="$emit('close')">✕</button>
        </div>

        <!-- Body -->
        <div class="wm-body">
          <div class="wm-preview">
            <img class="wm-preview-img" :src="ctoon.assetPath" :alt="ctoon.name" draggable="false" />
            <div class="wm-preview-info">
              <div class="wm-preview-name">{{ ctoon.name }}</div>
              <div class="wm-preview-meta">
                <span class="wm-rarity-badge" :class="`r-${rarityKey(ctoon.rarity)}`">{{ ctoon.rarity }}</span>
              </div>
            </div>
          </div>

          <hr class="wm-divider" />

          <div class="wm-field">
            <label class="wm-label">
              Points to offer <span class="wm-dim">(min 1)</span>
            </label>
            <input
              class="wm-input"
              type="number"
              v-model.number="offerInput"
              min="1"
              step="1"
              inputmode="numeric"
              @keyup.enter="confirm"
            />
            <div v-if="error" class="wm-error">{{ error }}</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="wm-footer">
          <button class="wm-cancel" @click="$emit('close')">Cancel</button>
          <button
            class="wm-submit"
            :disabled="confirmDisabled || processing"
            @click="confirm"
          >{{ processing ? 'Adding…' : 'Add to Wishlist' }}</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  ctoon: { type: Object, required: true },
})
const emit = defineEmits(['close', 'added'])

const { add } = useWishlist()

const offerInput = ref(1)
const error = ref('')
const processing = ref(false)

const confirmDisabled = computed(() =>
  !Number.isInteger(offerInput.value) || offerInput.value <= 0
)

async function confirm() {
  if (confirmDisabled.value) {
    error.value = 'Enter an integer greater than 0.'
    return
  }
  processing.value = true
  error.value = ''
  try {
    await add(props.ctoon.id, offerInput.value)
    emit('added', props.ctoon.id)
    emit('close')
  } catch (e) {
    error.value = e.data?.message || 'Failed to add to wishlist.'
  } finally {
    processing.value = false
  }
}

function rarityKey(r) { return (r || '').toLowerCase().replace(/\s+/g, '-') }
</script>

<style scoped>
.wm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}

.wm-modal {
  position: relative;
  width: 360px;
  max-width: 95vw;
  background: var(--OrbitDarkBlue);
  border: 2px solid var(--OrbitLightBlue);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.wm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--OrbitLightBlue);
  flex-shrink: 0;
}

.wm-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
  letter-spacing: 0.04em;
}

.wm-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.wm-close:hover { color: #fff; }

.wm-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.wm-preview {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.wm-preview-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  flex-shrink: 0;
  image-rendering: pixelated;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  padding: 3px;
  box-sizing: border-box;
}

.wm-preview-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.wm-preview-name {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
}

.wm-preview-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wm-rarity-badge {
  font-size: 0.6rem;
  font-weight: bold;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: capitalize;
}
.r-common       { background: #6b7280; color: #fff; }
.r-uncommon     { background: #e5e7eb; color: #111; }
.r-rare         { background: #16a34a; color: #fff; }
.r-very-rare    { background: #2563eb; color: #fff; }
.r-crazy-rare   { background: #7c3aed; color: #fff; }
.r-prize-only   { background: #111;    color: #e5e7eb; }
.r-code-only    { background: #ea580c; color: #fff; }
.r-auction-only { background: #eab308; color: #111; }

.wm-dim {
  font-size: 0.62rem;
  color: rgba(255, 255, 255, 0.45);
}

.wm-divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 0;
}

.wm-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.wm-label {
  font-size: 0.65rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255, 255, 255, 0.6);
}

.wm-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
}
.wm-input:focus { border-color: var(--OrbitLightBlue); }

.wm-error {
  font-size: 0.62rem;
  color: #fca5a5;
}

.wm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.wm-cancel {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.12s;
}
.wm-cancel:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }

.wm-submit {
  border: none;
  border-radius: 6px;
  background: var(--OrbitLightBlue);
  color: #fff;
  font-size: 0.65rem;
  font-weight: bold;
  padding: 5px 12px;
  cursor: pointer;
  transition: filter 0.12s;
  white-space: nowrap;
}
.wm-submit:not(:disabled):hover { filter: brightness(1.15); }
.wm-submit:disabled { opacity: 0.4; cursor: default; }
</style>
