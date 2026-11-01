<template>
  <Teleport to="body">
    <div v-if="step !== 'ascend'" class="cpm-overlay" role="dialog" aria-modal="true" aria-labelledby="cpm-title">
      <div class="cpm-modal" role="document">
        <button type="button" class="cpm-close" aria-label="Close" @click="$emit('close')">✕</button>

        <template v-if="step === 'pick'">
          <div class="cpm-header">
            <h2 id="cpm-title" class="cpm-title">✦ Choose Your Prestige cMoon</h2>
            <p class="cpm-sub">
              Prestiging resets your cMoonPoints to 0 and moves you to a prestige cMoon — you keep
              every reward and achievement you've already earned.
            </p>
          </div>

          <div class="cpm-body">
            <div class="cpm-options" role="radiogroup" aria-labelledby="cpm-title">
              <button
                v-for="c in cmoons" :key="c.id"
                type="button"
                class="cpm-card"
                :class="{ 'cpm-card-selected': choice === c.id, 'cpm-card-dim': !!choice && choice !== c.id }"
                role="radio"
                :aria-checked="choice === c.id"
                @click="choice = c.id"
              >
                <span class="cpm-poster" :style="{ backgroundColor: safeColor(c.color) }">
                  <img
                    v-if="c.avatarPath && !imageErrors[c.id]"
                    :src="c.avatarPath" alt="" width="200" height="200" loading="lazy"
                    @error="imageErrors = { ...imageErrors, [c.id]: true }"
                  />
                  <span v-if="choice === c.id" class="cpm-badge" aria-hidden="true">✓</span>
                </span>
                <span class="cpm-card-name">{{ c.name }}</span>
                <span class="cpm-card-count">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
              </button>
            </div>
            <div v-if="!cmoons.length" class="cpm-empty">No prestige cMoons are available right now.</div>
          </div>

          <div v-if="error" class="cpm-error" role="alert">{{ error }}</div>

          <div class="cpm-footer">
            <button class="cpm-primary-btn" :disabled="!choice" @click="step = 'confirm'">Continue</button>
          </div>
        </template>

        <template v-else-if="step === 'confirm'">
          <div class="cpm-header">
            <h2 id="cpm-title" class="cpm-title">✦ Ascend to Prestige {{ status.nextLevel }}{{ status.nextLevelTitle ? ` — ${status.nextLevelTitle}` : '' }}?</h2>
          </div>

          <div class="cpm-body cpm-confirm-body">
            <p class="cpm-confirm-line">
              You're about to join <strong>{{ pickedCMoon?.name }}</strong> as a Prestige
              {{ status.nextLevel }} member.
            </p>
            <ul class="cpm-confirm-list">
              <li>Your cMoonPoints will reset to <strong>0</strong>.</li>
              <li>Your cMoon Enemy battle health will reset.</li>
              <li>You keep <strong>every reward and achievement</strong> you've already earned.</li>
              <li>This cannot be undone.</li>
            </ul>
          </div>

          <div v-if="error" class="cpm-error" role="alert">{{ error }}</div>

          <div class="cpm-footer">
            <button class="cpm-primary-btn cpm-primary-btn-epic" :disabled="submitting" @click="confirm">
              {{ submitting ? 'Ascending…' : '✦ Prestige Now ✦' }}
            </button>
            <button type="button" class="cpm-back-btn" :disabled="submitting" @click="step = 'pick'">Back</button>
          </div>
        </template>
      </div>
    </div>

    <!-- The epic moment itself — deliberately its own full-screen beat, separate from (and before)
         the destination cMoon's own join effect, so prestiging always feels like a bigger occasion
         than an ordinary team join even when the chosen cMoon has no custom join effect configured. -->
    <div v-else class="cpm-ascend-overlay" @click="continueAfterAscend">
      <div class="cpm-ascend-glow" aria-hidden="true"></div>
      <div class="cpm-ascend-content">
        <p class="cpm-ascend-eyebrow">✦ Prestige Unlocked ✦</p>
        <p class="cpm-ascend-level">PRESTIGE {{ result.prestigeLevel }}</p>
        <p v-if="result.prestigeLevelTitle" class="cpm-ascend-subtitle">{{ result.prestigeLevelTitle }}</p>
        <p class="cpm-ascend-welcome">Welcome to {{ result.cMoonName }}</p>
        <button type="button" class="cpm-ascend-continue" @click="continueAfterAscend">Continue →</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { cmoonJoinEffectDescriptor } from '~/utils/cmoonJoinEffectDescriptor'

const props = defineProps({
  status: { type: Object, required: true },
})
const emit = defineEmits(['close', 'prestiged'])

const cmoons = computed(() => props.status?.prestigeCMoons || [])
const choice = ref(null)
const pickedCMoon = computed(() => cmoons.value.find(c => c.id === choice.value) || null)
const imageErrors = ref({})
const step = ref('pick')
const submitting = ref(false)
const error = ref('')
const result = ref(null)

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3a4a63'
}

const router = useRouter()
const { play } = useFullscreenEffect()
const { open: openRewardModal } = useCMoonRewardModal()

async function confirm() {
  if (!choice.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const res = await $fetch('/api/cmoon/prestige', { method: 'POST', body: { cMoonId: choice.value } })
    result.value = res
    step.value = 'ascend'
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Unable to prestige right now. Please try again.'
  } finally {
    submitting.value = false
  }
}

