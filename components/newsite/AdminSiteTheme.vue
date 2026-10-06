<template>
  <div class="admin-site-theme bg-gray-50 text-xs" style="color-scheme: light;">
    <div class="px-2 py-2 space-y-4">
      <h1 class="text-base font-semibold">Manage Site Theme</h1>
      <p class="text-gray-600">
        Recolor the site's chrome — topbar, sidebar, footer, and shared buttons — without changing
        any layout. Create named color schemes below, then apply one once the default theme is off.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- Default toggle -->
      <div class="bg-white border rounded p-3 space-y-2">
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox" class="mt-0.5" :checked="useDefaultSiteTheme" :disabled="togglingDefault"
            @change="setUseDefault($event.target.checked)"
          />
          <span>
            <span class="font-semibold">Use default theme</span>
            <span class="block text-gray-600">
              On: the site always shows its normal blue colors, regardless of any saved themes below.
              Off: the activated theme below applies site-wide instead.
            </span>
          </span>
        </label>
        <p v-if="!useDefaultSiteTheme" class="text-indigo-700">
          Custom theme active: <span class="font-semibold">{{ activeThemeName || 'none selected' }}</span>
        </p>
      </div>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="t in themes" :key="t.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="flex-shrink-0 rounded overflow-hidden border w-16 h-12" :style="{ background: t.bgColor }">
            <div class="h-1/2" :style="{ background: t.orbitDarkBlue }"></div>
            <div class="h-1/2 flex items-center justify-center gap-1 px-1" :style="{ background: t.orbitLightBlue }">
              <span class="w-2 h-2 rounded-full" :style="{ background: t.orbitGreen }"></span>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words flex items-center gap-2">
              {{ t.name }}
              <span v-if="!useDefaultSiteTheme && t.id === activeSiteThemeId" class="text-[10px] font-semibold text-white bg-indigo-600 rounded px-1.5 py-0.5">ACTIVE</span>
            </div>
            <div class="text-[11px] text-gray-600 break-words">
              {{ t.orbitDarkBlue }} · {{ t.orbitLightBlue }} · {{ t.orbitGreen }} · bg {{ t.bgColor }} · text {{ t.textColor }}
            </div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button
              type="button" class="text-indigo-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="activating === t.id || (t.id === activeSiteThemeId && !useDefaultSiteTheme)"
              @click="activate(t)"
            >{{ activating === t.id ? 'Applying…' : 'Apply' }}</button>
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(t)">Edit</button>
            <button
              type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="t.id === activeSiteThemeId || deletingId === t.id"
              :title="t.id === activeSiteThemeId ? 'Switch to another theme first' : ''"
              @click="remove(t)"
            >{{ deletingId === t.id ? 'Deleting…' : 'Delete' }}</button>
          </div>
        </div>
        <p v-if="!loading && !themes.length" class="text-gray-500">No saved themes yet — create one below.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ editId ? 'Edit theme' : 'New theme' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Name</label>
          <input v-model="form.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Halloween" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="field in COLOR_FIELDS" :key="field.key">
            <label class="block text-xs font-medium mb-1">{{ field.label }}</label>
            <div class="flex items-center gap-2">
              <input
                v-model="form[field.key]" class="w-full min-w-0 border rounded px-2 py-1" placeholder="#336699"
                autocapitalize="none" autocorrect="off" spellcheck="false"
              />
              <input v-model="colorPickers[field.key]" type="color" class="w-11 h-11 flex-shrink-0 border rounded p-0.5" :aria-label="`Pick ${field.label}`" />
            </div>
            <p v-if="form[field.key] && !isSafeCMoonColor(form[field.key])" class="text-[11px] text-red-600 mt-1">Must be a hex color like #336699</p>
          </div>
        </div>

        <!-- Live preview -->
        <div>
          <label class="block text-xs font-medium mb-1">Live preview</label>
          <div class="ast-preview rounded border overflow-hidden" :style="{ background: previewColor('bgColor') }">
            <div class="ast-topbar" :style="{ background: previewColor('orbitDarkBlue') }">
              <span :style="{ color: previewColor('textColor') }" class="font-semibold text-[11px]">Cartoon ReOrbit</span>
            </div>
            <div class="ast-nav" :style="{ background: previewColor('orbitLightBlue') }">
              <span :style="{ color: previewColor('textColor') }" class="text-[10px]">Home · cMart · Trades</span>
            </div>
            <div class="ast-body">
              <button type="button" class="ast-btn" :style="{ background: previewColor('orbitDarkBlue'), color: previewColor('textColor'), borderColor: previewColor('orbitDarkBlue') }">Blue Button</button>
              <button type="button" class="ast-btn" :style="{ background: previewColor('orbitGreen'), color: previewColor('textColor'), borderColor: previewColor('orbitGreen') }">Green Button</button>
              <span class="text-[11px]" :style="{ color: previewColor('textColor') }">Body text sample</span>
            </div>
          </div>
          <ul class="mt-2 space-y-0.5">
            <li v-for="c in contrastChecks" :key="c.label" :class="c.ratio < 4.5 ? 'text-red-600' : 'text-gray-600'">
              {{ c.label }}: {{ c.ratio.toFixed(2) }}:1{{ c.ratio < 4.5 ? ' — hard to read, consider adjusting' : '' }}
            </li>
          </ul>
        </div>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (editId ? 'Save changes' : 'Create theme') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { isSafeCMoonColor, relativeLuminance, contrast } from '~/utils/cmoonColor'

