<template>
  <div class="admin-manage-tutorial bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">

      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage Tutorial (How to Play)</h1>
        <a href="/newsite/tutorial" target="_blank" rel="noopener noreferrer"
           class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">
          Preview page ↗
        </a>
      </div>

      <p class="text-gray-500">
        This page is not on the nav — link to it from a homepage graphic in
        <span class="font-medium">Manage Homepage</span> (choose "Tutorial" from any image's Link dropdown).
      </p>

      <!-- Hero image -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Hero Image</h2>
        <p class="text-gray-500">Shown at the top of the page. Uploaded images are automatically cropped/resized to 800x800.</p>
        <div class="flex items-center gap-4">
          <div class="w-32 h-32 bg-gray-50 border rounded flex items-center justify-center overflow-hidden shrink-0">
            <img v-if="heroPreviewUrl || heroImagePath" :src="heroPreviewUrl || heroImagePath" alt="Hero preview" class="max-h-full max-w-full object-cover" />
            <span v-else class="text-gray-400">No image</span>
          </div>
          <div class="space-y-2 flex-1 min-w-0">
            <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp"
              @change="onHeroFile" class="block w-full text-xs" />
            <div v-if="heroFile" class="text-gray-600 truncate">Selected: {{ heroFile.name }}</div>
            <button type="button" class="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!heroFile || heroUploading" @click="uploadHero">
              <span v-if="!heroUploading">Upload Hero Image</span><span v-else>Uploading…</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Sections -->
      <!-- Tiptap's Editor instance exists but isn't fully initialized during SSR (methods
           like isActive() aren't callable yet), so this whole block is client-only — there's
           no SEO/SSR benefit to an admin-only editor anyway. -->
      <ClientOnly>
        <div v-for="e in editors" :key="e.key" class="bg-white border rounded p-3 space-y-2">
          <h2 class="font-semibold text-sm">{{ e.label }}</h2>
          <div v-if="e.editor" class="border rounded">
            <div class="flex flex-wrap gap-1 border-b bg-gray-50 p-1">
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('bold') }" @click="e.editor.chain().focus().toggleBold().run()"><b>B</b></button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('italic') }" @click="e.editor.chain().focus().toggleItalic().run()"><i>I</i></button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('heading', { level: 2 }) }" @click="e.editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('heading', { level: 3 }) }" @click="e.editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('bulletList') }" @click="e.editor.chain().focus().toggleBulletList().run()">• List</button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': e.editor.isActive('orderedList') }" @click="e.editor.chain().focus().toggleOrderedList().run()">1. List</button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="setLink(e.editor)">Link</button>
              <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="e.editor.chain().focus().unsetLink().run()">Unlink</button>
            </div>
            <EditorContent :editor="e.editor" class="tiptap-body p-2 min-h-[100px]" />
          </div>
        </div>
        <template #fallback>
          <div v-for="e in editors" :key="e.key" class="bg-white border rounded p-3 space-y-2">
            <h2 class="font-semibold text-sm">{{ e.label }}</h2>
            <div class="border rounded p-2 min-h-[100px] text-gray-400">Loading editor…</div>
          </div>
        </template>
      </ClientOnly>

      <div class="sticky bottom-0 bg-gray-50 pt-2 pb-1 flex items-center gap-2">
        <button type="button" class="px-4 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="saving" @click="saveAll">
          <span v-if="!saving">Save All Sections</span><span v-else>Saving…</span>
        </button>
        <span v-if="toast" :class="toast.type === 'error' ? 'text-red-600' : 'text-green-700'">{{ toast.msg }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { SECTION_META } from '@/utils/tutorialSections'

const heroImagePath = ref('')
const heroFile = ref(null)
const heroPreviewUrl = ref(null)
const heroUploading = ref(false)
const saving = ref(false)
const toast = ref(null)

// useEditor() returns a ShallowRef, and Vue only auto-unwraps a ref in templates when it's a
// direct <script setup> binding or a property read through a reactive() proxy — never a plain
// property on a plain array element. Without reactive() here, `e.editor` in the template (and
// in loadConfig/saveAll below) would be the ref wrapper itself, not the Editor instance, so
// `e.editor.isActive(...)` etc. would fail with "is not a function". reactive() only unwraps
// refs at the property it wraps; it doesn't deep-proxy what the ref points to, so the actual
// Editor instance stays exactly the plain (non-reactive) object Tiptap expects.
const editors = reactive(SECTION_META.map((meta) => ({
  key: meta.key,
  label: meta.label,
  editor: useEditor({
    content: '',
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }
      })
    ]
  })
})))

function setLink(editor) {
  const previous = editor.getAttributes('link').href
  const url = window.prompt('Link URL (https://…)', previous || 'https://')
  if (url === null) return
  if (url === '') {
    editor.chain().focus().unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

function onHeroFile(e) {
  const f = e.target.files?.[0] || null
  try { if (heroPreviewUrl.value) URL.revokeObjectURL(heroPreviewUrl.value) } catch {}
  heroFile.value = f
  heroPreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadHero() {
  if (!heroFile.value) return
  heroUploading.value = true; toast.value = null
  try {
    const fd = new FormData()
    fd.append('image', heroFile.value)
    const res = await $fetch('/api/admin/tutorial/image', { method: 'POST', body: fd })
    heroImagePath.value = res.heroImagePath || ''
    try { if (heroPreviewUrl.value) URL.revokeObjectURL(heroPreviewUrl.value) } catch {}
    heroPreviewUrl.value = null
    heroFile.value = null
    toast.value = { type: 'ok', msg: 'Hero image updated.' }
  } catch (err) {
    toast.value = { type: 'error', msg: err?.data?.statusMessage || 'Upload failed' }
  } finally {
    heroUploading.value = false
    setTimeout(() => { toast.value = null }, 3000)
  }
}

async function loadConfig() {
  const cfg = await $fetch('/api/admin/tutorial')
  heroImagePath.value = cfg.heroImagePath || ''
  for (const e of editors) {
    e.editor?.commands.setContent(cfg.sections?.[e.key] || '', false)
  }
}

async function saveAll() {
  saving.value = true; toast.value = null
  try {
    const sections = {}
    for (const e of editors) sections[e.key] = e.editor?.getHTML() || ''
    await $fetch('/api/admin/tutorial', { method: 'POST', body: { sections } })
    toast.value = { type: 'ok', msg: 'Saved.' }
  } catch (err) {
    toast.value = { type: 'error', msg: err?.data?.statusMessage || 'Save failed' }
  } finally {
    saving.value = false
    setTimeout(() => { toast.value = null }, 3000)
  }
}

onMounted(loadConfig)
onBeforeUnmount(() => {
  if (heroPreviewUrl.value) { try { URL.revokeObjectURL(heroPreviewUrl.value) } catch {} }
  for (const e of editors) e.editor?.destroy()
})
</script>

<style scoped>
.tiptap-body :deep(.ProseMirror) { outline: none; min-height: 90px; }
.tiptap-body :deep(p) { margin: 0 0 0.5em; }
.tiptap-body :deep(ul), .tiptap-body :deep(ol) { padding-left: 1.25em; margin: 0 0 0.5em; }
</style>
