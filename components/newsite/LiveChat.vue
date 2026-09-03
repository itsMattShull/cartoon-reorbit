<template>
  <!-- Teleported to body for the same reason as EconomyCtoonHistoryModal /
       EconomyFeaturedAuctionsCarousel: .site-container carries a transform,
       which makes it the containing block for position:fixed descendants and
       clips them to the scaled 1040px chrome instead of the real viewport. -->
  <Teleport to="body">
    <div class="echat">
      <button
        type="button"
        class="echat-toggle"
        :class="{ 'echat-toggle--open': open }"
        :aria-expanded="open ? 'true' : 'false'"
        aria-controls="live-chat-panel"
        @click="togglePanel"
      >
        <span aria-hidden="true">💬</span>
        <span>{{ open ? 'Close Chat' : 'Chat' }}</span>
        <span v-if="!open && unreadCount > 0" class="echat-unread" aria-hidden="true">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </button>

      <div v-if="open" id="live-chat-panel" class="echat-panel" role="dialog" aria-label="Live chat">
        <div class="echat-header">
          <span class="echat-title">Live Chat</span>
          <span class="echat-header-actions">
            <button
              v-if="isAdmin"
              type="button"
              class="echat-mod-toggle"
              :aria-expanded="showActiveTimeouts ? 'true' : 'false'"
              @click="showActiveTimeouts = !showActiveTimeouts"
            >🛡 {{ activeTimeouts.length || '' }}</button>
            <button type="button" class="echat-close" aria-label="Close chat" @click="togglePanel">✕</button>
          </span>
        </div>

        <div v-if="isAdmin && showActiveTimeouts" class="echat-timeouts">
          <p v-if="!activeTimeouts.length" class="echat-timeouts-empty">No active timeouts.</p>
          <div v-for="t in activeTimeouts" :key="t.id" class="echat-timeout-row">
            <span class="echat-timeout-user">{{ t.username }}</span>
            <span class="echat-timeout-until">until {{ new Date(t.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}</span>
            <button type="button" class="echat-timeout-lift" @click="liftTimeout(t.userId)">Lift</button>
          </div>
        </div>

        <div ref="listEl" class="echat-list" @scroll="onScroll">
          <!-- Not logged in: the history endpoint is the source of truth for
               this (401), so it doubles as the auth check — no separate probe. -->
          <div v-if="authState === 'anon'" class="echat-state">
            <p>Sign in to join the conversation.</p>
            <button type="button" class="echat-signin" @click="login">Sign In</button>
          </div>

          <div v-else-if="authState === 'error'" class="echat-state">
            <p>Couldn't load chat right now.</p>
            <button type="button" class="echat-signin" @click="openFresh">Retry</button>
          </div>

          <template v-else>
            <div v-if="loadingInitial" class="echat-state">Loading messages…</div>
            <template v-else>
              <div v-if="loadingMore" class="echat-loadmore">Loading earlier messages…</div>
              <div v-else-if="!hasMore && messages.length" class="echat-loadmore echat-loadmore--end">Start of the conversation</div>

              <p v-if="!messages.length" class="echat-state echat-state--empty">No messages yet — say hi!</p>

              <template v-for="m in messages" :key="m.id">
                <p v-if="m.system" class="echat-system-note">{{ m.body }}</p>

                <div v-else class="echat-msg">
                  <div class="echat-msg-head">
                    <span class="echat-msg-user">{{ m.username }}</span>
                    <span class="echat-msg-time">{{ relativeTime(m.createdAt) }}</span>
                    <span v-if="isAdmin" class="echat-msg-mod">
                      <button type="button" class="echat-mod-btn" title="Delete message" @click="deleteMessage(m.id)">🗑</button>
                      <button
                        v-if="m.userId !== user?.id"
                        type="button"
                        class="echat-mod-btn"
                        title="Time out this player"
                        @click="openTimeoutPrompt(m.userId, m.id)"
                      >⏱</button>
                    </span>
                  </div>
                  <!-- Plain text interpolation only — body is untrusted input from every
                       other player and is replayed to every future viewer via history,
                       so v-html here would be a stored-XSS hole. No linkification either:
                       inert text is a deliberate anti-scam measure for a real-economy game. -->
                  <div class="echat-msg-body">{{ m.body }}</div>

                  <div v-if="isAdmin && timeoutPromptMessageId === m.id" class="echat-timeout-prompt">
                    <select v-model.number="timeoutMinutes" class="echat-timeout-select">
                      <option v-for="d in TIMEOUT_DURATIONS" :key="d.minutes" :value="d.minutes">{{ d.label }}</option>
                    </select>
                    <input v-model="timeoutReason" class="echat-timeout-reason" type="text" maxlength="200" placeholder="Reason (optional)" />
                    <button type="button" class="echat-timeout-confirm" @click="submitTimeout">Time Out</button>
                    <button type="button" class="echat-timeout-cancel" @click="cancelTimeoutPrompt">Cancel</button>
                  </div>
                </div>
              </template>
            </template>
          </template>
        </div>

        <p v-if="chatError" class="echat-error" role="alert">{{ chatError }}</p>

        <div v-if="authState === 'ok'" class="echat-compose">
          <p v-if="timedOut" class="echat-timedout-banner">
            You're timed out from chat until {{ timeoutUntilLabel }}<span v-if="myTimeout?.reason">: {{ myTimeout.reason }}</span>.
          </p>
          <textarea
            v-model="draft"
            class="echat-input"
            rows="1"
            :placeholder="timedOut ? 'You cannot send messages right now…' : 'Say something…'"
            maxlength="320"
            :disabled="timedOut"
            @keydown.enter.exact.prevent="send"
          />
          <div class="echat-compose-foot">
            <span class="echat-compose-status">
              <span v-if="!socketConnected" class="echat-connecting">Connecting…</span>
              <span class="echat-counter" :class="{ 'echat-counter--warn': draft.length > 280, 'echat-counter--over': draft.length > 300 }">
                {{ draft.length }}/300
              </span>
            </span>
            <button type="button" class="echat-send" :disabled="!canSend" @click="send">Send</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// One shared room across every page this component is dropped onto (Economy,
// Auction House, individual auction pages) — deliberately not per-page/per-
// auction, so it reads as one community hangout rather than fragmenting into
// silos. Keep this literal string in sync with the ChatMessage/ChatTimeout
// rows already persisted under "economy" from before this component covered
// more than the Economy page — renaming it would orphan existing history.
const ROOM = 'economy'
const NEAR_BOTTOM_PX = 80
const NEAR_TOP_PX = 40

const config = useRuntimeConfig()
const { user, login, fetchSelf, isAdmin } = useAuth()

const open = ref(false)
const unreadCount = ref(0)

// Moderation (admin-only UI; every action is also re-checked server-side).
const myTimeout = ref(null) // { expiresAt, reason } | null — am I currently timed out
const timedOut = computed(() => !!myTimeout.value && new Date(myTimeout.value.expiresAt) > new Date())
const timeoutUntilLabel = computed(() => (
  myTimeout.value ? new Date(myTimeout.value.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
))
const activeTimeouts = ref([]) // admin panel: [{id, userId, username, reason, expiresAt}]
const showActiveTimeouts = ref(false)
// Split in two: a user can have several messages in view, so the prompt must
// render under the ONE message that was clicked (timeoutPromptMessageId),
// while the action itself always targets the user (timeoutPromptForUserId).
const timeoutPromptMessageId = ref(null)
const timeoutPromptForUserId = ref(null)
const timeoutMinutes = ref(15)
const timeoutReason = ref('')
const TIMEOUT_DURATIONS = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '24 hours' }
]

// 'ok' | 'anon' | 'error' — set once the first history load resolves.
const authState = ref(null)
const loadingInitial = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)
const messages = ref([])
const seenIds = new Set()

