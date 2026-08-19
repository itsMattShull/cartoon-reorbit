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

    <!--
      role="log" carries an implicit aria-live="polite", so aria-live is NOT
      also set here — some screen readers would announce twice. It is forced to
      "off" whenever focus is outside the panel: a busy #general announced
      message-by-message is unusable, because each new arrival interrupts the
      queue and the user can never finish reading the one they are on.
    -->
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
            width="16"
            height="16"
            loading="lazy"
            decoding="async"
            referrerpolicy="no-referrer"
          />
          <span class="dchat-name">{{ m.authorName }}</span>
          <time class="dchat-time" :datetime="new Date(m.createdAt).toISOString()">{{ clock(m.createdAt) }}</time>
        </div>

        <!--
          Tokens only. Every branch renders a text node or an element we built;
          nothing here interpolates message data into markup. Raw-HTML
          directives and DOM sinks are banned in this file by design and by
          test — see the header of server/utils/discordChat/normalize.js.
        -->
        <p class="dchat-body">
          <template v-for="(t, ti) in m.tokens" :key="ti">
            <a
              v-if="t.type === 'link'"
              :href="t.href"
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              referrerpolicy="no-referrer"
              class="dchat-link"
            >{{ t.value }}</a>
            <span v-else-if="t.type === 'mention'" class="dchat-mention">{{ t.value }}</span>
            <code v-else-if="t.type === 'code'" class="dchat-code">{{ t.value }}</code>
            <span v-else-if="t.type === 'codeblock'" class="dchat-codeblock">{{ t.value }}</span>
            <img
              v-else-if="t.type === 'emoji'"
              :src="t.url"
              :alt="`:${t.name}:`"
              class="dchat-emoji"
              width="18"
              height="18"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
            <span v-else-if="t.type === 'time'">{{ clock(t.at) }}</span>
            <template v-else>{{ t.value }}</template>
          </template>
          <span v-if="m.editedAt" class="dchat-edited"> (edited)</span>
        </p>

        <template v-for="(a, ai) in m.attachments" :key="ai">
          <a
            v-if="!isExpired(a)"
            :href="a.url"
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="dchat-att"
            :style="{ aspectRatio: `${a.width} / ${a.height}` }"
          >
            <img
              :src="a.url"
              :alt="a.name"
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
          </a>
          <span v-else class="dchat-att-expired">Image expired — open in Discord</span>
        </template>
      </div>
    </div>

    <button v-if="unread" class="dchat-unread" type="button" @click="jumpToBottom">
      {{ unread }} new ▼
    </button>

    <!-- Errors get their own assertive region; messages never do. -->
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
// socket.io-client is imported HERE and nowhere the layout touches. Nuxt's
// component and composable auto-imports are compile-time STATIC imports, so a
// composable that imported it would put all ~14.7 KB gzipped into the layout
// chunk of every /newsite page, for a feature most sessions never open. This
// component is rendered as <LazyDiscordChat>, which compiles to
// defineAsyncComponent and therefore lands in its own chunk.
import { io } from 'socket.io-client'
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, computed } from 'vue'

const props = defineProps({
  sheet: { type: Boolean, default: false }
})
defineEmits(['close'])

const runtime = useRuntimeConfig()

// Cap the DOM at 100. Nobody scrolls 100 messages back in a 224px column, and
// each row is ~5 nodes.
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

const dotClass = computed(() => {
  if (!enabled.value) return 'dchat-dot-off'
  return connected.value ? 'dchat-dot-on' : 'dchat-dot-wait'
})

const statusTitle = computed(() => {
  if (!enabled.value) return 'Chat is off'
  return connected.value ? 'Connected' : 'Connecting…'
})

const placeholder = computed(() => {
  if (!enabled.value) return 'Chat is off'
  if (blockedReason.value === 'muted') return 'You are muted'
  if (blockedReason.value === 'not_in_guild') return 'Join the Discord to chat'
  if (!connected.value) return 'Connecting…'
  return 'Message #general'
})

// Drives the aria-live toggle on the log. relatedTarget is null when focus
// leaves the document entirely (tab switch), which should not count as leaving
// the panel.
function onFocusOut(e) {
  if (!e.relatedTarget) return
  if (!e.currentTarget.contains(e.relatedTarget)) focusWithin.value = false
}

function clock(ms) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
  } catch {
    return ''
  }
}

function isExpired(a) {
  return Boolean(a.expiresAt && a.expiresAt < Date.now())
}

