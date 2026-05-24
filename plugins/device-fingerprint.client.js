// plugins/device-fingerprint.client.js
//
// Computes a FingerprintJS visitorId for the currently authenticated user
// and POSTs it to /api/auth/device-fingerprint so admins can correlate
// accounts that share the same device.
//
// Re-captures whenever the logged-in user changes (watch on user.id), so
// logging out + logging in as a different account in the same tab still
// produces a fingerprint row for the second account. The sessionStorage
// flag is scoped to userId so each distinct user captures at most once
// per browser session.

const SESSION_FLAG_PREFIX = 'cr_df_captured_v1:'

async function captureFor(userId) {
  try {
    if (!userId) return
    const flag = SESSION_FLAG_PREFIX + userId
    if (sessionStorage.getItem(flag) === '1') return

    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
    const fp = await FingerprintJS.load()
    const { visitorId } = await fp.get()
    if (!visitorId) return

    await $fetch('/api/auth/device-fingerprint', {
      method: 'POST',
      body: { visitorId }
    })

    sessionStorage.setItem(flag, '1')
  } catch (e) {
    if (process.dev) console.warn('[device-fingerprint] capture failed', e)
  }
}

export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined') return

  const schedule = (cb) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(cb, { timeout: 4000 })
    } else {
      window.setTimeout(cb, 1500)
    }
  }

  schedule(async () => {
    const { user, fetchSelf } = useAuth()
    if (!user.value) {
      try { await fetchSelf() } catch {}
    }

    if (user.value?.id) captureFor(user.value.id)

    watch(
      () => user.value?.id || null,
      (newId) => { if (newId) captureFor(newId) }
    )
  })
})
