// Looping battle-music helper shared by the solo battle popup (components/CMoonBattlePopupHost.vue)
// and the raid page (pages/newsite/cmoon-raid/[id].vue) — factored out after the exact same
// start/stop/autoplay-retry logic was duplicated verbatim in both places. Each caller gets its OWN
// instance (not a module-level singleton): solo and raid music are mutually exclusive by
// construction (a player is never in both at once), but each caller owns its own stop-on-unmount
// lifecycle and must not affect the other's state.
export function useBattleMusic() {
  let el = null
  let retryCleanup = null

  function clearRetry() {
    if (retryCleanup) { retryCleanup(); retryCleanup = null }
  }

  function stop() {
    clearRetry()
    if (!el) return
    try { el.pause() } catch {}
    el = null
  }

  function start(path) {
    stop()
    if (!path || typeof window === 'undefined') return
    try {
      const audio = new Audio(path)
      audio.loop = true
      audio.volume = 0.5
      el = audio
      audio.play().catch(() => {
        // Browser autoplay policy can block sound with no recent-enough user gesture — rather
        // than leaving the track silently dead for the rest of the fight, retry exactly once on
        // the player's next real interaction with the page. Guarded against `audio` having
        // already been superseded (stop()/a newer track) by the time that interaction happens.
        if (el !== audio || typeof document === 'undefined') return
        const retry = () => { if (el === audio) audio.play().catch(() => {}) }
        document.addEventListener('pointerdown', retry, { once: true })
        retryCleanup = () => document.removeEventListener('pointerdown', retry)
      })
    } catch {}
  }

  return { start, stop }
}
