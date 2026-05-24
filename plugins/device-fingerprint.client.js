// plugins/device-fingerprint.client.js
//
// Computes a FingerprintJS visitorId once per browser session for the
// currently authenticated user and POSTs it to /api/auth/device-fingerprint
// so admins can correlate accounts that share the same device.
//
// - Runs only on the client.
// - Skips if no user is logged in (waits up to ~5s for auth hydration).
// - Skips if already captured this browser session (sessionStorage flag).
// - All errors are swallowed; capture is best-effort and must never block
//   page rendering or auth flows.

const SESSION_FLAG = 'cr_df_captured_v1'

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  // Defer to idle so we never compete with the initial paint.
  const schedule = (cb) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(cb, { timeout: 4000 })
    } else {
      window.setTimeout(cb, 1500)
    }
  }

  schedule(async () => {
    try {
      if (sessionStorage.getItem(SESSION_FLAG) === '1') return

      // Wait briefly for auth to hydrate. useAuth's user ref may be null
      // for a moment after navigation finishes.
      const { user, fetchSelf } = useAuth()
      if (!user.value) {
        try { await fetchSelf() } catch {}
      }
      if (!user.value) return

      // Lazy-import so FingerprintJS doesn't bloat the initial bundle for
      // unauthenticated visitors or SSR.
      const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
      const fp = await FingerprintJS.load()
      const { visitorId } = await fp.get()
      if (!visitorId) return

      await $fetch('/api/auth/device-fingerprint', {
        method: 'POST',
        body: { visitorId }
      })

      sessionStorage.setItem(SESSION_FLAG, '1')
    } catch (e) {
      // Best-effort — never block the page on a fingerprint failure.
      if (process.dev) console.warn('[device-fingerprint] capture failed', e)
    }
  })
})
