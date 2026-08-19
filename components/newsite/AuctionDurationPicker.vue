<template>
  <div class="adp">
    <!-- Preset chips. The custom panel REPLACES this row rather than stacking
         below it: the modal has roughly 148px of vertical slack on a 360x640
         phone (80px with the cZone warning showing), and stacking spends more
         than that. -->
    <div v-if="!custom" class="adp-presets">
      <button
        v-for="p in PRESETS" :key="p.value"
        type="button"
        class="adp-preset"
        :class="{ active: preset === p.value }"
        :aria-pressed="preset === p.value"
        @click="selectPreset(p.value)"
      >{{ p.label }}</button>
      <button
        type="button"
        class="adp-preset adp-preset-custom"
        @click="openCustom"
      >Pick date…</button>
    </div>

    <!-- Days slider, unchanged in shape but now reaching the same 7-day
         ceiling the calendar does. A slider stopping at 5 next to a calendar
         reaching 7 reads as a bug. -->
    <div v-if="!custom && preset === 'days'" class="adp-slider-wrap">
      <div class="adp-slider-label">{{ timeframe }} day{{ timeframe !== 1 ? 's' : '' }}</div>
      <input
        class="adp-slider" type="range" v-model.number="timeframe"
        :min="1" :max="7" step="1" aria-label="Auction length in days"
      />
      <div class="adp-slider-ticks">
        <span>1d</span><span>3d</span><span>5d</span><span>7d</span>
      </div>
    </div>

    <!-- Custom end date/time.
         One datetime-local rather than a hand-built grid, or a date input and a
         time input side by side. min/max on a bare date input clamp the day
         only, so on the first and last selectable days the time would be
         unclamped and the player would hit an error they didn't cause. One
         field enforces the whole instant, opens the OS date+time picker on
         mobile, and matches the ~30 datetime-local inputs already in this app. -->
    <div v-else-if="custom" class="adp-custom">
      <div class="adp-custom-head">
        <label class="adp-custom-label" for="adp-end-at">Ends on</label>
        <button type="button" class="adp-back" @click="closeCustom">← Presets</button>
      </div>

      <input
        id="adp-end-at"
        ref="endAtInput"
        class="adp-input"
        type="datetime-local"
        v-model="endAtLocal"
        :min="minLocal"
        :max="maxLocal"
        step="60"
        :aria-invalid="!!error"
        aria-describedby="adp-readout adp-error"
      />

      <!-- Absolute and relative together, deliberately. When a player's device
           clock is wrong the two disagree, and the relative figure is the one
           that's true — showing both is what lets them notice. -->
      <div id="adp-readout" class="adp-readout" aria-live="polite">
        <template v-if="resolvedEnd && !error">
          <div class="adp-readout-abs">{{ absoluteLabel }}</div>
          <div class="adp-readout-rel">in {{ relativeLabel }} · {{ zoneLabel }}</div>
        </template>
        <div v-else-if="!endAtLocal" class="adp-readout-hint">
          Between 3 minutes and 7 days from now.
        </div>
      </div>

      <div v-if="shiftNote" class="adp-note">{{ shiftNote }}</div>
      <div id="adp-error" class="adp-error" role="alert">{{ error }}</div>
    </div>
  </div>
</template>

<script setup>
import {
  MIN_AUCTION_MINUTES,
  MAX_AUCTION_MINUTES,
  clampMsToAuctionMinutes,
  isListableMs,
  formatAuctionDuration
} from '~/server/utils/auctionDuration'

const props = defineProps({
  // { preset, timeframe, customEndAtLocal } — used when re-listing.
  prefill: { type: Object, default: null }
})

// Emits the resolved duration upward as { durationDays, durationMinutes, totalMinutes, valid }.
const emit = defineEmits(['update'])

const PRESETS = [
  { value: '3m',   label: '3 min'  },
  { value: '30m',  label: '30 min' },
  { value: '1h',   label: '1 hr'   },
  { value: '4h',   label: '4 hr'   },
  { value: '6h',   label: '6 hr'   },
  { value: '12h',  label: '12 hr'  },
  { value: 'days', label: 'Days…'  },
]

const PRESET_MINUTES = {
  '3m': 3, '30m': 30, '1h': 60, '4h': 240, '6h': 360, '12h': 720
}

const preset      = ref(props.prefill?.preset && props.prefill.preset !== 'custom' ? props.prefill.preset : 'days')
const timeframe   = ref(Math.min(7, Math.max(1, props.prefill?.timeframe || 1)))
const custom      = ref(props.prefill?.preset === 'custom')
const endAtLocal  = ref(props.prefill?.customEndAtLocal || '')

