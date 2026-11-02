<!-- components/PackOpenOverlay.vue
     The ONE pack-opening experience, shared by cMart (after a purchase), My Collection > Packs and the Redeem page.
     Mount it with the sealed pack's id; it makes the request itself (POST /api/packs/open), plays the unwrap, and
     reveals what was pulled.

       <PackOpenOverlay :user-pack-id="id" :pack="{ name, imagePath }" :remaining="n"
                        @opened="cards => ..." @open-next="..." @close="..." />

     State machine:  opening ──► revealed
                         └─────► error      (the pack is NOT consumed on an error — it is still sealed)

     Why it is not the old cMart markup moved over (see the mobile/a11y review):
       * the request fires the moment this mounts. The animation is cosmetic and only decides WHEN the result is shown,
         so leaving mid-animation can no longer lose an already-consumed pack's reveal to a timer that never fires;
       * a failed open shows an error, never a blank "success" grid;
       * "New!" comes from the server (`isNew`), not from a client snapshot that races the request;
       * real dialog semantics: role=dialog, focus moved in and trapped, Esc, scroll lock, focus handed back;
       * the close button and the Close/Open-another buttons are sticky, so a tall reveal scrolls under them rather than
         pushing them off a short phone screen;
       * 100dvh (not 100vh, which overshoots the visible area on iOS Safari);
       * prefers-reduced-motion skips the glow and the wait; "Skip" is always there for everyone else;
       * the glow is contained inside the dialog (transform + opacity only), not a full-viewport white flash. -->
<template>
  <Teleport to="body">
    <div class="pro-backdrop" @click.self="onBackdrop">
      <div
        ref="dialogEl"
        class="pro-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header class="pro-head">
          <h2 :id="titleId" ref="titleEl" class="pro-title" tabindex="-1">{{ title }}</h2>
          <button v-if="phase !== 'opening'" type="button" class="pro-x" aria-label="Close" @click="close">✕</button>
        </header>

        <div class="pro-body">
          <div v-if="phase === 'opening'" class="pro-stage">
            <CtoonImage
              :ctoon="pack || {}"
              :src="pack?.imagePath || ''"
              :alt="pack?.name || 'Pack'"
              class="pro-pack-img"
              :class="{ 'pro-pack-img--shake': !reduceMotion }"
            />
          </div>

          <p v-else-if="phase === 'error'" class="pro-error" role="alert">{{ errorMessage }}</p>

          <ul v-else class="pro-grid" :class="{ 'pro-grid--many': cards.length >= 6 }">
            <li
              v-for="(item, i) in cards"
              :key="item.id"
              class="pro-card"
              :class="{ 'pro-card--new': item.isNew }"
              :aria-label="cardLabel(item)"
            >
              <span v-if="item.isNew" class="pro-badge pro-badge--new">New!</span>
              <span v-if="item.inCmart === false" class="pro-badge pro-badge--excl">Pack Exclusive</span>
              <div class="pro-img-wrap">
                <!-- Animated gToon card effects are GPU-heavy (documented iOS crash in tests/gtoonCardPerformance.test.js),
                     so only the first few get them. -->
                <CtoonImage
                  v-if="item.assetPath"
                  :ctoon="item"
                  :alt="item.name"
                  :effects="i < FULL_EFFECT_CARDS ? 'full' : 'static'"
                  :ambient="false"
                  class="pro-img"
                />
                <SecondEditionOverlay :ctoon="item" />
              </div>
              <p class="pro-name">{{ item.name }}</p>
              <p class="pro-rarity">{{ item.rarity }}</p>
              <p class="pro-mint">Mint #{{ item.mintNumber }}</p>
            </li>
          </ul>

          <div v-if="glow" class="pro-glow" :class="{ 'pro-glow--fade': phase !== 'opening' }" aria-hidden="true" />
        </div>

        <footer class="pro-foot">
          <button v-if="phase === 'opening'" type="button" class="pro-btn pro-btn--ghost" @click="skip">Skip</button>
          <template v-else>
            <button v-if="phase === 'revealed' && remaining > 0" type="button" class="pro-btn pro-btn--primary" @click="$emit('open-next')">
              Open another ({{ remaining }} left)
            </button>
            <button ref="closeBtn" type="button" class="pro-btn" :class="remaining > 0 && phase === 'revealed' ? 'pro-btn--ghost' : 'pro-btn--primary'" @click="close">Close</button>
          </template>
        </footer>

        <p class="pro-sr" aria-live="polite">{{ liveText }}</p>
      </div>
    </div>
  </Teleport>