const listEl = ref(null)
let hasLoadedOnce = false
let socket = null
// A ref (not a plain flag) because canSend and the compose-box "connecting…"
// note both need to react to it.
const socketConnected = ref(false)

const draft = ref('')
const sending = ref(false)
let pendingBody = null
let sendingTimeout = null

const chatError = ref('')
let chatErrorTimeout = null

const canSend = computed(() => {
  const len = draft.value.trim().length
  return len > 0 && len <= 300 && !sending.value && socketConnected.value && !timedOut.value
})

function showChatError(message) {
  chatError.value = message
  clearTimeout(chatErrorTimeout)
  chatErrorTimeout = setTimeout(() => { chatError.value = '' }, 4000)
}

function relativeTime(iso) {
  const d = new Date(iso)
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d`
  return d.toLocaleDateString()
}

function isNearBottom() {
  const el = listEl.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
}

function scrollToBottom() {
  nextTick(() => {
    const el = listEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function addMessage(m) {
  if (seenIds.has(m.id)) return
  seenIds.add(m.id)
  messages.value.push(m)
}

// A local-only, unpersisted line ("Someone was timed out for 15m") so the
// room understands why a player went quiet — never stored, never sent to the
// server, just synthesized from the chat:timeout(-lifted) broadcast every
// open tab already receives.
function addSystemNote(text) {
  messages.value.push({ id: `sys-${Date.now()}-${Math.random()}`, system: true, body: text, createdAt: new Date().toISOString() })
}

async function fetchTimeoutStatus() {
  try {
    const res = await $fetch('/api/economy/chat/timeout-status', { query: { room: ROOM } })
    myTimeout.value = res?.timedOut ? { expiresAt: res.expiresAt, reason: res.reason } : null
  } catch {
    // Non-fatal: worst case the compose box stays enabled until the server
    // rejects a send and the resulting chat:error explains why.
  }
}

async function fetchActiveTimeouts() {
  if (!isAdmin.value) return
  try {
    const res = await $fetch('/api/admin/economy/chat/timeouts', { query: { room: ROOM } })
    activeTimeouts.value = res?.timeouts || []
  } catch {
    activeTimeouts.value = []
  }
}

async function fetchHistory(before) {
  return await $fetch('/api/economy/chat/history', {
    query: { room: ROOM, limit: 50, ...(before ? { before } : {}) }
  })
}

async function togglePanel() {
  open.value = !open.value
  if (!open.value) return

  unreadCount.value = 0

  if (!hasLoadedOnce) {
    await loadInitial()
    return
  }
  // Already loaded once this mount — just make sure we're still connected
  // (a dropped/never-established socket shouldn't silently strand the panel
  // in a read-only state).
  if (authState.value === 'ok' && !socketConnected.value) connectSocket()
  scrollToBottom()
}

async function openFresh() {
  hasLoadedOnce = false
  await loadInitial()
}

async function loadInitial() {
  loadingInitial.value = true
  try {
    const res = await fetchHistory()
    messages.value = []
    seenIds.clear()
    // API returns newest-first; display wants oldest-at-top.
    for (const m of [...res.messages].reverse()) addMessage(m)
    hasMore.value = !!res.hasMore
    authState.value = 'ok'
    hasLoadedOnce = true
    connectSocket()
    scrollToBottom()
    // Best-effort — used only to label the sender's own outgoing sends; the
    // history/socket auth check above is what actually gates the panel.
    if (!user.value) await fetchSelf({ ttlMs: 30000 })
    fetchTimeoutStatus()
    fetchActiveTimeouts()
  } catch (err) {
    authState.value = err?.statusCode === 401 ? 'anon' : 'error'
  } finally {
    loadingInitial.value = false
  }
}

async function loadOlder() {
  if (loadingMore.value || !hasMore.value || !messages.value.length) return
  loadingMore.value = true
  const el = listEl.value
  const prevScrollHeight = el ? el.scrollHeight : 0
  const prevScrollTop = el ? el.scrollTop : 0
  try {
    const oldest = messages.value[0]
    const res = await fetchHistory(oldest.createdAt)
    const older = [...res.messages].reverse().filter(m => !seenIds.has(m.id))
    messages.value.unshift(...older)
    older.forEach(m => seenIds.add(m.id))
    hasMore.value = !!res.hasMore
    nextTick(() => {
      if (!el) return
      // Keep the reader's spot fixed instead of yanking them to a new position
      // when older messages grow the list above what they're looking at.
      el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop
    })
  } catch {
    // Silent: an infinite-scroll fetch failing just means the next scroll
    // attempt retries it. hasMore stays true so that happens.
  } finally {
    loadingMore.value = false
  }
}

function onScroll() {
  const el = listEl.value
  if (!el || authState.value !== 'ok' || loadingInitial.value) return
  if (el.scrollTop < NEAR_TOP_PX) loadOlder()
}

function connectSocket() {
  if (socket) return
  import('socket.io-client').then(({ io }) => {
    if (socket) return // panel closed/reopened while the import was in flight
    const path = import.meta.env.PROD
      ? undefined
      : `http://localhost:${config.public.socketPort}`

    socket = io(path, {
      autoConnect: false,
      withCredentials: true,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      socketConnected.value = true
      socket.emit('join-chat-room', { room: ROOM })
    })

    socket.on('disconnect', () => { socketConnected.value = false })

    socket.on('chat:message', (payload) => {
      if (!payload || payload.room !== ROOM) return
      const wasNearBottom = isNearBottom()
      addMessage(payload)
      if (sending.value && pendingBody !== null && payload.body === pendingBody && payload.userId === user.value?.id) {
        sending.value = false
        pendingBody = null
        clearTimeout(sendingTimeout)
      }
      if (open.value) {
        if (wasNearBottom) scrollToBottom()
      } else {
        unreadCount.value++
      }
    })

    socket.on('chat:error', (payload) => {
      showChatError(payload?.message || 'Something went wrong.')
      sending.value = false
      pendingBody = null
      clearTimeout(sendingTimeout)
    })

    socket.on('chat:deleted', ({ room: r, id } = {}) => {
      if (r !== ROOM) return
      const idx = messages.value.findIndex(m => m.id === id)
      if (idx !== -1) messages.value.splice(idx, 1)
    })

    socket.on('chat:timeout', (payload) => {
      if (!payload || payload.room !== ROOM) return
      if (payload.userId === user.value?.id) myTimeout.value = { expiresAt: payload.expiresAt, reason: payload.reason }
      if (isAdmin.value) {
        activeTimeouts.value = [
          ...activeTimeouts.value.filter(t => t.userId !== payload.userId),
          { id: `${payload.userId}-${payload.expiresAt}`, userId: payload.userId, username: payload.username, reason: payload.reason, expiresAt: payload.expiresAt }
        ]
      }
      const mins = Math.max(1, Math.round((new Date(payload.expiresAt).getTime() - Date.now()) / 60000))
      addSystemNote(`${payload.username || 'A player'} was timed out from chat for ${mins}m${payload.reason ? ` (${payload.reason})` : ''}.`)
    })

    socket.on('chat:timeout-lifted', (payload) => {
      if (!payload || payload.room !== ROOM) return
      if (payload.userId === user.value?.id) myTimeout.value = null
      if (isAdmin.value) activeTimeouts.value = activeTimeouts.value.filter(t => t.userId !== payload.userId)
    })

    socket.connect()
  })
}

