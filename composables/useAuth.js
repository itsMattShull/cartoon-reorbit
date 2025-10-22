// composables/useAuth.js
export const useAuth = () => {
  const user = useState('user', () => null)

  const login = () => { window.location.href = '/api/auth/discord' }

  async function logout () {
    try {
      await $fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {}
    finally {
      user.value = null
      const session = useCookie('session'); session.value = null
      window.location.href = '/api/auth/discord'
    }
  }

  // Force fresh data. Avoid useFetch cache.
  const fetchSelf = async () => {
    try {
      const me = await $fetch('/api/auth/me', {
        credentials: 'include'
      })
      user.value = me
    } catch (err) {
      user.value = null
      const status = err?.data?.statusCode || err?.statusCode
      const msg = err?.data?.statusMessage || err?.message || ''
      if (status === 403 && /banned/i.test(msg || '')) {
        if (process.client) window.location.replace('/join-discord?banned=1')
      }
    }
  }

  // Optional helpers for optimistic UI
  const setUser = (partial) => { user.value = { ...(user.value || {}), ...partial } }
  const setPoints = (points) => { setUser({ points: Math.max(0, Number(points) || 0) }) }

  const isAdmin = computed(() => Boolean(user.value?.isAdmin))
  return { user, isAdmin, login, logout, fetchSelf, setUser, setPoints }
}