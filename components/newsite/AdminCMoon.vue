<template>
  <div class="admin-cmoon bg-gray-50 p-3 text-sm text-gray-900">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h1 class="text-base font-bold">cMoons</h1>
    </div>

    <!-- Feature flag -->
    <div class="bg-white rounded border p-3 mb-4">
      <label class="flex items-center gap-2">
        <input type="checkbox" v-model="flagEnabled" :disabled="flagSaving" @change="toggleFlag" />
        <span class="font-medium">cMoons enabled</span>
      </label>
      <p class="text-xs text-gray-600 mt-1">
        Off by default. Turning this on starts a 3-day window for existing players to pick a
        cMoon before they're auto-assigned to whichever has the fewest members; new players
        always get 3 days from when they join.
      </p>
      <p v-if="cMoonEnabledAt" class="text-xs text-gray-600 mt-1">
        Launched {{ formatDate(cMoonEnabledAt) }} · existing-player deadline {{ formatDate(cMoonSelectionDeadlineAt) }}
      </p>
    </div>

    <div v-if="loading" class="text-gray-600">Loading…</div>
    <template v-else>
      <!-- Existing cMoons -->
      <div class="space-y-3 mb-4">
        <div v-for="c in cmoons" :key="c.id" class="bg-white rounded border p-3">
          <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
            <img
              v-if="c.imagePath" :src="c.imagePath" alt=""
              class="w-6 h-9 object-cover rounded border flex-shrink-0"
            />
            <span v-else class="inline-block w-4 h-4 rounded-full border flex-shrink-0" :style="{ background: safeColor(c.color) }"></span>
            <span class="font-semibold break-words min-w-0">{{ c.name }}</span>
            <span class="text-xs text-gray-600">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
            <!-- Kept together so they travel as a unit when the row wraps on narrow screens. -->
            <div class="ml-auto flex items-center gap-3 flex-shrink-0">
              <button class="cm-tap text-xs text-indigo-600 hover:underline" @click="startEdit(c)">Edit</button>
              <button
                v-if="c.imagePath"
                class="cm-tap text-xs text-gray-600 hover:underline disabled:opacity-40"
                :disabled="imageBusyId === c.id"
                @click="removeImage(c)"
              >{{ imageBusyId === c.id ? 'Removing…' : 'Remove graphic' }}</button>
              <button
                class="cm-tap text-xs text-red-600 hover:underline disabled:opacity-40"
                :disabled="c.memberCount > 0"
                @click="remove(c)"
              >Delete</button>
            </div>
          </div>
          <div class="text-xs text-gray-600 break-words">
            Captains: {{ c.captains.map(cap => cap.username).join(', ') || 'none' }}
          </div>
          <div class="text-xs text-gray-600 break-words">
            Prize cToons: {{ c.prizeCtoons.map(p => `${p.name} ×${p.quantity}`).join(', ') || 'none' }}
          </div>
          <div class="text-xs text-gray-600 break-words">Discord role ID: {{ c.discordRoleId || 'none' }}</div>
          <div class="text-xs text-gray-600 break-words">
            cToons displayed: {{ c.displayedCtoonCount }}
            <NuxtLink :to="`/newsite/cmoon/${c.id}`" class="text-indigo-600 hover:underline ml-1">View cMoon page</NuxtLink>
          </div>
          <p v-if="c.memberCount > 0" class="text-xs text-gray-600 mt-1">
            Reassign members before this cMoon can be deleted.
          </p>

          <!-- Ranks: an ordered ladder (sortOrder) — a member's displayed rank is always the
               highest-sortOrder rank they've unlocked via an achievement (see Admin: Achievements). -->
          <div class="mt-2 pt-2 border-t">
            <div class="text-xs font-medium mb-1">Ranks</div>
            <div v-if="c.ranks.length" class="space-y-1 mb-2">
              <div v-for="r in c.ranks" :key="r.id" class="flex items-center gap-2 text-xs">
                <span class="text-gray-500 w-6 flex-shrink-0">#{{ r.sortOrder }}</span>
                <span class="flex-1 min-w-0 break-words">{{ r.name }}</span>
                <span class="text-gray-500 truncate max-w-[10rem]">{{ r.discordRoleId || 'no role' }}</span>
                <button type="button" class="cm-tap text-indigo-600" @click="startEditRank(c, r)">Edit</button>
                <button type="button" class="cm-tap text-red-600" @click="removeRank(c, r)">Delete</button>
              </div>
            </div>
            <div v-else class="text-xs text-gray-500 mb-2">No ranks yet.</div>

            <div v-if="rankForm.cMoonId === c.id" class="bg-gray-50 border rounded p-2 space-y-2">
              <input v-model="rankForm.name" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="Rank name (e.g. Sergeant)" />
              <div class="flex gap-2">
                <input v-model.number="rankForm.sortOrder" type="number" inputmode="numeric" class="cm-field w-24 border rounded px-2 py-1" style="font-size:16px" placeholder="Order" aria-label="Ladder order" />
                <input v-model="rankForm.discordRoleId" class="cm-field flex-1 min-w-0 border rounded px-2 py-1" style="font-size:16px" placeholder="Discord Role ID (optional)" inputmode="numeric" autocapitalize="none" autocorrect="off" spellcheck="false" />
              </div>
              <div v-if="rankFormError" class="text-xs text-red-600">{{ rankFormError }}</div>
              <div class="flex gap-2">
                <button type="button" class="cm-tap px-3 bg-indigo-600 text-white rounded text-xs" @click="saveRank(c)" :disabled="rankSaving">
                  {{ rankSaving ? 'Saving…' : (rankForm.id ? 'Save Rank' : 'Add Rank') }}
                </button>
                <button type="button" class="cm-tap px-3 border rounded text-xs" @click="resetRankForm">Cancel</button>
              </div>
            </div>
            <button v-else type="button" class="cm-tap text-xs text-indigo-600" @click="startAddRank(c)">+ Add rank</button>
          </div>
        </div>
        <div v-if="!cmoons.length" class="text-gray-600">No cMoons yet — create one below.</div>
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
            <label class="block text-xs font-medium mb-1">Color (badge background)</label>
            <div class="flex items-center gap-2">
              <input v-model="form.color" class="w-full min-w-0 border rounded px-2 py-1" style="font-size:16px" placeholder="#3366ff" autocapitalize="none" autocorrect="off" spellcheck="false" />
              <!-- Native picker is the one control that is easier on a phone than typing hex. -->
              <input v-model="colorPicker" type="color" class="cm-color-swatch flex-shrink-0" aria-label="Pick color" />
            </div>
            <p v-if="form.color && !isValidColor(form.color)" class="text-xs text-red-600 mt-1">Must be a hex color like #3366ff</p>
            <p v-else-if="isValidColor(form.color)" class="text-xs mt-1 flex items-center gap-2 flex-wrap">
              <span class="cm-preview-pill" :style="cMoonPillStyle(form.color)">{{ form.name || 'Preview' }}</span>
              <span :class="colorContrast >= 4.5 ? 'text-gray-600' : 'text-red-600'">
                Badge contrast {{ colorContrast.toFixed(1) }}:1{{ colorContrast >= 4.5 ? '' : ' — below the 4.5:1 minimum, pick a darker or lighter color' }}
              </span>
            </p>
            <!-- This color now also drives an entire cToon-modal/cMoon-page theme (not just the
                 small badge above), so preview it in that actual context rather than a swatch alone. -->
            <div v-if="palettePreview" class="cm-theme-preview" :style="{ background: palettePreview.bg, color: palettePreview.text }">
              <div class="cm-theme-preview-banner" :style="{ background: palettePreview.banner, color: palettePreview.bannerText }">
                {{ form.name || 'cMoon name' }}
              </div>
              <div class="cm-theme-preview-tile" :style="{ background: palettePreview.tileBg }">
                <div style="font-size:0.65rem;opacity:0.8;">cWorld</div>
                <div :style="{ color: palettePreview.linkText }">{{ form.name || 'cMoon name' }} ›</div>
              </div>
              <p style="font-size:0.72rem;" :style="{ color: palettePreview.textMuted }">This is how the themed cToon modal &amp; cMoon page will look.</p>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Discord Role ID (optional)</label>
            <input v-model="form.discordRoleId" class="w-full border rounded px-2 py-1" style="font-size:16px" inputmode="numeric" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="123456789012345678" />
          </div>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">cMoon page description (optional)</label>
          <textarea
            v-model="form.pageDescription"
            rows="3"
            maxlength="2000"
            class="w-full border rounded px-2 py-1"
            style="font-size:16px"
            placeholder="Shown on this cMoon's public page"
          ></textarea>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">cMoon page image (exactly 800×600 after processing)</label>
          <template v-if="!editId">
            <p class="text-xs text-gray-600">Save this cMoon first, then Edit it to upload a page image.</p>
          </template>
          <template v-else>
            <img v-if="pageImagePreview" :src="pageImagePreview" class="cm-page-image-preview" alt="Selected image preview" />
            <img v-else-if="currentPageImagePath" :src="currentPageImagePath" class="cm-page-image-preview" alt="Current cMoon page image" />
            <p v-else class="text-xs text-gray-600 mb-1">No image uploaded yet.</p>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="cm-field" @change="handlePageImageFile" />
            <p class="text-xs text-gray-500 mt-1">Any photo works — it's auto-cropped/resized to 800×600 on upload.</p>
            <button
              type="button"
              class="cm-tap mt-2 px-3 border rounded bg-white"
              :disabled="!pageImageFile || pageImageUploading"
              @click="uploadPageImage"
            >{{ pageImageUploading ? 'Uploading…' : 'Upload image' }}</button>
            <p v-if="pageImageError" class="text-xs text-red-600 mt-1">{{ pageImageError }}</p>
            <NuxtLink :to="`/newsite/cmoon/${editId}`" class="block text-xs text-indigo-600 hover:underline mt-2">View cMoon page</NuxtLink>
          </template>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">cToon modal banner (small wide graphic, replaces the "cWorld" text link)</label>
          <template v-if="!editId">
            <p class="text-xs text-gray-600">Save this cMoon first, then Edit it to upload a banner.</p>
          </template>
          <template v-else>
            <img v-if="bannerImagePreview" :src="bannerImagePreview" class="cm-banner-image-preview" alt="Selected banner preview" />
            <img v-else-if="currentBannerImagePath" :src="currentBannerImagePath" class="cm-banner-image-preview" alt="Current cMoon modal banner" />
            <p v-else class="text-xs text-gray-600 mb-1">No banner uploaded yet — the modal shows a plain text link instead.</p>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="cm-field" @change="handleBannerImageFile" />
            <p class="text-xs text-gray-500 mt-1">Any image works — it's auto-cropped/resized to a wide 800×200 banner on upload.</p>
            <button
              type="button"
              class="cm-tap mt-2 px-3 border rounded bg-white"
              :disabled="!bannerImageFile || bannerImageUploading"
              @click="uploadBannerImage"
            >{{ bannerImageUploading ? 'Uploading…' : 'Upload banner' }}</button>
            <p v-if="bannerImageError" class="text-xs text-red-600 mt-1">{{ bannerImageError }}</p>
          </template>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">Captains (from admins)</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="a in admins" :key="a.id"
              type="button"
              class="cm-chip px-3 rounded-full border text-xs"
              :class="form.captainIds.includes(a.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
              :aria-pressed="form.captainIds.includes(a.id)"
              @click="toggleCaptain(a.id)"
            >
              <span aria-hidden="true">{{ form.captainIds.includes(a.id) ? '✓' : '+' }}</span>
              {{ a.username || a.id }}
            </button>
          </div>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">Prize cToons (granted when a user joins)</label>
          <!-- Stacks on phones so the search field gets full width and Add stays a big target. -->
          <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              v-model="prizeCtoonSearch"
              class="cm-field w-full sm:flex-1 min-w-0 border rounded px-2 py-1"
              style="font-size:16px"
              placeholder="Type 3+ characters"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
              role="combobox"
              :aria-expanded="ctoonSuggestions.length > 0"
              aria-controls="cmoon-ctoon-suggestions"
            />
            <div class="flex gap-2">
              <input v-model.number="prizeCtoonQty" type="number" min="1" inputmode="numeric" class="cm-field w-20 flex-shrink-0 border rounded px-2 py-1" style="font-size:16px" aria-label="Quantity" />
              <button type="button" class="cm-tap flex-1 sm:flex-none px-4 border rounded bg-white" @click="addPrizeCtoon">Add</button>
            </div>
          </div>
          <!-- Rendered list rather than <datalist>: datalist is unreliable on iOS and forced an
               exact string match, which made this picker unusable on a phone. -->
          <div v-if="ctoonSuggestions.length" id="cmoon-ctoon-suggestions" class="mt-2 border rounded divide-y bg-white max-h-56 overflow-y-auto">
            <button
              v-for="c in ctoonSuggestions" :key="c.id"
              type="button"
              class="cm-tap w-full text-left px-3 text-xs hover:bg-gray-100"
              @click="selectCtoon(c)"
            >{{ c.name }}</button>
          </div>
          <div v-if="form.prizeCtoons.length" class="mt-2 space-y-1">
            <div v-for="(p, i) in form.prizeCtoons" :key="p.ctoonId" class="flex items-center gap-2 text-xs">
              <span class="break-words min-w-0">{{ nameForCtoon(p.ctoonId) }} × {{ p.quantity }}</span>
              <button type="button" class="cm-tap ml-auto flex-shrink-0 text-red-600" @click="form.prizeCtoons.splice(i, 1)">Remove</button>
            </div>
          </div>
        </div>

        <div class="mt-3">
          <label class="block text-xs font-medium mb-1">Starter choice graphic (selection-screen poster)</label>
          <p class="text-xs text-gray-600 mb-2">
            Shown as the choice for this cMoon on the "Choose your cMoon" screen new and existing
            players see. Portrait images work best (about a 2:3 ratio, e.g. 600×900) — it's
            automatically resized and cropped to fit. PNG, JPEG, or WebP, up to 5MB. Leave empty
            to keep showing the color swatch instead.
          </p>
          <div class="flex items-center gap-3 flex-wrap">
            <img
              v-if="imagePreviewUrl || currentImagePath"
              :src="imagePreviewUrl || currentImagePath" alt=""
              class="w-16 h-24 object-cover rounded border flex-shrink-0"
            />
            <input type="file" accept="image/png,image/jpeg,image/webp" class="cm-field text-xs" @change="onImageFileChange" />
          </div>
          <p v-if="imageError" class="text-xs text-red-600 mt-1">{{ imageError }}</p>
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
import { cMoonPillStyle, isSafeCMoonColor, cMoonContrastRatio } from '~/utils/cmoonColor'
import { cMoonPalette } from '~/utils/cmoonPalette'

