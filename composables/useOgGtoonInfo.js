// composables/useOgGtoonInfo.js
// One shared "gToon properties" dialog for the whole Original gToons UI, opened by right-clicking a card
// (desktop) or long-pressing it (mobile / tablet). State is module-level so any card can open the single
// <OgGtoonInfoModal /> that is mounted by the board / deck builder.
import { ref } from 'vue'

const isOpen = ref(false)
const base = ref(null)      // what the caller already knew (shown instantly)
const detail = ref(null)    // the card's printed properties from the server
const loading = ref(false)
const error = ref('')
let token = 0

/** Accepts a board entry, hand card, goal card or deck-builder card and normalises the bits we show at once. */
function normalise(card) {
  return {
    ctoonId: card.ctoonId ?? card.id ?? null,
    name: card.name || 'gToon',
    assetPath: card.assetPath || '',
    color: card.baseColor ?? card.gtoonColor ?? card.color ?? 'SILVER',
    value: card.baseValue ?? card.gtoonValue ?? card.value ?? 0,
    cardStyle: card.cardStyle ?? card.gtoonCardStyle ?? null
  }
}

async function open(card) {
  if (!card || isOpen.value) return // idempotent: Android fires both our long-press and a contextmenu
  const b = normalise(card)
  base.value = b
  detail.value = null
  error.value = ''
  isOpen.value = true
  if (!b.ctoonId) return
  const mine = ++token
  loading.value = true
  try {
    const d = await $fetch(`/api/game/oggtoons/card/${encodeURIComponent(b.ctoonId)}`)
    if (mine === token) detail.value = d
  } catch (e) {
    if (mine === token) error.value = e?.data?.statusMessage || 'Could not load this gToon\'s properties.'
  } finally {
    if (mine === token) loading.value = false
  }
}

function close() {
  token += 1
  isOpen.value = false
  loading.value = false
}

/**
 * Event handlers that make an element inspectable: right-click (desktop) or a ~0.5s press (touch / pen).
 * `getCard()` returns the card to inspect, or null when nothing may be inspected right now (e.g. a face-down
 * card). A long-press swallows the click that follows so it doesn't also place / select the card.
 */
function inspectGesture(getCard, { holdMs = 500, moveTolerance = 10 } = {}) {
  let timer = null
  let startX = 0
  let startY = 0
  let fired = false
  let firedReset = null
  const clear = () => { clearTimeout(timer); timer = null }
  return {
    contextmenu(e) {
      const card = getCard()
      if (!card) return
      e.preventDefault()
      open(card)
    },
    pointerdown(e) {
      if (e.pointerType === 'mouse' || (e.button != null && e.button > 0)) return
      clear()
      startX = e.clientX
      startY = e.clientY
      timer = setTimeout(() => {
        timer = null
        const card = getCard()
        if (!card) return
        fired = true
        clearTimeout(firedReset)
        firedReset = setTimeout(() => { fired = false }, 700) // never leave a stale "swallow the next click"
        open(card)
      }, holdMs)
    },
    pointermove(e) {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > moveTolerance) clear()
    },
    pointerup: clear,
    pointercancel: clear,
    pointerleave: clear,
    clickCapture(e) {
      if (!fired) return
      fired = false
      e.stopPropagation()
      e.preventDefault()
    }
  }
}

export function useOgGtoonInfo() {
  return { isOpen, base, detail, loading, error, open, close, inspectGesture }
}
