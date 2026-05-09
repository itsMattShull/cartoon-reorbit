<template>
  <div v-if="story && sessionId" class="sh-backdrop" @click.self="onBackdrop">
    <div class="sh-modal">

      <!-- Header -->
      <div class="sh-header">
        <span class="sh-title">{{ story?.title || 'Scavenger Hunt' }}</span>
      </div>

      <!-- Body -->
      <div class="sh-body">
        <template v-if="!result">
          <div v-if="step" class="sh-step">
            <img v-if="step.imagePath" :src="step.imagePath" alt="" class="sh-step-img" />
            <p class="sh-desc">{{ step.description }}</p>
            <div class="sh-choices">
              <button :disabled="loading" class="sh-btn sh-btn-primary" @click="choose('A')">
                {{ step.optionA }}
              </button>
              <button :disabled="loading" class="sh-btn sh-btn-secondary" @click="choose('B')">
                {{ step.optionB }}
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="sh-result">
            <template v-if="result.type === 'NOTHING'">
              <p class="sh-result-title">You found nothing this time.</p>
              <p v-if="result.text" class="sh-result-sub">{{ result.text }}</p>
            </template>
            <template v-else-if="result.type === 'POINTS'">
              <p class="sh-result-title">You won {{ Number(result.points).toLocaleString() }} points! 🎉</p>
              <p v-if="result.text" class="sh-result-sub">{{ result.text }}</p>
            </template>
            <template v-else>
              <p class="sh-result-title">You found an exclusive cToon! 🎉</p>
              <div v-if="result.ctoon" class="sh-ctoon">
                <img :src="result.ctoon.assetPath" :alt="result.ctoon.name" class="sh-ctoon-img" />
                <div class="sh-ctoon-name">{{ result.ctoon.name }}</div>
              </div>
              <p v-if="result.text" class="sh-result-sub">{{ result.text }}</p>
            </template>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="sh-footer">
        <button class="sh-btn sh-btn-primary" @click="close">{{ result ? 'Close' : 'Cancel' }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

const { sessionId, story, currentStep, result, loading, choose, close } = useScavengerHunt()
const step = computed(() => currentStep.value)

function onBackdrop() { close() }
</script>

<style scoped>
.sh-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  padding: 16px;
}

.sh-modal {
  background: #001f3f;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  width: 100%;
  max-width: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.sh-header {
  background: #336699;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sh-title {
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  letter-spacing: 0.03em;
}

/* Body */
.sh-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #002244;
}

.sh-step { display: flex; flex-direction: column; gap: 12px; }

.sh-step-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.sh-desc {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-line;
  line-height: 1.5;
}

.sh-choices {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* Result */
.sh-result {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.sh-result-title {
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
}

.sh-result-sub {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.sh-ctoon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.sh-ctoon-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  image-rendering: pixelated;
}

.sh-ctoon-name {
  font-size: 0.8rem;
  font-weight: bold;
  color: #fff;
}

/* Footer */
.sh-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: right;
  background: #001f3f;
}

/* Buttons */
.sh-btn {
  flex: 1;
  padding: 7px 14px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: bold;
  cursor: pointer;
  border: none;
  transition: background 0.12s, opacity 0.12s;
}
.sh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.sh-btn-primary {
  background: #3399cc;
  color: #fff;
}
.sh-btn-primary:not(:disabled):hover { background: #2288bb; }

.sh-btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.sh-btn-secondary:not(:disabled):hover { background: rgba(255, 255, 255, 0.18); }
</style>
