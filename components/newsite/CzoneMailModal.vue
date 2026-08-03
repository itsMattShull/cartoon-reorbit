<template>
  <Teleport to="body">
    <transition name="cz-fade">
      <div
        v-if="modelValue"
        class="cm-overlay"
        @click.self="close"
        @keydown.esc="close"
      >
        <div
          ref="dialogEl"
          class="cm-modal"
          role="dialog"
          aria-modal="true"
          :aria-label="`cMail for ${username}`"
          tabindex="-1"
        >
          <div class="cm-header">
            <span class="cm-title">📬 {{ username }}'s cMail</span>
            <button class="cm-close" aria-label="Close" @click="close">✕</button>
          </div>

          <!-- Tabs. Sized for thumbs, not the 24px topbar tabs this UI uses
               elsewhere. -->
          <div class="cm-tabs" role="tablist">
            <button
              class="cm-tab" :class="{ active: tab === 'messages' }"
              role="tab" :aria-selected="tab === 'messages'"
              @click="tab = 'messages'"
            >Messages</button>
            <button
              v-if="!isOwnZone"
              class="cm-tab" :class="{ active: tab === 'send' }"
              role="tab" :aria-selected="tab === 'send'"
              @click="tab = 'send'"
            >Send</button>
          </div>

          <!-- ── Messages / wall ─────────────────────────────────────── -->
          <div v-show="tab === 'messages'" class="cm-body">
            <div v-if="wallLoading && !wallItems.length" class="cm-status">Loading…</div>
            <div v-else-if="wallDisabled" class="cm-status">
              This player has turned off their cMail wall.
            </div>
            <div v-else-if="!wallItems.length" class="cm-status">
              No cMail here yet.<span v-if="!isOwnZone"> Be the first to leave some!</span>
            </div>

            <ul v-else class="cm-list">
              <li v-for="m in wallItems" :key="m.id" class="cm-row">
                <img
                  class="cm-avatar"
                  :src="`/avatars/${m.senderAvatar || 'default.png'}`"
                  alt=""
                />
                <NuxtLink
                  v-if="m.senderUsername"
                  class="cm-sender"
                  :to="`/newsite/czone/${encodeURIComponent(m.senderUsername)}`"
                  @click="close"
                >{{ m.senderUsername }}</NuxtLink>
                <span v-else class="cm-sender">A player</span>
                <span class="cm-date">{{ formatCzoneMailDate(m.createdAt) }}</span>
                <p class="cm-text">
                  <span v-if="m.emoji" class="cm-emoji">{{ m.emoji }}</span>{{ m.body }}
                </p>
                <!-- Owners can take something off their own wall without a trip
                     through My cWorld. -->
                <button
                  v-if="isOwnZone"
                  class="cm-row-action"
                  :class="{ 'cm-row-action--confirm': confirmingHideId === m.id }"
                  @click="onHideClick(m)"
                >{{ confirmingHideId === m.id ? 'Remove?' : 'Remove' }}</button>
              </li>
            </ul>

            <button
              v-if="wallCursor"
              class="cm-load-more"
              :disabled="wallLoading"
              @click="loadWall(false)"
            >{{ wallLoading ? 'Loading…' : 'Load more' }}</button>
          </div>

          <!-- ── Send ────────────────────────────────────────────────── -->
          <div v-show="tab === 'send'" class="cm-body">
            <div v-if="blockRemaining > 0" class="cm-notice cm-notice--warn">
              You've sent a lot of cMail! You can send more in about
              {{ Math.ceil(blockRemaining / 3600) }} hour{{ Math.ceil(blockRemaining / 3600) === 1 ? '' : 's' }}.
            </div>
            <p v-else class="cm-hint">Pick a message to leave on {{ username }}'s cZone.</p>

            <div v-if="templatesLoading" class="cm-status">Loading messages…</div>
            <div v-else-if="!groups.length" class="cm-status">No messages are available right now.</div>

            <div v-else class="cm-picker" role="radiogroup" aria-label="Choose a message">
              <template v-for="group in groups" :key="group.category">
                <div class="cm-group-header">{{ group.category }}</div>
                <button
                  v-for="t in group.templates"
                  :key="t.id"
                  type="button"
                  class="cm-option"
                  :class="{ selected: selectedId === t.id }"
                  role="radio"
                  :aria-checked="selectedId === t.id"
                  @click="selectedId = t.id"
                >
                  <span v-if="t.emoji" class="cm-option-emoji">{{ t.emoji }}</span>
                  <span class="cm-option-text">{{ t.text }}</span>
                </button>
              </template>
            </div>

            <p v-if="sendError" class="cm-notice cm-notice--warn" role="status">{{ sendError }}</p>
          </div>

          <!-- Pinned footer: the Send button must never be below a long list. -->
          <div v-if="tab === 'send'" class="cm-footer">
            <button
              class="cm-send"
              :disabled="!canSendNow"
              :aria-disabled="!canSendNow"
              @click="send"
            >{{ sendLabel }}</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
