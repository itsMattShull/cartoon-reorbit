<template>
  <Teleport to="body">
    <div class="am-overlay" @mousedown.self="$emit('close')">
      <div class="am-modal">

        <!-- ── Header ── -->
        <div class="am-header">
          <span class="am-title">Send to Auction</span>
          <button class="am-close" @click="$emit('close')">✕</button>
        </div>

        <!-- ── Body ── -->
        <div class="am-body">

          <!-- cToon preview -->
          <div class="am-preview">
            <img class="am-preview-img" :src="ctoon.assetPath" :alt="ctoon.name" draggable="false" />
            <div class="am-preview-info">
              <div class="am-preview-name">{{ ctoon.name }}</div>
              <div class="am-preview-meta">
                <span class="am-rarity-badge" :class="`r-${rarityKey(ctoon.rarity)}`">{{ ctoon.rarity }}</span>
                <span v-if="ctoon.mintNumber" class="am-dim">#{{ ctoon.mintNumber }}</span>
              </div>
              <!-- Recent auctions -->
              <div v-if="recentAuctions.length" class="am-recent">
                <div class="am-recent-label">Recent Sales</div>
                <div v-for="(ra, i) in recentAuctions" :key="i" class="am-recent-row">
                  <span class="am-dim">{{ formatDate(ra.endedAt) }}</span>
                  <span class="am-recent-pts">{{ ra.soldFor }} pts</span>
                </div>
              </div>
            </div>
          </div>

          <hr class="am-divider" />

          <!-- Initial bid -->
          <div class="am-field">
            <label class="am-label">Initial Bid <span class="am-dim">(min {{ minInitialBet }} pts)</span></label>
            <input
              class="am-input" type="number"
              v-model.number="initialBet"
              :min="minInitialBet" step="1"
            />
            <div v-if="initialBet < minInitialBet" class="am-error">
              Must be at least {{ minInitialBet }} pts
            </div>
          </div>

          <hr class="am-divider" />

          <!-- Duration presets -->
          <div class="am-field">
            <label class="am-label">Duration</label>
            <div class="am-presets">
              <button
                v-for="p in PRESETS" :key="p.value"
                class="am-preset" :class="{ active: durationPreset === p.value }"
                @click="durationPreset = p.value"
              >{{ p.label }}</button>
            </div>
            <!-- Days slider -->
            <div v-if="durationPreset === 'days'" class="am-slider-wrap">
              <div class="am-slider-label">{{ timeframe }} day{{ timeframe !== 1 ? 's' : '' }}</div>
              <input class="am-slider" type="range" v-model.number="timeframe" :min="1" :max="5" step="1" />
              <div class="am-slider-ticks"><span>1d</span><span>2d</span><span>3d</span><span>4d</span><span>5d</span></div>
            </div>
          </div>

        </div>

        <!-- ── Footer ── -->
        <div class="am-footer">
          <button class="am-instabid" :disabled="sending" @click="instaBid">
            Insta-bid · {{ instaBidValue }} pts
          </button>
          <div class="am-footer-right">
            <button class="am-cancel" @click="$emit('close')">Cancel</button>
            <button
              class="am-submit"
              :disabled="sending || initialBet < minInitialBet"
              @click="sendToAuction"
            >{{ sending ? 'Sending…' : 'Send to Auction' }}</button>
          </div>
        </div>

        <!-- Toast -->
        <div v-if="toast.message" class="am-toast" :class="toast.type">{{ toast.message }}</div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  ctoon: { type: Object, required: true },
})
const emit = defineEmits(['close', 'created'])

const PRESETS = [
  { value: '3m',   label: '3 min'  },
  { value: '30m',  label: '30 min' },
  { value: '1h',   label: '1 hr'   },
  { value: '4h',   label: '4 hr'   },
  { value: '6h',   label: '6 hr'   },
  { value: '12h',  label: '12 hr'  },
  { value: 'days', label: 'Days…'  },
]

const RARITY_MIN = {
  'common': 25, 'uncommon': 50, 'rare': 100, 'very rare': 187,
  'crazy rare': 312, 'code only': 50, 'prize only': 50, 'auction only': 50,
}

const instaBidValue = computed(() => RARITY_MIN[(props.ctoon.rarity || '').toLowerCase()] ?? 50)
const minInitialBet = computed(() => Math.max(1, instaBidValue.value))

const initialBet     = ref(Math.max(props.ctoon.price || 0, instaBidValue.value))
const durationPreset = ref('days')
const timeframe      = ref(1)
const sending        = ref(false)
const recentAuctions = ref([])
const toast          = reactive({ message: '', type: 'success' })

onMounted(async () => {
  try {
    const res = await $fetch(`/api/ctoon/${props.ctoon.ctoonId}/getRecentAuctions`)
    recentAuctions.value = Array.isArray(res) ? res : []
  } catch { recentAuctions.value = [] }
})

function showToast(message, type = 'error') {
  toast.message = message
  toast.type    = type
  setTimeout(() => { toast.message = '' }, 4000)
}

