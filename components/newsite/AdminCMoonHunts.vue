<template>
  <div class="admin-cmoon-hunts bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">cMoon Scavenger Hunts</h1>
      </div>
      <p class="text-gray-500">
        A split-clue cooperative puzzle. Author a hunt as several clues plus one final answer. The moment it's
        posted, every current member of every cMoon is privately DMed exactly one clue — nobody on a team sees
        anyone else's. The team has to share what they each learned in their own Discord channel, then anyone
        submits the combined answer with <code class="font-mono">/hunt</code>. Every cMoon can complete the
        same hunt once, independently — it's not a race between teams.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- Settings -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Settings</h2>
        <p v-if="settingsError" class="text-red-600">{{ settingsError }}</p>
        <p v-if="settingsSaved" class="text-green-700">Saved.</p>
        <div class="w-40">
          <label class="block text-xs font-medium mb-1">Points per team completion</label>
          <input v-model.number="cMoonHuntPoints" type="number" min="0" class="w-full border rounded px-2 py-1" />
        </div>
        <button
          type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="savingSettings" @click="saveSettings"
        >{{ savingSettings ? 'Saving…' : 'Save settings' }}</button>
      </div>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="h in hunts" :key="h.id" class="bg-white rounded border p-3 flex items-start gap-3 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-semibold break-words">{{ h.title }}</span>
              <span v-if="!h.active" class="text-[10px] text-gray-500">(inactive)</span>
              <span v-if="h.postedAt" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">Posted</span>
              <span v-else class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Staged</span>
            </div>
            <div class="text-[11px] text-gray-600">Final answer: <span class="font-mono">{{ h.finalAnswer }}</span></div>
            <div class="text-[11px] text-gray-600">{{ h.clues.length }} clue{{ h.clues.length === 1 ? '' : 's' }}</div>
            <div v-if="h.postedAt" class="text-[11px] text-gray-600">
              Posted {{ formatDate(h.postedAt) }} • {{ h.assignedCount }} clue{{ h.assignedCount === 1 ? '' : 's' }} DMed • {{ h.completedCount }} team{{ h.completedCount === 1 ? '' : 's' }} completed
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button
              v-if="!h.postedAt" type="button" class="text-indigo-600 hover:underline disabled:opacity-40"
              :disabled="postingId === h.id" @click="postNow(h)"
            >{{ postingId === h.id ? 'Sending…' : 'Send to teams now' }}</button>
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(h)">Edit</button>
            <button type="button" class="text-red-600 hover:underline disabled:opacity-40" :disabled="deletingId === h.id" @click="removeHunt(h)">
              {{ deletingId === h.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
        <p v-if="!loading && !hunts.length" class="text-gray-500">No hunts yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ form.id ? 'Edit hunt' : 'New hunt' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Title (admin-facing only, never shown to players)</label>
          <input v-model="form.title" maxlength="200" class="w-full border rounded px-2 py-1" placeholder="Autumn 2026 Hunt" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Final answer</label>
          <input v-model="form.finalAnswer" maxlength="200" class="w-full border rounded px-2 py-1" placeholder="haunted carousel" />
          <p class="text-[11px] text-gray-500 mt-1">Compared case/whitespace-insensitively. This is what a team submits with /hunt after combining everyone's clues.</p>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">
            Clues {{ form.id && posted ? '(locked — this hunt already posted)' : '' }}
          </label>
          <div v-for="(c, i) in form.clues" :key="i" class="flex items-center gap-2 mb-2">
            <span class="text-[11px] text-gray-500 w-10 flex-shrink-0">#{{ i + 1 }}</span>
            <input
              v-model="form.clues[i]" class="flex-1 border rounded px-2 py-1" :disabled="form.id && posted"
              placeholder="Clue text DMed to one team member"
            />
            <button
              v-if="!(form.id && posted)" type="button" class="text-red-600 hover:underline flex-shrink-0"
              :disabled="form.clues.length <= 1" @click="form.clues.splice(i, 1)"
            >Remove</button>
          </div>
          <button
            v-if="!(form.id && posted)" type="button" class="text-indigo-600 hover:underline"
            @click="form.clues.push('')"
          >+ Add clue</button>
        </div>

        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="form.active" />
          <span class="text-xs font-medium">Active{{ !form.id ? ' (creating active sends it to every cMoon immediately)' : '' }}</span>
        </label>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (form.id ? 'Save changes' : 'Create hunt') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const hunts = ref([])
const loading = ref(false)
const loadError = ref('')

const saving = ref(false)
const formError = ref('')
const deletingId = ref('')
const postingId = ref('')
const posted = ref(false)

const cMoonHuntPoints = ref(75)
const savingSettings = ref(false)
const settingsError = ref('')
const settingsSaved = ref(false)

const emptyForm = () => ({ id: '', title: '', finalAnswer: '', clues: [''], active: true })
const form = reactive(emptyForm())

function formatDate(d) {
  if (!d) return ''
  try { return new Date(d).toLocaleString() } catch { return String(d) }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-hunts')
    hunts.value = res?.hunts || []
    cMoonHuntPoints.value = res?.cMoonHuntPoints ?? 75
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load hunts'
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
      body: { cMoonHuntPoints: Math.trunc(Number(cMoonHuntPoints.value)) || 0 },
    })
    settingsSaved.value = true
  } catch (e) {
    settingsError.value = e?.data?.statusMessage || 'Failed to save settings'
  } finally {
    savingSettings.value = false
  }
}

function resetForm() {
  formError.value = ''
  posted.value = false
  Object.assign(form, emptyForm())
}

function startEdit(h) {
  resetForm()
  posted.value = !!h.postedAt
  Object.assign(form, {
    id: h.id, title: h.title, finalAnswer: h.finalAnswer,
    clues: h.clues.map(c => c.text), active: !!h.active,
  })
}

async function save() {
  formError.value = ''
  if (!form.title.trim()) { formError.value = 'Title is required.'; return }
  if (!form.finalAnswer.trim()) { formError.value = 'Final answer is required.'; return }
  const clueTexts = form.clues.map(c => c.trim()).filter(Boolean)
  if (!clueTexts.length) { formError.value = 'At least one clue is required.'; return }

  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/admin/cmoon-hunts/${form.id}`, {
        method: 'PUT',
        body: {
          title: form.title.trim(),
          finalAnswer: form.finalAnswer.trim(),
          active: form.active,
          ...(posted.value ? {} : { clues: clueTexts }),
        },
      })
    } else {
      await $fetch('/api/admin/cmoon-hunts', {
        method: 'POST',
        body: { title: form.title.trim(), finalAnswer: form.finalAnswer.trim(), active: form.active, clues: clueTexts },
      })
    }
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save hunt'
  } finally {
    saving.value = false
  }
}

async function postNow(h) {
  postingId.value = h.id
  try {
    await $fetch(`/api/admin/cmoon-hunts/${h.id}/post`, { method: 'POST' })
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to send the hunt'
  } finally {
    postingId.value = ''
  }
}

async function removeHunt(h) {
  if (!confirm(`Delete "${h.title}"? This can't be undone.`)) return
  deletingId.value = h.id
  try {
    await $fetch(`/api/admin/cmoon-hunts/${h.id}`, { method: 'DELETE' })
    if (form.id === h.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete hunt'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>
