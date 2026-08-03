<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-5xl mx-auto space-y-6">
      <!-- ── Templates ─────────────────────────────────────────────── -->
      <div class="bg-white rounded-lg shadow p-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h1 class="text-2xl font-semibold">Manage cZone Mail</h1>
            <p class="text-sm text-gray-600 mt-1">
              The pre-made messages players can leave on each other's cZones. Players
              can only pick from this list — they can never type their own text.
            </p>
          </div>
          <button
            class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            @click="openCreate"
          >Add Message</button>
        </div>

        <p v-if="error" class="text-red-600 mb-4">{{ error }}</p>
        <p v-if="loading" class="text-gray-500">Loading…</p>

        <template v-if="templates.length">
          <!-- Mobile cards -->
          <div class="space-y-4 sm:hidden">
            <div v-for="t in templates" :key="t.id" class="border rounded-lg p-4">
              <div class="font-medium text-gray-900">
                <span v-if="t.emoji" class="mr-1">{{ t.emoji }}</span>{{ t.text }}
              </div>
              <div class="text-xs text-gray-500 mt-2 flex flex-wrap gap-2">
                <span>{{ t.category || 'Uncategorized' }}</span>
                <span>Order: {{ t.sortOrder }}</span>
                <span :class="t.active ? 'text-green-700' : 'text-gray-400'">
                  {{ t.active ? 'Active' : 'Disabled' }}
                </span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                Used {{ t.usageCount }} time{{ t.usageCount === 1 ? '' : 's' }} all time
                <span v-if="t.lastUsedAt"> · last {{ formatDate(t.lastUsedAt) }}</span>
              </div>
              <div class="mt-3 flex gap-3">
                <button class="text-blue-600" @click="openEdit(t)">Edit</button>
                <button class="text-red-600" @click="openRetire(t)">Retire</button>
              </div>
            </div>
          </div>

          <!-- Desktop table -->
          <div class="hidden sm:block overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left border-b">
                  <th class="py-2 pr-4">Message</th>
                  <th class="py-2 pr-4">Category</th>
                  <th class="py-2 pr-4">Order</th>
                  <th class="py-2 pr-4">Status</th>
                  <th class="py-2 pr-4 whitespace-nowrap">Usage</th>
                  <th class="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in templates" :key="t.id" class="border-b last:border-b-0">
                  <td class="py-3 pr-4">
                    <span v-if="t.emoji" class="mr-1">{{ t.emoji }}</span>{{ t.text }}
                  </td>
                  <td class="py-3 pr-4">{{ t.category || '—' }}</td>
                  <td class="py-3 pr-4">{{ t.sortOrder }}</td>
                  <td class="py-3 pr-4">
                    <span :class="t.active ? 'text-green-700' : 'text-gray-400'">
                      {{ t.active ? 'Active' : 'Disabled' }}
                    </span>
                  </td>
                  <td class="py-3 pr-4 whitespace-nowrap">
                    {{ t.usageCount }}
                    <span class="text-gray-400 text-xs">({{ t.recentCount }} kept)</span>
                    <div v-if="t.lastUsedAt" class="text-xs text-gray-500">{{ formatDate(t.lastUsedAt) }}</div>
                  </td>
                  <td class="py-3 pr-4 whitespace-nowrap">
                    <button class="text-blue-600 mr-3" @click="openEdit(t)">Edit</button>
                    <button class="text-red-600" @click="openRetire(t)">Retire</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <p v-else-if="!loading" class="text-gray-500">No messages yet.</p>
      </div>

      <!-- ── Settings ──────────────────────────────────────────────── -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-1">Limits &amp; Notifications</h2>
        <p class="text-sm text-gray-600 mb-4">
          These are the same settings shown under Global Settings → cZone Mail.
        </p>

        <div v-if="settingsWarning" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-900">
          <strong>Heads up:</strong> {{ settingsWarning }}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Cooldown between messages (seconds)</span>
            <input v-model.number="settings.cooldownSeconds" type="number" min="0" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Same-player cooldown (minutes)</span>
            <input v-model.number="settings.pairCooldownMinutes" type="number" min="0" class="mt-1 w-full border rounded px-3 py-2" />
            <span class="text-xs text-gray-500">0 disables. Stops one player repeatedly messaging the same person.</span>
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Spam window (minutes)</span>
            <input v-model.number="settings.spamWindowMinutes" type="number" min="1" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Messages in window before block</span>
            <input v-model.number="settings.spamThreshold" type="number" min="2" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Block length (hours)</span>
            <input v-model.number="settings.spamBlockHours" type="number" min="1" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block">
            <span class="block text-sm font-medium text-gray-700">Keep messages for (days)</span>
            <input v-model.number="settings.retentionDays" type="number" min="1" class="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <label class="block sm:col-span-2">
            <span class="block text-sm font-medium text-gray-700">Discord notification channel ID</span>
            <input v-model.trim="settings.discordChannelId" type="text" inputmode="numeric" class="mt-1 w-full border rounded px-3 py-2" placeholder="123456789012345678" />
            <span class="text-xs text-gray-500">
              Must be a standard text channel. Each player gets one private thread here.
              Leave blank to send direct messages only.
            </span>
          </label>
        </div>

        <p v-if="settingsError" class="text-red-600 text-sm mt-3">{{ settingsError }}</p>
        <p v-if="channelWarning" class="text-yellow-700 text-sm mt-3">{{ channelWarning }}</p>

        <div class="mt-4">
          <button
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            :disabled="savingSettings"
            @click="saveSettings"
          >{{ savingSettings ? 'Saving…' : 'Save Settings' }}</button>
        </div>
      </div>

      <!-- ── Spam log ──────────────────────────────────────────────── -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-xl font-semibold mb-1">Spam Blocks</h2>
        <p class="text-sm text-gray-600 mb-4">
          Players who tripped the burst guard. Blocks expire on their own.
        </p>

        <p v-if="!spamLogs.length" class="text-gray-500">No spam blocks recorded.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Player</th>
                <th class="py-2 pr-4">Messages</th>
                <th class="py-2 pr-4">Blocked until</th>
                <th class="py-2 pr-4">When</th>
                <th class="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in spamLogs" :key="row.id" class="border-b last:border-b-0">
                <td class="py-3 pr-4">{{ row.username || '—' }}</td>
                <td class="py-3 pr-4">{{ row.count }} in {{ row.windowMinutes }}m</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  {{ formatDate(row.blockedUntil) }}
                  <span v-if="row.stillBlocked" class="text-red-600 text-xs ml-1">active</span>
                </td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatDate(row.createdAt) }}</td>
                <td class="py-3 pr-4">
                  <button
                    v-if="row.stillBlocked"
                    class="text-blue-600"
                    @click="unblock(row)"
                  >Lift block</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add/Edit modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold">{{ form.id ? 'Edit Message' : 'Add Message' }}</h2>
          <button class="text-gray-600" @click="closeModal">Close</button>
        </div>
        <div class="p-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <label class="block mb-1 font-medium">Message</label>
            <input v-model="form.text" maxlength="120" class="w-full border rounded px-3 py-2" placeholder="Nice cZone!" />
            <p class="text-xs text-gray-500 mt-1">{{ (form.text || '').length }}/120. No links.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block mb-1 font-medium">Emoji</label>
              <input v-model="form.emoji" class="w-full border rounded px-3 py-2" placeholder="😄" />
            </div>
            <div>
              <label class="block mb-1 font-medium">Category</label>
              <input v-model="form.category" maxlength="32" class="w-full border rounded px-3 py-2" placeholder="Compliments" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block mb-1 font-medium">Sort order</label>
              <input v-model.number="form.sortOrder" type="number" class="w-full border rounded px-3 py-2" />
            </div>
            <label class="flex items-center gap-2 mt-6">
              <input v-model="form.active" type="checkbox" class="w-4 h-4" />
              <span>Active</span>
            </label>
          </div>
          <p v-if="modalError" class="text-red-600 text-sm">{{ modalError }}</p>
        </div>
        <div class="p-4 border-t flex justify-end gap-2">
          <button class="px-4 py-2 rounded border" @click="closeModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-blue-600 text-white"
            :disabled="saving"
            @click="saveTemplate"
          >{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </div>
    </div>

    <!-- Retire modal -->
    <div v-if="retiring" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="retiring = null"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-md p-5">
        <h2 class="text-lg font-semibold mb-2">Retire this message?</h2>
        <p class="text-sm text-gray-700 mb-3">
          “{{ retiring.text }}” will stop appearing in the player picker.
        </p>
        <label class="flex items-start gap-2 text-sm mb-4">
          <input v-model="purgeMessages" type="checkbox" class="mt-1 w-4 h-4" />
          <span>
            Also remove every message already sent from this template
            ({{ retiring.recentCount }} currently stored). Use this if the wording
            turned out badly — retiring alone leaves copies in players' inboxes
            and on their public walls.
          </span>
        </label>
        <div class="flex justify-end gap-2">
          <button class="px-4 py-2 rounded border" @click="retiring = null">Cancel</button>
          <button class="px-4 py-2 rounded bg-red-600 text-white" @click="confirmRetire">Retire</button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded bg-green-100 text-green-800">
      {{ toast }}
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - Manage cZone Mail', middleware: ['auth', 'admin'], layout: 'admin' })

const templates = ref([])
const spamLogs = ref([])
const loading = ref(true)
const error = ref('')

const settings = ref({
  cooldownSeconds: 30,
  pairCooldownMinutes: 60,
  spamWindowMinutes: 6,
  spamThreshold: 10,
  spamBlockHours: 12,
  retentionDays: 90,
  discordChannelId: ''
})
const settingsWarning = ref('')
const settingsError = ref('')
const channelWarning = ref('')
const savingSettings = ref(false)

const showModal = ref(false)
const saving = ref(false)
const modalError = ref('')
const form = ref({ id: null, text: '', emoji: '', category: '', sortOrder: 0, active: true })

const retiring = ref(null)
const purgeMessages = ref(false)

const toast = ref('')
function showToast(msg) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 3000)
}

