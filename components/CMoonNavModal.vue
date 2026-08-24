<template>
  <Teleport to="body">
    <div v-if="visible" class="cnm-overlay" @click.self="close">
      <div class="cnm-modal">
        <div class="cnm-header">
          <h2 class="cnm-title">cMoons</h2>
          <button class="cnm-close" @click="close" aria-label="Close">✕</button>
        </div>

        <div v-if="loading" class="cnm-loading">Loading…</div>
        <div v-else class="cnm-body">
          <button
            v-for="c in cmoons" :key="c.id"
            type="button"
            class="cnm-option"
            @click="go(c)"
          >
            <span class="cnm-swatch" :style="{ background: safeColor(c.color) }"></span>
            <span class="cnm-option-body">
              <span class="cnm-option-name">{{ c.name }}</span>
              <span class="cnm-option-count">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
            </span>
            <span v-if="c.locked" class="cnm-lock" aria-label="Locked" title="Locked">🔒</span>
          </button>
          <div v-if="!loading && !cmoons.length" class="cnm-empty">No cMoons are available yet.</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const router = useRouter()
const loading = ref(false)
const cmoons = ref([])
let loaded = false

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#3a4a63'
}

function close() {
  emit('close')
}

function go(c) {
  close()
  router.push(`/newsite/cmoon/${c.id}`)
}

async function load() {
  if (loaded) return
  loading.value = true
  try {
    const data = await $fetch('/api/cmoons')
    cmoons.value = data?.cmoons || []
    loaded = true
  } catch {
    cmoons.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) load()
  if (typeof document !== 'undefined') document.body.style.overflow = v ? 'hidden' : ''
})

function onKeydown(e) {
  if (e.key === 'Escape' && props.visible) close()
}

onMounted(() => { if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<style scoped>
.cnm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cnm-modal {
  width: 100%;
  max-width: 380px;
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

.cnm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.cnm-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
}

.cnm-close {
  min-width: 32px;
  min-height: 32px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1rem;
  cursor: pointer;
}
.cnm-close:hover { color: #fff; }

.cnm-loading, .cnm-empty {
  padding: 20px 16px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.cnm-body {
  padding: 12px 16px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cnm-option {
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
.cnm-option:hover { background: rgba(255, 255, 255, 0.09); }

.cnm-swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.cnm-option-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.cnm-option-name {
  font-weight: 700;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cnm-option-count {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
}

/* Icon-only (not a "Locked" text pill): .cnm-option-name is already nowrap+ellipsis, competing
   with the swatch for space on a 320px screen — a text badge would crowd it further. */
.cnm-lock {
  flex-shrink: 0;
  font-size: 0.85rem;
  opacity: 0.75;
}

.cnm-option:focus-visible,
.cnm-close:focus-visible {
  outline: 3px solid #ffd75e;
  outline-offset: 2px;
}
</style>
