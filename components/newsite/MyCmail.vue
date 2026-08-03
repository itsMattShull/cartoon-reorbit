<template>
  <div class="mycmail">
    <!-- Sticky in-module header. The layout's sidebar is collapsed by default on
         phones and sits above the content behind a "Show Sidebar" button, so
         controls that matter cannot live there. -->
    <div class="cmi-header">
      <h1 class="cmi-title">cMail</h1>
      <div class="cmi-controls">
        <label class="cmi-toggle">
          <input type="checkbox" v-model="unreadOnly" @change="reload" />
          <span>Unread only</span>
        </label>
        <button
          class="cmi-btn"
          :disabled="marking || !unreadCount"
          @click="markAllRead"
        >Mark all read</button>
      </div>
    </div>

    <div class="cmi-scroll">
      <div v-if="loading && !items.length" class="cmi-status">Loading…</div>
      <div v-else-if="!items.length" class="cmi-status">
        {{ unreadOnly ? 'No unread cMail.' : 'No cMail yet. Visit other players\' cZones and say hello!' }}
      </div>

      <ul v-else class="cmi-list">
        <li
          v-for="m in items"
          :key="m.id"
          class="cmi-row"
          :class="{ unread: !m.read }"
          @click="openDetail(m)"
        >
          <img class="cmi-avatar" :src="`/avatars/${m.senderAvatar || 'default.png'}`" alt="" />
          <span class="cmi-sender">
            {{ m.senderUsername || 'A player' }}
            <span v-if="!m.read" class="cmi-new">New</span>
          </span>
          <span class="cmi-date">{{ formatCzoneMailDate(m.createdAt) }}</span>
          <p class="cmi-text">
            <span v-if="m.emoji" class="cmi-emoji">{{ m.emoji }}</span>{{ m.body }}
          </p>
        </li>
      </ul>

      <button
        v-if="cursor"
        class="cmi-load-more"
        :disabled="loading"
        @click="loadMore"
      >{{ loading ? 'Loading…' : 'Load more' }}</button>
    </div>

    <!-- Detail sheet. Per-row Delete/Block/Visit buttons would put ~75 targets,
         several destructive, on a 360px screen; the row opens this instead. -->
    <Teleport to="body">
      <transition name="cmi-fade">
        <div v-if="selected" class="cmi-overlay" @click.self="closeDetail">
          <div class="cmi-sheet" role="dialog" aria-modal="true" aria-label="cMail details">
            <div class="cmi-sheet-header">
              <span>From {{ selected.senderUsername || 'a player' }}</span>
              <button class="cmi-sheet-close" aria-label="Close" @click="closeDetail">✕</button>
            </div>
            <div class="cmi-sheet-body">
              <p class="cmi-sheet-text">
                <span v-if="selected.emoji" class="cmi-emoji">{{ selected.emoji }}</span>{{ selected.body }}
              </p>
              <p class="cmi-sheet-date">{{ new Date(selected.createdAt).toLocaleString() }}</p>
              <p v-if="actionError" class="cmi-sheet-error" role="status">{{ actionError }}</p>
            </div>
            <div class="cmi-sheet-footer">
              <NuxtLink
                v-if="selected.senderUsername"
                class="cmi-sheet-btn cmi-sheet-btn--primary"
                :to="`/newsite/czone/${encodeURIComponent(selected.senderUsername)}`"
              >Visit their cZone</NuxtLink>
              <button
                class="cmi-sheet-btn"
                :class="{ 'cmi-sheet-btn--confirm': confirmingDelete }"
                @click="onDeleteClick"
              >{{ confirmingDelete ? 'Really delete?' : 'Delete' }}</button>
              <button
                class="cmi-sheet-btn"
                :class="{ 'cmi-sheet-btn--confirm': confirmingBlock }"
                :disabled="!selected.senderUsername"
                @click="onBlockClick"
              >{{ confirmingBlock ? 'Really block?' : 'Block sender' }}</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { formatCzoneMailDate } from '~/composables/useCzoneMail'

const { state, refreshUnread, setUnread } = useCzoneMail()

const items = ref([])
const cursor = ref(null)
const loading = ref(false)
const unreadOnly = ref(false)
const marking = ref(false)

const selected = ref(null)
const actionError = ref('')
const confirmingDelete = ref(false)
const confirmingBlock = ref(false)
let confirmTimer = null

const unreadCount = computed(() => state.value.unread)

async function load(reset) {
  if (loading.value) return
  loading.value = true
  try {
    const res = await $fetch('/api/czone-mail/inbox', {
      query: {
        // 10, not the API's 25 max: 25 cards is ~2700px of scrolling on a phone.
        limit: 10,
        ...(unreadOnly.value ? { unreadOnly: 1 } : {}),
        ...(reset ? {} : { cursor: cursor.value })
      }
    })
    const rows = Array.isArray(res?.items) ? res.items : []
    items.value = reset ? rows : [...items.value, ...rows]
    cursor.value = res?.nextCursor || null
  } catch {
    if (reset) items.value = []
  } finally {
    loading.value = false
  }
}

function reload() {
  cursor.value = null
  load(true)
}
function loadMore() { load(false) }

onMounted(async () => {
  await load(true)
  await refreshUnread()
})