const COLOR_FIELDS = [
  { key: 'orbitDarkBlue', label: 'Dark accent (topbar, sidebar top/bottom)' },
  { key: 'orbitLightBlue', label: 'Light accent (nav bar, sidebar fill)' },
  { key: 'orbitGreen', label: 'Highlight accent (green buttons)' },
  { key: 'bgColor', label: 'Page background' },
  { key: 'textColor', label: 'Text color' },
]
const FALLBACK = '#336699'

const themes = ref([])
const useDefaultSiteTheme = ref(true)
const activeSiteThemeId = ref(null)
const loading = ref(false)
const loadError = ref('')
const togglingDefault = ref(false)
const activating = ref('')
const deletingId = ref('')

const editId = ref('')
const saving = ref(false)
const formError = ref('')

const emptyForm = () => ({
  name: '', orbitDarkBlue: '#336699', orbitLightBlue: '#3399CC', orbitGreen: '#66CC00',
  bgColor: '#003466', textColor: '#ffffff',
})
const form = reactive(emptyForm())

const colorPickers = reactive(
  Object.fromEntries(COLOR_FIELDS.map(f => [f.key, form[f.key]]))
)
for (const f of COLOR_FIELDS) {
  watch(() => colorPickers[f.key], (v) => { form[f.key] = v })
  watch(() => form[f.key], (v) => { if (isSafeCMoonColor(v)) colorPickers[f.key] = v })
}

const activeThemeName = computed(() => themes.value.find(t => t.id === activeSiteThemeId.value)?.name || '')

function previewColor(key) {
  return isSafeCMoonColor(form[key]) ? form[key] : FALLBACK
}

const contrastChecks = computed(() => {
  const ratio = (fgKey, bgKey, label) => {
    const fg = previewColor(fgKey)
    const bg = previewColor(bgKey)
    return { label, ratio: contrast(relativeLuminance(fg), relativeLuminance(bg)) }
  }
  return [
    ratio('textColor', 'bgColor', 'Text vs. page background'),
    ratio('textColor', 'orbitDarkBlue', 'Text vs. topbar/sidebar'),
    ratio('textColor', 'orbitLightBlue', 'Text vs. nav bar'),
  ]
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/site-themes')
    themes.value = res?.themes || []
    useDefaultSiteTheme.value = res?.useDefaultSiteTheme ?? true
    activeSiteThemeId.value = res?.activeSiteThemeId || null
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load site themes'
  } finally {
    loading.value = false
  }
}

async function setUseDefault(value) {
  togglingDefault.value = true
  loadError.value = ''
  try {
    await $fetch('/api/admin/site-theme-settings', { method: 'POST', body: { useDefaultSiteTheme: value } })
    useDefaultSiteTheme.value = value
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to update the default theme toggle'
  } finally {
    togglingDefault.value = false
  }
}

function resetForm() {
  editId.value = ''
  formError.value = ''
  Object.assign(form, emptyForm())
}

function startEdit(t) {
  editId.value = t.id
  formError.value = ''
  Object.assign(form, {
    name: t.name,
    orbitDarkBlue: t.orbitDarkBlue,
    orbitLightBlue: t.orbitLightBlue,
    orbitGreen: t.orbitGreen,
    bgColor: t.bgColor,
    textColor: t.textColor,
  })
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = 'Name is required.'; return }
  for (const f of COLOR_FIELDS) {
    if (!isSafeCMoonColor(form[f.key])) { formError.value = `${f.label} must be a hex value like #336699`; return }
  }

  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      orbitDarkBlue: form.orbitDarkBlue,
      orbitLightBlue: form.orbitLightBlue,
      orbitGreen: form.orbitGreen,
      bgColor: form.bgColor,
      textColor: form.textColor,
    }
    if (editId.value) {
      await $fetch(`/api/admin/site-themes/${editId.value}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/site-themes', { method: 'POST', body })
      editId.value = res.id
    }
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save theme'
  } finally {
    saving.value = false
  }
}

async function activate(t) {
  activating.value = t.id
  loadError.value = ''
  try {
    await $fetch('/api/admin/site-theme-settings', { method: 'POST', body: { activeSiteThemeId: t.id, useDefaultSiteTheme: false } })
    activeSiteThemeId.value = t.id
    useDefaultSiteTheme.value = false
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to apply theme'
  } finally {
    activating.value = ''
  }
}

async function remove(t) {
  if (t.id === activeSiteThemeId.value) return
  if (!confirm(`Delete "${t.name}"? This can't be undone.`)) return
  deletingId.value = t.id
  try {
    await $fetch(`/api/admin/site-themes/${t.id}`, { method: 'DELETE' })
    if (editId.value === t.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete theme'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
</script>

<style scoped>
.ast-preview {
  width: 100%;
  max-width: 420px;
}
.ast-topbar {
  padding: 8px 10px;
}
.ast-nav {
  padding: 5px 10px;
}
.ast-body {
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ast-btn {
  border: 2px solid transparent;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
}
</style>