</template>

<script>
// Module scope (shared by every instance): packs currently being opened. A second overlay for the same pack — a
// double-tap on Open, or the same pack shown in two places — must not send a second request.
const inFlight = new Set()
</script>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import CtoonImage from '@/components/CtoonImage.vue'

const props = defineProps({
  userPackId: { type: String, required: true },
  pack: { type: Object, default: null },        // { name, imagePath } — art for the unwrap
  remaining: { type: Number, default: 0 },       // other sealed packs the caller could open next
  // Shown under the error. cMart passes a hint that the pack is safe in My Collection.
  errorHint: { type: String, default: 'Your pack is still sealed — you can try again from My Collection > Packs.' }
})
const emit = defineEmits(['opened', 'open-next', 'close', 'failed'])

const FULL_EFFECT_CARDS = 4
const MIN_REVEAL_MS = 3000       // how long the unwrap plays before the cards are shown
const REDUCED_REVEAL_MS = 300    // prefers-reduced-motion: a brief fade only

const phase = ref('opening')     // 'opening' | 'revealed' | 'error'
const cards = ref([])
const errorMessage = ref('')
const glow = ref(false)
const skipped = ref(false)
const reduceMotion = ref(false)
const dialogEl = ref(null)
const titleEl = ref(null)
const closeBtn = ref(null)
const titleId = `pro-title-${Math.random().toString(36).slice(2, 9)}`

let timers = []
let previouslyFocused = null
let responseReady = false
let minElapsed = false
let claimedFlight = false

const title = computed(() => {
  if (phase.value === 'opening') return `Opening ${props.pack?.name || 'pack'}…`
  if (phase.value === 'error') return 'Couldn’t open this pack'
  return `You got ${cards.value.length} cToon${cards.value.length === 1 ? '' : 's'}!`
})
const liveText = computed(() => {
  if (phase.value === 'error') return errorMessage.value
  if (phase.value !== 'revealed') return ''
  const fresh = cards.value.filter(c => c.isNew).length
  return `Opened ${props.pack?.name || 'pack'}: ${cards.value.length} cToon${cards.value.length === 1 ? '' : 's'}${fresh ? `, ${fresh} new` : ''}.`
})

const cardLabel = (c) => `${c.name}, ${c.rarity}, mint ${c.mintNumber}${c.isNew ? ', new' : ''}`

function later (fn, ms) { timers.push(setTimeout(fn, ms)) }

function maybeReveal () {
  if (phase.value !== 'opening' || !responseReady) return
  if (!minElapsed && !skipped.value) return
  phase.value = 'revealed'
  later(() => { glow.value = false }, 1100)
  nextTick(() => titleEl.value?.focus?.())
}

function skip () {
  skipped.value = true
  maybeReveal()
}

