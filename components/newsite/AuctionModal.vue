<template>
  <Teleport to="body">
    <div class="am-overlay" @mousedown.self="$emit('close')">
      <div class="am-modal">

        <!-- ── Header ── -->
        <div class="am-header">
          <span class="am-title">{{ isRelist ? 'Re-list at Auction' : 'Send to Auction' }}</span>
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

            <!-- What this cToon has actually sold for. Sits below the input on
                 purpose: it's a sale-price history, not a starting-bid target. -->
            <div class="am-guide">
              <template v-if="loadingSuggestion">
                <div class="am-guide-loading">Checking recent sales…</div>
              </template>
              <template v-else-if="suggestion && suggestion.basis !== 'none'">
                <div class="am-guide-top">
                  <span class="am-guide-label">{{ guideLabel }}</span>
                  <span class="am-guide-value">{{ guideValue }}</span>
                </div>
                <div class="am-guide-note">{{ guideNote }}</div>
                <div v-if="showsRange" class="am-guide-note">
                  Starting bids are usually set lower.
                </div>
              </template>
              <template v-else>
                <div class="am-guide-note">Not enough sales data yet.</div>
              </template>
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
  ctoon:   { type: Object, required: true },
  // Optional starting values, used when re-listing something that didn't sell:
  // { initialBet, durationPreset, timeframe, isRelist }
  prefill: { type: Object, default: null },
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

// When re-listing, start from the terms that didn't sell last time so the
// seller only has to change what they want to change.
const isRelist = computed(() => !!props.prefill?.isRelist)

const initialBet = ref(
  props.prefill?.initialBet != null
    ? Math.max(props.prefill.initialBet, instaBidValue.value)
    : Math.max(props.ctoon.price || 0, instaBidValue.value)
)
const durationPreset = ref(props.prefill?.durationPreset || 'days')
const timeframe      = ref(props.prefill?.timeframe || 1)
const sending        = ref(false)
const recentAuctions = ref([])
const suggestion     = ref(null)
const loadingSuggestion = ref(true)
const toast          = reactive({ message: '', type: 'success' })

onMounted(async () => {
  try {
    const res = await $fetch(`/api/ctoon/${props.ctoon.ctoonId}/getRecentAuctions`, {
      query: {
        suggest: '1',
        ...(props.ctoon.id ? { userCtoonId: props.ctoon.id } : {})
      }
    })
    recentAuctions.value = Array.isArray(res?.sales) ? res.sales : []
    suggestion.value     = res?.suggestion ?? null
  } catch {
    recentAuctions.value = []
    suggestion.value     = null
  } finally {
    loadingSuggestion.value = false
  }
})

// ── Price guide copy ──────────────────────────────────────────────
// Deliberately worded as "sold for", never "recommended" or "list at": the
// numbers come from completed sales, while the field above is the starting bid.
const showsRange = computed(() =>
  ['recent', 'alltime'].includes(suggestion.value?.basis)
)

const guideLabel = computed(() => {
  switch (suggestion.value?.basis) {
    case 'recent':      return 'Recent sales'
    case 'alltime':     return 'Past sales'
    case 'estimate':    return 'cMart price'
    case 'below_floor': return 'Minimum bid'
    default:            return ''
  }
})

const guideValue = computed(() => {
  const s = suggestion.value
  if (!s) return ''
  if (s.basis === 'below_floor') return `${s.floor} pts`
  if (s.basis === 'estimate')    return `${s.mid} pts`
  if (s.low === s.high)          return `${s.low} pts`
  return `${s.low}–${s.high} pts`
})

const guideNote = computed(() => {
  const s = suggestion.value
  if (!s) return ''
  const n = s.sampleSize
  const plural = n === 1 ? 'sale' : 'sales'
  const mint = s.mintAdjusted ? ', adjusted for mint' : ''
  switch (s.basis) {
    case 'recent':      return `From ${n} ${plural} in the last ${s.windowDays} days${mint}.`
    case 'alltime':     return `No sales in ${s.windowDays} days. From ${n} older ${plural}${mint}.`
    case 'estimate':    return 'No auction history — this is a list price, not a sale.'
    case 'below_floor': return `Recent sales averaged ${s.mid} pts, below the minimum.`
    default:            return ''
  }
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
    showToast(e.data?.statusMessage || e.data?.message || 'Failed to create auction.', 'error')
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
    showToast(e.data?.statusMessage || e.data?.message || 'Failed to create auction.', 'error')
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
  padding: 12px;
  box-sizing: border-box;
}

/* ── Modal box ── */
.am-modal {
  position: relative;
  width: 420px;
  max-width: 95vw;
  /* Without a height cap the footer ends up under the on-screen keyboard when
     the bid input is focused, and the overlay is fixed so it can't be scrolled
     to. Never binds on desktop, where the modal is well under this height. */
  max-height: calc(100dvh - 24px);
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
  /* min-height:0 is what actually lets this shrink under the modal's
     max-height — the default min-height:auto refuses to. */
  flex: 1;
  min-height: 0;
  overscroll-behavior: contain;
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
  /* The buttons are nowrap, so without this they get clipped by the modal's
     overflow:hidden on narrow phones instead of moving to a second line. */
  flex-wrap: wrap;
  row-gap: 6px;
}

.am-footer-right { display: flex; gap: 6px; margin-left: auto; }

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

/* ── Price guide ── */
.am-guide {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 2px;
  /* Reserved so the modal doesn't grow under the user's finger when the
     suggestion resolves after mount. */
  min-height: 30px;
}

.am-guide-top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}

.am-guide-label {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.4);
}

.am-guide-value {
  font-size: 0.8rem;
  font-weight: bold;
  color: var(--OrbitGreen);
  white-space: nowrap;
}

.am-guide-note    { font-size: 0.65rem; color: rgba(255,255,255,0.5); line-height: 1.35; }
.am-guide-loading { font-size: 0.65rem; color: rgba(255,255,255,0.35); font-style: italic; }

@media (max-width: 768px) {
  /* Anything under 16px makes iOS Safari zoom the page on focus, which shoves
     the fixed-position modal half off-screen. */
  .am-input { font-size: 16px; }
  .am-preset, .am-instabid, .am-cancel, .am-submit { min-height: 30px; }
}
</style>