function disconnectSocket() {
  if (!socket) return
  socket.emit('leave-chat-room', { room: ROOM })
  socket.disconnect()
  socket = null
  socketConnected.value = false
}

function send() {
  if (!canSend.value) return // covers empty/over-length/in-flight/disconnected
  const body = draft.value.trim()
  sending.value = true
  pendingBody = body
  // Never send username/userId — the server resolves identity from the
  // authenticated session, not from anything the client sends.
  socket.emit('chat:send', { room: ROOM, body })
  draft.value = ''
  clearTimeout(sendingTimeout)
  // Safety net: if the ack (our own chat:message broadcast) or a chat:error
  // never arrives — e.g. a dropped packet — don't leave Send stuck disabled.
  sendingTimeout = setTimeout(() => {
    sending.value = false
    pendingBody = null
  }, 6000)
}

// ── Admin moderation actions. The socket handlers re-check isAdmin fresh
// server-side on every call, so these client gates are UX only, not security. ──
function deleteMessage(id) {
  if (!socket || !socketConnected.value) return
  socket.emit('admin:chat:delete', { room: ROOM, id })
}

function openTimeoutPrompt(userId, messageId) {
  timeoutPromptForUserId.value = userId
  timeoutPromptMessageId.value = messageId
  timeoutMinutes.value = 15
  timeoutReason.value = ''
}