async function run () {
  if (inFlight.has(props.userPackId)) {
    phase.value = 'error'
    errorMessage.value = 'This pack is already being opened.'
    return
  }
  inFlight.add(props.userPackId)
  claimedFlight = true
  try {
    const res = await $fetch('/api/packs/open', { method: 'POST', body: { userPackId: props.userPackId } })
    cards.value = Array.isArray(res) ? res : []
    responseReady = true
    emit('opened', cards.value)
    maybeReveal()
  } catch (err) {
    errorMessage.value = `${err?.data?.statusMessage || err?.statusMessage || 'Something went wrong.'} ${props.errorHint}`.trim()
    phase.value = 'error'
    emit('failed', err) // lets the opener react (e.g. drop a pack that was already opened in another tab)
    glow.value = false
    nextTick(() => titleEl.value?.focus?.())
  } finally {
    inFlight.delete(props.userPackId)
    claimedFlight = false
  }
}

function close () { emit('close') }
// Clicking outside only dismisses once there is something to dismiss (never mid-unwrap).
function onBackdrop () { if (phase.value !== 'opening') close() }

function focusables () {
  return [...(dialogEl.value?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])]
}
function onKeydown (e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    if (phase.value === 'opening') skip()
    else close()
    return
  }
  if (e.key !== 'Tab') return
  const f = focusables()
  if (!f.length) { e.preventDefault(); dialogEl.value?.focus(); return }
  const first = f[0]; const last = f[f.length - 1]
  if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogEl.value || document.activeElement === titleEl.value)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

onMounted(() => {
  reduceMotion.value = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  previouslyFocused = document.activeElement
  document.documentElement.classList.add('pro-scroll-lock')
  nextTick(() => (titleEl.value || dialogEl.value)?.focus?.())

  if (reduceMotion.value) {
    later(() => { minElapsed = true; maybeReveal() }, REDUCED_REVEAL_MS)
  } else {
    glow.value = true
    later(() => { minElapsed = true; maybeReveal() }, MIN_REVEAL_MS)
  }
  run()
})

onBeforeUnmount(() => {
  timers.forEach(clearTimeout); timers = []
  document.documentElement.classList.remove('pro-scroll-lock')
  if (claimedFlight) inFlight.delete(props.userPackId)
  // Hand focus back, unless the opener vanished (e.g. its tile was just removed) — the parent places focus then.
  if (previouslyFocused?.isConnected) previouslyFocused.focus?.()
})
</script>

<style>
/* Unscoped on purpose: the overlay is teleported to <body>, and the scroll lock targets <html>. */
html.pro-scroll-lock { overflow: hidden; }
</style>

<style scoped>
.pro-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  overscroll-behavior: contain;
}

/* The dialog is the only thing that scrolls horizontally-contained; header and footer are sticky inside it. */
.pro-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  max-height: 90vh;                    /* fallback for browsers without dvh */
  max-height: calc(100dvh - 24px);
  background: #fff;
  color: #1a2a40;                      /* explicit: the surface is white, never inherit a light text colour */
  border-radius: 12px;
  overflow: hidden;
  outline: none;
}

.pro-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 10px 18px;
  border-bottom: 1px solid #dbe5f3;
  min-height: 48px;
}
.pro-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #1a2a40; outline: none; }
.pro-x {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 8px;
  font-size: 1.25rem; line-height: 1; color: #445;
  cursor: pointer;
}
.pro-x:focus-visible, .pro-btn:focus-visible { outline: 3px solid #3399cc; outline-offset: 2px; }

.pro-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
}

.pro-stage { display: flex; justify-content: center; align-items: center; min-height: 180px; }
.pro-pack-img { max-width: 100%; max-height: 50vh; max-height: 50dvh; object-fit: contain; }
.pro-pack-img--shake { animation: pro-shake 0.5s ease-in-out infinite alternate; }

