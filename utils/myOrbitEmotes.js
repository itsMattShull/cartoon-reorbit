// Shared canonical emote list for MyOrbit — built ONCE here so the player-facing emote picker
// (components/MyOrbitWindow.vue) and the server-side validator (server/utils/myOrbitSocket.js's
// 'emote' handler) can never drift apart on what's a valid emote key. Plain JS, no Vue/Nuxt
// imports, so it's usable from a Vue component, from the plain-Node socket-server.js process, and
// from a bare `node --test` run — same convention as utils/myOrbitIsometric.js.
//
// Emoji rather than uploaded art on purpose: no new asset pipeline, renders instantly on every
// platform, and a fixed small set keeps this from ever becoming a free-text abuse vector (unlike
// chat, there is nothing here for the banned-word filter to need to cover).
export const MYORBIT_EMOTES = [
  { key: 'wave', icon: '👋', label: 'Wave' },
  { key: 'dance', icon: '💃', label: 'Dance' },
  { key: 'laugh', icon: '😂', label: 'Laugh' },
  { key: 'cheer', icon: '🎉', label: 'Cheer' },
  { key: 'heart', icon: '❤️', label: 'Heart' },
  { key: 'wow', icon: '😮', label: 'Wow' }
]

const EMOTE_BY_KEY = new Map(MYORBIT_EMOTES.map(e => [e.key, e]))

export function isValidMyOrbitEmote(key) {
  return typeof key === 'string' && EMOTE_BY_KEY.has(key)
}

export function myOrbitEmoteIcon(key) {
  return EMOTE_BY_KEY.get(key)?.icon || null
}