function cancelTimeoutPrompt() {
  timeoutPromptForUserId.value = null
  timeoutPromptMessageId.value = null
}

function submitTimeout() {
  if (!socket || !socketConnected.value || !timeoutPromptForUserId.value) return
  socket.emit('admin:chat:timeout', {
    room: ROOM,
    userId: timeoutPromptForUserId.value,
    minutes: timeoutMinutes.value,
    reason: timeoutReason.value.trim() || undefined
  })
  timeoutPromptForUserId.value = null
  timeoutPromptMessageId.value = null
}

function liftTimeout(userId) {
  if (!socket || !socketConnected.value) return
  socket.emit('admin:chat:lift-timeout', { room: ROOM, userId })
}

onUnmounted(() => {
  clearTimeout(sendingTimeout)
  clearTimeout(chatErrorTimeout)
  disconnectSocket()
})
</script>

<style scoped>
/* z-index 800: below the highest modals this component shares a page with —
   on Economy, EconomyCtoonHistoryModal (1100) and EconomyFeaturedAuctionsCarousel
   (1150) — so either can still cover this panel, while staying above ordinary
   page content everywhere else this component is used (Auction House, an
   individual auction page).

   Anchored bottom-LEFT, not bottom-right: components/Onboarding.vue (the
   site-wide Daily/Events/Alerts hub) is `fixed right-3` at every breakpoint,
   not just mobile, so a right-anchored toggle here would sit on top of it —
   on mobile, permanently hiding a real notification surface behind a chat
   button. Left is unclaimed by any other fixed UI (checked layouts/ and the
   newsite template: no bottom nav bar either). */
