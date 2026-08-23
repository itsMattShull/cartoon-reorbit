// Singleton driver for full-screen cMoon effects (Glitch/Slime) — mirrors the useState-backed
// singleton pattern in useCtoonModal.js, but keeps `onComplete` in a plain module-level variable
// rather than useState: useState's value is part of the SSR payload and must stay serializable,
// and a function reference is neither serializable nor meaningful across the server/client split.
const VALID_TYPES = ['GLITCH', 'SLIME']

let onCompleteCallback = null

export function useFullscreenEffect() {
  const active = useState('fx-active', () => false)
  const type = useState('fx-type', () => null)

  // Single-flight: a caller mid-effect (e.g. a fast double-submit) is ignored rather than
  // restarting or queuing — this app only ever has one full-screen effect in flight at a time.
  function play(effectType, { onComplete } = {}) {
    if (active.value) return
    if (!VALID_TYPES.includes(effectType)) {
      onComplete?.()
      return
    }
    onCompleteCallback = onComplete || null
    type.value = effectType
    active.value = true
  }

  // Called by FullscreenEffectHost.vue once its animation timeline finishes. Not exposed for
  // callers to invoke directly — per product decision, effects always play to completion.
  function finish() {
    if (!active.value) return
    active.value = false
    type.value = null
    const cb = onCompleteCallback
    onCompleteCallback = null
    cb?.()
  }

  return { active, type, play, finish }
}
