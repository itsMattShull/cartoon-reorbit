// Singleton driver for full-screen cMoon effects — mirrors the useState-backed singleton pattern
// in useCtoonModal.js, but keeps `onComplete` in a plain module-level variable rather than
// useState: useState's value is part of the SSR payload and must stay serializable, and a
// function reference is neither serializable nor meaningful across the server/client split.
// Imported from utils/cmoonEffectTypes.js (the single source of truth also used by the
// server-side allow-list in server/utils/cmoon.js) so this list can't drift out of sync.
import { CMOON_EFFECT_TYPES } from '~/utils/cmoonEffectTypes'
const VALID_TYPES = CMOON_EFFECT_TYPES

let onCompleteCallback = null

export function useFullscreenEffect() {
  const active = useState('fx-active', () => false)
  // The descriptor for whichever effect is currently (or was most recently) playing:
  // { type: 'GLITCH' } for one of the closed built-in set, or
  // { type: 'CUSTOM', config: { backgroundColor, imagePath, text, textColor, textPosition } } for
  // an admin-authored CMoonJoinEffect. Kept as one object rather than a bare type string so every
  // caller (built-in or custom) shares a single calling convention — a second, permanently
  // parallel play() signature for custom effects was considered and rejected, since it would have
  // meant every one of the 5 play() call sites forking into two cases forever.
  const effect = useState('fx-effect', () => null)

  // Single-flight: a caller mid-effect (e.g. a fast double-submit) is ignored rather than
  // restarting or queuing — this app only ever has one full-screen effect in flight at a time.
  function play(descriptor, { onComplete } = {}) {
    if (active.value) return
    const type = descriptor?.type
    const isBuiltIn = VALID_TYPES.includes(type)
    const isCustom = type === 'CUSTOM' && descriptor?.config && typeof descriptor.config === 'object'
    if (!isBuiltIn && !isCustom) {
      onComplete?.()
      return
    }
    onCompleteCallback = onComplete || null
    effect.value = isCustom ? { type: 'CUSTOM', config: descriptor.config } : { type }
    active.value = true
  }

  // Called by FullscreenEffectHost.vue once its animation timeline finishes. Not exposed for
  // callers to invoke directly — per product decision, effects always play to completion.
  //
  // Fires the stored onComplete callback (route navigation / reward reveal) BEFORE clearing
  // `active` — the host wraps its overlay in a `<Transition>` now, so setting `active = false`
  // starts a CSS fade-out rather than an instant unmount; firing the callback in the same tick
  // means the destination route starts mounting immediately, behind the still-visible, now-fading
  // overlay, instead of only after it's gone (this is what actually fixes the old "fades to black
  // then abruptly ends" behavior — see performance/mobile review for why the *expensive* part of
  // the outgoing effect, e.g. a canvas rAF loop or an autoplaying GIF, still needs to stop the
  // instant `done` fires rather than riding out the full fade: that's handled by the host itself
  // unmounting the inner effect component immediately, independent of this timing).
  function finish() {
    if (!active.value) return
    const cb = onCompleteCallback
    onCompleteCallback = null
    cb?.()
    active.value = false
  }

  return { active, effect, play, finish }
}
