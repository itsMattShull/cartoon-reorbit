<template>
  <div class="admin-myorbit-moderation bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">MyOrbit Moderation</h1>
      </div>
      <p class="text-gray-500">
        Spectate a room's live chat (nothing is otherwise persisted — this is the only place to
        see it) and mute, ban, or delete a message. Mute/ban are scoped to MyOrbit only; they
        never touch the player's ability to use the rest of the site.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Room picker ────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Spectate a room</h2>
        <div v-if="rooms.length" class="flex flex-wrap gap-1">
          <button
            v-for="r in rooms" :key="r.id" type="button"
            class="px-2 py-1 rounded text-[11px] bg-gray-100 hover:bg-gray-200"
            :class="selectedRoomId === r.id ? 'ring-2 ring-blue-500' : ''"
            @click="spectate(r.id)"
          >{{ r.name }}</button>
        </div>
        <p v-else class="text-gray-500">No rooms yet.</p>
      </div>

      <!-- ── Live chat feed ─────────────────────────────────────────── -->
      <div v-if="selectedRoomId" class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Live chat — {{ selectedRoomName }}</h2>
        <p v-if="chatError" class="text-red-600">{{ chatError }}</p>
        <div class="h-64 overflow-y-auto border rounded p-2 space-y-1 bg-gray-50">
          <div v-if="!messages.length" class="text-gray-400">No messages yet.</div>
          <div v-for="m in messages" :key="m.id" class="flex items-start gap-2 bg-white rounded px-2 py-1">
            <div class="flex-1 min-w-0">
              <span class="font-semibold">{{ m.username }}:</span>
              <span class="break-words">{{ m.message }}</span>
            </div>
            <div class="flex-shrink-0 flex gap-1">
              <button type="button" class="text-red-600 hover:underline" @click="deleteMessage(m)">Delete</button>
              <button type="button" class="text-amber-700 hover:underline" @click="openMuteForm(m.userId, m.username)">Mute</button>
              <button type="button" class="text-red-800 hover:underline" @click="openBanForm(m.userId, m.username)">Ban</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Mute/ban by user (also reachable directly, without a message to click from) ── -->
      <div v-if="actionForm" class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">{{ actionForm.type === 'mute' ? 'Mute' : 'Ban' }} {{ actionForm.username }}</h2>
        <p v-if="actionError" class="text-red-600">{{ actionError }}</p>
        <div class="flex gap-2 flex-wrap items-end">
          <div v-if="actionForm.type === 'mute'" class="w-28">
            <label class="block text-[11px] font-medium mb-1">Minutes</label>
            <input v-model.number="actionForm.minutes" type="number" min="1" max="10080" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-64">
            <label class="block text-[11px] font-medium mb-1">Reason (optional)</label>
            <input v-model="actionForm.reason" maxlength="300" class="w-full border rounded px-2 py-1" />
          </div>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="submitAction">
            {{ actionForm.type === 'mute' ? 'Mute' : 'Ban' }}
          </button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="actionForm = null">Cancel</button>
        </div>
      </div>

      <!-- ── Currently muted/banned users ───────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Un-mute / un-ban by user id</h2>
        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-64">
            <label class="block text-[11px] font-medium mb-1">User ID</label>
            <input v-model="unactionUserId" class="w-full border rounded px-2 py-1" />
          </div>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="unmuteUser">Unmute</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="unbanUser">Unban</button>
        </div>
        <p v-if="unactionMessage" class="text-green-700">{{ unactionMessage }}</p>
        <p v-if="unactionError" class="text-red-600">{{ unactionError }}</p>
      </div>

      <!-- ── Banned words ───────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Banned words</h2>
        <p v-if="bannedWordsError" class="text-red-600">{{ bannedWordsError }}</p>
        <div class="flex flex-wrap gap-1">
          <span v-for="w in bannedWords" :key="w.id" class="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-[11px]">
            {{ w.phrase }}
            <button type="button" class="text-red-600" @click="deleteBannedWord(w)">×</button>
          </span>
        </div>
        <div class="flex gap-2 items-end">
          <div class="w-48">
            <input v-model="newBannedWord" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="new phrase" @keyup.enter="addBannedWord" />
          </div>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="addBannedWord">Add</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const rooms = ref([])
const loadError = ref('')
const selectedRoomId = ref(null)
const selectedRoomName = ref('')
const messages = ref([])
const chatError = ref('')

const actionForm = ref(null)
const actionError = ref('')
const unactionUserId = ref('')
const unactionMessage = ref('')
const unactionError = ref('')