const rs = useAdminResources()

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
const emptyForm = () => ({ name: '', color: '', discordRoleId: '', pageDescription: '', captainIds: [], prizeCtoons: [] })
const form = reactive(emptyForm())
const prizeCtoonSearch = ref('')
const prizeCtoonQty = ref(1)

// Starter-graphic upload state. Kept separate from `form` — the image is a separate multipart
// request (POST/DELETE .../[id]/image), sent only after the name/color/etc save succeeds.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const selectedImageFile = ref(null)
const imagePreviewUrl = ref('')
const currentImagePath = ref('')
const imageError = ref('')
const imageBusyId = ref('')

function onImageFileChange(e) {
  const file = e.target.files?.[0] || null
  e.target.value = ''
  imageError.value = ''
  if (!file) return
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    imageError.value = 'Only PNG, JPEG, or WebP images are allowed'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    imageError.value = 'Image must be 5MB or smaller'
    return
  }
  if (imagePreviewUrl.value) rs.revokeObjectUrl(imagePreviewUrl.value)
  selectedImageFile.value = file
  imagePreviewUrl.value = rs.objectUrl(file)
}

async function uploadImageIfNeeded(id) {
  if (!selectedImageFile.value) return
  const fd = new FormData()
  fd.append('image', selectedImageFile.value)
  await $fetch(`/api/admin/cmoons/${id}/image`, { method: 'POST', body: fd })
}

