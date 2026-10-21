<template>
  <div class="admin-manage-navigation bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage Navigation</h1>
        <NuxtLink to="/newsite/cmoon-nav" target="_blank" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">
          View cMoon nav page ↗
        </NuxtLink>
      </div>
      <p class="text-gray-500">
        Controls the seasonal-updates section on the bottom half of the cMoon navigation page:
        each season has its own start/end date, header, live team leaderboard + win/loss recap,
        progress trackers, and a text blurb. Seasons can be scheduled ahead of time — the nav page
        shows a countdown to whichever one is next.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- Seasons list -->
      <div class="bg-white border rounded p-3 space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-sm">Seasons</h2>
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            @click="openAddForm"
          >+ Add Season</button>
        </div>

        <div v-if="loading" class="text-gray-500 py-4 text-center">Loading…</div>
        <template v-else>
          <div v-for="s in seasons" :key="s.id" class="border rounded p-2 flex items-center gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="font-semibold break-words">
                Season {{ s.seasonNumber }}<span v-if="s.header"> — {{ s.header }}</span>
                <span
                  class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
                  :class="statusClass(s)"
                >{{ statusLabel(s) }}</span>
              </div>
              <div class="text-[11px] text-gray-600">{{ formatDate(s.startAt) }} – {{ formatDate(s.endAt) }}</div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <button
                v-if="isFuture(s)" type="button" class="text-indigo-600 hover:underline"
                @click="openEditForm(s)"
              >Edit</button>
              <button
                v-if="isFuture(s)" type="button" class="text-red-600 hover:underline disabled:opacity-40"
                :disabled="deletingId === s.id" @click="removeSeason(s)"
              >{{ deletingId === s.id ? 'Deleting…' : 'Delete' }}</button>
            </div>
          </div>
          <p v-if="!seasons.length" class="text-gray-500 px-1">No seasons yet — click "+ Add Season" to create one.</p>
        </template>
      </div>

      <!-- Add/Edit season form -->
      <div v-if="formOpen" class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ editingId ? 'Edit Season' : 'Add Season' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div class="flex gap-2 flex-wrap">
          <div class="flex-1 min-w-[160px]">
            <label class="block text-xs font-medium mb-1">Start date</label>
            <input v-model="form.startAt" type="datetime-local" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="flex-1 min-w-[160px]">
            <label class="block text-xs font-medium mb-1">End date</label>
            <input v-model="form.endAt" type="datetime-local" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Header ({{ form.header.length }}/80)</label>
          <input v-model="form.header" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="e.g. cMoons Season 1" />
        </div>

        <div class="border-t pt-3 space-y-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.enemiesGoalEnabled" />
            <span class="text-xs font-medium">Show a combined "enemies defeated" progress bar</span>
          </label>
          <p class="text-[11px] text-gray-500">
            One shared bar for the whole playerbase — every enemy defeated during this season,
            regular enemies and raid bosses alike.
          </p>
          <div v-if="form.enemiesGoalEnabled" class="flex gap-2 flex-wrap">
            <div class="flex-1 min-w-[160px]">
              <label class="block text-xs font-medium mb-1">Bar label ({{ form.enemiesGoalLabel.length }}/60)</label>
              <input v-model="form.enemiesGoalLabel" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Enemies Defeated" />
            </div>
            <div class="w-32 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Target</label>
              <input v-model.number="form.enemiesGoalTarget" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
            </div>
          </div>
        </div>

        <!-- Trackers (local list, saved together with the season) -->
        <div class="border-t pt-3 space-y-2">
          <h3 class="font-semibold text-sm">Progress Trackers</h3>
          <div v-for="(t, idx) in form.trackers" :key="idx" class="border rounded p-2 flex gap-2 flex-wrap items-end">
            <div class="flex-1 min-w-[140px]">
              <label class="block text-xs font-medium mb-1">Label</label>
              <input v-model="t.label" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. NPC Victories" />
            </div>
            <div class="flex-1 min-w-[140px]">
              <label class="block text-xs font-medium mb-1">Metric</label>
              <select v-model="t.metricType" class="w-full border rounded px-2 py-1">
                <option v-for="m in METRIC_OPTIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </div>
            <div class="w-28 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Target</label>
              <input v-model.number="t.targetValue" type="number" min="0" step="any" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="w-20 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="t.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
            </div>
            <label class="flex items-center gap-1.5 pb-1.5">
              <input type="checkbox" v-model="t.active" />
              <span class="text-xs font-medium">Active</span>
            </label>
            <button type="button" class="text-red-600 hover:underline pb-1.5" @click="form.trackers.splice(idx, 1)">Remove</button>
          </div>
          <button type="button" class="text-indigo-600 hover:underline" @click="addTrackerRow">+ Add tracker</button>
        </div>

        <!-- Blurb -->
        <div class="border-t pt-3 space-y-2">
          <h3 class="font-semibold text-sm">Blurb</h3>
          <p class="text-gray-500">Shown beneath the trackers, styled like the Tutorial page's prose.</p>
          <ClientOnly>
            <div v-if="blurbEditor" class="border rounded">
              <div class="flex flex-wrap gap-1 border-b bg-gray-50 p-1">
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': blurbEditor.isActive('bold') }" @click="blurbEditor.chain().focus().toggleBold().run()"><b>B</b></button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': blurbEditor.isActive('italic') }" @click="blurbEditor.chain().focus().toggleItalic().run()"><i>I</i></button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': blurbEditor.isActive('heading', { level: 2 }) }" @click="blurbEditor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': blurbEditor.isActive('bulletList') }" @click="blurbEditor.chain().focus().toggleBulletList().run()">• List</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="setBlurbLink">Link</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="blurbEditor.chain().focus().unsetLink().run()">Unlink</button>
              </div>
              <EditorContent :editor="blurbEditor" class="tiptap-body p-2 min-h-[100px]" />
            </div>
            <template #fallback>
              <div class="border rounded p-2 min-h-[100px] text-gray-400">Loading editor…</div>
            </template>
          </ClientOnly>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="saveSeason"
          >{{ saving ? 'Saving…' : (editingId ? 'Save changes' : 'Create season') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="closeForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

const METRIC_OPTIONS = [
  { value: 'BATTLE_WINS', label: 'NPC Battle Wins' },
  { value: 'BATTLE_LOSSES', label: 'NPC Battle Losses' },
  { value: 'TEAM_SCORE', label: 'Team Score (points)' },
  { value: 'AVG_POINTS', label: 'Average Points per Member' },
]

const loading = ref(false)
const loadError = ref('')
const seasons = ref([])
const deletingId = ref('')

const formOpen = ref(false)
const editingId = ref('')
const saving = ref(false)
const formError = ref('')

function emptyForm() {
  return {
    startAt: '', endAt: '', header: '',
    enemiesGoalEnabled: false, enemiesGoalLabel: 'Enemies Defeated', enemiesGoalTarget: 1000,
    trackers: [],
  }
}
const form = reactive(emptyForm())

const blurbEditor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
    Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  ],
})