function formatDate(v) {
  if (!v) return '—'
  return new Date(v).toLocaleString()
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [tpl, cfg, logs] = await Promise.all([
      $fetch('/api/admin/czone-mail/templates'),
      $fetch('/api/admin/czone-mail/settings'),
      $fetch('/api/admin/czone-mail/spam-logs')
    ])
    templates.value = tpl?.templates || []
    settings.value = {
      cooldownSeconds: cfg.cooldownSeconds,
      pairCooldownMinutes: cfg.pairCooldownMinutes,
      spamWindowMinutes: cfg.spamWindowMinutes,
      spamThreshold: cfg.spamThreshold,
      spamBlockHours: cfg.spamBlockHours,
      retentionDays: cfg.retentionDays,
      discordChannelId: cfg.discordChannelId || ''
    }
    settingsWarning.value = cfg.warning || ''
    spamLogs.value = logs?.items || []
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Failed to load cZone Mail settings.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

function openCreate() {
  form.value = { id: null, text: '', emoji: '', category: '', sortOrder: 0, active: true }
  modalError.value = ''
  showModal.value = true
}

function openEdit(t) {
  form.value = {
    id: t.id, text: t.text, emoji: t.emoji || '',
    category: t.category || '', sortOrder: t.sortOrder, active: t.active
  }
  modalError.value = ''
  showModal.value = true
}

function closeModal() { showModal.value = false }

async function saveTemplate() {
  saving.value = true
  modalError.value = ''
  try {
    const body = {
      text: form.value.text,
      emoji: form.value.emoji,
      category: form.value.category,
      sortOrder: form.value.sortOrder,
      active: form.value.active
    }
    if (form.value.id) {
      await $fetch(`/api/admin/czone-mail/templates/${form.value.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/czone-mail/templates', { method: 'POST', body })
    }
    showModal.value = false
    showToast('Saved.')
    await loadAll()
  } catch (e) {
    modalError.value = e?.data?.statusMessage || 'Could not save that message.'
  } finally {
    saving.value = false
  }
}

function openRetire(t) {
  retiring.value = t
  purgeMessages.value = false
}

async function confirmRetire() {
  const t = retiring.value
  retiring.value = null
  try {
    const res = await $fetch(`/api/admin/czone-mail/templates/${t.id}`, {
      method: 'DELETE',
      body: { purgeMessages: purgeMessages.value }
    })
    showToast(res.purged ? `Retired. Removed ${res.purged} sent message(s).` : 'Retired.')
    await loadAll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Could not retire that message.'
  }
}

async function saveSettings() {
  savingSettings.value = true
  settingsError.value = ''
  channelWarning.value = ''
  try {
    const res = await $fetch('/api/admin/czone-mail/settings', { method: 'POST', body: settings.value })
    settingsWarning.value = res.warning || ''
    channelWarning.value = res.channelWarning || ''
    showToast('Settings saved.')
  } catch (e) {
    settingsError.value = e?.data?.statusMessage || 'Could not save settings.'
  } finally {
    savingSettings.value = false
  }
}

async function unblock(row) {
  try {
    await $fetch('/api/admin/czone-mail/unblock', { method: 'POST', body: { userId: row.userId } })
    showToast(`Lifted block on ${row.username || 'player'}.`)
    await loadAll()
  } catch (e) {
    error.value = e?.data?.statusMessage || 'Could not lift that block.'
  }
}
</script>