.echat {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 800;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.echat-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  background: var(--OrbitDarkBlue, #003466);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  position: relative;
}

.echat-toggle--open {
  background: var(--OrbitLightBlue, #3399CC);
}

.echat-unread {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
}

.echat-panel {
  width: 320px;
  max-width: calc(100vw - 32px);
  height: 440px;
  max-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
  background: var(--OrbitDarkBlue, #003466);
  border: 2px solid var(--OrbitLightBlue, #3399CC);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.echat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 8px 10px 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.echat-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: #fff;
}

.echat-close {
  min-width: 36px;
  min-height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.9rem;
  cursor: pointer;
}
.echat-close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.echat-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.echat-mod-toggle {
  min-width: 36px;
  min-height: 36px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.8rem;
  cursor: pointer;
}
.echat-mod-toggle:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }

.echat-timeouts {
  flex-shrink: 0;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.echat-timeouts-empty {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.echat-timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: #fff;
}

.echat-timeout-user { font-weight: 700; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.echat-timeout-until { color: rgba(255, 255, 255, 0.55); flex-shrink: 0; }

.echat-timeout-lift {
  flex-shrink: 0;
  min-height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.echat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.echat-state {
  margin: auto 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.echat-state--empty { margin: 12px 0 0; }

.echat-signin {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 8px;
  border: none;
  background: var(--OrbitGreen, #66cc00);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.echat-loadmore {
  flex-shrink: 0;
  text-align: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  padding: 2px 0;
}
.echat-loadmore--end { text-transform: uppercase; letter-spacing: 0.05em; }

.echat-msg {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.echat-msg-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.echat-msg-user {
  font-weight: 700;
  font-size: 0.78rem;
  color: var(--OrbitLightBlue, #6cc6f5);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.echat-msg-time {
  flex-shrink: 0;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
}

/* Untrusted player text: wrap instead of overflowing on long unbroken runs
   (URLs, emoji strings) — no JS-side mangling, this is CSS-only. */
.echat-msg-body {
  font-size: 0.85rem;
  color: #fff;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}

/* Admin-only per-message controls — kept small (this is a dense, secondary
   surface in a 320px panel, not the primary tap target the 44px floor is
   for), but still a real tappable box rather than bare text. */
.echat-msg-mod {
  margin-left: auto;
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.echat-mod-btn {
  min-width: 26px;
  min-height: 26px;
  border: none;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
}
.echat-mod-btn:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }

.echat-timeout-prompt {
  margin-top: 4px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.echat-timeout-select,
.echat-timeout-reason {
  min-height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 0.78rem;
  padding: 0 6px;
}
.echat-timeout-reason { flex: 1; min-width: 90px; }

.echat-timeout-confirm,
.echat-timeout-cancel {
  min-height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
}
.echat-timeout-confirm { background: #dc2626; color: #fff; }
.echat-timeout-cancel { background: rgba(255, 255, 255, 0.12); color: #fff; }

/* Ephemeral, unpersisted "X was timed out" line — visually distinct from a
   real message so it can't be mistaken for something a player said. */
.echat-system-note {
  margin: 0;
  text-align: center;
  font-size: 0.72rem;
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
}

.echat-error {
  flex-shrink: 0;
  margin: 0;
  padding: 6px 12px;
  background: rgba(220, 38, 38, 0.18);
  border-top: 1px solid rgba(220, 38, 38, 0.4);
  color: #fca5a5;
  font-size: 0.75rem;
}

.echat-compose {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
}

.echat-input {
  width: 100%;
  box-sizing: border-box;
  resize: none;
  max-height: 70px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-family: inherit;
  font-size: 1rem; /* >=16px so iOS Safari doesn't auto-zoom on focus */
  line-height: 1.3;
}
.echat-input::placeholder { color: rgba(255, 255, 255, 0.45); }
.echat-input:focus { outline: none; border-color: var(--OrbitLightBlue, #3399CC); }
.echat-input:disabled { opacity: 0.5; cursor: not-allowed; }

.echat-timedout-banner {
  margin: 0 0 2px;
  font-size: 0.75rem;
  color: #fca5a5;
}

.echat-compose-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.echat-compose-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.echat-connecting {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.45);
  font-style: italic;
}

.echat-counter {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.45);
}
.echat-counter--warn { color: #fbbf24; }
.echat-counter--over { color: #fca5a5; font-weight: 700; }

.echat-send {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 8px;
  border: none;
  background: var(--OrbitLightBlue, #3399CC);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.echat-send:disabled { opacity: 0.4; cursor: default; }
.echat-send:not(:disabled):hover { filter: brightness(1.1); }

/* 768px matches the layout's own MOBILE_BREAKPOINT (layouts/newsite-template.vue)
   — below it the panel becomes a bottom sheet instead of a floating card, since
   a 320px fixed card either overflows a narrow phone or covers most of it anyway.
   The sheet itself still spans the full width (opening it is a deliberate,
   temporary action, same as Onboarding's own panel covering other content when
   opened) — only the collapsed TOGGLE stays left-aligned, so Onboarding's
   bottom-right toggle remains reachable whenever chat isn't actually open. */
@media (max-width: 768px) {
  .echat {
    right: 0;
    left: 0;
    bottom: 0;
    align-items: stretch;
    padding: 0 10px 10px;
    box-sizing: border-box;
  }

  .echat-toggle {
    align-self: flex-start;
    margin-left: 6px;
  }

  .echat-panel {
    width: 100%;
    max-width: none;
    height: min(70vh, 520px);
    border-radius: 12px 12px 0 0;
  }
}
</style>
