<template>
  <div class="admin-cmoon bg-gray-50 p-3 text-sm">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h1 class="text-base font-bold">cMoons</h1>
    </div>

    <!-- Feature flag -->
    <div class="bg-white rounded border p-3 mb-4">
      <label class="flex items-center gap-2">
        <input type="checkbox" v-model="flagEnabled" :disabled="flagSaving" @change="toggleFlag" />
        <span class="font-medium">cMoons enabled</span>
      </label>
      <p class="text-xs text-gray-500 mt-1">
        Off by default. Turning this on starts a 3-day window for existing players to pick a
        cMoon before they're auto-assigned to whichever has the fewest members; new players
        always get 3 days from when they join.
      </p>
      <p v-if="cMoonEnabledAt" class="text-xs text-gray-500 mt-1">
        Launched {{ formatDate(cMoonEnabledAt) }} · existing-player deadline {{ formatDate(cMoonSelectionDeadlineAt) }}
      </p>
    </div>

    <div v-if="loading" class="text-gray-500">Loading…</div>
    <template v-else>
      <!-- Existing cMoons -->
      <div class="space-y-3 mb-4">
        <div v-for="c in cmoons" :key="c.id" class="bg-white rounded border p-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="inline-block w-4 h-4 rounded-full border" :style="{ background: c.color }"></span>
            <span class="font-semibold">{{ c.name }}</span>
            <span class="text-xs text-gray-500">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
            <button class="ml-auto text-xs text-indigo-600 hover:underline" @click="startEdit(c)">Edit</button>
            <button
              class="text-xs text-red-600 hover:underline disabled:opacity-40"
              :disabled="c.memberCount > 0"
              :title="c.memberCount > 0 ? 'Reassign members before deleting' : ''"
              @click="remove(c)"
            >Delete</button>
          </div>
          <div class="text-xs text-gray-500">
            Captains: {{ c.captains.map(cap => cap.username).join(', ') || 'none' }}
          </div>
          <div class="text-xs text-gray-500">
            Prize cToons: {{ c.prizeCtoons.map(p => `${p.name} ×${p.quantity}`).join(', ') || 'none' }}
          </div>
          <div class="text-xs text-gray-500">Discord role ID: {{ c.discordRoleId || 'none' }}</div>
        </div>
        <div v-if="!cmoons.length" class="text-gray-500">No cMoons yet — create one below.</div>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white rounded border p-3">
        <h2 class="font-semibold mb-2">{{ editId ? 'Edit cMoon' : 'Create cMoon' }}</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="form.name" class="w-full border rounded px-2 py-1" style="font-size:16px" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Color (text color)</label>
            <div class="flex items-center gap-2">
              <input v-model="form.color" class="w-full border rounded px-2 py-1" style="font-size:16px" placeholder="#3366ff" />
              <span class="inline-block w-6 h-6 rounded-full border flex-shrink-0" :style="{ background: safeColor(form.color) }"></span>
            </div>
            <p v-if="form.color && !isValidColor(form.color)" class="text-xs text-red-600 mt-1">Must be a hex color like #3366ff</p>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Discord Role ID (optional)</label>
            <input v-model="form.discordRoleId" class="w-full border rounded px-2 py-1" style="font-size:16px" placeholder="123456789012345678" />
          </div>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">Captains (from admins)</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="a in admins" :key="a.id"
              type="button"
              class="px-2 py-1 rounded-full border text-xs"
              :class="form.captainIds.includes(a.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
              @click="toggleCaptain(a.id)"
            >{{ a.username || a.id }}</button>
          </div>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">Prize cToons (granted when a user joins)</label>
          <div class="flex gap-2 items-center">
            <datalist id="cmoon-ctoon-list">
              <option v-for="c in filteredCtoons(prizeCtoonSearch)" :key="c.id" :value="c.name" />
            </datalist>
            <input v-model="prizeCtoonSearch" list="cmoon-ctoon-list" class="border rounded px-2 py-1 flex-1" style="font-size:16px" placeholder="Type 3+ characters" />
            <input v-model.number="prizeCtoonQty" type="number" min="1" class="w-20 border rounded px-2 py-1" style="font-size:16px" />
            <button type="button" class="px-3 py-1 border rounded" @click="addPrizeCtoon">Add</button>
          </div>
          <div v-if="form.prizeCtoons.length" class="mt-2 space-y-1">
            <div v-for="(p, i) in form.prizeCtoons" :key="p.ctoonId" class="flex items-center gap-2 text-xs">
              <span>{{ nameForCtoon(p.ctoonId) }} × {{ p.quantity }}</span>
              <button type="button" class="text-red-600" @click="form.prizeCtoons.splice(i, 1)">Remove</button>
            </div>
          </div>
        </div>

        <div v-if="formError" class="text-xs text-red-600 mt-2">{{ formError }}</div>

        <div class="mt-3 flex gap-2">
          <button class="px-3 py-1.5 bg-indigo-600 text-white rounded" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create cMoon') }}
          </button>
          <button v-if="editId" type="button" class="px-3 py-1.5 border rounded" @click="resetForm">Cancel</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