// NOTE: message text is admin-authored but still rendered with normal Vue
// interpolation ({{ }}), never v-html — including the emoji field.
import { formatCzoneMailDate } from '~/composables/useCzoneMail'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  username:   { type: String, default: '' },
  isOwnZone:  { type: Boolean, default: false },
  initialTab: { type: String, default: 'messages' }
})
const emit = defineEmits(['update:modelValue', 'toast', 'sent'])

const { cooldownRemaining, blockRemaining, noteRejection, noteCooldown } = useCzoneMail()

const tab = ref(props.initialTab)
const dialogEl = ref(null)

const groups = ref([])
const templatesLoading = ref(false)
const selectedId = ref(null)
const sending = ref(false)
const sendError = ref('')

const wallItems = ref([])
const wallCursor = ref(null)
const wallLoading = ref(false)
const wallDisabled = ref(false)
const confirmingHideId = ref(null)
let confirmTimer = null

const canSendNow = computed(() =>
  !!selectedId.value && !sending.value && cooldownRemaining.value === 0 && blockRemaining.value === 0
)

const sendLabel = computed(() => {
  if (sending.value) return 'Sending…'
  if (blockRemaining.value > 0) return 'Sending paused'
  if (cooldownRemaining.value > 0) return `Wait ${cooldownRemaining.value}s…`
  return 'Send cMail'
})

function close() {
  emit('update:modelValue', false)
}

watch(() => props.modelValue, async (open) => {
  if (!open) {
    confirmingHideId.value = null
    return
  }
  tab.value = props.isOwnZone ? 'messages' : props.initialTab
  sendError.value = ''
  await nextTick()
  dialogEl.value?.focus()
  loadWall(true)
  if (!props.isOwnZone) loadTemplates()
})

// Reset everything when the modal is pointed at a different player.
watch(() => props.username, () => {
  wallItems.value = []
  wallCursor.value = null
  wallDisabled.value = false
  selectedId.value = null
  sendError.value = ''
  if (props.modelValue) loadWall(true)
})

async function loadTemplates() {
  if (groups.value.length) return
  templatesLoading.value = true
  try {
    const res = await $fetch('/api/czone-mail/templates')
    groups.value = Array.isArray(res?.groups) ? res.groups : []
  } catch {
    groups.value = []
  } finally {
    templatesLoading.value = false
  }
}

async function loadWall(reset) {
  if (!props.username || wallLoading.value) return
  wallLoading.value = true
  try {
    const res = await $fetch(`/api/czone-mail/wall/${encodeURIComponent(props.username)}`, {
      query: { limit: 10, ...(reset ? {} : { cursor: wallCursor.value }) }
    })
    const items = Array.isArray(res?.items) ? res.items : []
    wallItems.value = reset ? items : [...wallItems.value, ...items]
    wallCursor.value = res?.nextCursor || null
    wallDisabled.value = res?.wallEnabled === false
  } catch {
    if (reset) wallItems.value = []
  } finally {
    wallLoading.value = false
  }
}

// Tap-twice to confirm, matching the wishlist trade button's idiom.
function onHideClick(m) {
  if (confirmingHideId.value !== m.id) {
    confirmingHideId.value = m.id
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmingHideId.value = null }, 5000)
    return
  }
  if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
  confirmingHideId.value = null
  hideFromWall(m)
}

async function hideFromWall(m) {
  wallItems.value = wallItems.value.filter(x => x.id !== m.id)
  try {
    await $fetch(`/api/czone-mail/${encodeURIComponent(m.id)}/wall-visibility`, {
      method: 'POST',
      body: { hidden: true }
    })
    emit('toast', 'Removed from your wall.', 'success')
  } catch {
    emit('toast', 'Could not remove that message.', 'error')
    loadWall(true)
  }
}

