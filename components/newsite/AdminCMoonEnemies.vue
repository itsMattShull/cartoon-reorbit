<template>
  <div class="admin-cmoon-enemies bg-gray-50 text-xs" style="color-scheme: light;">
    <div class="px-2 py-2 space-y-4">
      <h1 class="text-base font-semibold">Manage cMoon Enemies</h1>
      <p class="text-gray-600">
        Build NPC factions that appear as a random site-wide battle popup. Each faction just groups
        its members for organization — HP, battle mode, cMoon points, and prizes are all set per
        member. Popup appearance rate and cooldown live on the
        <NuxtLink to="/newsite/admin/cMoon" class="text-indigo-600 hover:underline">cMoons</NuxtLink> page;
        results are recorded on the
        <NuxtLink to="/newsite/admin/cmoonBattleLogs" class="text-indigo-600 hover:underline">cMoon Battle Logs</NuxtLink> page.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Factions ─────────────────────────────────────────────── -->
      <section class="space-y-2">
        <h2 class="font-semibold text-sm">Factions</h2>
        <div class="space-y-2">
          <div v-for="f in factions" :key="f.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
            <div class="w-20 h-14 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
              <img v-if="f.bannerImagePath" :src="f.bannerImagePath" alt="" class="w-full h-full object-cover" />
              <span v-else class="text-gray-400 text-[10px]">No banner</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold break-words">{{ f.name }}<span v-if="!f.active" class="ml-2 text-[10px] font-normal text-gray-500">(inactive)</span></div>
              <div v-if="f.description" class="text-[11px] text-gray-600 break-words">{{ f.description }}</div>
              <div class="text-[11px] text-gray-600">{{ f.memberCount }} member{{ f.memberCount === 1 ? '' : 's' }}</div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <button type="button" class="text-indigo-600 hover:underline" @click="startEditFaction(f)">Edit</button>
              <button
                type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="f.memberCount > 0 || deletingFactionId === f.id"
                :title="f.memberCount > 0 ? 'Delete or move its members first' : ''"
                @click="removeFaction(f)"
              >{{ deletingFactionId === f.id ? 'Deleting…' : 'Delete' }}</button>
            </div>
          </div>
          <p v-if="!loading && !factions.length" class="text-gray-500">No enemy factions yet.</p>
        </div>

        <div class="bg-white border rounded p-3 space-y-3">
          <h3 class="font-semibold text-sm">{{ factionForm.id ? 'Edit faction' : 'New faction' }}</h3>
          <p v-if="factionFormError" class="text-red-600">{{ factionFormError }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="factionForm.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. The Void Syndicate" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Description (optional, {{ factionForm.description.length }}/500)</label>
            <textarea v-model="factionForm.description" maxlength="500" rows="2" class="w-full border rounded px-2 py-1"></textarea>
          </div>
          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="factionForm.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex items-end pb-1.5">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="factionForm.active" />
                <span class="text-xs font-medium">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Banner (optional, static or animated GIF)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <div class="w-32 h-[42px] bg-gray-100 border rounded flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="factionPreviewImageSrc" :src="factionPreviewImageSrc" alt="" class="w-full h-full object-cover" />
                <span v-else class="text-gray-400 text-[10px]">No banner</span>
              </div>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block w-full" @change="onFactionFile" />
                <p class="text-[10px] text-gray-500">PNG, JPEG, WEBP, or animated GIF. Max 5MB. Cropped to fill a 3:1 banner.</p>
                <p v-if="factionImageError" class="text-red-600">{{ factionImageError }}</p>
                <button
                  v-if="factionForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!factionPendingFile || factionUploadingImage" @click="uploadFactionImage"
                >{{ factionUploadingImage ? 'Uploading…' : 'Upload banner' }}</button>
                <p v-else class="text-[11px] text-gray-500">Picking a file here uploads it together with "Create faction" below.</p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="factionSaving" @click="saveFaction"
            >{{ factionSaving ? 'Saving…' : (factionForm.id ? 'Save changes' : 'Create faction') }}</button>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetFactionForm">Cancel</button>
          </div>
        </div>
      </section>

      <!-- ── Members ──────────────────────────────────────────────── -->
      <section class="space-y-2 pt-2 border-t">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">Enemy Members</h2>
          <select v-model="memberFactionFilter" class="border rounded px-2 py-1">
            <option value="">All factions</option>
            <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>

        <div class="space-y-2">
          <div v-for="m in filteredMembers" :key="m.id" class="bg-white rounded border p-3 space-y-2">
            <div class="flex items-center gap-3 flex-wrap">
              <div class="w-14 h-14 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
                <img v-if="m.imagePath" :src="m.imagePath" alt="" class="max-w-full max-h-full object-contain" />
                <span v-else class="text-gray-400 text-[10px]">No art</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold break-words">
                  {{ m.name }}
                  <span v-if="!m.active" class="ml-1 text-[10px] font-normal text-gray-500">(inactive)</span>
                  <span v-if="m.defeatedAt" class="ml-1 text-[10px] font-normal text-red-600">(defeated)</span>
                </div>
                <div class="text-[11px] text-gray-600 break-words">
                  {{ m.faction?.name }} · {{ m.battleMode === 'SHARED_POOL' ? 'Shared pool' : 'Per player' }} ·
                  HP {{ m.battleMode === 'SHARED_POOL' ? `${m.currentHp}/${m.maxHp}` : m.maxHp }} ·
                  {{ m.cMoonPointsReward }} cMoon pts · {{ m.rewardCount }} prize row{{ m.rewardCount === 1 ? '' : 's' }} ·
                  {{ m.battleCount }} battle{{ m.battleCount === 1 ? '' : 's' }} fought
                </div>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <button
                  v-if="m.battleMode === 'SHARED_POOL' && m.defeatedAt"
                  type="button" class="text-indigo-600 hover:underline disabled:opacity-40"
                  :disabled="resettingId === m.id" @click="resetMember(m)"
                >{{ resettingId === m.id ? 'Reviving…' : 'Revive' }}</button>
                <button type="button" class="text-indigo-600 hover:underline" @click="startEditMember(m)">Edit</button>
                <button
                  type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="m.hasBattles || deletingMemberId === m.id"
                  :title="m.hasBattles ? 'Has battle history — deactivate instead of deleting' : ''"
                  @click="removeMember(m)"
                >{{ deletingMemberId === m.id ? 'Deleting…' : 'Delete' }}</button>
              </div>
            </div>
          </div>
          <p v-if="!loading && !filteredMembers.length" class="text-gray-500">No enemy members yet.</p>
        </div>

        <div class="bg-white border rounded p-3 space-y-3">
          <h3 class="font-semibold text-sm">{{ memberForm.id ? 'Edit member' : 'New member' }}</h3>
          <p v-if="memberFormError" class="text-red-600">{{ memberFormError }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Faction</label>
            <select v-model="memberForm.factionId" class="w-full border rounded px-2 py-1">
              <option value="" disabled>Select a faction…</option>
              <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="memberForm.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Grim Sentinel" />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Battle mode</label>
            <select v-model="memberForm.battleMode" class="w-full border rounded px-2 py-1" :disabled="editingMemberHasBattles">
              <option value="PER_PLAYER">Per player — every player fights their own fresh copy</option>
              <option value="SHARED_POOL">Shared pool — all players chip away at one HP total</option>
            </select>
            <p v-if="editingMemberHasBattles" class="text-[11px] text-gray-500 mt-1">Can't change once this enemy has been fought.</p>
          </div>

          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Max HP (1-200)</label>
              <input v-model.number="memberForm.maxHp" type="number" min="1" max="200" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">cMoon points on win (0-5000)</label>
              <input v-model.number="memberForm.cMoonPointsReward" type="number" min="0" max="5000" class="w-full border rounded px-2 py-1" />
            </div>
          </div>

          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="memberForm.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex items-end pb-1.5">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="memberForm.active" />
                <span class="text-xs font-medium">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Portrait (optional, static or animated GIF)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <div class="w-24 h-24 bg-gray-100 border rounded flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="memberPreviewImageSrc" :src="memberPreviewImageSrc" alt="" class="max-w-full max-h-full object-contain" />
                <span v-else class="text-gray-400 text-[10px]">No art</span>
              </div>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block w-full" @change="onMemberFile" />
                <p class="text-[10px] text-gray-500">PNG, JPEG, WEBP, or animated GIF. Max 5MB. Letterboxed, never cropped.</p>
                <p v-if="memberImageError" class="text-red-600">{{ memberImageError }}</p>
                <button
                  v-if="memberForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!memberPendingFile || memberUploadingImage" @click="uploadMemberImage"
                >{{ memberUploadingImage ? 'Uploading…' : 'Upload portrait' }}</button>
                <p v-else class="text-[11px] text-gray-500">Picking a file here uploads it together with "Create member" below.</p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="memberSaving" @click="saveMember"
            >{{ memberSaving ? 'Saving…' : (memberForm.id ? 'Save changes' : 'Create member') }}</button>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetMemberForm">Cancel</button>
          </div>

          <!-- Rewards can only attach to an already-created member (needs its id) -->
          <div v-if="memberForm.id" class="pt-2 border-t space-y-2">
            <h4 class="font-semibold text-xs">Potential prizes on a win (each rolled independently)</h4>
            <div v-if="editingMemberRewards.length" class="space-y-1">
              <div v-for="r in editingMemberRewards" :key="r.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
                <span class="flex-1 min-w-0 break-words">
                  {{ rewardLabel(r) }} — {{ r.dropChancePercent }}% chance<span v-if="r.rewardType === 'CTOON'"> · x{{ r.quantity }}</span>
                </span>
                <button type="button" class="text-red-600 hover:underline flex-shrink-0" :disabled="deletingRewardId === r.id" @click="removeReward(r)">
                  {{ deletingRewardId === r.id ? 'Removing…' : 'Remove' }}
                </button>
              </div>
            </div>
            <p v-else class="text-gray-500">No prizes configured yet — a win still awards cMoon points either way.</p>

            <p v-if="rewardFormError" class="text-red-600">{{ rewardFormError }}</p>
            <div class="flex gap-2 flex-wrap items-end">
              <div class="w-32 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Prize type</label>
                <select v-model="rewardForm.rewardType" class="w-full border rounded px-2 py-1">
                  <option value="CTOON">cToon</option>
                  <option value="AVATAR">Avatar</option>
                  <option value="BACKGROUND">Background</option>
                </select>
              </div>
              <div class="w-24 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Drop % (0-100)</label>
                <input v-model.number="rewardForm.dropChancePercent" type="number" min="0" max="100" step="0.1" class="w-full border rounded px-2 py-1" />
              </div>
              <div v-if="rewardForm.rewardType === 'CTOON'" class="w-20 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Qty (1-20)</label>
                <input v-model.number="rewardForm.quantity" type="number" min="1" max="20" class="w-full border rounded px-2 py-1" />
              </div>
            </div>

            <div v-if="rewardForm.rewardType === 'CTOON'">
              <label class="block text-[11px] font-medium mb-1">cToon</label>
              <input
                v-model="rewardCtoonSearch"
                class="w-full border rounded px-2 py-1"
                :placeholder="rewardForm.ctoonId ? rewardCtoonSelectedName : 'Type 3+ characters of a cToon'"
                autocapitalize="none" autocorrect="off" spellcheck="false"
              />
              <div v-if="rewardCtoonSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-32 overflow-y-auto">
                <button
                  v-for="c in rewardCtoonSuggestions" :key="c.id" type="button"
                  class="w-full text-left px-2 py-1 text-[11px] hover:bg-gray-100"
                  @click="selectRewardCtoon(c)"
                >{{ c.name }}</button>
              </div>
            </div>
            <div v-else-if="rewardForm.rewardType === 'AVATAR'">
              <label class="block text-[11px] font-medium mb-1">Avatar</label>
              <select v-model="rewardForm.avatarId" class="w-full border rounded px-2 py-1">
                <option value="">Select an avatar…</option>
                <option v-for="av in avatarsCatalog" :key="av.id" :value="av.id">{{ av.label || av.filename }}</option>
              </select>
            </div>
            <div v-else>
              <label class="block text-[11px] font-medium mb-1">Background</label>
              <select v-model="rewardForm.backgroundId" class="w-full border rounded px-2 py-1">
                <option value="">Select a background…</option>
                <option v-for="bg in backgrounds" :key="bg.id" :value="bg.id">{{ bg.label || bg.filename }}</option>
              </select>
            </div>

            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="rewardSaving" @click="addReward"
            >{{ rewardSaving ? 'Adding…' : 'Add prize' }}</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
const factions = ref([])
const members = ref([])
const backgrounds = ref([])
const avatarsCatalog = ref([])
const ctoonsCatalog = ref([])
const loading = ref(false)
const loadError = ref('')

const memberFactionFilter = ref('')
const filteredMembers = computed(() => {
  if (!memberFactionFilter.value) return members.value
  return members.value.filter(m => m.factionId === memberFactionFilter.value)
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [factionsData, membersData, backgroundsData, avatarsData, ctoonsData] = await Promise.all([
      $fetch('/api/admin/cmoon-enemy-factions'),
      $fetch('/api/admin/cmoon-enemy-members'),
      $fetch('/api/admin/backgrounds'),
      $fetch('/api/admin/avatars'),
      $fetch('/api/admin/list-ctoons'),
    ])
    factions.value = factionsData?.factions || []
    members.value = membersData?.members || []
    backgrounds.value = backgroundsData || []
    avatarsCatalog.value = avatarsData || []
    ctoonsCatalog.value = ctoonsData || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load cMoon enemies'
  } finally {
    loading.value = false
  }
}

// ── Factions ───────────────────────────────────────────────────────
const factionSaving = ref(false)
const factionFormError = ref('')
const deletingFactionId = ref('')
const factionPendingFile = ref(null)
const factionPendingFilePreviewUrl = ref(null)
const factionUploadingImage = ref(false)
const factionImageError = ref('')
const factionSavedImagePath = ref('')

const emptyFactionForm = () => ({ id: '', name: '', description: '', active: true, sortOrder: 0 })
const factionForm = reactive(emptyFactionForm())
const factionPreviewImageSrc = computed(() => factionPendingFilePreviewUrl.value || factionSavedImagePath.value || '')

function clearFactionPendingFile() {
  if (factionPendingFilePreviewUrl.value) { try { URL.revokeObjectURL(factionPendingFilePreviewUrl.value) } catch {} }
  factionPendingFile.value = null
  factionPendingFilePreviewUrl.value = null
}

function resetFactionForm() {
  factionFormError.value = ''
  factionImageError.value = ''
  clearFactionPendingFile()
  factionSavedImagePath.value = ''
  Object.assign(factionForm, emptyFactionForm())
}

function startEditFaction(f) {
  resetFactionForm()
  factionForm.id = f.id
  factionForm.name = f.name
  factionForm.description = f.description || ''
  factionForm.active = !!f.active
  factionForm.sortOrder = f.sortOrder
  factionSavedImagePath.value = f.bannerImagePath || ''
}

function onFactionFile(ev) {
  factionImageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    factionImageError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    factionImageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearFactionPendingFile()
  factionPendingFile.value = f
  factionPendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadFactionImageFor(id) {
  if (!factionPendingFile.value || !id) return
  factionUploadingImage.value = true
  factionImageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', factionPendingFile.value)
    const res = await $fetch(`/api/admin/cmoon-enemy-factions/${id}/image`, { method: 'POST', body: fd })
    factionSavedImagePath.value = res.bannerImagePath || factionSavedImagePath.value
    clearFactionPendingFile()
  } catch (e) {
    factionImageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    factionUploadingImage.value = false
  }
}

async function uploadFactionImage() {
  if (!factionPendingFile.value || !factionForm.id) return
  await uploadFactionImageFor(factionForm.id)
  await load()
}

async function saveFaction() {
  factionFormError.value = ''
  if (!factionForm.name.trim()) { factionFormError.value = 'Name is required.'; return }

  factionSaving.value = true
  try {
    const body = {
      name: factionForm.name.trim(),
      description: factionForm.description.trim() || null,
      active: factionForm.active,
      sortOrder: Math.trunc(Number(factionForm.sortOrder)) || 0,
    }
    if (factionForm.id) {
      await $fetch(`/api/admin/cmoon-enemy-factions/${factionForm.id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-enemy-factions', { method: 'POST', body })
      factionForm.id = res.id
    }
    if (factionPendingFile.value) await uploadFactionImageFor(factionForm.id)
    resetFactionForm()
    await load()
  } catch (e) {
    factionFormError.value = e?.data?.statusMessage || 'Failed to save faction'
  } finally {
    factionSaving.value = false
  }
}

async function removeFaction(f) {
  if (f.memberCount > 0) return
  if (!confirm(`Delete faction "${f.name}"? This can't be undone.`)) return
  deletingFactionId.value = f.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-factions/${f.id}`, { method: 'DELETE' })
    if (factionForm.id === f.id) resetFactionForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete faction'
  } finally {
    deletingFactionId.value = ''
  }
}

// ── Members ────────────────────────────────────────────────────────
const memberSaving = ref(false)
const memberFormError = ref('')
const deletingMemberId = ref('')
const resettingId = ref('')
const editingMemberHasBattles = ref(false)
const editingMemberRewards = ref([])
const memberPendingFile = ref(null)
const memberPendingFilePreviewUrl = ref(null)
const memberUploadingImage = ref(false)
const memberImageError = ref('')
const memberSavedImagePath = ref('')

const emptyMemberForm = () => ({
  id: '', factionId: '', name: '', maxHp: 5, battleMode: 'PER_PLAYER',
  cMoonPointsReward: 10, active: true, sortOrder: 0,
})
const memberForm = reactive(emptyMemberForm())
const memberPreviewImageSrc = computed(() => memberPendingFilePreviewUrl.value || memberSavedImagePath.value || '')

function clearMemberPendingFile() {
  if (memberPendingFilePreviewUrl.value) { try { URL.revokeObjectURL(memberPendingFilePreviewUrl.value) } catch {} }
  memberPendingFile.value = null
  memberPendingFilePreviewUrl.value = null
}

function resetMemberForm() {
  memberFormError.value = ''
  memberImageError.value = ''
  clearMemberPendingFile()
  memberSavedImagePath.value = ''
  editingMemberHasBattles.value = false
  editingMemberRewards.value = []
  resetRewardForm()
  Object.assign(memberForm, emptyMemberForm())
  if (memberFactionFilter.value) memberForm.factionId = memberFactionFilter.value
}

function startEditMember(m) {
  resetMemberForm()
  Object.assign(memberForm, {
    id: m.id, factionId: m.factionId, name: m.name, maxHp: m.maxHp, battleMode: m.battleMode,
    cMoonPointsReward: m.cMoonPointsReward, active: !!m.active, sortOrder: m.sortOrder,
  })
  memberSavedImagePath.value = m.imagePath || ''
  editingMemberHasBattles.value = !!m.hasBattles
  editingMemberRewards.value = m.rewards || []
}

function onMemberFile(ev) {
  memberImageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    memberImageError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    memberImageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearMemberPendingFile()
  memberPendingFile.value = f
  memberPendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadMemberImageFor(id) {
  if (!memberPendingFile.value || !id) return
  memberUploadingImage.value = true
  memberImageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', memberPendingFile.value)
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${id}/image`, { method: 'POST', body: fd })
    memberSavedImagePath.value = res.imagePath || memberSavedImagePath.value
    clearMemberPendingFile()
  } catch (e) {
    memberImageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    memberUploadingImage.value = false
  }
}

async function uploadMemberImage() {
  if (!memberPendingFile.value || !memberForm.id) return
  await uploadMemberImageFor(memberForm.id)
  await load()
}

async function saveMember() {
  memberFormError.value = ''
  if (!memberForm.factionId) { memberFormError.value = 'Pick a faction.'; return }
  if (!memberForm.name.trim()) { memberFormError.value = 'Name is required.'; return }
  const maxHp = Math.trunc(Number(memberForm.maxHp))
  if (!Number.isInteger(maxHp) || maxHp < 1 || maxHp > 200) { memberFormError.value = 'Max HP must be between 1 and 200.'; return }
  const cMoonPointsReward = Math.trunc(Number(memberForm.cMoonPointsReward))
  if (!Number.isInteger(cMoonPointsReward) || cMoonPointsReward < 0 || cMoonPointsReward > 5000) {
    memberFormError.value = 'cMoon points reward must be between 0 and 5000.'
    return
  }

  memberSaving.value = true
  try {
    const body = {
      factionId: memberForm.factionId,
      name: memberForm.name.trim(),
      maxHp,
      battleMode: memberForm.battleMode,
      cMoonPointsReward,
      active: memberForm.active,
      sortOrder: Math.trunc(Number(memberForm.sortOrder)) || 0,
    }
    let id = memberForm.id
    if (id) {
      await $fetch(`/api/admin/cmoon-enemy-members/${id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-enemy-members', { method: 'POST', body })
      id = res.id
      memberForm.id = id
    }
    if (memberPendingFile.value) await uploadMemberImageFor(id)
    await load()
    // Re-select the freshly saved member from the reloaded list so its rewards/hasBattles reflect
    // the DB, rather than trusting this form's own local state.
    const fresh = members.value.find(m => m.id === id)
    if (fresh) startEditMember(fresh)
  } catch (e) {
    memberFormError.value = e?.data?.statusMessage || 'Failed to save member'
  } finally {
    memberSaving.value = false
  }
}

async function removeMember(m) {
  if (m.hasBattles) return
  if (!confirm(`Delete member "${m.name}"? This can't be undone.`)) return
  deletingMemberId.value = m.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${m.id}`, { method: 'DELETE' })
    if (memberForm.id === m.id) resetMemberForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete member'
  } finally {
    deletingMemberId.value = ''
  }
}

async function resetMember(m) {
  resettingId.value = m.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${m.id}/reset`, { method: 'POST' })
    await load()
    if (memberForm.id === m.id) {
      const fresh = members.value.find(x => x.id === m.id)
      if (fresh) startEditMember(fresh)
    }
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to revive member'
  } finally {
    resettingId.value = ''
  }
}

// ── Rewards (per-member, add/remove one row at a time) ──────────────
const rewardSaving = ref(false)
const rewardFormError = ref('')
const deletingRewardId = ref('')
const rewardCtoonSearch = ref('')

const emptyRewardForm = () => ({ rewardType: 'CTOON', ctoonId: '', avatarId: '', backgroundId: '', dropChancePercent: 10, quantity: 1 })
const rewardForm = reactive(emptyRewardForm())

function resetRewardForm() {
  rewardFormError.value = ''
  rewardCtoonSearch.value = ''
  Object.assign(rewardForm, emptyRewardForm())
}

watch(() => rewardForm.rewardType, () => {
  rewardForm.ctoonId = ''
  rewardForm.avatarId = ''
  rewardForm.backgroundId = ''
  rewardCtoonSearch.value = ''
})

const rewardCtoonSelectedName = computed(() => ctoonsCatalog.value.find(c => c.id === rewardForm.ctoonId)?.name || '')
const rewardCtoonSuggestions = computed(() => {
  const v = rewardCtoonSearch.value.trim().toLowerCase()
  if (v.length < 3) return []
  return ctoonsCatalog.value.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
})
function selectRewardCtoon(c) {
  rewardForm.ctoonId = c.id
  rewardCtoonSearch.value = c.name
}

function rewardLabel(r) {
  if (r.rewardType === 'CTOON') return r.ctoon?.name || 'Unknown cToon'
  if (r.rewardType === 'AVATAR') return r.avatar?.label || 'Unknown avatar'
  return r.background?.label || 'Unknown background'
}

async function addReward() {
  rewardFormError.value = ''
  if (!memberForm.id) return
  const dropChancePercent = Number(rewardForm.dropChancePercent)
  if (!Number.isFinite(dropChancePercent) || dropChancePercent < 0 || dropChancePercent > 100) {
    rewardFormError.value = 'Drop chance must be between 0 and 100.'
    return
  }
  const body = { rewardType: rewardForm.rewardType, dropChancePercent }
  if (rewardForm.rewardType === 'CTOON') {
    if (!rewardForm.ctoonId) { rewardFormError.value = 'Pick a cToon.'; return }
    body.ctoonId = rewardForm.ctoonId
    const quantity = Math.trunc(Number(rewardForm.quantity)) || 1
    if (quantity < 1 || quantity > 20) { rewardFormError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else if (rewardForm.rewardType === 'AVATAR') {
    if (!rewardForm.avatarId) { rewardFormError.value = 'Pick an avatar.'; return }
    body.avatarId = rewardForm.avatarId
  } else {
    if (!rewardForm.backgroundId) { rewardFormError.value = 'Pick a background.'; return }
    body.backgroundId = rewardForm.backgroundId
  }

  rewardSaving.value = true
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${memberForm.id}/rewards`, { method: 'POST', body })
    resetRewardForm()
    await load()
    const fresh = members.value.find(m => m.id === memberForm.id)
    if (fresh) editingMemberRewards.value = fresh.rewards || []
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to add prize'
  } finally {
    rewardSaving.value = false
  }
}

async function removeReward(r) {
  if (!confirm('Remove this prize row?')) return
  deletingRewardId.value = r.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-rewards/${r.id}`, { method: 'DELETE' })
    await load()
    const fresh = members.value.find(m => m.id === memberForm.id)
    if (fresh) editingMemberRewards.value = fresh.rewards || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to remove prize'
  } finally {
    deletingRewardId.value = ''
  }
}

onMounted(load)
onBeforeUnmount(() => { clearFactionPendingFile(); clearMemberPendingFile() })
</script>
