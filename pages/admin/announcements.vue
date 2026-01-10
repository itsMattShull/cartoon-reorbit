<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto bg-white rounded-lg shadow p-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h1 class="text-2xl font-semibold">Manage Announcements</h1>
        <button
          class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          @click="openCreate"
        >
          Add Announcement
        </button>
      </div>

      <div v-if="error" class="text-red-600 mb-4">
        {{ error.message || 'Failed to load announcements' }}
      </div>
      <div v-if="pending" class="text-gray-500">Loading...</div>

      <div v-if="announcements?.length">
        <div class="space-y-4 sm:hidden">
          <div v-for="row in announcements" :key="row.id" class="border rounded-lg p-4 bg-white">
            <div class="text-sm text-gray-500">Go Live (CST)</div>
            <div class="font-medium text-gray-900">{{ formatCentral(row.scheduledAt) }}</div>
            <div class="mt-3 text-sm text-gray-500">Preview</div>
            <div class="text-gray-900">{{ previewMessage(row.message) }}</div>
            <div class="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
              <span v-if="row.pingOption">Ping: {{ row.pingOption }}</span>
              <span v-if="imageCount(row)">Images: {{ imageCount(row) }}</span>
            </div>
            <div v-if="row.sendError" class="text-xs text-red-600 mt-2">
              Last error: {{ row.sendError }}
            </div>
            <div class="mt-3 flex gap-3">
              <button class="text-blue-600 hover:text-blue-800" @click="openEdit(row)">Edit</button>
              <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
            </div>
          </div>
        </div>

        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b">
              <th class="py-2 pr-4">Preview</th>
              <th class="py-2 pr-4 whitespace-nowrap">Go Live (CST)</th>
              <th class="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in announcements" :key="row.id" class="border-b last:border-b-0">
              <td class="py-3 pr-4 align-top">
                <div class="text-gray-900">
                  {{ previewMessage(row.message) }}
                </div>
                <div class="text-xs text-gray-500 mt-1 flex flex-wrap gap-2">
                  <span v-if="row.pingOption">Ping: {{ row.pingOption }}</span>
                  <span v-if="imageCount(row)">Images: {{ imageCount(row) }}</span>
                </div>
                <div v-if="row.sendError" class="text-xs text-red-600 mt-2">
                  Last error: {{ row.sendError }}
                </div>
              </td>
              <td class="py-3 pr-4 align-top whitespace-nowrap">
                {{ formatCentral(row.scheduledAt) }}
              </td>
              <td class="py-3 pr-4 align-top whitespace-nowrap">
                <button class="text-blue-600 hover:text-blue-800 mr-3" @click="openEdit(row)">Edit</button>
                <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
              </td>
            </tr>
          </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="!pending" class="text-gray-500">No upcoming announcements.</div>
    </div>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">{{ modalTitle }}</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeModal">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block mb-1 font-medium">Date (CST)</label>
                <input v-model="form.date" type="date" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">Time (CST)</label>
                <input v-model="form.time" type="time" class="w-full border rounded px-3 py-2" />
              </div>
            </div>

            <div>
              <label class="block mb-1 font-medium">Ping Option</label>
              <select v-model="form.pingOption" class="w-full border rounded px-3 py-2">
                <option value="">None</option>
                <option value="@everyone">@everyone</option>
                <option value="@here">@here</option>
              </select>
            </div>

            <div>
              <label class="block mb-1 font-medium">Message</label>
              <textarea
                ref="messageInput"
                v-model="form.message"
                maxlength="1000"
                rows="5"
                class="w-full border rounded px-3 py-2"
                @input="onMessageInput"
                @click="onMessageInput"
                @keydown="onMessageKeydown"
              ></textarea>
              <div class="text-xs text-gray-500 mt-1">
                {{ messageCount }}/1000 characters
              </div>
              <div v-if="showMentionSuggestions" class="mt-2 border rounded bg-white shadow-sm max-h-48 overflow-y-auto">
                <div v-if="mentionLoading" class="px-3 py-2 text-xs text-gray-500">Searching...</div>
                <button
                  v-for="user in mentionSuggestions"
                  :key="user.id || user.username"
                  class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
                  :disabled="!user.discordId"
                  @mousedown.prevent="applyMention(user)"
                >
                  <span>@{{ user.username }}</span>
                  <span v-if="!user.discordId" class="ml-2 text-xs text-gray-400">(no Discord ID)</span>
                </button>
                <div v-if="!mentionLoading && !mentionSuggestions.length" class="px-3 py-2 text-xs text-gray-500">
                  No matching users with Discord IDs
                </div>
              </div>
            </div>

            <div>
              <label class="block mb-1 font-medium">Images (optional, up to 3)</label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Image 1</label>
                  <input ref="fileInput1" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'image1')" />
                  <div v-if="form.imagePath" class="text-xs text-gray-500 mt-2">
                    Current: {{ form.imagePath }}
                  </div>
                  <div v-if="imageFile1" class="text-xs text-gray-500 mt-1">Selected: {{ imageFile1.name }}</div>
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Image 2</label>
                  <input ref="fileInput2" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'image2')" />
                  <div v-if="form.imagePath2" class="text-xs text-gray-500 mt-2">
                    Current: {{ form.imagePath2 }}
                  </div>
                  <div v-if="imageFile2" class="text-xs text-gray-500 mt-1">Selected: {{ imageFile2.name }}</div>
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">Image 3</label>
                  <input ref="fileInput3" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'image3')" />
                  <div v-if="form.imagePath3" class="text-xs text-gray-500 mt-2">
                    Current: {{ form.imagePath3 }}
                  </div>
                  <div v-if="imageFile3" class="text-xs text-gray-500 mt-1">Selected: {{ imageFile3.name }}</div>
                </div>
              </div>
            </div>

            <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="closeModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving"
            @click="saveAnnouncement"
          >
            <span v-if="!saving">Save</span>
            <span v-else>Saving...</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch, nextTick } from 'vue'