// Ticks so a modal left open can't submit a duration computed against a stale
// "now". 30s rather than 1s: the value is recomputed at submit anyway, so the
// tick only keeps the readout and the min/max honest, and a 1s tick would make
// the error message flicker under the user's finger on a near-minimum pick.
const now = ref(Date.now())
let timer = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 30_000) })
onUnmounted(() => { if (timer) clearInterval(timer) })

// ── Local-time formatting ─────────────────────────────────────────────────
// Every value below is derived from epoch milliseconds and only formatted for
// display, which is what keeps this DST-safe: the bounds are elapsed-time
// bounds, so a fall-back week simply offers a last selectable instant that is
// 167 wall-clock hours out instead of 168, rather than offering a date the
// server would then reject.
function toLocalInputValue(ms) {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Parse the input's value with the multi-argument Date constructor.
// new Date('2026-11-04') would parse as UTC midnight — a full day off for every
// negative-offset user — and the 'YYYY-MM-DDTHH:mm' form is the one browsers
// historically disagreed about. The field-by-field constructor is unambiguous.
function parseLocalInputValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '')
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0)
  // Round-trip the fields. A nonexistent local time (2:30 AM on a spring-forward
  // date) is silently relocated by the constructor, and the user deserves to be
  // told rather than watching their input change under them.
  const shifted =
    dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d ||
    dt.getHours() !== h || dt.getMinutes() !== mi
  return { date: dt, shifted }
}

const minLocal = computed(() => toLocalInputValue(now.value + MIN_AUCTION_MINUTES * 60000))
const maxLocal = computed(() => toLocalInputValue(now.value + MAX_AUCTION_MINUTES * 60000))

const parsed = computed(() => custom.value ? parseLocalInputValue(endAtLocal.value) : null)
const resolvedEnd = computed(() => parsed.value?.date ?? null)
const rawMs = computed(() =>
  resolvedEnd.value ? resolvedEnd.value.getTime() - now.value : NaN
)

