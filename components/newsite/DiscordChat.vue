<template>
  <div
    class="dchat"
    :class="{ 'dchat-sheet': sheet }"
    @focusin="focusWithin = true"
    @focusout="onFocusOut"
  >
    <div class="dchat-head">
      <span class="dchat-title">Discord Chat</span>
      <span class="dchat-dot" :class="dotClass" :title="statusTitle" aria-hidden="true" />
      <button v-if="sheet" class="dchat-close" type="button" aria-label="Close chat" @click="$emit('close')">✕</button>
    </div>

    <!-- role="log" is implicitly aria-live=polite; forced "off" outside focus
         so a busy channel doesn't interrupt a screen reader mid-message. -->
    <div
      ref="scroller"
      class="dchat-list"
      role="log"
      aria-relevant="additions"
      :aria-live="focusWithin ? 'polite' : 'off'"
      aria-atomic="false"
      tabindex="0"
      @scroll="onScroll"
    >
      <p v-if="!enabled" class="dchat-empty">Chat is turned off right now.</p>
      <p v-else-if="!messages.length" class="dchat-empty">No messages yet.</p>

      <div
        v-for="(m, i) in messages"
        :key="m.id"
        class="dchat-msg"
        :class="{ 'dchat-msg-site': m.viaSite, 'dchat-msg-grouped': isGrouped(i) }"
      >
        <div v-if="!isGrouped(i)" class="dchat-msg-head">
          <img
            v-if="m.avatarUrl"
            :src="m.avatarUrl"
            alt=""
            class="dchat-avatar"
            width="16" height="16"
            loading="lazy" decoding="async" referrerpolicy="no-referrer"
          />
          <span class="dchat-name">{{ m.authorName }}</span>
          <time class="dchat-time" :datetime="new Date(m.createdAt).toISOString()">{{ clock(m.createdAt) }}</time>
        </div>

        <!-- Tokens only, rendered as elements/text — never raw HTML. Message
             content is fully attacker controlled and shown to every user. -->
        <p class="dchat-body">
          <template v-for="(t, ti) in m.tokens" :key="ti">
            <a
              v-if="t.type === 'link'"
              :href="t.href" target="_blank" rel="noopener noreferrer nofollow ugc" referrerpolicy="no-referrer"
              class="dchat-link"
            >{{ t.value }}</a>
            <span v-else-if="t.type === 'mention'" class="dchat-mention">{{ t.value }}</span>
            <code v-else-if="t.type === 'code'" class="dchat-code">{{ t.value }}</code>
            <span v-else-if="t.type === 'codeblock'" class="dchat-codeblock">{{ t.value }}</span>
            <img
              v-else-if="t.type === 'emoji'"
              :src="t.url" :alt="`:${t.name}:`" class="dchat-emoji"
              width="18" height="18" loading="lazy" decoding="async" referrerpolicy="no-referrer"
            />
            <span v-else-if="t.type === 'time'">{{ clock(t.at) }}</span>
            <template v-else>{{ t.value }}</template>
          </template>
          <span v-if="m.editedAt" class="dchat-edited"> (edited)</span>
        </p>

        <template v-for="(a, ai) in m.attachments" :key="ai">
          <a
            v-if="!isExpired(a)"
            :href="a.url" target="_blank" rel="noopener noreferrer nofollow"
            class="dchat-att" :style="{ aspectRatio: `${a.width} / ${a.height}` }"
          >
            <img :src="a.url" :alt="a.name" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
          </a>
          <span v-else class="dchat-att-expired">Image expired — open in Discord</span>
        </template>
      </div>
    </div>

    <button v-if="unread" class="dchat-unread" type="button" @click="jumpToBottom">{{ unread }} new ▼</button>

    <p v-if="notice" class="dchat-notice" role="status" aria-live="assertive">{{ notice }}</p>

    <form class="dchat-compose" @submit.prevent="send">
      <textarea
        ref="input"
        v-model="draft"
        class="dchat-input"
        :maxlength="maxLength"
        :disabled="!canSend"
        :placeholder="placeholder"
        rows="1"
        @keydown="onKeydown"
      />
      <button class="dchat-send" type="submit" :disabled="!canSend || !draft.trim()">Send</button>
    </form>
  </div>
</template>

<script setup>
// socket.io-client is imported here only — never from a composable the layout
// touches — so it stays out of the layout chunk. Rendered via <LazyDiscordChat>.
import { io } from 'socket.io-client'
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, computed } from 'vue'

const props = defineProps({ sheet: { type: Boolean, default: false } })
defineEmits(['close'])

const runtime = useRuntimeConfig()

const MAX_MESSAGES = 100
const BOTTOM_THRESHOLD = 24
const GROUP_WINDOW_MS = 5 * 60 * 1000

