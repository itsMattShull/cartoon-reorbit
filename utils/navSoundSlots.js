// utils/navSoundSlots.js
//
// The fixed set of per-nav-button "haptic sound" assignment slots (see
// composables/useClickSoundEffects.js and the Sounds tab in Admin > Manage Homepage). Each key
// here must have a matching `data-nav-sound="<key>"` attribute on the corresponding link in
// components/newsite/NavLeft.vue / NavRight.vue — that data attribute is how a click gets
// mapped back to a slot; keep the two in sync by hand when either changes.
//
// 'default' is not a real nav button — it's the site-wide fallback sound (GlobalGameConfig.
// uiClickSoundPath) used for every button that isn't one of these named nav items. It's
// included in this list so the admin UI can render one uniform "assign a sound" row per slot,
// including the default.
export const NAV_SOUND_SLOTS = [
  { key: 'default', label: 'Default (every other button)' },
  { key: 'home', label: 'ReOrbit Home' },
  { key: 'my-cworld', label: 'My cWorld' },
  { key: 'cmart', label: 'cMart' },
  { key: 'auctions', label: 'Auctions' },
  { key: 'trades', label: 'Trades' },
  { key: 'economy', label: 'Economy' },
  { key: 'games', label: 'Games' },
  { key: 'redeem', label: 'Redeem' },
  { key: 'settings', label: 'Settings' },
  { key: 'logout', label: 'Logout' },
  { key: 'admin', label: 'Admin (admin users only)' }
]

export const NAV_SOUND_SLOT_KEYS = new Set(NAV_SOUND_SLOTS.map(s => s.key))

export function isNavSoundSlotKey(key) {
  return typeof key === 'string' && NAV_SOUND_SLOT_KEYS.has(key)
}