const bannedWords = ref([])
const bannedWordsError = ref('')
const newBannedWord = ref('')

let socket = null

function ensureSocket() {
  if (socket) return socket
  const runtime = useRuntimeConfig()
  socket = io(
    import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
    { reconnectionDelayMax: 5000, withCredentials: true }
  )
  socket.on('myorbit:chatMessage', (m) => {
    // Only this socket's currently-spectated room's messages belong in the feed — the socket
    // may briefly still be receiving the PREVIOUS room's events too, mid-switch.
    if (m.roomId !== selectedRoomId.value) return
    messages.value = [...messages.value.slice(-199), m] // keep a bounded rolling window
  })
  socket.on('myorbit:messageDeleted', ({ messageId }) => {
    messages.value = messages.value.filter(m => m.id !== messageId)
  })
  socket.on('myorbit:error', (payload) => { chatError.value = payload?.message || 'Something went wrong' })
  return socket
}

async function loadRooms() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/myorbit-rooms')
    rooms.value = res?.rooms || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load rooms'
  }
}

function spectate(roomId) {
  chatError.value = ''
  messages.value = []
  selectedRoomId.value = roomId
  selectedRoomName.value = rooms.value.find(r => r.id === roomId)?.name || ''
  ensureSocket().emit('myorbit:adminSpectate', { roomId })
}

async function deleteMessage(m) {
  chatError.value = ''
  try {
    await $fetch('/api/admin/myorbit/delete-message', {
      method: 'POST',
      body: { roomId: selectedRoomId.value, messageId: m.id, targetUserId: m.userId, messageText: m.message }
    })
    messages.value = messages.value.filter(x => x.id !== m.id)
  } catch (e) {
    chatError.value = e?.data?.statusMessage || 'Failed to delete message'
  }
}

function openMuteForm(userId, username) {
  actionError.value = ''
  actionForm.value = { type: 'mute', userId, username, minutes: 15, reason: '' }
}
function openBanForm(userId, username) {
  actionError.value = ''
  actionForm.value = { type: 'ban', userId, username, reason: '' }
}

async function submitAction() {
  actionError.value = ''
  const form = actionForm.value
  try {
    if (form.type === 'mute') {
      await $fetch('/api/admin/myorbit/mute', { method: 'POST', body: { userId: form.userId, minutes: form.minutes, reason: form.reason } })
    } else {
      await $fetch('/api/admin/myorbit/ban', { method: 'POST', body: { userId: form.userId, reason: form.reason } })
    }
    actionForm.value = null
  } catch (e) {
    actionError.value = e?.data?.statusMessage || 'Failed to apply action'
  }
}

async function unmuteUser() {
  unactionMessage.value = ''
  unactionError.value = ''
  try {
    await $fetch('/api/admin/myorbit/unmute', { method: 'POST', body: { userId: unactionUserId.value } })
    unactionMessage.value = 'Unmuted.'
  } catch (e) {
    unactionError.value = e?.data?.statusMessage || 'Failed to unmute'
  }
}
async function unbanUser() {
  unactionMessage.value = ''
  unactionError.value = ''
  try {
    await $fetch('/api/admin/myorbit/unban', { method: 'POST', body: { userId: unactionUserId.value } })
    unactionMessage.value = 'Unbanned.'
  } catch (e) {
    unactionError.value = e?.data?.statusMessage || 'Failed to unban'
  }
}

async function loadBannedWords() {
  bannedWordsError.value = ''
  try {
    const res = await $fetch('/api/admin/myorbit-banned-words')
    bannedWords.value = res?.words || []
  } catch (e) {
    bannedWordsError.value = e?.data?.statusMessage || 'Failed to load banned words'
  }
}
async function addBannedWord() {
  if (!newBannedWord.value.trim()) return
  bannedWordsError.value = ''
  try {
    await $fetch('/api/admin/myorbit-banned-words', { method: 'POST', body: { phrase: newBannedWord.value } })
    newBannedWord.value = ''
    await loadBannedWords()
  } catch (e) {
    bannedWordsError.value = e?.data?.statusMessage || 'Failed to add phrase'
  }
}
async function deleteBannedWord(w) {
  bannedWordsError.value = ''
  try {
    await $fetch(`/api/admin/myorbit-banned-words/${w.id}`, { method: 'DELETE' })
    await loadBannedWords()
  } catch (e) {
    bannedWordsError.value = e?.data?.statusMessage || 'Failed to remove phrase'
  }
}

loadRooms()
loadBannedWords()

onBeforeUnmount(() => {
  if (socket) { socket.disconnect(); socket = null }
})
</script>