function toLocalInput(d) {
  if (!d) return ''
  const dt = new Date(d)
  const pad = n => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isFuture(s) { return new Date(s.startAt).getTime() > Date.now() }
function isPast(s) { return new Date(s.endAt).getTime() <= Date.now() }
function statusLabel(s) {
  if (isFuture(s)) return 'Future'
  if (isPast(s)) return 'Past'
  return 'Current'
}
function statusClass(s) {
  if (isFuture(s)) return 'bg-blue-100 text-blue-700'
  if (isPast(s)) return 'bg-gray-100 text-gray-600'
  return 'bg-green-100 text-green-700'
}

function addTrackerRow() {
  form.trackers.push({ label: '', metricType: 'BATTLE_WINS', targetValue: 100, active: true, sortOrder: form.trackers.length })
}

function setBlurbLink() {
  const previous = blurbEditor.value?.getAttributes('link').href
  const url = window.prompt('Link URL (https://…)', previous || 'https://')
  if (url === null) return
  if (url === '') {
    blurbEditor.value.chain().focus().unsetLink().run()
    return
  }
  blurbEditor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-seasons')
    seasons.value = res.items || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load seasons'
  } finally {
    loading.value = false
  }
}

function openAddForm() {
  editingId.value = ''
  formError.value = ''
  Object.assign(form, emptyForm())
  // Default the very first season's start date to whenever cMoons first launched — nothing to
  // default to for a later season, left blank for the admin to pick.
  if (!seasons.value.length) {
    $fetch('/api/admin/cmoons').then(res => {
      if (res?.cMoonEnabledAt) form.startAt = toLocalInput(res.cMoonEnabledAt)
    }).catch(() => {})
  }
  blurbEditor.value?.commands.setContent('', false)
  formOpen.value = true
}

