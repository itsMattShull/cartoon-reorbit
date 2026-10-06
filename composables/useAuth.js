export const useAuth = () => {
    const user = useState('user', () => null)
    const fetchSelfInFlight = useState('auth:fetch-self-in-flight', () => null)
    const fetchSelfLastFetchedAt = useState('auth:fetch-self-last-fetched-at', () => 0)
    // Where a banned/suspended account's 403 says it should be sent instead of the generic '/'.
    // Route middleware (middleware/newsite.js, middleware/auth.js) reads this when `!user.value`
    // and calls `navigateTo(blockedRedirect.value || '/')`. This has to be `navigateTo`, not a
    // client-only `window.location.replace` fired from inside fetchSelf: the FIRST time a banned/
    // suspended account loads a page, the request is server-rendered, `fetchSelf` runs during
    // SSR where `window` doesn't exist, and the middleware's own `navigateTo('/')` becomes a real
    // 302 sent before any client JS exists to redirect further — the user lands on the bare
    // homepage with no explanation. Routing the redirect through the state the middleware already
    // calls `navigateTo` with fixes both the SSR case and the client SPA-navigation case the same
    // way, with no race between two different navigation mechanisms.
    const blockedRedirect = useState('auth:blocked-redirect', () => null)
  
    const login = () => {
      window.location.href = '/api/auth/discord'
    }
  
    async function logout () {
      try {
        await $fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        })
      } catch (err) {
        // Ignore network / server errors: we'll still clear local state.
      } finally {
        user.value = null
        blockedRedirect.value = null
        // Pro‑actively clear the cookie client‑side as well.
        const session = useCookie('session')
        session.value = null
        // Replace the current history entry so "Back" doesn’t jump to a protected page.
        window.location.href = '/api/auth/discord'
      }
    }
  
    const fetchSelf = async (opts = {}) => {
      const ttlMs = Number(opts.ttlMs) || 0

      if (!opts.force) {
        if (fetchSelfInFlight.value) {
          return fetchSelfInFlight.value
        }

        const ageMs = Date.now() - (fetchSelfLastFetchedAt.value || 0)
        if (ttlMs > 0 && ageMs < ttlMs) {
          return user.value
        }
      }

      const request = (async () => {
      try {
        if (opts.force) {
          const me = await $fetch('/api/auth/me', {
            credentials: 'include',
            headers: {
              ...(process.server ? useRequestHeaders(['cookie']) : {}),
              'cache-control': 'no-store' // bypass any proxy/browser cache
            }
          })
          user.value = me
          fetchSelfLastFetchedAt.value = Date.now()
          blockedRedirect.value = null
          return me
        }
        const me = await $fetch('/api/auth/me', {
          credentials: 'include',
          headers: process.server ? useRequestHeaders(['cookie']) : undefined
        })
        user.value = me
        fetchSelfLastFetchedAt.value = Date.now()
        blockedRedirect.value = null
        return me
      } catch (err) {
        user.value = null
        // If banned or temporarily suspended, record where the calling route middleware should
        // redirect instead of '/' — see blockedRedirect's own comment above.
        const status = err?.data?.statusCode || err?.statusCode
        const msg = err?.data?.statusMessage || err?.message || ''
        const suspendedMatch = msg.match(/^Suspended until (.+)$/i)
        if (status === 403 && suspendedMatch) {
          blockedRedirect.value = `/join-discord?suspended=1&until=${encodeURIComponent(suspendedMatch[1])}`
        } else if (status === 403 && /banned/i.test(msg || '')) {
          blockedRedirect.value = '/join-discord?banned=1'
        } else {
          blockedRedirect.value = null
        }
        // Belt-and-suspenders for an account that gets banned/suspended mid-session, in an
        // already-open client-side tab, discovered by a component polling fetchSelf outside of
        // any route middleware (so nothing else would otherwise act on blockedRedirect).
        if (process.client && blockedRedirect.value) {
          window.location.replace(blockedRedirect.value)
        }
        return null
      }
      })()

      if (!opts.force) {
        fetchSelfInFlight.value = request
        request.finally(() => {
          if (fetchSelfInFlight.value === request) {
            fetchSelfInFlight.value = null
          }
        })
      }

      return request
    }

    // Optional helpers for optimistic UI
    const setUser = (partial) => { user.value = { ...(user.value || {}), ...partial } }
    const setPoints = (points) => { setUser({ points: Math.max(0, Number(points) || 0) }) }
  
    const isAdmin = computed(() => Boolean(user.value?.isAdmin))

    return { user, isAdmin, login, logout, fetchSelf, setUser, setPoints, blockedRedirect }
  }