function isGrouped(i) {
  if (i === 0) return false
  const prev = messages.value[i - 1]
  const cur = messages.value[i]
  return prev.authorName === cur.authorName && cur.createdAt - prev.createdAt < GROUP_WINDOW_MS
}

// Read BEFORE mutating: appending fires no scroll event, so a listener-driven
// flag would be one message stale.
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
  const el = scroller.value
  // Smooth is used only here. On the list itself, consecutive appends each
  // interrupt the animation and it never settles at the bottom.
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

async function append(message) {
  const wasAtBottom = stickToBottom
  // push + splice, never a spread-reassign: reallocating the array makes Vue
  // diff every keyed node instead of fast-pathing an append.
  messages.value.push(markRaw(message))
  if (messages.value.length > MAX_MESSAGES) {
    messages.value.splice(0, messages.value.length - MAX_MESSAGES)
  }
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
  // During IME composition Enter commits the candidate. Sending on it would
  // post half a word and clear the box.
  if (e.isComposing || e.keyCode === 229) return
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
    {
      // websocket only: skips the 4 extra polling requests of a default
      // handshake. The session cookie rides the handshake for auth.
      transports: ['websocket'],
      withCredentials: true,
      reconnectionDelayMax: 5000
    }
  )

  socket.on('connect', () => {
    connected.value = true
    socket.emit('chat:join')
  })
  socket.on('disconnect', () => {
    connected.value = false
  })

  socket.on('chat:state', (s) => {
    enabled.value = s.enabled !== false
    if (s.maxLength) maxLength.value = s.maxLength
  })

  socket.on('chat:gateway', (s) => {
    if (typeof s?.connected === 'boolean') connected.value = s.connected
    if (s?.fatal) notice.value = 'Chat is temporarily unavailable.'
  })

  // A snapshot REPLACES rather than merges, so a client that missed a delete
  // while disconnected self-heals.
  socket.on('chat:snapshot', ({ messages: list }) => replaceAll(list || []))

  socket.on('chat:message', (m) => append(m))

  socket.on('chat:update', ({ id, patch }) => {
    const i = messages.value.findIndex((m) => m.id === id)
    if (i === -1) return
    messages.value[i] = markRaw({ ...messages.value[i], ...patch })
  })

  socket.on('chat:delete', ({ ids }) => {
    const drop = new Set(ids || [])
    messages.value = messages.value.filter((m) => !drop.has(m.id))
  })

  socket.on('chat:sent', () => {
    sending.value = false
    draft.value = ''
  })

  socket.on('chat:error', (e) => {
    sending.value = false
    if (e?.reason === 'muted' || e?.reason === 'not_in_guild' || e?.reason === 'not_allowed') {
      blockedReason.value = e.reason
    }
    notice.value = e?.message || 'Message not sent.'
  })

  socket.on('authError', () => {
    notice.value = 'Please sign in again.'
  })
}

onMounted(() => {
  connect()
  // Images and font swaps change row heights after paint, which would silently
  // push a pinned view off the bottom.
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (stickToBottom) pin()
    })
    resizeObserver.observe(scroller.value)
  }
  // Focusing the composer on mobile would summon the keyboard before the user
  // has seen a single message.
  if (!props.sheet) input.value?.focus?.()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  try {
    socket?.emit('chat:leave')
    socket?.disconnect()
  } catch {
    // already gone
  }
  socket = null
})
</script>

<style scoped>
.dchat {
  display: flex;
  flex-direction: column;
  /* min-height:0 on BOTH the panel and the scroller. A flex item's automatic
     minimum size is its content size, so without these the list refuses to
     shrink, the panel grows past the sidebar, and `.sidebar { overflow:hidden }`
     clips the composer away with no scrollbar anywhere to reveal it. */
  min-height: 0;
  height: 100%;
  /* Darker ground than the sidebar panel. This is what makes the text legible:
     white on --OrbitDarkBlue is 5.99:1 but the muted tones and the Send button
     fail against it, and white on --OrbitLightBlue is only 3.20:1. Over this
     (~#264C73) white is 8.9:1, timestamps at 62% reach 4.6:1 and the Send
     button clears 3:1 as a UI component. Same rgba(0,0,0,0.25) treatment the
     cToon filter's search field already uses. */
  background: rgba(0, 0, 0, 0.25);
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

.dchat-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.dchat-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-left: auto;
}
.dchat-dot-on { background: var(--OrbitGreen); }
.dchat-dot-wait { background: #ffd166; }
.dchat-dot-off { background: rgba(255, 255, 255, 0.35); }

.dchat-close {
  background: none;
  border: none;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
}

.dchat-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* overscroll-behavior alone does not stop pull-to-refresh on mobile here (the
     document scrolls, not this element) — the sheet also pins the body. */
  overscroll-behavior: contain;
  /* Chrome's scroll anchoring repositions scrollTop when content is inserted,
     which silently un-pins an append. Both directions are handled manually. */
  overflow-anchor: none;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--OrbitDarkBlue) transparent;
  padding: 4px 6px;
  /* Isolates the list's layout/paint from the rest of the scaled chrome. */
  contain: layout paint style;
}