const messages = ref([])
const draft = ref('')
const notice = ref('')
const unread = ref(0)
const enabled = ref(true)
const connected = ref(false)
const blockedReason = ref('')
const maxLength = ref(400)
const focusWithin = ref(false)
const sending = ref(false)

const scroller = ref(null)
const input = ref(null)

let socket = null
let stickToBottom = true
let resizeObserver = null

const canSend = computed(() => enabled.value && connected.value && !blockedReason.value && !sending.value)
const dotClass = computed(() => !enabled.value ? 'dchat-dot-off' : connected.value ? 'dchat-dot-on' : 'dchat-dot-wait')
const statusTitle = computed(() => !enabled.value ? 'Chat is off' : connected.value ? 'Connected' : 'Connecting…')
const placeholder = computed(() => {
  if (!enabled.value) return 'Chat is off'
  if (blockedReason.value === 'muted') return 'You are muted'
  if (blockedReason.value === 'not_in_guild') return 'Join the Discord to chat'
  if (!connected.value) return 'Connecting…'
  return 'Message #general'
})

function onFocusOut(e) {
  if (!e.relatedTarget) return
  if (!e.currentTarget.contains(e.relatedTarget)) focusWithin.value = false
}

function clock(ms) {
  try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) }
  catch { return '' }
}

function isExpired(a) { return Boolean(a.expiresAt && a.expiresAt < Date.now()) }

function isGrouped(i) {
  if (i === 0) return false
  const prev = messages.value[i - 1]
  const cur = messages.value[i]
  return prev.authorName === cur.authorName && cur.createdAt - prev.createdAt < GROUP_WINDOW_MS
}

function atBottom() {
  const el = scroller.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
}

function pin() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

function onScroll() {
  stickToBottom = atBottom()
  if (stickToBottom) unread.value = 0
}

function jumpToBottom() {
  stickToBottom = true
  unread.value = 0
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

async function append(message) {
  const wasAtBottom = stickToBottom
  messages.value.push(markRaw(message)) // push+splice, never spread-reassign
  if (messages.value.length > MAX_MESSAGES) messages.value.splice(0, messages.value.length - MAX_MESSAGES)
  await nextTick()
  if (wasAtBottom) pin()
  else unread.value += 1
}

function replaceAll(list) {
  messages.value = list.slice(-MAX_MESSAGES).map((m) => markRaw(m))
  nextTick(pin)
}

function onKeydown(e) {
  if (e.key !== 'Enter') return
  if (e.isComposing || e.keyCode === 229) return // IME composition
  if (e.shiftKey) return
  e.preventDefault()
  send()
}

function send() {
  const content = draft.value.trim()
  if (!content || !canSend.value || !socket) return
  sending.value = true
  notice.value = ''
  socket.emit('chat:send', { content })
}

function connect() {
  socket = io(
    import.meta.env.PROD ? '/chat' : `http://localhost:${runtime.public.socketPort}/chat`,
    { transports: ['websocket'], withCredentials: true, reconnectionDelayMax: 5000 }
  )

  socket.on('connect', () => { connected.value = true; socket.emit('chat:join') })
  socket.on('disconnect', () => { connected.value = false })

  socket.on('chat:state', (s) => {
    enabled.value = s.enabled !== false
    if (s.maxLength) maxLength.value = s.maxLength
  })
  socket.on('chat:gateway', (s) => {
    if (typeof s?.connected === 'boolean') connected.value = s.connected
    if (s?.fatal) notice.value = 'Chat is temporarily unavailable.'
  })
  socket.on('chat:snapshot', ({ messages: list }) => replaceAll(list || []))
  socket.on('chat:message', (m) => append(m))
  socket.on('chat:update', ({ id, patch }) => {
    const i = messages.value.findIndex((m) => m.id === id)
    if (i !== -1) messages.value[i] = markRaw({ ...messages.value[i], ...patch })
  })
  socket.on('chat:delete', ({ ids }) => {
    const drop = new Set(ids || [])
    messages.value = messages.value.filter((m) => !drop.has(m.id))
  })
  socket.on('chat:sent', () => { sending.value = false; draft.value = '' })
  socket.on('chat:error', (e) => {
    sending.value = false
    if (['muted', 'not_in_guild', 'not_allowed'].includes(e?.reason)) blockedReason.value = e.reason
    notice.value = e?.message || 'Message not sent.'
  })
  socket.on('authError', () => { notice.value = 'Please sign in again.' })
}

onMounted(() => {
  connect()
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => { if (stickToBottom) pin() })
    resizeObserver.observe(scroller.value)
  }
  if (!props.sheet) input.value?.focus?.() // don't summon the mobile keyboard on open
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  try { socket?.emit('chat:leave'); socket?.disconnect() } catch {}
  socket = null
})
</script>