const shiftNote = computed(() => {
  if (!parsed.value?.shifted || !resolvedEnd.value) return ''
  return `That time doesn't exist on this date — clocks jump forward. Your auction will end at ` +
         `${resolvedEnd.value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
})

const error = computed(() => {
  if (!custom.value || !endAtLocal.value) return ''
  if (!resolvedEnd.value) return 'Pick a valid date and time.'
  if (rawMs.value < MIN_AUCTION_MINUTES * 60000) return `Must be at least ${MIN_AUCTION_MINUTES} minutes from now.`
  if (rawMs.value > MAX_AUCTION_MINUTES * 60000) return 'Auctions can run for at most 7 days.'
  return ''
})

const absoluteLabel = computed(() => {
  if (!resolvedEnd.value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }).format(resolvedEnd.value)
  } catch { return resolvedEnd.value.toLocaleString() }
})

// timeZoneName resolves for the formatted instant, not for right now — so a
// player picking a post-transition date sees "EST" while their clock still
// reads "EDT". That is the DST disclosure, for free.
const zoneLabel = computed(() => {
  try {
    return `your device's time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'})`
  } catch { return "your device's time zone" }
})

const relativeLabel = computed(() =>
  Number.isFinite(rawMs.value) ? formatAuctionDuration(clampMsToAuctionMinutes(rawMs.value)) : ''
)

// ── Resolved value ────────────────────────────────────────────────────────
const totalMinutes = computed(() => {
  if (custom.value) {
    if (!isListableMs(rawMs.value)) return null
    return clampMsToAuctionMinutes(rawMs.value)
  }
  if (preset.value === 'days') return timeframe.value * 1440
  return PRESET_MINUTES[preset.value] ?? 1440
})

// The wire shape stays {durationDays, durationMinutes} — the insta-bid path and
// the admin/worker callers still send days-only, and the server validates the
// sum, so the split is never load-bearing.
const payload = computed(() => {
  const total = totalMinutes.value
  if (total == null) return { durationDays: 0, durationMinutes: 0, totalMinutes: null, valid: false }
  return { durationDays: 0, durationMinutes: total, totalMinutes: total, valid: true }
})

watch(payload, (v) => emit('update', v), { immediate: true })

function selectPreset(value) { preset.value = value }
function openCustom() {
  custom.value = true
  if (!endAtLocal.value) {
    const seed = totalMinutes.value ?? 1440
    endAtLocal.value = toLocalInputValue(Date.now() + seed * 60000)
  }
  nextTick(() => endAtInput.value?.focus())
}
function closeCustom() { custom.value = false }

const endAtInput = ref(null)

defineExpose({
  // The modal shows a confirm step for long listings; it needs the label.
  describe: () => (totalMinutes.value == null ? '' : formatAuctionDuration(totalMinutes.value)),
  endsAtLabel: () => absoluteLabel.value,
  totalMinutes: () => totalMinutes.value
})
</script>

<style scoped>
/* Custom properties are namespaced --adp-* on purpose: tests/shortCardVarContract.test.js
   walks every .vue file under components/, pages/ and layouts/ and fails any
   --sc-* name that ShortCard doesn't itself read.

   The defaults below are the dark AuctionModal surface. A light host overrides
   them on the wrapper rather than forking this component. */
.adp {
  --adp-fg: #fff;
  --adp-fg-dim: rgba(255,255,255,0.55);
  --adp-fg-faint: rgba(255,255,255,0.4);
  --adp-border: rgba(255,255,255,0.2);
  --adp-surface: rgba(0,0,0,0.2);
  --adp-input-bg: rgba(0,0,0,0.3);
  --adp-accent: var(--OrbitLightBlue);
  /* #fca5a5, which AuctionModal uses for errors, is 3.10:1 on --OrbitDarkBlue
     and fails WCAG AA at this size. #fee2e2 is 4.91:1. */
  --adp-error: #fee2e2;
  --adp-scheme: dark;

  display: flex;
  flex-direction: column;
  gap: 5px;
}

.adp-presets { display: flex; flex-wrap: wrap; gap: 4px; }

.adp-preset {
  border: 1px solid var(--adp-border);
  border-radius: 5px;
  background: var(--adp-surface);
  color: var(--adp-fg-dim);
  font-size: 0.65rem;
  font-weight: bold;
  padding: 3px 9px;
  cursor: pointer;
  transition: all 0.12s;
}
.adp-preset.active {
  background: var(--adp-accent);
  border-color: var(--adp-accent);
  color: #fff;
}
.adp-preset:not(.active):hover { color: var(--adp-fg); border-color: var(--adp-fg-dim); }
.adp-preset-custom { border-style: dashed; }

/* Slider */
.adp-slider-wrap { display: flex; flex-direction: column; gap: 3px; padding-top: 2px; }
.adp-slider-label { font-size: 0.72rem; font-weight: bold; color: var(--adp-fg); text-align: center; }
.adp-slider { width: 100%; accent-color: var(--adp-accent); }
.adp-slider-ticks { display: flex; justify-content: space-between; font-size: 0.58rem; color: var(--adp-fg-faint); }

/* Custom panel */
.adp-custom { display: flex; flex-direction: column; gap: 4px; }
.adp-custom-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
.adp-custom-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--adp-fg-dim);
}
.adp-back {
  border: none;
  background: none;
  color: var(--adp-accent);
  font-size: 0.62rem;
  font-weight: bold;
  cursor: pointer;
  padding: 2px 0;
}

.adp-input {
  width: 100%;
  background: var(--adp-input-bg);
  border: 1px solid var(--adp-border);
  border-radius: 6px;
  /* Both are required on a dark surface. `color` alone does not reach WebKit's
     ::-webkit-datetime-edit-* segments or the calendar-picker indicator, so the
     field renders near-black on a dark background without color-scheme. */
  color: var(--adp-fg);
  color-scheme: var(--adp-scheme);
  font-size: 0.8rem;
  padding: 5px 8px;
  outline: none;
  box-sizing: border-box;
}
.adp-input:focus { border-color: var(--adp-accent); }

.adp-readout { display: flex; flex-direction: column; gap: 1px; min-height: 26px; }
.adp-readout-abs { font-size: 0.72rem; font-weight: bold; color: var(--adp-fg); }
.adp-readout-rel { font-size: 0.62rem; color: var(--adp-fg-dim); }
.adp-readout-hint { font-size: 0.62rem; color: var(--adp-fg-faint); }

.adp-note { font-size: 0.62rem; color: #fde68a; line-height: 1.35; }
.adp-error { font-size: 0.65rem; color: var(--adp-error); line-height: 1.35; }
.adp-error:empty { display: none; }

@media (max-width: 768px) {
  /* Anything under 16px makes iOS Safari zoom the page on focus, which shoves
     the fixed-position modal half off-screen. */
  .adp-input { font-size: 16px; }
  .adp-preset, .adp-back { min-height: 30px; }
}
</style>
