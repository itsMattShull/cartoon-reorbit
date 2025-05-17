export const useAuth = () => {
    const user = useState('user', () => null)
  
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
  
    const fetchSelf = async () => {
      try {
        const { data } = await useFetch('/api/auth/me', { credentials: 'include' })
        user.value = data.value
      } catch (err) {
        user.value = null
      }
    }
  
    const isAdmin = computed(() => Boolean(user.value?.isAdmin))

    return { user, isAdmin, login, logout, fetchSelf }
  }