<style scoped>
.dchat {
  display: flex;
  flex-direction: column;
  min-height: 0; /* flex item auto-min-size would else overflow .sidebar */
  height: 100%;
  background: rgba(0, 0, 0, 0.25); /* darker than the panel so text clears WCAG */
  border-radius: var(--sidebar-middle-radius, 8px);
  overflow: hidden;
  font-family: inherit;
  color: #fff;
}

.dchat-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--OrbitDarkBlue);
}
.dchat-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.dchat-dot { width: 7px; height: 7px; border-radius: 50%; margin-left: auto; }
.dchat-dot-on { background: var(--OrbitGreen); }
.dchat-dot-wait { background: #ffd166; }
.dchat-dot-off { background: rgba(255, 255, 255, 0.35); }
.dchat-close { background: none; border: none; color: #fff; font-size: 16px; line-height: 1; padding: 0 2px; cursor: pointer; }

.dchat-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none; /* scroll anchoring would silently un-pin an append */
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  padding: 4px 6px;
  contain: layout paint style;
}
.dchat-empty { font-size: 12px; color: rgba(255, 255, 255, 0.62); text-align: center; margin: 10px 0; }

.dchat-msg {
  content-visibility: auto;
  contain-intrinsic-size: 0 44px;
  padding: 1px 0;
  margin-top: 7px;
}
.dchat-msg-grouped { margin-top: 1px; }
.dchat-msg-site { border-left: 2px solid var(--OrbitGreen); padding-left: 5px; }

.dchat-msg-head { display: flex; align-items: baseline; gap: 5px; min-width: 0; }
.dchat-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; align-self: center; }
.dchat-name {
  font-weight: 700;
  font-size: clamp(12.5px, calc(12.5px / var(--site-scale, 1)), 16px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  flex: 0 1 auto; min-width: 0;
}
.dchat-time { font-size: 11px; color: rgba(255, 255, 255, 0.62); white-space: nowrap; flex: 0 0 auto; margin-left: auto; }

.dchat-body {
  font-size: clamp(12.5px, calc(12.5px / var(--site-scale, 1)), 16px);
  line-height: 1.35;
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere; /* `anywhere`, not break-word, or a long URL blows the row out */
  min-width: 0;
}
.dchat-link { color: #bfe3ff; text-decoration: underline; }
.dchat-mention { color: #cfe4ff; background: rgba(255, 255, 255, 0.12); border-radius: 3px; padding: 0 2px; }
.dchat-code, .dchat-codeblock { background: rgba(0, 0, 0, 0.3); border-radius: 3px; padding: 0 3px; font-size: 0.92em; }
.dchat-codeblock { display: block; white-space: pre-wrap; padding: 3px 5px; margin: 2px 0; }
.dchat-emoji { width: 18px; height: 18px; vertical-align: -3px; }
.dchat-edited { font-size: 10px; color: rgba(255, 255, 255, 0.5); }

.dchat-att { display: block; width: 100%; max-height: 120px; margin-top: 3px; border-radius: 6px; overflow: hidden; }
.dchat-att img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dchat-att-expired { display: block; font-size: 11px; color: rgba(255, 255, 255, 0.62); margin-top: 3px; }

.dchat-unread {
  flex: 0 0 auto;
  margin: 0 6px 3px;
  padding: 2px 0;
  font-size: 11px; font-weight: 700; color: #fff;
  background: var(--OrbitLightBlue);
  border: none; border-radius: 4px; cursor: pointer;
}
.dchat-notice { flex: 0 0 auto; margin: 0; padding: 3px 8px; font-size: 11px; color: #ffd166; }

.dchat-compose { flex: 0 0 auto; display: flex; gap: 4px; padding: 5px 6px; background: var(--OrbitDarkBlue); }
.dchat-input {
  flex: 1 1 auto;
  min-width: 0;
  resize: none;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.28);
  color: #ffffff; /* explicit — @layer base defaults textarea to dark text */
  font-family: inherit;
  font-size: 13px;
  line-height: 1.3;
  padding: 4px 6px;
  max-height: 62px;
}
.dchat-input::placeholder { color: rgba(255, 255, 255, 0.5); }
.dchat-input:disabled { opacity: 0.6; cursor: not-allowed; }

.dchat-send {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 6px;
  border: 2px solid #1a5a9a;
  background: var(--OrbitLightBlue);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.dchat-send:disabled { opacity: 0.45; cursor: not-allowed; }

.dchat-sheet { border-radius: 0; height: 100%; }

@media (max-width: 768px) {
  .dchat-name, .dchat-body { font-size: 14px; }
  .dchat-time { font-size: 12px; }
  .dchat-input { font-size: 16px; } /* prevents iOS auto-zoom on focus */
}
</style>
