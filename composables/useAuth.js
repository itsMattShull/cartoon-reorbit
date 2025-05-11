export const useAuth = () => {
    const user = useState('user', () => null)
  
    const login = () => {
      window.location.href = '/api/auth/discord'
    }
  
    async function logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      user.value = null
      navigateTo('/')
    }
  
    const fetchSelf = async () => {
      try {
        const { data } = await useFetch('/api/auth/me', { credentials: 'include' })
        user.value = data.value
      } catch (err) {
        user.value = null
      }
    }
  
    return { user, login, logout, fetchSelf }
  }
  