.dchat-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
  text-align: center;
  margin: 10px 0;
}

.dchat-msg {
  /* Virtualization-grade behaviour with no JS: off-screen rows skip style,
     layout and paint. A real virtual scroller would cost more than it saves at
     100 rows, and image loads make row heights variable anyway. */
  content-visibility: auto;
  contain-intrinsic-size: 0 44px;
  padding: 1px 0;
  margin-top: 7px;
}

.dchat-msg-grouped { margin-top: 1px; }

/* Site-relayed messages get a rule rather than a badge — cheaper, and it reads
   as period-appropriate. */
.dchat-msg-site {
  border-left: 2px solid var(--OrbitGreen);
  padding-left: 5px;
}

.dchat-msg-head {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.dchat-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  align-self: center;
}

.dchat-name {
  font-weight: 700;
  /* Counter-scales the chrome's transform. computeSiteScale floors at ~0.72 on
     a narrow desktop window, which would render 12.5px type at 9 physical px,
     grayscale-antialiased. The clamp keeps it readable without changing
     anything at scale 1. */
  font-size: clamp(12.5px, calc(12.5px / var(--site-scale, 1)), 16px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 1 auto;
  min-width: 0;
}

.dchat-time {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  white-space: nowrap;
  flex: 0 0 auto;
  margin-left: auto;
}

.dchat-body {
  font-size: clamp(12.5px, calc(12.5px / var(--site-scale, 1)), 16px);
  line-height: 1.35;
  margin: 0;
  /* pre-wrap keeps Discord's newlines; `anywhere` (not break-word) is what
     actually shrinks min-content so a 200-char CDN URL cannot blow the row out
     to 1400px and get clipped by the sidebar's overflow:hidden. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  min-width: 0;
}

.dchat-link { color: #bfe3ff; text-decoration: underline; }
.dchat-mention {
  color: #cfe4ff;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  padding: 0 2px;
}
.dchat-code,
.dchat-codeblock {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  padding: 0 3px;
  font-size: 0.92em;
}
.dchat-codeblock { display: block; white-space: pre-wrap; padding: 3px 5px; margin: 2px 0; }
.dchat-emoji { width: 18px; height: 18px; vertical-align: -3px; }
.dchat-edited { font-size: 10px; color: rgba(255, 255, 255, 0.5); }

.dchat-att {
  display: block;
  width: 100%;
  max-height: 120px;
  margin-top: 3px;
  border-radius: 6px;
  overflow: hidden;
}
.dchat-att img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dchat-att-expired {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  margin-top: 3px;
}

.dchat-unread {
  flex: 0 0 auto;
  margin: 0 6px 3px;
  padding: 2px 0;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--OrbitLightBlue);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.dchat-notice {
  flex: 0 0 auto;
  margin: 0;
  padding: 3px 8px;
  font-size: 11px;
  color: #ffd166;
}

.dchat-compose {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
  padding: 5px 6px;
  background: var(--OrbitDarkBlue);
}

.dchat-input {
  flex: 1 1 auto;
  min-width: 0;
  resize: none;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.28);
  /* Explicit, and required. assets/css/tailwind.css sets
     `textarea { color: #111827 }` in @layer base for the ~1300 fields on light
     backgrounds; scoped CSS wins, but without this the composer would render
     gray-900 on dark navy — invisible, and formFieldContrast.test.js would not
     catch it because that test only inspects Tailwind-classed fields.
     -webkit-text-fill-color is deliberately NOT set; see that file's note. */
  color: #ffffff;
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

/* Mobile sheet. The chrome drops its transform below 768px, which is what makes
   a fixed-position sheet resolve against the real viewport here and only here. */
.dchat-sheet {
  border-radius: 0;
  height: 100%;
}

@media (max-width: 768px) {
  .dchat-name,
  .dchat-body { font-size: 14px; }
  .dchat-time { font-size: 12px; }
  .dchat-input {
    /* 16px minimum, non-negotiable: the viewport meta sets no maximum-scale
       (correctly), so iOS Safari zooms the page on focus for anything smaller
       and does not zoom back out. */
    font-size: 16px;
  }
}
</style>