function openEditForm(s) {
  editingId.value = s.id
  formError.value = ''
  Object.assign(form, {
    startAt: toLocalInput(s.startAt),
    endAt: toLocalInput(s.endAt),
    header: s.header || '',
    enemiesGoalEnabled: !!s.enemiesDefeatedGoalEnabled,
    enemiesGoalLabel: s.enemiesDefeatedGoalLabel || 'Enemies Defeated',
    enemiesGoalTarget: s.enemiesDefeatedGoalTarget || 1000,
    trackers: (s.trackers || []).map(t => ({ label: t.label, metricType: t.metricType, targetValue: t.targetValue, active: !!t.active, sortOrder: t.sortOrder })),
  })
  blurbEditor.value?.commands.setContent(s.blurb || '', false)
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  editingId.value = ''
  formError.value = ''
}

async function saveSeason() {
  formError.value = ''
  if (!form.startAt || !form.endAt) { formError.value = 'Start and end date are both required.'; return }
  const startAt = new Date(form.startAt)
  const endAt = new Date(form.endAt)
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) { formError.value = 'Invalid date.'; return }
  if (startAt >= endAt) { formError.value = 'Start date must be before end date.'; return }
  if (!form.header.trim()) { formError.value = 'Header is required.'; return }

  for (const t of form.trackers) {
    if (!t.label.trim()) { formError.value = 'Every tracker needs a label.'; return }
    if (!Number.isFinite(Number(t.targetValue)) || Number(t.targetValue) <= 0) { formError.value = `Tracker "${t.label}" needs a positive target.`; return }
  }

  saving.value = true
  try {
    const body = {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      header: form.header.trim(),
      blurb: blurbEditor.value?.getHTML() || '',
      enemiesDefeatedGoalEnabled: form.enemiesGoalEnabled,
      enemiesDefeatedGoalLabel: form.enemiesGoalLabel.trim(),
      enemiesDefeatedGoalTarget: Math.trunc(Number(form.enemiesGoalTarget)) || 0,
      trackers: form.trackers.map(t => ({
        label: t.label.trim(), metricType: t.metricType,
        targetValue: Number(t.targetValue), active: !!t.active,
        sortOrder: Math.trunc(Number(t.sortOrder)) || 0,
      })),
    }
    if (editingId.value) {
      await $fetch(`/api/admin/cmoon-seasons/${editingId.value}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/cmoon-seasons', { method: 'POST', body })
    }
    closeForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save season'
  } finally {
    saving.value = false
  }
}

async function removeSeason(s) {
  if (!confirm(`Delete Season ${s.seasonNumber}? This can't be undone.`)) return
  deletingId.value = s.id
  try {
    await $fetch(`/api/admin/cmoon-seasons/${s.id}`, { method: 'DELETE' })
    if (editingId.value === s.id) closeForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete season'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
onBeforeUnmount(() => { blurbEditor.value?.destroy() })
</script>

<style scoped>
.tiptap-body :deep(.ProseMirror) { outline: none; min-height: 90px; }
.tiptap-body :deep(p) { margin: 0 0 0.5em; }
.tiptap-body :deep(ul), .tiptap-body :deep(ol) { padding-left: 1.25em; margin: 0 0 0.5em; }
</style>