const loading = ref(false)
const saving = ref(false)
const formError = ref('')
const cmoons = ref([])
const admins = ref([])
const ctoons = ref([])
const flagEnabled = ref(false)
const flagSaving = ref(false)
const cMoonEnabledAt = ref(null)
const cMoonSelectionDeadlineAt = ref(null)

const editId = ref('')
const emptyForm = () => ({ name: '', color: '', discordRoleId: '', captainIds: [], prizeCtoons: [] })
const form = reactive(emptyForm())
const prizeCtoonSearch = ref('')
const prizeCtoonQty = ref(1)

function isValidColor(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') }
function safeColor(c) { return isValidColor(c) ? c : '#cccccc' }

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(dt)
}

function filteredCtoons(input) {
  const v = String(input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return ctoons.value.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
}

function nameForCtoon(id) {
  return ctoons.value.find(c => c.id === id)?.name || id
}

function toggleCaptain(id) {
  const i = form.captainIds.indexOf(id)
  if (i >= 0) form.captainIds.splice(i, 1)
  else form.captainIds.push(id)
}

function addPrizeCtoon() {
  const match = ctoons.value.find(c => c.name === prizeCtoonSearch.value)
  if (!match) {
    formError.value = 'Select a valid cToon from suggestions.'
    return
  }
  formError.value = ''
  if (form.prizeCtoons.find(p => p.ctoonId === match.id)) return
  form.prizeCtoons.push({ ctoonId: match.id, quantity: Math.max(1, Number(prizeCtoonQty.value || 1)) })
  prizeCtoonSearch.value = ''
  prizeCtoonQty.value = 1
}

function startEdit(c) {
  editId.value = c.id
  Object.assign(form, {
    name: c.name,
    color: c.color,
    discordRoleId: c.discordRoleId || '',
    captainIds: c.captains.map(cap => cap.userId),
    prizeCtoons: c.prizeCtoons.map(p => ({ ctoonId: p.ctoonId, quantity: p.quantity })),
  })
  formError.value = ''
}

function resetForm() {
  Object.assign(form, emptyForm())
  editId.value = ''
  formError.value = ''
}

async function load() {
  loading.value = true
  try {
    const [data, adminsData, ctoonsData] = await Promise.all([
      $fetch('/api/admin/cmoons'),
      $fetch('/api/admin/cmoon-admins'),
      $fetch('/api/admin/list-ctoons'),
    ])
    cmoons.value = data.cmoons || []
    flagEnabled.value = !!data.cMoonEnabled
    cMoonEnabledAt.value = data.cMoonEnabledAt
    cMoonSelectionDeadlineAt.value = data.cMoonSelectionDeadlineAt
    admins.value = adminsData || []
    ctoons.value = ctoonsData || []
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to load cMoons'
  } finally {
    loading.value = false
  }
}

async function toggleFlag() {
  flagSaving.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-settings', { method: 'POST', body: { cMoonEnabled: flagEnabled.value } })
    cMoonEnabledAt.value = res.cMoonEnabledAt
    cMoonSelectionDeadlineAt.value = res.cMoonSelectionDeadlineAt
  } catch (e) {
    flagEnabled.value = !flagEnabled.value
    alert(e?.data?.statusMessage || 'Failed to update flag')
  } finally {
    flagSaving.value = false
  }
}

async function save() {
  if (!form.name.trim()) { formError.value = 'Name is required'; return }
  if (!isValidColor(form.color)) { formError.value = 'Color must be a hex value like #3366ff'; return }
  formError.value = ''
  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      color: form.color,
      discordRoleId: form.discordRoleId.trim(),
      captainIds: form.captainIds,
      prizeCtoons: form.prizeCtoons,
    }
    if (!editId.value) {
      await $fetch('/api/admin/cmoons', { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/cmoons/${editId.value}`, { method: 'PUT', body })
    }
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    saving.value = false
  }
}

async function remove(c) {
  if (c.memberCount > 0) return
  if (!confirm(`Delete cMoon "${c.name}"?`)) return
  try {
    await $fetch(`/api/admin/cmoons/${c.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
}

onMounted(load)
</script>