function continueAfterAscend() {
  const prestigedResult = result.value
  const picked = pickedCMoon.value
  const goToCMoon = () => {
    router.push(`/newsite/cmoon/${prestigedResult.cMoonId}`)
    const prizes = prestigedResult?.prizes || []
    if (prizes.length) {
      openRewardModal({
        kind: 'prize',
        eyebrow: `Prestige ${prestigedResult.prestigeLevel} Rewards`,
        title: 'Ascension Complete!',
        items: prizes.map(p => ({ id: p.ctoonId, imagePath: p.assetPath, label: p.name, qty: p.quantity, variant: 'ctoon' })),
        note: 'On their way to your cToon collection.',
      })
    }
  }
  const descriptor = cmoonJoinEffectDescriptor(picked)
  if (descriptor) play(descriptor, { onComplete: goToCMoon })
  else goToCMoon()
  emit('prestiged', prestigedResult)
}

watch(() => step.value, async (v) => {
  if (typeof document === 'undefined') return
  // Same documentElement-lock reasoning as CMoonSelectModal — the newsite layout's `<html>`
  // carries the real scroll container.
  document.documentElement.style.overflow = v ? 'hidden' : ''
})
onMounted(() => { if (typeof document !== 'undefined') document.documentElement.style.overflow = 'hidden' })
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.documentElement.style.overflow = '' })
</script>

<style scoped>
.cpm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
  overscroll-behavior: contain;
}

.cpm-modal {
  width: 100%;
  max-width: 440px;
  max-height: 85vh;
  max-height: 85dvh;
  background: linear-gradient(160deg, #140a2e 0%, #0a1830 100%);
  border: 2px solid #8a5cf6;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  color: #fff;
  font-family: 'Nunito', sans-serif;
  position: relative;
}

.cpm-close {
  position: absolute;
  top: 0;
  right: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.1rem;
  cursor: pointer;
  z-index: 1;
}
.cpm-close:hover,
.cpm-close:focus-visible {
  color: #fff;
}

.cpm-header {
  padding: 16px 40px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.cpm-title {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 800;
}

.cpm-sub {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.cpm-body {
  padding: 12px 16px;
  overflow-y: auto;
}

.cpm-empty {
  padding: 20px 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.cpm-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 10px;
}

.cpm-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  text-align: left;
  cursor: pointer;
  min-height: 44px;
}

.cpm-card-selected {
  border-color: #c9a9ff;
  background: rgba(138, 92, 246, 0.18);
}

.cpm-card-dim {
  opacity: 0.55;
}

@media (hover: hover) and (pointer: fine) {
  .cpm-card:hover {
    border-color: rgba(201, 169, 255, 0.5);
  }
}

.cpm-poster {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.cpm-poster img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cpm-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(138, 92, 246, 0.35);
  color: #fff;
  font-size: 1.1rem;
  font-weight: 800;
}

.cpm-card-name {
  font-weight: 700;
  font-size: 0.82rem;
  word-break: break-word;
}

.cpm-card-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
}

.cpm-confirm-body {
  font-size: 0.85rem;
}

.cpm-confirm-line {
  margin: 0 0 10px;
}

.cpm-confirm-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.8rem;
}

.cpm-error {
  padding: 0 16px;
  font-size: 0.72rem;
  color: #ff8a8a;
}

.cpm-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cpm-primary-btn {
  width: 100%;
  min-height: 46px;
  border: none;
  border-radius: 8px;
  background: #6c3ce0;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.cpm-primary-btn:disabled {
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.62);
  cursor: not-allowed;
}

.cpm-primary-btn-epic {
  background: linear-gradient(90deg, #ff5ec0, #8a5cf6, #4fd6ff, #ff5ec0);
  background-size: 300% 100%;
  animation: cpm-btn-shimmer 3s linear infinite;
}

@keyframes cpm-btn-shimmer {
  0% { background-position: 0% 50%; }
  100% { background-position: 300% 50%; }
}

.cpm-back-btn {
  width: 100%;
  min-height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.cpm-back-btn:disabled {
  color: rgba(255, 255, 255, 0.35);
  cursor: not-allowed;
}

/* ── The Ascension moment ─────────────────────────────────────────────── */

.cpm-ascend-overlay {
  position: fixed;
  inset: 0;
  z-index: 9900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 45%, #1c0f3d 0%, #060310 75%);
  overflow: hidden;
  cursor: pointer;
}

.cpm-ascend-glow {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(circle at 50% 50%, rgba(255, 94, 192, 0.35), transparent 35%),
    radial-gradient(circle at 30% 70%, rgba(79, 214, 255, 0.3), transparent 40%),
    radial-gradient(circle at 70% 30%, rgba(138, 92, 246, 0.35), transparent 40%);
  animation: cpm-ascend-pulse 3.5s ease-in-out infinite;
}

@keyframes cpm-ascend-pulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.08); }
}

.cpm-ascend-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  animation: cpm-ascend-rise 0.6s ease-out;
}

@keyframes cpm-ascend-rise {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.cpm-ascend-eyebrow {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}

/* Holographic/prismatic shimmer: an animated multi-color gradient clipped to the text itself. */
.cpm-ascend-level {
  margin: 4px 0 0;
  font-size: clamp(2.2rem, 10vw, 4rem);
  font-weight: 900;
  letter-spacing: 0.02em;
  background: linear-gradient(100deg, #ff5ec0, #ffd75e, #4fd6ff, #8a5cf6, #ff5ec0);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
  animation: cpm-btn-shimmer 4s linear infinite;
  text-shadow: 0 0 40px rgba(138, 92, 246, 0.5);
}

.cpm-ascend-subtitle {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}

.cpm-ascend-welcome {
  margin: 10px 0 0;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.75);
}

.cpm-ascend-continue {
  margin-top: 26px;
  min-height: 46px;
  padding: 10px 28px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .cpm-ascend-continue:hover {
    background: rgba(255, 255, 255, 0.16);
  }
}
</style>
