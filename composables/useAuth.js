export const useAuth = () => {
    const user = useState('user', () => null)
    const fetchSelfInFlight = useState('auth:fetch-self-in-flight', () => null)
    const fetchSelfLastFetchedAt = useState('auth:fetch-self-last-fetched-at', () => 0)
  
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
          return me
        }
        const { data } = await useFetch('/api/auth/me', {
          credentials: 'include',
          headers: process.server ? useRequestHeaders(['cookie']) : undefined
        })
        user.value = data.value
        fetchSelfLastFetchedAt.value = Date.now()
        return data.value
      } catch (err) {
        user.value = null
        // If banned, kick to /join-discord with notice
        const status = err?.data?.statusCode || err?.statusCode
        const msg = err?.data?.statusMessage || err?.message || ''
        if (status === 403 && /banned/i.test(msg || '')) {
          if (process.client) window.location.replace('/join-discord?banned=1')
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

    return { user, isAdmin, login, logout, fetchSelf, setUser, setPoints }
  }
