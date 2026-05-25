// composables/useBehavioralCapture.js
// Captures keystroke and touch timing events on text fields during the
// survey, then batches them to /api/survey/behavioral on blur (or every 5s).
//
// Usage:
//   const { attachTo, stopCapture } = useBehavioralCapture(sessionId)
//   // In template: @focus="attachTo($event.target, 'whyJoin')"
//                  @blur="detachFrom($event.target)"

export function useBehavioralCapture(sessionId) {
  const deviceClass = ref('desktop')
  const pendingEvents = ref([])
  const flushTimer = ref(null)
  const keydownTimes = {}
  const handlers = new Map() // element → { down, up, focus, blur }

  onMounted(() => {
    deviceClass.value = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
      ? 'mobile'
      : 'desktop'
  })

  function recordEvent(type, fieldName, data) {
    pendingEvents.value.push({ type, fieldName, ts: Date.now(), ...data })
  }

  function scheduleFlush() {
    if (flushTimer.value) return
    flushTimer.value = setTimeout(() => {
      flushTimer.value = null
      flush()
    }, 5000)
  }

  async function flush() {
    if (!pendingEvents.value.length) return
    const batch = pendingEvents.value.splice(0)
    try {
      await $fetch('/api/survey/behavioral', {
        method: 'POST',
        body: { sessionId, deviceClass: deviceClass.value, events: batch },
        credentials: 'include',
      })
    } catch {
      // best-effort — don't surface errors to user
    }
  }

  function attachTo(el, fieldName) {
    if (!el || handlers.has(el)) return

    const onKeydown = (e) => {
      keydownTimes[e.key] = Date.now()
      if (e.key === 'Backspace') {
        recordEvent('backspace', fieldName, {})
        scheduleFlush()
      }
    }

    const onKeyup = (e) => {
      const down = keydownTimes[e.key]
      if (down) {
        const dwell = Date.now() - down
        recordEvent('dwell', fieldName, { key: e.key, dwell })
        delete keydownTimes[e.key]
        scheduleFlush()
      }
    }

    const onFocus = () => recordEvent('focus', fieldName, {})
    const onBlur  = () => {
      recordEvent('blur', fieldName, {})
      flush()
    }

    el.addEventListener('keydown', onKeydown)
    el.addEventListener('keyup',   onKeyup)
    el.addEventListener('focus',   onFocus)
    el.addEventListener('blur',    onBlur)

    handlers.set(el, { onKeydown, onKeyup, onFocus, onBlur })
  }

  function detachFrom(el) {
    const h = handlers.get(el)
    if (!h) return
    el.removeEventListener('keydown', h.onKeydown)
    el.removeEventListener('keyup',   h.onKeyup)
    el.removeEventListener('focus',   h.onFocus)
    el.removeEventListener('blur',    h.onBlur)
    handlers.delete(el)
  }

  function stopCapture() {
    for (const [el] of handlers) detachFrom(el)
    if (flushTimer.value) { clearTimeout(flushTimer.value); flushTimer.value = null }
    flush()
  }

  return { attachTo, detachFrom, stopCapture }
}