async function markAllRead() {
  marking.value = true
  try {
    await $fetch('/api/czone-mail/read', { method: 'POST', body: {} })
    for (const m of items.value) m.read = true
    setUnread(0)
    if (unreadOnly.value) reload()
  } catch {
    // leave state as-is; the badge refreshes on next load
  } finally {
    marking.value = false
  }
}

function openDetail(m) {
  selected.value = m
  actionError.value = ''
  confirmingDelete.value = false
  confirmingBlock.value = false
  if (!m.read) markOneRead(m)
}

function closeDetail() {
  selected.value = null
  if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
}

async function markOneRead(m) {
  m.read = true
  setUnread(Math.max(0, unreadCount.value - 1))
  try {
    await $fetch('/api/czone-mail/read', { method: 'POST', body: { ids: [m.id] } })
  } catch {
    refreshUnread()
  }
}

function armConfirm(which) {
  confirmingDelete.value = which === 'delete'
  confirmingBlock.value = which === 'block'
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmTimer = setTimeout(() => {
    confirmingDelete.value = false
    confirmingBlock.value = false
  }, 5000)
}

function onDeleteClick() {
  if (!confirmingDelete.value) return armConfirm('delete')
  confirmingDelete.value = false
  removeMessage(selected.value)
}

function onBlockClick() {
  if (!confirmingBlock.value) return armConfirm('block')
  confirmingBlock.value = false
  blockSender(selected.value)
}

async function removeMessage(m) {
  if (!m) return
  try {
    await $fetch(`/api/czone-mail/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
    items.value = items.value.filter(x => x.id !== m.id)
    closeDetail()
  } catch {
    actionError.value = 'Could not delete that message.'
  }
}

async function blockSender(m) {
  if (!m?.senderUsername) return
  try {
    await $fetch('/api/czone-mail/blocks', { method: 'POST', body: { username: m.senderUsername } })
    actionError.value = ''
    closeDetail()
    reload()
  } catch (err) {
    actionError.value = err?.data?.statusMessage || 'Could not block that player.'
  }
}

onBeforeUnmount(() => {
  if (confirmTimer) clearTimeout(confirmTimer)
})
</script>

<style scoped>
.mycmail {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: #fff;
}

.cmi-header {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: var(--OrbitLightBlue);
  border-radius: 4px;
}

.cmi-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: bold;
}

.cmi-controls { display: flex; align-items: center; gap: 10px; }

.cmi-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  min-height: 36px;
}
.cmi-toggle input { width: 18px; height: 18px; }

.cmi-btn {
  min-height: 36px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.cmi-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.cmi-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 4px 4px;
}

.cmi-status {
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  font-size: 0.92rem;
  line-height: 1.5;
  padding: 32px 12px;
}

.cmi-list { list-style: none; margin: 0; padding: 0; }

.cmi-row {
  display: grid;
  /* minmax(0, 1fr), not 1fr — see CzoneMailModal for why. */
  grid-template-columns: 32px minmax(0, 1fr) auto;
  grid-template-areas:
    "avatar sender date"
    "avatar text   text";
  gap: 2px 10px;
  align-items: center;
  min-height: 44px;
  padding: 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}
.cmi-row:hover { background: rgba(255, 255, 255, 0.14); }
.cmi-row.unread { background: rgba(255, 255, 255, 0.16); }

.cmi-avatar {
  grid-area: avatar;
  align-self: start;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.cmi-sender {
  grid-area: sender;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 0.86rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Unread is marked by a labelled pill plus bold weight, never colour alone. */
.cmi-new {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: #fff;
  color: #003466;
  font-size: 0.68rem;
  font-weight: 800;
}

.cmi-date {
  grid-area: date;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

.cmi-text {
  grid-area: text;
  margin: 2px 0 0;
  font-size: 0.95rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.cmi-emoji { margin-right: 4px; }

.cmi-load-more {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 4px 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}
.cmi-load-more:disabled { opacity: 0.6; cursor: default; }

/* ── Detail sheet ── */
.cmi-overlay {
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

.cmi-sheet {
  width: 100%;
  max-width: 420px;
  max-height: min(80vh, 80dvh);
  display: flex;
  flex-direction: column;
  background: #fff;
  color: #111;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
}

.cmi-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--OrbitDarkBlue);
  color: #fff;
  font-weight: bold;
  font-size: 0.92rem;
  flex-shrink: 0;
}

.cmi-sheet-close {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 1.1rem;
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
}

.cmi-sheet-body { padding: 14px; overflow-y: auto; flex: 1; }

.cmi-sheet-text {
  margin: 0 0 10px;
  font-size: 1.05rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.cmi-sheet-date { margin: 0; font-size: 0.82rem; color: #666; }
.cmi-sheet-error { margin: 10px 0 0; font-size: 0.9rem; color: #b91c1c; }

.cmi-sheet-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #ddd;
}

.cmi-sheet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #333;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.cmi-sheet-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cmi-sheet-btn--primary {
  background: var(--OrbitDarkBlue);
  border-color: var(--OrbitDarkBlue);
  color: #fff;
}
.cmi-sheet-btn--confirm { background: #dc2626; border-color: #dc2626; color: #fff; }

.cmi-fade-enter-active,
.cmi-fade-leave-active { transition: opacity 0.2s; }
.cmi-fade-enter-from,
.cmi-fade-leave-to { opacity: 0; }
</style>