async function removeImage(c) {
  imageBusyId.value = c.id
  try {
    await $fetch(`/api/admin/cmoons/${c.id}/image`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Failed to remove graphic')
  } finally {
    imageBusyId.value = ''
  }
}

// ── cMoon page image (separate step — needs an existing cMoon row) ─────
const pageImageFile = ref(null)
const pageImagePreview = ref('')
const pageImageUploading = ref(false)
const pageImageError = ref('')
const currentPageImagePath = ref('')

// ── cToon modal banner (separate step — needs an existing cMoon row) ───
const bannerImageFile = ref(null)
const bannerImagePreview = ref('')
const bannerImageUploading = ref(false)
const bannerImageError = ref('')
const currentBannerImagePath = ref('')

const palettePreview = computed(() => isValidColor(form.color) ? cMoonPalette(form.color) : null)

function handlePageImageFile(e) {
  const file = e.target.files?.[0] || null
  pageImageFile.value = file
  pageImageError.value = ''
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadPageImage() {
  if (!editId.value || !pageImageFile.value || pageImageUploading.value) return
  pageImageUploading.value = true
  pageImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', pageImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/page-image`, { method: 'POST', body })
    currentPageImagePath.value = res.pageImagePath
    pageImageFile.value = null
    if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
    pageImagePreview.value = ''
    await load()
  } catch (e) {
    pageImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    pageImageUploading.value = false
  }
}

function handleBannerImageFile(e) {
  const file = e.target.files?.[0] || null
  bannerImageFile.value = file
  bannerImageError.value = ''
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadBannerImage() {
  if (!editId.value || !bannerImageFile.value || bannerImageUploading.value) return
  bannerImageUploading.value = true
  bannerImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', bannerImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/banner-image`, { method: 'POST', body })
    currentBannerImagePath.value = res.bannerImagePath
    bannerImageFile.value = null
    if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
    bannerImagePreview.value = ''
    await load()
  } catch (e) {
    bannerImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    bannerImageUploading.value = false
  }
}

// Share the validation/contrast helpers with the player-facing badges so the admin
// preview here matches exactly what renders on leaderboards and cZones.
function isValidColor(c) { return isSafeCMoonColor(c) }
function safeColor(c) { return isValidColor(c) ? c : '#cccccc' }

const colorContrast = computed(() => cMoonContrastRatio(form.color))

// Two-way bridge to <input type="color">, which only ever holds a valid lowercase hex.
const colorPicker = computed({
  get: () => (isValidColor(form.color) ? form.color : '#3366ff'),
  set: (v) => { form.color = v },
})

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

const ctoonSuggestions = computed(() => filteredCtoons(prizeCtoonSearch.value))

function selectCtoon(c) {
  prizeCtoonSearch.value = c.name
  addPrizeCtoon(c)
}

function addPrizeCtoon(preselected) {
  // Tolerate case and stray whitespace, and accept a lone suggestion — mobile
  // keyboards autocapitalize, which used to make the exact match impossible to hit.
  const typed = String(prizeCtoonSearch.value || '').trim().toLowerCase()
  const match = preselected
    || ctoons.value.find(c => c.name?.trim().toLowerCase() === typed)
    || (ctoonSuggestions.value.length === 1 ? ctoonSuggestions.value[0] : null)
  if (!match) {
    formError.value = 'Select a valid cToon from the suggestions below.'
    return
  }
  if (form.prizeCtoons.find(p => p.ctoonId === match.id)) {
    formError.value = `${match.name} is already a prize for this cMoon.`
    prizeCtoonSearch.value = ''
    return
  }
  formError.value = ''
  const qty = Math.floor(Number(prizeCtoonQty.value))
  form.prizeCtoons.push({ ctoonId: match.id, quantity: Math.min(100, Math.max(1, Number.isFinite(qty) ? qty : 1)) })
  prizeCtoonSearch.value = ''
  prizeCtoonQty.value = 1
}

function startEdit(c) {
  editId.value = c.id
  Object.assign(form, {
    name: c.name,
    color: c.color,
    discordRoleId: c.discordRoleId || '',
    pageDescription: c.pageDescription || '',
    captainIds: c.captains.map(cap => cap.userId),
    prizeCtoons: c.prizeCtoons.map(p => ({ ctoonId: p.ctoonId, quantity: p.quantity })),
  })
  currentPageImagePath.value = c.pageImagePath || ''
  pageImageFile.value = null
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = ''
  pageImageError.value = ''
  currentBannerImagePath.value = c.bannerImagePath || ''
  bannerImageFile.value = null
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = ''
  bannerImageError.value = ''
  formError.value = ''
  clearImageSelection()
  currentImagePath.value = c.imagePath || ''
}

function clearImageSelection() {
  if (imagePreviewUrl.value) rs.revokeObjectUrl(imagePreviewUrl.value)
  selectedImageFile.value = null
  imagePreviewUrl.value = ''
  imageError.value = ''
}

function resetForm() {
  Object.assign(form, emptyForm())
  editId.value = ''
  formError.value = ''
  clearImageSelection()
  currentImagePath.value = ''
  currentPageImagePath.value = ''
  pageImageFile.value = null
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = ''
  pageImageError.value = ''
  currentBannerImagePath.value = ''
  bannerImageFile.value = null
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = ''
  bannerImageError.value = ''
}

// Ranks: one shared edit-form object, scoped to whichever cMoon card it's open on
// (rankForm.cMoonId), mirroring the single-form-at-a-time pattern used for cMoons above.
const emptyRankForm = () => ({ cMoonId: '', id: '', name: '', sortOrder: 0, discordRoleId: '' })
const rankForm = reactive(emptyRankForm())
const rankFormError = ref('')
const rankSaving = ref(false)

function resetRankForm() {
  Object.assign(rankForm, emptyRankForm())
  rankFormError.value = ''
}

function startAddRank(c) {
  resetRankForm()
  rankForm.cMoonId = c.id
  rankForm.sortOrder = (c.ranks.reduce((max, r) => Math.max(max, r.sortOrder), -1)) + 1
}

function startEditRank(c, r) {
  Object.assign(rankForm, { cMoonId: c.id, id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId || '' })
  rankFormError.value = ''
}

async function saveRank(c) {
  if (!rankForm.name.trim()) { rankFormError.value = 'Name is required'; return }
  rankFormError.value = ''
  rankSaving.value = true
  try {
    const body = { name: rankForm.name.trim(), sortOrder: rankForm.sortOrder, discordRoleId: rankForm.discordRoleId.trim() }
    if (!rankForm.id) {
      await $fetch(`/api/admin/cmoons/${c.id}/ranks`, { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/cmoons/${c.id}/ranks/${rankForm.id}`, { method: 'PUT', body })
    }
    resetRankForm()
    await load()
  } catch (e) {
    rankFormError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    rankSaving.value = false
  }
}

async function removeRank(c, r) {
  if (!confirm(`Delete rank "${r.name}"?`)) return
  try {
    await $fetch(`/api/admin/cmoons/${c.id}/ranks/${r.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
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
      pageDescription: form.pageDescription,
      captainIds: form.captainIds,
      prizeCtoons: form.prizeCtoons,
    }
    let id = editId.value
    if (!id) {
      const res = await $fetch('/api/admin/cmoons', { method: 'POST', body })
      id = res.id
    } else {
      await $fetch(`/api/admin/cmoons/${id}`, { method: 'PUT', body })
    }
    // Runs after the main save succeeds so a rejected image never blocks name/color/etc from
    // saving; a failure here surfaces as formError below without undoing the save that already went through.
    await uploadImageIfNeeded(id)
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

<style scoped>
/* The newsite layout sets `color: #ffffff` on <body>, which every admin section has
   to opt out of. Without this the whole panel renders white-on-white. */
.admin-cmoon {
  width: 100%;
  min-height: 100%;
  color: #111;
  /* Keeps the UA from painting checkboxes, number spinners and placeholders in
     dark-mode colors on iOS/macOS, which would reintroduce unreadable controls. */
  color-scheme: light;
}

/* Checkboxes and radios are excluded on purpose: painting a background over a
   native checkbox suppresses its tick on WebKit/Blink. Buttons are excluded so
   the Tailwind text-* utilities already on them keep winning. */
.admin-cmoon input:not([type='checkbox']):not([type='radio']):not([type='color']),
.admin-cmoon select,
.admin-cmoon textarea {
  color: #111;
  background: #fff;
  -webkit-text-fill-color: #111;
}

.admin-cmoon input::placeholder {
  color: #6b7280;
  -webkit-text-fill-color: #6b7280;
  opacity: 1;
}

/* 44px minimum touch target without changing the visual text size. */
.cm-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.cm-chip {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cm-field {
  min-height: 44px;
}

.cm-color-swatch {
  width: 44px;
  height: 44px;
  padding: 2px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.cm-preview-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}

.cm-theme-preview {
  margin-top: 8px;
  border-radius: 6px;
  overflow: hidden;
  max-width: 320px;
}
.cm-theme-preview-banner {
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.85rem;
}
.cm-theme-preview-tile {
  margin: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}
.cm-theme-preview p { margin: 0 8px 8px; }

.cm-page-image-preview {
  display: block;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}

.cm-banner-image-preview {
  display: block;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 4 / 1;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}
</style>
