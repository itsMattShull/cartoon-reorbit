<template>
  <div class="admin-cmoon-riddles bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">cMoon Riddles</h1>
      </div>
      <p class="text-gray-500">
        Riddles solved via the Discord <code class="font-mono">/riddle</code> slash command (a private reply, so
        the answer is never spoiled in the channel). <strong>Weekly</strong> riddles broadcast to every cMoon's
        Discord channel on a rotation — the first player anywhere to solve one credits their own cMoon.
        <strong>Boss-Lore</strong> riddles are tied to one raid boss and block that boss from being raided at all
        until solved. Both award the same configurable points (see Manage cMoons → scoring rules) to the
        solver's team.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- Settings: points + weekly rotation schedule -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Settings</h2>
        <p v-if="settingsError" class="text-red-600">{{ settingsError }}</p>
        <p v-if="settingsSaved" class="text-green-700">Saved.</p>

        <div class="w-32">
          <label class="block text-xs font-medium mb-1">Points per solve</label>
          <input v-model.number="settings.cMoonRiddlePoints" type="number" min="0" class="w-full border rounded px-2 py-1" />
        </div>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="settings.cMoonRiddleRotationEnabled" />
          <span class="text-xs font-medium">Auto-post next weekly riddle on a schedule</span>
        </label>

        <div class="flex items-end gap-3 flex-wrap">
          <div>
            <label class="block text-xs font-medium mb-1">Day</label>
            <select v-model.number="settings.cMoonRiddleRotationDayOfWeek" class="border rounded px-2 py-1">
              <option v-for="(d, i) in DAY_NAMES" :key="i" :value="i">{{ d }}</option>
            </select>
          </div>
          <div class="w-20">
            <label class="block text-xs font-medium mb-1">Hour (0-23)</label>
            <input v-model.number="settings.cMoonRiddleRotationHour" type="number" min="0" max="23" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="w-20">
            <label class="block text-xs font-medium mb-1">Minute</label>
            <input v-model.number="settings.cMoonRiddleRotationMinute" type="number" min="0" max="59" class="w-full border rounded px-2 py-1" />
          </div>
        </div>
        <p class="text-[11px] text-gray-500">Times are America/Chicago. Posts the oldest unposted active Weekly riddle and deactivates whichever one was open before it.</p>
        <p v-if="cMoonRiddleLastPostedFor" class="text-[11px] text-gray-500">Last auto-posted for: {{ cMoonRiddleLastPostedFor }}</p>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="savingSettings" @click="saveSettings"
          >{{ savingSettings ? 'Saving…' : 'Save settings' }}</button>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50 disabled:opacity-50"
            :disabled="postingNext" @click="postNextNow"
          >{{ postingNext ? 'Posting…' : 'Post next riddle now' }}</button>
          <p v-if="postNextResult" class="text-[11px]" :class="postNextResult.posted ? 'text-green-700' : 'text-gray-500'">
            {{ postNextResult.posted ? 'Posted.' : 'Nothing unposted to send.' }}
          </p>
        </div>
      </div>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="r in riddles" :key="r.id" class="bg-white rounded border p-3 flex items-start gap-3 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                :class="r.kind === 'WEEKLY' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'"
              >{{ r.kind === 'WEEKLY' ? 'Weekly' : 'Boss-Lore' }}</span>
              <span v-if="!r.active" class="text-[10px] text-gray-500">(inactive)</span>
              <span v-if="r.enemyMemberName" class="text-[11px] text-gray-600">gates: {{ r.enemyMemberName }}</span>
            </div>
            <div class="font-semibold break-words mt-1">{{ r.question }}</div>
            <div class="text-[11px] text-gray-600">Answer: <span class="font-mono">{{ r.answer }}</span></div>
            <div class="text-[11px] mt-1">
              <span v-if="r.solvedAt" class="text-green-700">
                Solved by {{ r.solvedByUsername || 'unknown' }} ({{ r.solvedByCMoonName || 'unknown cMoon' }}) on {{ formatDate(r.solvedAt) }}
              </span>
              <span v-else class="text-gray-500">Unsolved</span>
              <span v-if="r.kind === 'WEEKLY'" class="text-gray-500 ml-2">
                {{ r.postedAt ? `Posted ${formatDate(r.postedAt)}` : 'Not posted yet' }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(r)">Edit</button>
            <button type="button" class="text-red-600 hover:underline disabled:opacity-40" :disabled="deletingId === r.id" @click="removeRiddle(r)">
              {{ deletingId === r.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
        <p v-if="!loading && !riddles.length" class="text-gray-500">No riddles yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ form.id ? 'Edit riddle' : 'New riddle' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Kind</label>
          <select v-model="form.kind" class="w-full border rounded px-2 py-1" :disabled="!!form.id">
            <option value="WEEKLY">Weekly (broadcast to every cMoon)</option>
            <option value="BOSS_LORE">Boss-Lore (gates one raid boss)</option>
          </select>
          <p v-if="form.id" class="text-[11px] text-gray-500 mt-1">Kind can't change after creation — delete and recreate instead.</p>
        </div>

        <div v-if="form.kind === 'BOSS_LORE'">
          <label class="block text-xs font-medium mb-1">Raid boss this gates</label>
          <select v-model="form.enemyMemberId" class="w-full border rounded px-2 py-1" :disabled="!!form.id">
            <option value="">Select a raid boss…</option>
            <option v-for="m in enemyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <p v-if="!enemyMembers.length" class="text-[11px] text-gray-500 mt-1">No raid bosses exist yet — mark a cMoon enemy as a raid boss first.</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Question</label>
          <textarea v-model="form.question" rows="3" maxlength="1000" class="w-full border rounded px-2 py-1" placeholder="What has keys but no locks…"></textarea>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Answer</label>
          <input v-model="form.answer" maxlength="200" class="w-full border rounded px-2 py-1" placeholder="a keyboard" />
          <p class="text-[11px] text-gray-500 mt-1">Compared case/whitespace-insensitively — "A Keyboard" and "a keyboard" both match.</p>
        </div>

        <div v-if="form.kind === 'BOSS_LORE'">
          <label class="block text-xs font-medium mb-1">Lore flavor link (optional)</label>
          <select v-model="form.encyclopediaEntryId" class="w-full border rounded px-2 py-1">
            <option value="">None</option>
            <option v-for="e in encyclopediaEntries" :key="e.id" :value="e.id">{{ e.title }}</option>
          </select>
        </div>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="form.active" />
          <span class="text-xs font-medium">Active</span>
        </label>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (form.id ? 'Save changes' : 'Create riddle') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const riddles = ref([])
const enemyMembers = ref([])
const encyclopediaEntries = ref([])
const loading = ref(false)
const loadError = ref('')

const saving = ref(false)
const formError = ref('')
const deletingId = ref('')

const settings = reactive({
  cMoonRiddlePoints: 50,
  cMoonRiddleRotationEnabled: false,
  cMoonRiddleRotationDayOfWeek: 1,
  cMoonRiddleRotationHour: 9,
  cMoonRiddleRotationMinute: 0,
})
const cMoonRiddleLastPostedFor = ref('')
const savingSettings = ref(false)
const settingsError = ref('')
const settingsSaved = ref(false)
const postingNext = ref(false)
const postNextResult = ref(null)

const emptyForm = () => ({ id: '', kind: 'WEEKLY', question: '', answer: '', enemyMemberId: '', encyclopediaEntryId: '', active: true })
const form = reactive(emptyForm())

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleString() } catch { return String(d) }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-riddles')
    riddles.value = res?.riddles || []
    enemyMembers.value = res?.enemyMembers || []
    encyclopediaEntries.value = res?.encyclopediaEntries || []
    settings.cMoonRiddlePoints = res?.cMoonRiddlePoints ?? 50
    settings.cMoonRiddleRotationEnabled = !!res?.cMoonRiddleRotationEnabled
    settings.cMoonRiddleRotationDayOfWeek = res?.cMoonRiddleRotationDayOfWeek ?? 1
    settings.cMoonRiddleRotationHour = res?.cMoonRiddleRotationHour ?? 9
    settings.cMoonRiddleRotationMinute = res?.cMoonRiddleRotationMinute ?? 0
    cMoonRiddleLastPostedFor.value = res?.cMoonRiddleLastPostedFor || ''
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load riddles'
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  settingsError.value = ''
  settingsSaved.value = false
  savingSettings.value = true
  try {
    await $fetch('/api/admin/cmoon-settings', {
      method: 'POST',
      body: {
        cMoonRiddlePoints: Math.trunc(Number(settings.cMoonRiddlePoints)) || 0,
        cMoonRiddleRotationEnabled: settings.cMoonRiddleRotationEnabled,
        cMoonRiddleRotationDayOfWeek: Math.trunc(Number(settings.cMoonRiddleRotationDayOfWeek)) || 0,
        cMoonRiddleRotationHour: Math.trunc(Number(settings.cMoonRiddleRotationHour)) || 0,
        cMoonRiddleRotationMinute: Math.trunc(Number(settings.cMoonRiddleRotationMinute)) || 0,
      },
    })
    settingsSaved.value = true
  } catch (e) {
    settingsError.value = e?.data?.statusMessage || 'Failed to save settings'
  } finally {
    savingSettings.value = false
  }
}

async function postNextNow() {
  postingNext.value = true
  postNextResult.value = null
  try {
    postNextResult.value = await $fetch('/api/admin/cmoon-riddles/post-next', { method: 'POST' })
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to post the next riddle'
  } finally {
    postingNext.value = false
  }
}

function resetForm() {
  formError.value = ''
  Object.assign(form, emptyForm())
}

function startEdit(r) {
  resetForm()
  Object.assign(form, {
    id: r.id, kind: r.kind, question: r.question, answer: r.answer,
    enemyMemberId: r.enemyMemberId || '', encyclopediaEntryId: r.encyclopediaEntryId || '',
    active: !!r.active,
  })
}

async function save() {
  formError.value = ''
  if (!form.question.trim()) { formError.value = 'Question is required.'; return }
  if (!form.answer.trim()) { formError.value = 'Answer is required.'; return }
  if (form.kind === 'BOSS_LORE' && !form.enemyMemberId) { formError.value = 'Select a raid boss for a boss-lore riddle.'; return }

  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/admin/cmoon-riddles/${form.id}`, {
        method: 'PUT',
        body: {
          question: form.question.trim(),
          answer: form.answer.trim(),
          encyclopediaEntryId: form.encyclopediaEntryId || null,
          active: form.active,
        },
      })
    } else {
      await $fetch('/api/admin/cmoon-riddles', {
        method: 'POST',
        body: {
          kind: form.kind,
          question: form.question.trim(),
          answer: form.answer.trim(),
          enemyMemberId: form.kind === 'BOSS_LORE' ? form.enemyMemberId : null,
          encyclopediaEntryId: form.kind === 'BOSS_LORE' ? (form.encyclopediaEntryId || null) : null,
          active: form.active,
        },
      })
    }
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save riddle'
  } finally {
    saving.value = false
  }
}

async function removeRiddle(r) {
  if (!confirm(`Delete this ${r.kind === 'WEEKLY' ? 'weekly' : 'boss-lore'} riddle? This can't be undone.`)) return
  deletingId.value = r.id
  try {
    await $fetch(`/api/admin/cmoon-riddles/${r.id}`, { method: 'DELETE' })
    if (form.id === r.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete riddle'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>
