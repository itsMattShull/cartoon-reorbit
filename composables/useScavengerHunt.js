import { useAuth } from '~/composables/useAuth'

export function useScavengerHunt() {
  const isOpen     = useState('scav-isOpen', () => false)
  const sessionId  = useState('scav-sessionId', () => '')
  const story      = useState('scav-story', () => null) // { id, title }
  const currentStep= useState('scav-step', () => null)   // { layer, path, description, imagePath, optionA, optionB }
  const path       = useState('scav-path', () => '')
  const loading    = useState('scav-loading', () => false)
  const result     = useState('scav-result', () => null) // { type, points?, ctoon? }

  async function maybeTrigger(trigger, opts = {}) {
    const open = opts && opts.open === true
    try {
      const res = await $fetch('/api/scavenger/consider', { method: 'POST', body: { trigger } })
      if (res && res.started) {
        sessionId.value = res.sessionId
        story.value     = res.story
        currentStep.value = res.step || null
        path.value      = res.path || ''
        result.value    = null
        if (open) isOpen.value = true
      }
    } catch (e) { /* swallow */ }
  }

  function openIfPending() {
    if (sessionId.value && currentStep.value && !result.value) {
      isOpen.value = true
    }
  }

  function reset() {
    isOpen.value = false
    sessionId.value = ''
    story.value = null
    currentStep.value = null
    path.value = ''
    result.value = null
    loading.value = false
  }

  async function choose(option) {
    if (!sessionId.value || !story.value) return
    if (loading.value) return
    loading.value = true
    try {
      const res = await $fetch('/api/scavenger/choose', {
        method: 'POST',
        body: { sessionId: sessionId.value, choice: option }
      })
      if (res?.continue) {
        currentStep.value = res.step || null
      } else if (res?.complete) {
        result.value = res.result
        // If user received points, refresh auth to update Nav points
        if (res?.result?.type === 'POINTS' && Number(res?.result?.points) > 0) {
          try {
            const { fetchSelf } = useAuth()
            await fetchSelf({ force: true })
          } catch {}
        }
      }
    } catch (e) {
      // if session invalid, close
      reset()
    } finally {
      loading.value = false
    }
  }

  async function close() {
    if (sessionId.value && !result.value) {
      try {
        await $fetch('/api/scavenger/cancel', { method: 'POST', body: { sessionId: sessionId.value } })
      } catch {}
    }
    isOpen.value = false
    reset()
  }

  return { isOpen, sessionId, story, currentStep, result, loading, maybeTrigger, openIfPending, choose, close, reset }
}
