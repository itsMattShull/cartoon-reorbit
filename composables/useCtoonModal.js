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

  // `context` resets to neutral on every open() unless the caller passes one
  // explicitly (context: { source: 'market', ... }) — context is a shared
  // singleton, so resetting it here (rather than requiring every caller to
  // remember a separate clearContext() call beforehand) is what keeps a
  // stale source from a previous modal open (e.g. 'market') from silently
  // leaking into an unrelated one opened later from a different page.
  async function open({ ctoonId, userCtoonId, assetPath, name, context: nextContext } = {}) {
    if (!ctoonId && !userCtoonId) return

    context.value = { source: '', isOwner: false, username: '', ...(nextContext || {}) }

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
