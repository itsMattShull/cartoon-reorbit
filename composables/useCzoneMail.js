// Shared cMail client state.
//
// The send cooldown is global per sender, and players hop between cZones
// constantly (the nav arrows push a new route each time), which unmounts the send
// modal. Keeping the cooldown in component state would reset the countdown on
// every hop and the next send would just bounce off the server. useState keeps it
// alive for the session, seeded from the server's retryAfter rather than a
// client clock.

export const useCzoneMailState = () => useState('czoneMail', () => ({
  // Epoch ms when the global cooldown ends.
  cooldownUntil: 0,
  // Epoch ms when a burst block ends, if one is active.
  blockedUntil: 0,
  // Unread count for the My cWorld badge.
  unread: 0,
  unreadLoaded: false
}))

export function useCzoneMail() {
  const state = useCzoneMailState()

  // A single ticking clock drives every countdown, so components don't each run
  // their own interval.
  const now = useState('czoneMailNow', () => Date.now())
  if (process.client && !useState('czoneMailTicking', () => false).value) {
    useState('czoneMailTicking').value = true
    setInterval(() => { now.value = Date.now() }, 1000)
  }

  const cooldownRemaining = computed(() =>
    Math.max(0, Math.ceil((state.value.cooldownUntil - now.value) / 1000))
  )
  const blockRemaining = computed(() =>
    Math.max(0, Math.ceil((state.value.blockedUntil - now.value) / 1000))
  )
  const canSend = computed(() => cooldownRemaining.value === 0 && blockRemaining.value === 0)

  function noteCooldown(seconds) {
    state.value.cooldownUntil = Date.now() + Math.max(0, Number(seconds) || 0) * 1000
  }

  function noteBlock(seconds) {
    state.value.blockedUntil = Date.now() + Math.max(0, Number(seconds) || 0) * 1000
  }

  /** Apply a 429 response from the send endpoint. */
  function noteRejection(reason, retryAfterSeconds) {
    if (reason === 'spam_block') noteBlock(retryAfterSeconds)
    else noteCooldown(retryAfterSeconds)
  }

  async function refreshUnread() {
    try {
      const res = await $fetch('/api/czone-mail/unread-count')
      state.value.unread = Number(res?.count ?? 0)
    } catch {
      state.value.unread = 0
    } finally {
      state.value.unreadLoaded = true
    }
  }

  function setUnread(n) {
    state.value.unread = Math.max(0, Number(n) || 0)
    state.value.unreadLoaded = true
  }

  return {
    state,
    cooldownRemaining,
    blockRemaining,
    canSend,
    noteCooldown,
    noteBlock,
    noteRejection,
    refreshUnread,
    setUnread
  }
}

/** Compact relative date used in the inbox and on the wall. */
export function formatCzoneMailDate(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