.pro-error { margin: 12px 4px; padding: 14px; background: #fdecec; color: #7a1d1d; border-radius: 8px; font-size: 0.95rem; line-height: 1.4; }

.pro-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.pro-card {
  position: relative;
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 10px 8px;
  background: #f5f8ff; border: 2px solid #c7d8f0; border-radius: 8px;
  animation: pro-pop 0.35s ease-out both;
}
.pro-card:nth-child(2) { animation-delay: 0.06s; }
.pro-card:nth-child(3) { animation-delay: 0.12s; }
.pro-card:nth-child(4) { animation-delay: 0.18s; }
.pro-card:nth-child(n+5) { animation-delay: 0.24s; }
.pro-card--new { border-color: #16a34a; }

.pro-badge { position: absolute; top: 6px; font-weight: 700; color: #fff; padding: 2px 6px; border-radius: 10px; font-size: 0.68rem; line-height: 1.2; }
.pro-badge--new { left: 6px; background: #15803d; }
.pro-badge--excl { right: 6px; background: #7c3aed; text-align: right; }

.pro-img-wrap { position: relative; display: inline-block; margin-top: 18px; }
.pro-img { width: 80px; height: 80px; object-fit: contain; display: block; }
.pro-name {
  margin: 0; font-size: 0.78rem; font-weight: 700; text-align: center; color: #1a2a40;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pro-rarity { margin: 0; font-size: 0.7rem; color: #445; text-transform: capitalize; }
.pro-mint { margin: 0; font-size: 0.7rem; color: #556; }

.pro-foot {
  flex: 0 0 auto;
  display: flex; gap: 8px; flex-wrap: wrap;
  padding: 10px 12px;
  border-top: 1px solid #dbe5f3;
  background: #fff;
}
.pro-btn {
  flex: 1 1 140px;
  min-height: 44px;
  padding: 8px 18px;
  border-radius: 8px;
  border: 2px solid var(--OrbitDarkBlue, #336699);
  background: #fff; color: var(--OrbitDarkBlue, #336699);
  font-size: 0.95rem; font-weight: 700; cursor: pointer;
}
.pro-btn--primary { background: var(--OrbitDarkBlue, #336699); color: #fff; }
.pro-btn--primary:hover { background: var(--OrbitLightBlue, #3399cc); border-color: var(--OrbitLightBlue, #3399cc); }
.pro-btn--ghost { background: #fff; color: var(--OrbitDarkBlue, #336699); }

/* Contained glow: scales and fades only (compositor-friendly), never a full-viewport flash. */
.pro-glow {
  position: absolute; left: 50%; top: 50%;
  width: 120%; aspect-ratio: 1 / 1;
  margin-left: -60%; margin-top: -60%;
  border-radius: 50%;
  background: radial-gradient(circle, #fff 0%, #fff 55%, rgba(255, 255, 255, 0) 70%);
  pointer-events: none;
  transform: scale(0.02); opacity: 0;
  animation: pro-glow-grow 1.8s ease-in 1.2s forwards; /* peaks as the reveal begins (MIN_REVEAL_MS) */
}
.pro-glow--fade { animation: pro-glow-out 0.9s ease-out forwards; }

.pro-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

@keyframes pro-shake { from { transform: rotate(-2deg) scale(1); } to { transform: rotate(2deg) scale(1.03); } }
@keyframes pro-pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes pro-glow-grow { 0% { transform: scale(0.02); opacity: 0.9; } 100% { transform: scale(2.2); opacity: 0.9; } }
@keyframes pro-glow-out { from { opacity: 0.9; transform: scale(2.2); } to { opacity: 0; transform: scale(2.2); } }

@media (max-width: 768px) {
  .pro-backdrop { padding: 8px; }
  .pro-dialog { max-height: calc(100dvh - 16px); }
  .pro-body { padding: 12px; }
  /* 5 or fewer cards: two roomy columns. 6+: three compact columns so ten cards stay a short scroll. */
  .pro-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .pro-grid--many { grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .pro-grid--many .pro-card { padding: 8px 4px; }
  .pro-grid--many .pro-img { width: 64px; height: 64px; }
  .pro-grid--many .pro-name { font-size: 0.72rem; }
}

@media (prefers-reduced-motion: reduce) {
  .pro-glow { display: none; }
  .pro-pack-img--shake, .pro-card { animation: none; }
}
</style>
