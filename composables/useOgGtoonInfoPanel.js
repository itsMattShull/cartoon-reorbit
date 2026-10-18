// composables/useOgGtoonInfoPanel.js
// State for the Info tab on the Original gToons match board: clicking a gToon on the board or in the deck
// shows its printed properties there (the same data the right-click / long-press modal in
// useOgGtoonInfo shows, but kept in separate state so the two never open each other).
import { ref } from 'vue'

const card = ref(null)      // what the caller already knew (shown instantly)
const detail = ref(null)    // the card's printed properties from the server
const loading = ref(false)
const error = ref('')
let token = 0

/** Accepts a board entry, hand card or deck-builder card and normalises the bits we show at once. */
function normalise(c) {
  return {
    ctoonId: c.ctoonId ?? c.id ?? null,
    name: c.name || 'gToon',
    assetPath: c.assetPath || '',
    color: c.baseColor ?? c.gtoonColor ?? c.color ?? 'SILVER',
    value: c.baseValue ?? c.gtoonValue ?? c.value ?? 0,
    cardStyle: c.cardStyle ?? c.gtoonCardStyle ?? null
  }
}

async function show(c) {
  if (!c) return
  const b = normalise(c)
  card.value = b
  detail.value = null
  error.value = ''
  loading.value = false
  const mine = ++token
  if (!b.ctoonId) return
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

function clear() {
  token += 1
  card.value = null
  detail.value = null
  loading.value = false
  error.value = ''
}

export function useOgGtoonInfoPanel() {
  return { card, detail, loading, error, show, clear }
}
