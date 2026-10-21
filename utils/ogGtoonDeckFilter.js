// utils/ogGtoonDeckFilter.js — the Manage Deck tab's gToon search/filter, shared by the sidebar panel
// (components/newsite/OgGtoonDeckSidebar.vue) and the card grid (components/oggtoons/OgGtoonDecks.vue).
export const OG_CARD_TYPES = ['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN']

export const emptyDeckFilter = () => ({
  search: '',        // matches the gToon's name and/or any of its character names
  set: '',
  series: '',
  types: [],         // a card matches when it carries ANY selected type
  hasPowers: false,
  minNumber: '',     // the number printed on the card (its value); '' = no bound
  maxNumber: ''
})

const bound = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v))

export function isDeckFilterActive(f) {
  const e = emptyDeckFilter()
  return Object.keys(e).some(k => (Array.isArray(e[k]) ? f[k]?.length > 0 : (f[k] ?? e[k]) !== e[k]))
}

/** True when a gToon from /api/user/ctoons?isOgGtoon=true passes every active filter. */
export function matchesDeckFilter(card, f) {
  const q = (f.search || '').trim().toLowerCase()
  if (q) {
    const hit = String(card.name || '').toLowerCase().includes(q)
      || (card.characters || []).some(c => String(c).toLowerCase().includes(q))
    if (!hit) return false
  }
  if (f.set && card.set !== f.set) return false
  if (f.series && card.series !== f.series) return false
  if (f.types?.length && !(card.gtoonTypes || []).some(t => f.types.includes(t))) return false
  if (f.hasPowers && !card.powerDescription) return false
  const value = Number(card.gtoonValue)
  const lo = bound(f.minNumber)
  const hi = bound(f.maxNumber)
  if (lo !== null && !(value >= lo)) return false
  if (hi !== null && !(value <= hi)) return false
  return true
}

/** Characters of `card` that already appear on a different card in `slotCards` (empty = no clash). */
export function sharedCharacters(card, slotCards) {
  const mine = new Set((card.characters || []).map(c => String(c).toLowerCase()))
  if (!mine.size) return []
  const out = new Set()
  for (const other of slotCards) {
    if (!other || other.ctoonId === card.ctoonId) continue
    for (const c of other.characters || []) if (mine.has(String(c).toLowerCase())) out.add(c)
  }
  return [...out]
}
