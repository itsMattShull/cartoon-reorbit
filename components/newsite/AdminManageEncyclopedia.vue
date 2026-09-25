<template>
  <div class="admin-manage-encyclopedia bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage Encyclopedia</h1>
        <NuxtLink to="/newsite/encyclopedia" target="_blank" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">
          View page ↗
        </NuxtLink>
      </div>
      <p class="text-gray-500">
        Wiki-style reference entries, reachable from the Encyclopedia nav link and its search bar.
        An entry's body can link to another entry — pick one from the "Link to entry" list below
        the editor toolbar while writing.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- List -->
      <div class="space-y-2">
        <div v-for="e in entries" :key="e.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
          <div class="w-20 h-10 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
            <img v-if="e.heroImagePath" :src="e.heroImagePath" alt="" class="w-full h-full object-cover" />
            <span v-else class="text-gray-400 text-[10px]">No hero</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold break-words">{{ e.title }}<span v-if="!e.active" class="ml-2 text-[10px] font-normal text-gray-500">(inactive)</span></div>
            <div class="text-[11px] text-gray-600">/newsite/encyclopedia/{{ e.slug }}</div>
          </div>
          <div class="flex items-center gap-3 flex-shrink-0">
            <button type="button" class="text-indigo-600 hover:underline" @click="startEdit(e)">Edit</button>
            <button type="button" class="text-red-600 hover:underline disabled:opacity-40" :disabled="deletingId === e.id" @click="removeEntry(e)">
              {{ deletingId === e.id ? 'Deleting…' : 'Delete' }}
            </button>
          </div>
        </div>
        <p v-if="!loading && !entries.length" class="text-gray-500">No entries yet.</p>
      </div>

      <!-- Create / edit form -->
      <div class="bg-white border rounded p-3 space-y-3">
        <h2 class="font-semibold text-sm">{{ form.id ? 'Edit entry' : 'New entry' }}</h2>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div>
          <label class="block text-xs font-medium mb-1">Title</label>
          <input v-model="form.title" maxlength="120" class="w-full border rounded px-2 py-1" placeholder="e.g. The Great cToon War" @input="onTitleInput" />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">
            Slug (URL) — /newsite/encyclopedia/<span class="font-mono">{{ form.slug || '…' }}</span>
          </label>
          <input v-model="form.slug" maxlength="96" class="w-full border rounded px-2 py-1 font-mono" placeholder="the-great-ctoon-war" @input="slugTouched = true" />
          <p v-if="form.id" class="text-[11px] text-gray-500 mt-1">Changing this breaks any existing links pointing at the old slug.</p>
        </div>

        <div class="flex gap-2">
          <div class="w-24 flex-shrink-0">
            <label class="block text-xs font-medium mb-1">Order</label>
            <input v-model.number="form.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
          </div>
          <div class="flex items-end pb-1.5">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.active" />
              <span class="text-xs font-medium">Active</span>
            </label>
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium mb-1">Hero image (JPG, PNG, or animated GIF)</label>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="w-40 h-[42px] bg-gray-100 border rounded flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="previewImageSrc" :src="previewImageSrc" alt="" class="w-full h-full object-cover" />
              <span v-else class="text-gray-400 text-[10px]">No hero</span>
            </div>
            <div class="space-y-2 flex-1 min-w-[200px]">
              <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif" class="block w-full" @change="onFile" />
              <p class="text-[10px] text-gray-500">Cropped to fill a 1600x400 (4:1) banner, matching the Tutorial page's hero. Max 5MB.</p>
              <p v-if="imageError" class="text-red-600">{{ imageError }}</p>
              <button
                v-if="form.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                :disabled="!pendingFile || uploadingImage" @click="uploadImage"
              >{{ uploadingImage ? 'Uploading…' : 'Upload hero image' }}</button>
              <p v-else class="text-[11px] text-gray-500">Picking a file here uploads it together with "Create entry" below.</p>
            </div>
          </div>
        </div>

        <!-- Tiptap's Editor instance isn't fully initialized during SSR, same as
             AdminManageTutorial.vue — client-only, no SEO/SSR benefit for an admin editor anyway. -->
        <ClientOnly>
          <div>
            <label class="block text-xs font-medium mb-1">Body</label>
            <div v-if="editor" class="border rounded">
              <div class="flex flex-wrap gap-1 border-b bg-gray-50 p-1">
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('heading', { level: 2 }) }" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('heading', { level: 3 }) }" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">• List</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" :class="{ 'bg-gray-300': editor.isActive('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()">1. List</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="setExternalLink">External Link</button>
                <button type="button" class="px-2 py-1 rounded hover:bg-gray-200" @click="editor.chain().focus().unsetLink().run()">Unlink</button>
              </div>
              <div class="flex items-center gap-2 border-b bg-gray-50 p-1">
                <label class="text-[11px] text-gray-600 flex-shrink-0">Link to entry:</label>
                <select v-model="linkTargetSlug" class="flex-1 min-w-0 border rounded px-1.5 py-0.5 text-[11px]">
                  <option value="">Select an entry…</option>
                  <option v-for="o in linkableEntries" :key="o.slug" :value="o.slug">{{ o.title }}</option>
                </select>
                <button
                  type="button" class="px-2 py-0.5 text-[11px] font-semibold rounded bg-indigo-600 text-white disabled:opacity-50"
                  :disabled="!linkTargetSlug" @click="setEntryLink"
                >Insert</button>
              </div>
              <EditorContent :editor="editor" class="tiptap-body p-2 min-h-[140px]" />
            </div>
          </div>
          <template #fallback>
            <div>
              <label class="block text-xs font-medium mb-1">Body</label>
              <div class="border rounded p-2 min-h-[140px] text-gray-400">Loading editor…</div>
            </div>
          </template>
        </ClientOnly>

        <div class="flex items-center gap-3 flex-wrap pt-1">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="save"
          >{{ saving ? 'Saving…' : (form.id ? 'Save changes' : 'Create entry') }}</button>
          <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetForm">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { slugify } from '~/utils/encyclopediaSlug'