async function send() {
  if (!canSendNow.value) return
  sending.value = true
  sendError.value = ''
  try {
    await $fetch('/api/czone-mail/send', {
      method: 'POST',
      body: { username: props.username, templateId: selectedId.value }
    })
    // The server-side cooldown starts now; mirror it locally so the button
    // disables immediately rather than after a failed round trip.
    noteCooldown(30)
    selectedId.value = null
    emit('toast', 'cMail sent!', 'success')
    emit('sent')
    // Show it landing on the wall — far stronger feedback for a kid than a
    // toast that vanishes.
    tab.value = 'messages'
    await loadWall(true)
  } catch (err) {
    const data = err?.data?.data || {}
    if (data.reason) noteRejection(data.reason, data.retryAfterSeconds)
    sendError.value = err?.data?.statusMessage || 'That cMail could not be sent.'
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>

<style scoped>
/* Above .cz-modal-overlay (9980) and the glitch overlay (9990) so a cZone-search
   glitch can't render on top of an open modal; still under the toast (9999). */
.cm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9995;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}

.cm-modal {
  background: #fff;
  color: #111;
  border-radius: 6px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  width: 100%;
  max-width: 480px;
  /* dvh so the pinned footer can't sit under mobile browser chrome. */
  max-height: min(80vh, 80dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.cm-modal:focus { outline: none; }

.cm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--OrbitDarkBlue);
  color: #fff;
  font-weight: bold;
  flex-shrink: 0;
}
.cm-title { font-size: 0.95rem; }

.cm-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  /* The shared .cz-modal-close is roughly a 16px target; this one is tappable. */
  min-width: 44px;
  min-height: 44px;
}
.cm-close:hover { color: #fff; }

.cm-tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid #ddd;
}
.cm-tab {
  flex: 1;
  min-height: 44px;
  padding: 8px 14px;
  border: none;
  background: #eef2f7;
  color: #33415c;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}
.cm-tab.active { background: var(--OrbitDarkBlue); color: #fff; }

.cm-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  min-height: 0;
}

.cm-status {
  text-align: center;
  color: #666;
  font-size: 0.9rem;
  padding: 24px 8px;
  line-height: 1.5;
}

.cm-hint {
  font-size: 0.9rem;
  color: #555;
  margin: 0 0 10px;
}

.cm-notice {
  font-size: 0.9rem;
  line-height: 1.45;
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0 0 10px;
}
.cm-notice--warn { background: #fff4e5; color: #8a4b00; border: 1px solid #f0c48a; }

/* ── Message list ── */
.cm-list { list-style: none; margin: 0; padding: 0; }

.cm-row {
  display: grid;
  /* minmax(0, 1fr) is load-bearing: a bare 1fr is min-content floored, so a long
     message would widen the grid past the viewport and (because the layout sets
     overflow-x on .main-content) scroll the whole page sideways. */
  grid-template-columns: 28px minmax(0, 1fr) auto;
  grid-template-areas:
    "avatar sender date"
    "avatar text   text"
    "avatar action action";
  gap: 2px 8px;
  align-items: center;
  padding: 8px 10px;
  min-height: 44px;
  border-radius: 8px;
  background: #f5f7fa;
  margin-bottom: 8px;
}

.cm-avatar {
  grid-area: avatar;
  align-self: start;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.cm-sender {
  grid-area: sender;
  font-weight: 700;
  font-size: 0.82rem;
  color: var(--OrbitDarkBlue);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-sender:hover { text-decoration: underline; }

.cm-date {
  grid-area: date;
  font-size: 0.78rem;
  color: #777;
  white-space: nowrap;
}

.cm-text {
  grid-area: text;
  margin: 2px 0 0;
  /* Message bodies deliberately do not inherit the 0.6–0.7rem scale used in the
     cZone topbar — this is the content, and the readers are children. */
  font-size: 0.95rem;
  line-height: 1.45;
  color: #222;
  overflow-wrap: anywhere;
}
.cm-emoji { margin-right: 4px; }

.cm-row-action {
  grid-area: action;
  justify-self: start;
  margin-top: 6px;
  min-height: 36px;
  padding: 4px 12px;
  font-size: 0.82rem;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #444;
  cursor: pointer;
}
.cm-row-action--confirm { background: #dc2626; border-color: #dc2626; color: #fff; font-weight: 700; }

.cm-load-more {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: 4px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: var(--OrbitDarkBlue);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.cm-load-more:disabled { opacity: 0.6; cursor: default; }

/* ── Message picker ── */
.cm-picker { display: flex; flex-direction: column; gap: 6px; }

.cm-group-header {
  position: sticky;
  top: -12px; /* cancels .cm-body padding so it pins flush */
  z-index: 1;
  background: #fff;
  padding: 8px 2px 4px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7a869a;
}

.cm-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  text-align: left;
  border-radius: 8px;
  border: 2px solid #dfe5ee;
  background: #fff;
  color: #222;
  font-family: inherit;
  /* 16px minimum: anything smaller triggers iOS zoom-on-focus, which strands a
     child inside a zoomed viewport over a scaled cZone canvas. */
  font-size: 1rem;
  line-height: 1.35;
  cursor: pointer;
}
.cm-option:hover { background: #f0f4ff; }
.cm-option.selected {
  border-color: var(--OrbitDarkBlue);
  background: #e8f0ff;
  font-weight: 600;
}
.cm-option-emoji { font-size: 1.2rem; flex-shrink: 0; }
.cm-option-text { overflow-wrap: anywhere; }

/* ── Footer ── */
.cm-footer {
  flex-shrink: 0;
  padding: 10px 12px;
  border-top: 1px solid #ddd;
  background: #fff;
}

.cm-send {
  width: 100%;
  min-height: 48px;
  border-radius: 8px;
  border: 2px solid #2a6a00;
  background: var(--OrbitGreen);
  color: #fff;
  font-family: inherit;
  font-size: 1rem;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}
.cm-send:disabled { opacity: 0.5; cursor: not-allowed; }

.cz-fade-enter-active,
.cz-fade-leave-active { transition: opacity 0.2s; }
.cz-fade-enter-from,
.cz-fade-leave-to { opacity: 0; }
</style>
