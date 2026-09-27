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
        header, live team leaderboard, progress trackers, and a text blurb.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- Season header + start-new-season -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">Season</h2>

        <div>
          <label class="block text-xs font-medium mb-1">Header ({{ header.length }}/80)</label>
          <input v-model="header" maxlength="80" class="w-full border rounded px-2 py-1" placeholder="e.g. cMoons Season 1" />
          <p class="text-[11px] text-gray-500 mt-1">Saved together with the blurb below via "Save Season Settings."</p>
        </div>

        <div class="border-t pt-3">
          <p class="text-gray-600">
            Season started <span class="font-medium">{{ formatDate(startedAt) }}</span>.
            Every tracker below only counts what's happened since then.
          </p>
          <button
            type="button" class="mt-2 px-3 py-1.5 text-xs font-semibold rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
            :disabled="startingNew" @click="startNewSeason"
          >{{ startingNew ? 'Starting…' : 'Start New Season' }}</button>
          <p class="text-[11px] text-gray-500 mt-1">
            Resets every tracker's progress to zero going forward. Past battles and points are
            never deleted — just no longer counted toward the current season.
          </p>
        </div>
      </div>

      <!-- Trackers -->
      <div class="space-y-2">
        <h2 class="font-semibold text-sm px-1">Progress Trackers</h2>
        <div v-for="t in trackers" :key="t.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words">{{ t.label }}<span v-if="!t.active" class="ml-2 text-[10px] font-normal text-gray-500">(inactive)</span></div>
            <div class="text-[11px] text-gray-600">{{ metricLabel(t.metricType) }} · target {{ t.targetValue }}</div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEditTracker(t)">Edit</button>
            <button type="button" class="text-red-600 hover:underline disabled:opacity-40" :disabled="deletingId === t.id" @click="removeTracker(t)">
              {{ deletingId === t.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
        <p v-if="!loading && !trackers.length" class="text-gray-500 px-1">No trackers yet — the seasonal section shows just the header, leaderboard, and blurb until you add one.</p>
      </div>

      <div class="bg-white border rounded p-3 space-y-3">
        <h3 class="font-semibold text-sm">{{ trackerForm.id ? 'Edit tracker' : 'New tracker' }}</h3>
        <p v-if="trackerFormError" class="text-red-600">{{ trackerFormError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Label</label>
          <input v-model="trackerForm.label" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. NPC Victories" />
        </div>

        <div class="flex gap-2">
          <div class="flex-1 min-w-0">
            <label class="block text-xs font-medium mb-1">Metric</label>
            <select v-model="trackerForm.metricType" class="w-full border rounded px-2 py-1">
              <option v-for="m in METRIC_OPTIONS" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </div>
          <div class="w-32 flex-shrink-0">
            <label class="block text-xs font-medium mb-1">Target</label>
            <input v-model.number="trackerForm.targetValue" type="number" min="0" step="any" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <div class="flex gap-2">
          <div class="w-24 flex-shrink-0">
            <label class="block text-xs font-medium mb-1">Order</label>
            <input v-model.number="trackerForm.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="flex items-end pb-1.5">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="trackerForm.active" />
              <span class="text-xs font-medium">Active</span>
            </label>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="trackerSaving" @click="saveTracker"
          >{{ trackerSaving ? 'Saving…' : (trackerForm.id ? 'Save changes' : 'Create tracker') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetTrackerForm">Cancel</button>
        </div>
      </div>

      <!-- Blurb -->
      <ClientOnly>
        <div class="bg-white border rounded p-3 space-y-2">
          <h2 class="font-semibold text-sm">Blurb</h2>
          <p class="text-gray-500">Shown beneath the trackers, styled like the Tutorial page's prose.</p>
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
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="blurbSaving" @click="saveBlurb"
          >{{ blurbSaving ? 'Saving…' : 'Save Season Settings' }}</button>
          <span v-if="blurbError" class="text-red-600 ml-2">{{ blurbError }}</span>
        </div>
        <template #fallback>
          <div class="bg-white border rounded p-3 space-y-2">
            <h2 class="font-semibold text-sm">Blurb</h2>
            <div class="border rounded p-2 min-h-[100px] text-gray-400">Loading editor…</div>
          </div>
        </template>
      </ClientOnly>
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
function metricLabel(v) { return METRIC_OPTIONS.find(m => m.value === v)?.label || v }

const loading = ref(false)
const loadError = ref('')

const header = ref('')
const startedAt = ref(null)
const startingNew = ref(false)

const trackers = ref([])
const deletingId = ref('')
const trackerSaving = ref(false)
const trackerFormError = ref('')
const emptyTrackerForm = () => ({ id: '', label: '', metricType: 'BATTLE_WINS', targetValue: 100, active: true, sortOrder: 0 })
const trackerForm = reactive(emptyTrackerForm())

const blurbSaving = ref(false)
const blurbError = ref('')
const blurbEditor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
    Link.configure({ openOnClick: false, autolink: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  ],
})

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
    const res = await $fetch('/api/admin/cmoon-season')
    header.value = res.header || ''
    startedAt.value = res.startedAt
    trackers.value = res.trackers || []
    blurbEditor.value?.commands.setContent(res.blurb || '', false)
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load navigation settings'
  } finally {
    loading.value = false
  }
}

async function startNewSeason() {
  if (!confirm('Start a new season? Every tracker resets to zero progress going forward. Past battles and points are not deleted.')) return
  startingNew.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-season/start-new', { method: 'POST' })
    startedAt.value = res.startedAt
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to start a new season'
  } finally {
    startingNew.value = false
  }
}

function resetTrackerForm() {
  trackerFormError.value = ''
  Object.assign(trackerForm, emptyTrackerForm())
}

function startEditTracker(t) {
  resetTrackerForm()
  Object.assign(trackerForm, { id: t.id, label: t.label, metricType: t.metricType, targetValue: t.targetValue, active: !!t.active, sortOrder: t.sortOrder })
}

async function saveTracker() {
  trackerFormError.value = ''
  if (!trackerForm.label.trim()) { trackerFormError.value = 'Label is required.'; return }
  const targetValue = Number(trackerForm.targetValue)
  if (!Number.isFinite(targetValue) || targetValue <= 0) { trackerFormError.value = 'Target must be a positive number.'; return }

  trackerSaving.value = true
  try {
    const body = {
      label: trackerForm.label.trim(),
      metricType: trackerForm.metricType,
      targetValue,
      active: trackerForm.active,
      sortOrder: Math.trunc(Number(trackerForm.sortOrder)) || 0,
    }
    if (trackerForm.id) {
      await $fetch(`/api/admin/cmoon-season-trackers/${trackerForm.id}`, { method: 'PUT', body })
    } else {
      await $fetch('/api/admin/cmoon-season-trackers', { method: 'POST', body })
    }
    resetTrackerForm()
    await load()
  } catch (e) {
    trackerFormError.value = e?.data?.statusMessage || 'Failed to save tracker'
  } finally {
    trackerSaving.value = false
  }
}

async function removeTracker(t) {
  if (!confirm(`Delete "${t.label}"? This can't be undone.`)) return
  deletingId.value = t.id
  try {
    await $fetch(`/api/admin/cmoon-season-trackers/${t.id}`, { method: 'DELETE' })
    if (trackerForm.id === t.id) resetTrackerForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete tracker'
  } finally {
    deletingId.value = ''
  }
}

async function saveBlurb() {
  blurbError.value = ''
  blurbSaving.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-season', {
      method: 'POST',
      body: { header: header.value.trim(), blurb: blurbEditor.value?.getHTML() || '' },
    })
    blurbEditor.value?.commands.setContent(res.blurb || '', false)
  } catch (e) {
    blurbError.value = e?.data?.statusMessage || 'Failed to save blurb'
  } finally {
    blurbSaving.value = false
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
