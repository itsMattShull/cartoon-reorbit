export function useCtoonModal() {
  const isOpen = useState('ctoon-modal-open', () => false)
  const loading = useState('ctoon-modal-loading', () => false)
  const error = useState('ctoon-modal-error', () => null)
  const data = useState('ctoon-modal-data', () => null)
  const requestToken = useState('ctoon-modal-token', () => 0)
  const context = useState('ctoon-modal-context', () => ({
    source: '',
    isOwner: false,
    username: ''
  }))
  const holidaySignal = useState('ctoon-modal-holiday-signal', () => 0)
  const holidayRedeem = useState('ctoon-modal-holiday-redeem', () => null)

  async function open({ ctoonId, userCtoonId, assetPath, name } = {}) {
    if (!ctoonId && !userCtoonId) return

    const token = requestToken.value + 1
    requestToken.value = token
    isOpen.value = true
    loading.value = true
    error.value = null

    data.value = {
      ctoon: {
        id: ctoonId || null,
        name: name || null,
        assetPath: assetPath || null
      },
      userCtoon: null
    }

    try {
      const res = await $fetch('/api/ctoon/modal', {
        query: {
          ...(ctoonId ? { ctoonId } : {}),
          ...(userCtoonId ? { userCtoonId } : {})
        }
      })
      if (requestToken.value !== token) return
      data.value = res
    } catch (err) {
      if (requestToken.value !== token) return
      error.value = err
    } finally {
      if (requestToken.value === token) loading.value = false
    }
  }

  function close() {
    isOpen.value = false
  }

  function setContext(next = {}) {
    context.value = { ...context.value, ...next }
  }

  function clearContext() {
    context.value = { source: '', isOwner: false, username: '' }
  }

  function notifyHolidayRedeem(payload) {
    holidayRedeem.value = payload || null
    holidaySignal.value += 1
  }

  return {
    isOpen,
    loading,
    error,
    data,
    context,
    holidaySignal,
    holidayRedeem,
    open,
    close,
    setContext,
    clearContext,
    notifyHolidayRedeem
  }
}