import { useFetch } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({
  title: 'Admin - Announcements',
  middleware: ['auth','admin'],
  layout: 'default'
})

const showModal = ref(false)
const saving = ref(false)
const formError = ref('')
const imageFile1 = ref(null)
const imageFile2 = ref(null)
const imageFile3 = ref(null)
const fileInput1 = ref(null)
const fileInput2 = ref(null)
const fileInput3 = ref(null)
const messageInput = ref(null)
const mentionSuggestions = ref([])
const mentionQuery = ref('')
const mentionLoading = ref(false)
const showMentionSuggestions = ref(false)
const mentionRange = ref({ start: 0, end: 0 })
let mentionTimer = null
const mentionCacheByName = new Map()
const mentionCacheById = new Map()

const form = reactive({
  id: null,
  date: '',
  time: '',
  pingOption: '',
  message: '',
  imagePath: '',
  imagePath2: '',
  imagePath3: ''
})

const { data: listData, pending, error, refresh } = await useFetch('/api/admin/announcements')
const announcements = computed(() => (listData.value?.items || []).filter(item => item.sentAt == null))

const messageCount = computed(() => form.message.length)
const modalTitle = computed(() => (form.id ? 'Edit Announcement' : 'Add Announcement'))

function previewMessage(msg) {
  const text = displayMessage(String(msg || ''))
  if (text.length <= 150) return text
  return `${text.slice(0, 150)}...`
}

function imageCount(row) {
  let count = 0
  if (row?.imagePath) count += 1
  if (row?.imagePath2) count += 1
  if (row?.imagePath3) count += 1
  return count
}

function cacheMentionUsers(items) {
  for (const item of items || []) {
    if (!item?.username || !item?.discordId) continue
    mentionCacheByName.set(String(item.username).toLowerCase(), String(item.discordId))
    mentionCacheById.set(String(item.discordId), String(item.username))
  }
}

function extractMentionIds(text) {
  const ids = new Set()
  const re = /<@!?(\d+)>/g
  let m
  while ((m = re.exec(text))) {
    ids.add(m[1])
  }
  return Array.from(ids)
}

function extractMentionNames(text) {
  const names = new Set()
  const re = /(^|[^<])@([A-Za-z0-9._-]+)/g
  let m
  while ((m = re.exec(text))) {
    const name = m[2]
    const lower = name.toLowerCase()
    if (lower === 'everyone' || lower === 'here') continue
    names.add(name)
  }
  return Array.from(names)
}

function replaceMentionIds(text) {
  return text.replace(/<@!?(\d+)>/g, (match, id) => {
    const username = mentionCacheById.get(String(id))
    return username ? `@${username}` : match
  })
}

