<template>
  <Teleport to="body">
    <div v-if="visible" class="cms-overlay">
      <div class="cms-modal">
        <div class="cms-header">
          <h2 class="cms-title">Choose your cMoon</h2>
          <p class="cms-sub">
            Pick a faction to represent. This can't be changed later, so choose carefully.
          </p>
          <p v-if="deadlineText" class="cms-deadline">Choose by {{ deadlineText }} or you'll be auto-assigned.</p>
        </div>

        <div v-if="loading" class="cms-loading">Loading cMoons…</div>
        <div v-else class="cms-body">
          <button
            v-for="c in cmoons" :key="c.id"
            type="button"
            class="cms-option"
            :class="{ 'cms-option-selected': choice === c.id }"
            role="radio"
            :aria-checked="choice === c.id"
            @click="choice = c.id"
          >
            <span class="cms-swatch" :style="{ background: safeColor(c.color) }"></span>
            <span class="cms-option-body">
              <span class="cms-option-name">{{ c.name }}</span>
              <span class="cms-option-count">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
            </span>
            <span class="cms-option-check" aria-hidden="true">{{ choice === c.id ? '●' : '○' }}</span>
          </button>
          <div v-if="!cmoons.length" class="cms-empty">No cMoons are available yet.</div>
        </div>

        <div v-if="error" class="cms-error" role="alert">{{ error }}</div>

        <div class="cms-footer">
          <button class="cms-confirm-btn" :disabled="!choice || submitting" @click="confirm">
            {{ submitting ? 'Joining…' : 'Confirm cMoon' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const visible = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const cmoons = ref([])
const choice = ref(null)
const deadline = ref(null)

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3a4a63'
}

const deadlineText = computed(() => {
  if (!deadline.value) return ''
  const d = new Date(deadline.value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
})

async function checkStatus() {
  try {
    const status = await $fetch('/api/cmoon/status')
    if (!status?.cMoonEnabled || !status.canChoose) return
    deadline.value = status.deadline || null
    loading.value = true
    visible.value = true
    const list = await $fetch('/api/cmoons')
    cmoons.value = list?.cmoons || []
  } catch {
    // Not logged in, or feature off — silently skip.
  } finally {
    loading.value = false
  }
}

async function confirm() {
  if (!choice.value || submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/cmoon/select', { method: 'POST', body: { cMoonId: choice.value } })
    visible.value = false
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Unable to join that cMoon. Please try again.'
  } finally {
    submitting.value = false
  }
}

watch(visible, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
})

onMounted(checkStatus)
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<style scoped>
.cms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cms-modal {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  max-height: 85dvh;
  background: #0a1830;
  border: 2px solid #1a5a9a;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: env(safe-area-inset-bottom);
  color: #fff;
  font-family: 'Nunito', sans-serif;
}

.cms-header {
  padding: 16px 16px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.cms-title {
  margin: 0 0 4px;
  font-size: 1.1rem;
  font-weight: 800;
}

.cms-sub {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.cms-deadline {
  margin: 6px 0 0;
  font-size: 0.7rem;
  color: #ffd75e;
  font-weight: 600;
}

.cms-loading, .cms-empty {
  padding: 20px 16px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.cms-body {
  padding: 12px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cms-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 12px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  text-align: left;
  cursor: pointer;
}

.cms-option-selected {
  border-color: #ffd75e;
  background: rgba(255, 215, 94, 0.12);
}

.cms-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.cms-option-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cms-option-name {
  font-weight: 700;
  font-size: 0.85rem;
}

.cms-option-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
}

.cms-option-check {
  flex: 0 0 auto;
  color: #ffd75e;
}

.cms-error {
  padding: 0 16px;
  font-size: 0.72rem;
  color: #ff8a8a;
}

.cms-footer {
  padding: 12px 16px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.cms-confirm-btn {
  width: 100%;
  min-height: 46px;
  border: none;
  border-radius: 8px;
  /* #2e8b57 gave white text only 4.25:1; this clears the 4.5:1 minimum. */
  background: #256e45;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}

.cms-confirm-btn:disabled {
  background: rgba(255, 255, 255, 0.10);
  color: rgba(255, 255, 255, 0.62);
  cursor: not-allowed;
}

.cms-option:focus-visible,
.cms-confirm-btn:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}
</style>