const entries = ref([])
const loading = ref(false)
const loadError = ref('')

const saving = ref(false)
const formError = ref('')
const deletingId = ref('')
const slugTouched = ref(false)
const pendingFile = ref(null)
const pendingFilePreviewUrl = ref(null)
const uploadingImage = ref(false)
const imageError = ref('')
const savedImagePath = ref('')
const linkTargetSlug = ref('')

const emptyForm = () => ({ id: '', title: '', slug: '', sortOrder: 0, active: true })
const form = reactive(emptyForm())

const previewImageSrc = computed(() => pendingFilePreviewUrl.value || savedImagePath.value || '')
const linkableEntries = computed(() => entries.value.filter(e => e.id !== form.id))

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
    Link.configure({ openOnClick: false, autolink: false }),
  ],
})

function onTitleInput() {
  if (!form.id && !slugTouched.value) form.slug = slugify(form.title)
}

function setExternalLink() {
  const previous = editor.value?.getAttributes('link').href
  const url = window.prompt('Link URL (https://…)', previous || 'https://')
  if (url === null) return
  if (url === '') {
    editor.value.chain().focus().unsetLink().run()
    return
  }
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run()
}

function setEntryLink() {
  if (!linkTargetSlug.value) return
  editor.value.chain().focus().extendMarkRange('link').setLink({ href: `/newsite/encyclopedia/${linkTargetSlug.value}` }).run()
  linkTargetSlug.value = ''
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/encyclopedia-entries')
    entries.value = res?.entries || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load encyclopedia entries'
  } finally {
    loading.value = false
  }
}

function clearPendingFile() {
  if (pendingFilePreviewUrl.value) { try { URL.revokeObjectURL(pendingFilePreviewUrl.value) } catch {} }
  pendingFile.value = null
  pendingFilePreviewUrl.value = null
}

function resetForm() {
  formError.value = ''
  imageError.value = ''
  slugTouched.value = false
  clearPendingFile()
  savedImagePath.value = ''
  Object.assign(form, emptyForm())
  editor.value?.commands.setContent('', false)
}

function startEdit(e) {
  resetForm()
  slugTouched.value = true
  Object.assign(form, { id: e.id, title: e.title, slug: e.slug, sortOrder: e.sortOrder, active: !!e.active })
  savedImagePath.value = e.heroImagePath || ''
  editor.value?.commands.setContent(e.body || '', false)
}

function onFile(ev) {
  imageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/gif'].includes(f.type)) {
    imageError.value = 'PNG, JPG, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    imageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearPendingFile()
  pendingFile.value = f
  pendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadImageFor(id) {
  if (!pendingFile.value || !id) return
  uploadingImage.value = true
  imageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', pendingFile.value)
    const res = await $fetch(`/api/admin/encyclopedia-entries/${id}/image`, { method: 'POST', body: fd })
    savedImagePath.value = res.heroImagePath || savedImagePath.value
    clearPendingFile()
  } catch (e) {
    imageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    uploadingImage.value = false
  }
}

async function uploadImage() {
  if (!pendingFile.value || !form.id) return
  await uploadImageFor(form.id)
  await load()
}

async function save() {
  formError.value = ''
  if (!form.title.trim()) { formError.value = 'Title is required.'; return }
  if (!form.slug.trim()) { formError.value = 'Slug is required.'; return }

  saving.value = true
  try {
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim().toLowerCase(),
      body: editor.value?.getHTML() || '',
      active: form.active,
      sortOrder: Math.trunc(Number(form.sortOrder)) || 0,
    }
    let id = form.id
    if (id) {
      await $fetch(`/api/admin/encyclopedia-entries/${id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/encyclopedia-entries', { method: 'POST', body })
      id = res.id
      form.id = id
    }
    if (pendingFile.value) await uploadImageFor(id)
    resetForm()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save entry'
  } finally {
    saving.value = false
  }
}

async function removeEntry(e) {
  if (!confirm(`Delete "${e.title}"? This can't be undone. Any links pointing at it will break.`)) return
  deletingId.value = e.id
  try {
    await $fetch(`/api/admin/encyclopedia-entries/${e.id}`, { method: 'DELETE' })
    if (form.id === e.id) resetForm()
    await load()
  } catch (err) {
    loadError.value = err?.data?.statusMessage || 'Failed to delete entry'
  } finally {
    deletingId.value = ''
  }
}

onMounted(load)
onBeforeUnmount(() => {
  clearPendingFile()
  editor.value?.destroy()
})
</script>

<style scoped>
.tiptap-body :deep(.ProseMirror) { outline: none; min-height: 130px; }
.tiptap-body :deep(p) { margin: 0 0 0.5em; }
.tiptap-body :deep(ul), .tiptap-body :deep(ol) { padding-left: 1.25em; margin: 0 0 0.5em; }
</style>