function replaceMentionsWithIds(text) {
  return text.replace(/(^|[^<])@([A-Za-z0-9._-]+)/g, (match, prefix, name) => {
    const lower = String(name).toLowerCase()
    if (lower === 'everyone' || lower === 'here') return `${prefix}@${name}`
    const discordId = mentionCacheByName.get(lower)
    return discordId ? `${prefix}<@${discordId}>` : `${prefix}@${name}`
  })
}

function displayMessage(text) {
  return replaceMentionIds(text)
}

async function resolveDiscordIds(ids) {
  const missing = ids.filter(id => !mentionCacheById.has(String(id)))
  if (!missing.length) return
  try {
    const res = await $fetch('/api/admin/user-mentions', {
      query: { discordIds: missing.join(','), limit: String(missing.length) }
    })
    cacheMentionUsers(res?.items || [])
  } catch {}
}

async function resolveUsernames(names) {
  const missing = names.filter(name => !mentionCacheByName.has(String(name).toLowerCase()))
  if (!missing.length) return
  try {
    const res = await $fetch('/api/admin/user-mentions', {
      query: { usernames: missing.join(','), limit: String(missing.length) }
    })
    cacheMentionUsers(res?.items || [])
  } catch {}
}

async function convertDiscordToUsernames(text) {
  const ids = extractMentionIds(text)
  if (ids.length) await resolveDiscordIds(ids)
  return replaceMentionIds(text)
}

async function convertUsernamesToDiscord(text) {
  const names = extractMentionNames(text)
  if (names.length) await resolveUsernames(names)
  return replaceMentionsWithIds(text)
}

function findMentionAtCursor(text, caret) {
  const beforeCursor = text.slice(0, caret)
  const at = beforeCursor.lastIndexOf('@')
  if (at === -1) return null
  const afterAt = beforeCursor.slice(at + 1)
  if (/\s/.test(afterAt)) return null
  const beforeChar = beforeCursor[at - 1]
  if (beforeChar && /[A-Za-z0-9._-]/.test(beforeChar)) return null
  return { query: afterAt, start: at, end: caret }
}

function scheduleMentionFetch(query) {
  if (mentionTimer) clearTimeout(mentionTimer)
  mentionTimer = setTimeout(() => {
    fetchMentionSuggestions(query)
  }, 150)
}

async function fetchMentionSuggestions(query) {
  const sanitized = String(query || '').replace(/[^A-Za-z0-9._-]/g, '')
  if (!sanitized || sanitized.length < 1) {
    mentionSuggestions.value = []
    showMentionSuggestions.value = false
    return
  }
  mentionLoading.value = true
  showMentionSuggestions.value = true
  try {
    const res = await $fetch('/api/admin/user-mentions', {
      query: { q: sanitized, limit: '8' }
    })
    mentionSuggestions.value = res?.items || []
    cacheMentionUsers(mentionSuggestions.value)
  } catch {
    mentionSuggestions.value = []
  } finally {
    mentionLoading.value = false
  }
}

function onMessageInput() {
  const el = messageInput.value
  const caret = el?.selectionStart ?? form.message.length
  const found = findMentionAtCursor(form.message, caret)
  if (!found || found.query.length < 1) {
    mentionQuery.value = ''
    mentionSuggestions.value = []
    showMentionSuggestions.value = false
    return
  }
  const sanitized = String(found.query || '').replace(/[^A-Za-z0-9._-]/g, '')
  if (!sanitized) {
    mentionQuery.value = ''
    mentionSuggestions.value = []
    showMentionSuggestions.value = false
    return
  }
  mentionRange.value = { start: found.start, end: found.end }
  if (sanitized === mentionQuery.value) return
  mentionQuery.value = sanitized
  scheduleMentionFetch(sanitized)
}

function onMessageKeydown(e) {
  if (e.key === 'Escape') {
    showMentionSuggestions.value = false
  }
}

async function applyMention(user) {
  if (!user?.username || !user?.discordId) return
  cacheMentionUsers([user])
  const { start, end } = mentionRange.value
  const before = form.message.slice(0, start)
  const after = form.message.slice(end)
  const insert = `@${user.username}`
  const needsSpace = after && !/^[\\s,.!?]/.test(after)
  form.message = `${before}${insert}${needsSpace ? ' ' : ''}${after}`
  mentionQuery.value = ''
  mentionSuggestions.value = []
  showMentionSuggestions.value = false
  await nextTick()
  const el = messageInput.value
  if (el) {
    const pos = before.length + insert.length + (needsSpace ? 1 : 0)
    el.focus()
    el.setSelectionRange(pos, pos)
  }
}

