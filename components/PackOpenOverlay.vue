<!-- components/PackOpenOverlay.vue
     Standalone copy of Cmart.vue's pack-opening sequence (glow → reveal grid),
     for pages that grant a sealed pack outside the cMart purchase flow (currently
     just the code-redeem page) but want the exact same opening experience.
     Deliberately not shared code with Cmart.vue: that component's buyPack() is a
     live purchase path, and importing/refactoring it to serve a second caller
     risks the purchase flow for a presentation-only parity ask. This copies the
     markup, timing and CSS (:global, same as Cmart.vue's own) verbatim instead. -->
<template>
  <Teleport to="body">
    <div v-if="overlayVisible" class="pack-overlay" @click.self="revealComplete && close()">
      <div class="pack-overlay-card">
        <button v-if="revealComplete" class="pack-overlay-close" @click="close">✕</button>

        <template v-if="openingStep === 'pack'">
          <CtoonImage :ctoon="openingPack" :src="openingPack?.imagePath" class="pack-overlay-img" alt="Pack" />
        </template>

        <template v-if="openingStep === 'reveal'">
          <div class="pack-reveal-grid">
            <div
              v-for="item in packContents"
              :key="item.id"
              class="pack-reveal-card"
              :class="{ 'pack-reveal-new': !originalOwnedSet.has(item.id) }"
            >
              <span v-if="!originalOwnedSet.has(item.id)" class="pack-new-badge">New!</span>
              <span v-if="!item.inCmart" class="pack-exclusive-badge">Pack Exclusive</span>
              <div class="pack-reveal-img-wrap">
                <CtoonImage
                  v-if="item.assetPath"
                  :ctoon="item"
                  :alt="item.name"
                  effects="full"
                  :ambient="false"
                  class="pack-reveal-img" />
                <SecondEditionOverlay :ctoon="item" />
              </div>
              <p class="pack-reveal-name">{{ item.name }}</p>
              <p class="pack-reveal-rarity">{{ item.rarity }}</p>
              <p class="pack-reveal-mint">Mint #{{ item.mintNumber }}</p>
            </div>
          </div>
          <p v-if="openError" class="pack-reveal-error">{{ openError }}</p>
          <button v-if="revealComplete" class="pack-reveal-close-btn" @click="close">Close</button>
        </template>
      </div>
    </div>
    <div v-if="showGlow" class="pack-glow" :class="glowStage" />
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'

const emit = defineEmits(['opened', 'closed'])

const overlayVisible = ref(false)
const showGlow        = ref(false)
const openingStep     = ref('pack')
const glowStage       = ref('hidden')
const revealComplete  = ref(false)
const openingPack     = ref(null)
const packContents    = ref([])
const originalOwnedSet = ref(new Set())
const openError       = ref('')

function resetSequence() {
  openingStep.value    = 'pack'
  glowStage.value       = 'hidden'
  revealComplete.value  = false
  showGlow.value        = false
  packContents.value    = []
  openError.value        = ''
}

/** pack: { userPackId, name, imagePath } */
async function open(pack) {
  openingPack.value = pack
  resetSequence()
  overlayVisible.value = true
  showGlow.value        = true

  try {
    const res = await $fetch('/api/cmart/self/owned', { credentials: 'include' })
    originalOwnedSet.value = new Set(Array.isArray(res?.ownedCtoonIds) ? res.ownedCtoonIds : [])
  } catch {
    originalOwnedSet.value = new Set()
  }

  setTimeout(() => { glowStage.value = 'expand' }, 2000)

  setTimeout(async () => {
    try {
      packContents.value = await $fetch('/api/cmart/open-pack', {
        query: { id: pack.userPackId }
      })
      emit('opened', packContents.value)
    } catch (e) {
      openError.value = e?.data?.statusMessage || 'Failed to open pack.'
    }
    openingStep.value    = 'reveal'
    revealComplete.value = true
    glowStage.value      = 'fade'
  }, 3000)

  setTimeout(() => {
    showGlow.value  = false
    glowStage.value = 'hidden'
  }, 6000)
}

function close() {
  overlayVisible.value = false
  emit('closed')
}

defineExpose({ open })
</script>

<style>
/* Unscoped on purpose, same as Cmart.vue's own :global() rules for these exact
   class names — this overlay is teleported to <body>, outside any component's
   scoped-style boundary. */
.pack-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.pack-overlay-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.pack-overlay-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #555;
  line-height: 1;
}

.pack-overlay-img {
  max-width: 100%;
  max-height: 60vh;
  object-fit: contain;
}

.pack-reveal-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

.pack-reveal-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f5f8ff;
  border: 2px solid #c7d8f0;
  border-radius: 8px;
  padding: 10px 8px;
  gap: 4px;
}

.pack-reveal-new {
  border-color: #16a34a;
  animation: cardGlow 1.5s ease-in-out infinite alternate;
}

.pack-new-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  background: #16a34a;
  color: #fff;
  font-size: 0.6rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 10px;
}

.pack-exclusive-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #7c3aed;
  color: #fff;
  font-size: 0.56rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 10px;
  text-align: right;
}

.pack-reveal-img-wrap {
  position: relative;
  display: inline-block;
  margin-top: 16px;
}

.pack-reveal-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  display: block;
}

.pack-reveal-name {
  font-size: 0.75rem;
  font-weight: bold;
  text-align: center;
  color: #1a2a40;
  margin: 0;
}

.pack-reveal-rarity {
  font-size: 0.65rem;
  color: #556;
  margin: 0;
  text-transform: capitalize;
}

.pack-reveal-mint {
  font-size: 0.6rem;
  color: #889;
  margin: 0;
}

.pack-reveal-error {
  width: 100%;
  text-align: center;
  font-size: 0.75rem;
  color: #dc2626;
  margin: 0;
}

.pack-reveal-close-btn {
  margin-top: 8px;
  padding: 8px 24px;
  background: var(--OrbitDarkBlue, #336699);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: bold;
  cursor: pointer;
  align-self: stretch;
}

.pack-reveal-close-btn:hover {
  background: var(--OrbitLightBlue, #3399CC);
}

/* ── Glow effect ─────────────────────────────────────────────── */
.pack-glow {
  position: fixed;
  top: 50%;
  left: 50%;
  width: 1vw;
  height: 1vh;
  background: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1100;
}

.pack-glow.expand {
  animation: expandGlow 2s ease-out forwards;
}

.pack-glow.fade {
  animation:
    expandGlow 2s ease-out forwards,
    fadeGlow   1s ease-in 2s forwards;
}

@keyframes expandGlow {
  from { width: 1vw; height: 1vh; opacity: 1; }
  to   { width: 300vw; height: 300vh; opacity: 1; }
}

@keyframes fadeGlow {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes cardGlow {
  from { box-shadow: 0 0 4px #16a34a; }
  to   { box-shadow: 0 0 16px #16a34a; }
}

@media (max-width: 768px) {
  .pack-reveal-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
