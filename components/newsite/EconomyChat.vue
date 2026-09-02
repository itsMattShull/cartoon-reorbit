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
        aria-controls="economy-chat-panel"
        @click="togglePanel"
      >
        <span aria-hidden="true">💬</span>
        <span>{{ open ? 'Close Chat' : 'Chat' }}</span>
        <span v-if="!open && unreadCount > 0" class="echat-unread" aria-hidden="true">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </button>

      <div v-if="open" id="economy-chat-panel" class="echat-panel" role="dialog" aria-label="Economy hangout chat">
        <div class="echat-header">
          <span class="echat-title">Economy Chat</span>
          <button type="button" class="echat-close" aria-label="Close chat" @click="togglePanel">✕</button>
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

              <div v-for="m in messages" :key="m.id" class="echat-msg">
                <div class="echat-msg-head">
                  <span class="echat-msg-user">{{ m.username }}</span>
                  <span class="echat-msg-time">{{ relativeTime(m.createdAt) }}</span>
                </div>
                <!-- Plain text interpolation only — body is untrusted input from every
                     other player and is replayed to every future viewer via history,
                     so v-html here would be a stored-XSS hole. No linkification either:
                     inert text is a deliberate anti-scam measure for a real-economy game. -->
                <div class="echat-msg-body">{{ m.body }}</div>
              </div>
            </template>
          </template>
        </div>

        <p v-if="chatError" class="echat-error" role="alert">{{ chatError }}</p>

        <div v-if="authState === 'ok'" class="echat-compose">
          <textarea
            v-model="draft"
            class="echat-input"
            rows="1"
            placeholder="Message the economy…"
            maxlength="320"
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
const ROOM = 'economy'
const NEAR_BOTTOM_PX = 80
const NEAR_TOP_PX = 40

const config = useRuntimeConfig()
const { user, login, fetchSelf } = useAuth()

const open = ref(false)
const unreadCount = ref(0)

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
  return len > 0 && len <= 300 && !sending.value && socketConnected.value
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
    if (!user.value) fetchSelf({ ttlMs: 30000 })
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

onUnmounted(() => {
  clearTimeout(sendingTimeout)
  clearTimeout(chatErrorTimeout)
  disconnectSocket()
})
</script>

<style scoped>
/* z-index 800: below the Economy page's own modals (EconomyCtoonHistoryModal
   at 1100, EconomyFeaturedAuctionsCarousel at 1150) so either can still cover
   this panel, above ordinary page content. */
.echat {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 800;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
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
   a 320px fixed card either overflows a narrow phone or covers most of it anyway. */
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
    align-self: flex-end;
    margin-right: 6px;
  }

  .echat-panel {
    width: 100%;
    max-width: none;
    height: min(70vh, 520px);
    border-radius: 12px 12px 0 0;
  }
}
</style>