function formatCentral(date) {
  const d = new Date(date)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: '2-digit',
    hour12: true
  }).formatToParts(d)
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  const day = `${map.month}/${map.day}/${map.year}`
  const time = `${map.hour}:${map.minute} ${map.dayPeriod.toUpperCase()}`
  return `${day} ${time}`
}

function centralParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  }).formatToParts(date)
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` }
}

function openCreate() {
  resetForm()
  const future = new Date(Date.now() + 5 * 60 * 1000)
  const parts = centralParts(future)
  form.date = parts.date
  form.time = parts.time
  showModal.value = true
}

async function openEdit(row) {
  resetForm()
  form.id = row.id
  form.message = await convertDiscordToUsernames(row.message || '')
  form.pingOption = row.pingOption || ''
  form.imagePath = row.imagePath || ''
  form.imagePath2 = row.imagePath2 || ''
  form.imagePath3 = row.imagePath3 || ''
  const parts = centralParts(new Date(row.scheduledAt))
  form.date = parts.date
  form.time = parts.time
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  resetForm()
}

function resetForm() {
  form.id = null
  form.date = ''
  form.time = ''
  form.pingOption = ''
  form.message = ''
  form.imagePath = ''
  form.imagePath2 = ''
  form.imagePath3 = ''
  formError.value = ''
  imageFile1.value = null
  imageFile2.value = null
  imageFile3.value = null
  if (fileInput1.value) fileInput1.value.value = ''
  if (fileInput2.value) fileInput2.value.value = ''
  if (fileInput3.value) fileInput3.value.value = ''
  mentionQuery.value = ''
  mentionSuggestions.value = []
  showMentionSuggestions.value = false
}

function onFileChange(e, slot) {
  const file = e.target.files?.[0]
  const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif'])
  const refs = {
    image1: { file: imageFile1, input: fileInput1 },
    image2: { file: imageFile2, input: fileInput2 },
    image3: { file: imageFile3, input: fileInput3 }
  }
  const target = refs[slot]
  if (!target) return
  if (!file) {
    target.file.value = null
    return
  }
  if (!allowed.has(file.type)) {
    formError.value = 'Only JPG, JPEG, PNG, or GIF images are allowed.'
    target.file.value = null
    if (target.input.value) target.input.value.value = ''
    return
  }
  target.file.value = file
}

async function saveAnnouncement() {
  formError.value = ''
  const message = form.message.trim()
  if (!form.date || !form.time) {
    formError.value = 'Select a date and time in CST.'
    return
  }
  if (!message) {
    formError.value = 'Message is required.'
    return
  }
  if (message.length > 1000) {
    formError.value = 'Message must be 1000 characters or less.'
    return
  }

  saving.value = true
  try {
    const fd = new FormData()
    const formattedMessage = await convertUsernamesToDiscord(message)
    if (formattedMessage.length > 1000) {
      formError.value = 'Message is too long after mentions are expanded.'
      saving.value = false
      return
    }
    fd.append('message', formattedMessage)
    fd.append('pingOption', form.pingOption || '')
    fd.append('scheduledAtLocal', `${form.date} ${form.time}`)
    if (imageFile1.value) fd.append('image1', imageFile1.value)
    if (imageFile2.value) fd.append('image2', imageFile2.value)
    if (imageFile3.value) fd.append('image3', imageFile3.value)

    if (form.id) {
      await $fetch(`/api/admin/announcements/${form.id}`, { method: 'PUT', body: fd })
    } else {
      await $fetch('/api/admin/announcements', { method: 'POST', body: fd })
    }
    await refresh()
    closeModal()
  } catch (err) {
    formError.value = err?.data?.statusMessage || 'Failed to save announcement'
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (!confirm('Delete this announcement? This cannot be undone.')) return
  try {
    await $fetch(`/api/admin/announcements/${row.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    alert(err?.data?.statusMessage || 'Failed to delete announcement')
  }
}

watch(announcements, async (items) => {
  const ids = new Set()
  for (const row of items || []) {
    extractMentionIds(String(row.message || '')).forEach(id => ids.add(id))
  }
  if (ids.size) await resolveDiscordIds(Array.from(ids))
}, { immediate: true })
</script>
