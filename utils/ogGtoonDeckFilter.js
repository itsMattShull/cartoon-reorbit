// utils/ogGtoonDeckFilter.js — the Manage Deck tab's gToon search/filter, shared by the sidebar panel
// (components/newsite/OgGtoonDeckSidebar.vue) and the card grid (components/oggtoons/OgGtoonDecks.vue).
import { GTOON_COLOR_ORDER } from './gtoonCardStyle.js'

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

/**
 * One entry per distinct gToon. /api/user/ctoons returns a row per COPY owned, but a deck is 12 different gToons
 * (the server rejects repeats and addCard refuses a second copy), so extra copies only bloat the grid. The first
 * copy stands for the card and `ownedCount` says how many the player has.
 */
export function dedupeByCtoon(cards) {
  const byCtoon = new Map()
  for (const c of cards || []) {
    const seen = byCtoon.get(c.ctoonId)
    if (seen) seen.ownedCount += 1
    else byCtoon.set(c.ctoonId, { ...c, ownedCount: 1 })
  }
  return [...byCtoon.values()]
}

const colorRank = (color) => {
  const i = GTOON_COLOR_ORDER.indexOf(String(color || '').toUpperCase())
  return i === -1 ? GTOON_COLOR_ORDER.length : i
}

/** Grid order: by colour (GTOON_COLOR_ORDER), then by the number on the card (low to high), then by name. Returns a new array. */
export function sortDeckCards(cards) {
  return [...cards].sort((a, b) =>
    colorRank(a.gtoonColor) - colorRank(b.gtoonColor)
    || (Number(a.gtoonValue) || 0) - (Number(b.gtoonValue) || 0)
    || String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  )
}