function buildPayload(createInitialBid = false) {
  let durationDays = 0, durationMinutes = 0
  switch (durationPreset.value) {
    case '3m':  durationMinutes = 3;       break
    case '30m': durationMinutes = 30;      break
    case '1h':  durationMinutes = 60;      break
    case '4h':  durationMinutes = 240;     break
    case '6h':  durationMinutes = 360;     break
    case '12h': durationMinutes = 720;     break
    default:    durationDays    = timeframe.value
  }
  return { userCtoonId: props.ctoon.id, initialBet: initialBet.value, durationDays, durationMinutes, createInitialBid }
}

async function sendToAuction() {
  if (initialBet.value < minInitialBet.value) return
  sending.value = true
  try {
    await $fetch('/api/auctions', { method: 'POST', body: buildPayload(false) })
    showToast('Auction created!', 'success')
    emit('created', props.ctoon.id)
    setTimeout(() => emit('close'), 1200)
  } catch (e) {
    showToast(e.data?.message || 'Failed to create auction.', 'error')
  } finally {
    sending.value = false
  }
}

async function instaBid() {
  if (sending.value) return
  sending.value = true
  try {
    await $fetch('/api/auctions', {
      method: 'POST',
      body: { userCtoonId: props.ctoon.id, initialBet: instaBidValue.value, durationDays: 1, durationMinutes: 0, createInitialBid: true }
    })
    showToast('Auction created with initial bid!', 'success')
    emit('created', props.ctoon.id)
    setTimeout(() => emit('close'), 1200)
  } catch (e) {
    showToast(e.data?.message || 'Failed to create auction.', 'error')
  } finally {
    sending.value = false
  }
}

function rarityKey(r) { return (r || '').toLowerCase().replace(/\s+/g, '-') }
function formatDate(d) { try { return new Date(d).toLocaleDateString() } catch { return '' } }
</script>

<style scoped>
/* ── Overlay ── */
.am-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Modal box ── */
.am-modal {
  position: relative;
  width: 420px;
  max-width: 95vw;
  background: var(--OrbitDarkBlue);
  border: 2px solid var(--OrbitLightBlue);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}

/* ── Header ── */
.am-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--OrbitLightBlue);
  flex-shrink: 0;
}

.am-title {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
  letter-spacing: 0.04em;
}

.am-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.am-close:hover { color: #fff; }

/* ── Body ── */
.am-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* ── Preview ── */
.am-preview {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.am-preview-img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
  image-rendering: pixelated;
  background: rgba(0,0,0,0.25);
  border-radius: 6px;
  padding: 3px;
  box-sizing: border-box;
}

.am-preview-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

.am-preview-name {
  font-size: 0.85rem;
  font-weight: bold;
  color: #fff;
}

.am-preview-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.am-rarity-badge {
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

.am-dim { font-size: 0.62rem; color: rgba(255,255,255,0.45); }

/* Recent auctions */
.am-recent { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
.am-recent-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.07em; color: rgba(255,255,255,0.4); }
.am-recent-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.65rem; }
.am-recent-pts { font-weight: bold; color: var(--OrbitGreen); }

/* ── Divider ── */
.am-divider { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 0; }

/* ── Field ── */
.am-field { display: flex; flex-direction: column; gap: 5px; }

.am-label {
  font-size: 0.65rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.6);
}

.am-input {
  width: 100%;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  color: #fff;
  font-size: 0.8rem;
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
}
.am-input:focus { border-color: var(--OrbitLightBlue); }

.am-error { font-size: 0.62rem; color: #fca5a5; }

/* ── Presets ── */
.am-presets { display: flex; flex-wrap: wrap; gap: 4px; }

.am-preset {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 5px;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.55);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 3px 9px;
  cursor: pointer;
  transition: all 0.12s;
}
.am-preset.active { background: var(--OrbitLightBlue); border-color: var(--OrbitLightBlue); color: #fff; }
.am-preset:not(.active):hover { color: #fff; border-color: rgba(255,255,255,0.4); }

/* ── Slider ── */
.am-slider-wrap { display: flex; flex-direction: column; gap: 3px; padding-top: 2px; }
.am-slider-label { font-size: 0.72rem; font-weight: bold; color: #fff; text-align: center; }
.am-slider { width: 100%; accent-color: var(--OrbitLightBlue); }
.am-slider-ticks { display: flex; justify-content: space-between; font-size: 0.58rem; color: rgba(255,255,255,0.4); }

/* ── Footer ── */
.am-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
  gap: 6px;
}

.am-footer-right { display: flex; gap: 6px; }

.am-instabid {
  border: 1px solid var(--OrbitGreen);
  border-radius: 6px;
  background: rgba(102,204,0,0.15);
  color: var(--OrbitGreen);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.am-instabid:not(:disabled):hover { background: rgba(102,204,0,0.3); }
.am-instabid:disabled { opacity: 0.4; cursor: default; }

.am-cancel {
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.6);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.12s;
}
.am-cancel:hover { background: rgba(255,255,255,0.14); color: #fff; }

.am-submit {
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
.am-submit:not(:disabled):hover { filter: brightness(1.15); }
.am-submit:disabled { opacity: 0.4; cursor: default; }

/* ── Toast ── */
.am-toast {
  position: absolute;
  bottom: 54px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: bold;
  white-space: nowrap;
  pointer-events: none;
}
.am-toast.success { background: #16a34a; color: #fff; }
.am-toast.error   { background: #dc2626; color: #fff; }
</style>
