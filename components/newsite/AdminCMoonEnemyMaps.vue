<template>
  <div class="admin-cmoon-enemy-maps bg-gray-50 text-xs">
    <div class="px-2 py-2 space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-base font-semibold">Manage cMoon Enemy Maps</h1>
      </div>
      <p class="text-gray-500">
        Animated backgrounds shown during raid battles — NPC cMoon raids and cMoon PvP matches only,
        never solo battles. Each map is off by default; turn it on to let it be rolled by the weighted
        random pool, assign it as a faction's default or a specific raid boss's override in
        <strong>Manage cMoon Enemies</strong>, or both.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── List ───────────────────────────────────────────────────── -->
      <div class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Maps</h2>
        <div v-if="maps.length" class="space-y-1">
          <button
            v-for="m in maps" :key="m.id" type="button"
            class="w-full text-left flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1 hover:bg-gray-100"
            :class="selectedId === m.id ? 'ring-2 ring-blue-500' : ''"
            @click="selectMap(m)"
          >
            <span class="w-3 h-3 rounded-full flex-shrink-0 border" :style="{ backgroundColor: m.backgroundColor }"></span>
            <span class="flex-1 min-w-0 break-words font-semibold">{{ m.name }}</span>
            <span v-if="m.isBaseMap" class="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] flex-shrink-0">Base map</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0" :class="m.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'">
              {{ m.active ? 'Active' : 'Inactive' }}
            </span>
            <span v-if="m.assignedEnemiesOnly" class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] flex-shrink-0">Assigned only</span>
            <span class="text-gray-500 flex-shrink-0">{{ m.factionUsageCount }} faction(s) · {{ m.memberUsageCount }} boss(es)</span>
          </button>
        </div>
        <p v-else class="text-gray-500">No maps yet.</p>
      </div>

      <!-- ── Selected map editor ────────────────────────────────────── -->
      <div v-if="form" class="bg-white border rounded p-3 space-y-3">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">{{ selectedId ? 'Edit map' : 'New map' }}</h2>
          <button
            v-if="selectedId && !form.isBaseMap" type="button"
            class="text-red-600 hover:underline text-[11px]" :disabled="deleting" @click="deleteMap"
          >{{ deleting ? 'Deleting…' : 'Delete map' }}</button>
        </div>
        <p v-if="form.isBaseMap" class="text-[11px] text-gray-500">
          This is the base "No Effect" map shipped with the feature — its name, animation, color, and
          effects are locked; only its occurrence weight is editable, and it can't be deleted.
        </p>
        <p v-if="formError" class="text-red-600">{{ formError }}</p>

        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Name</label>
            <input v-model="form.name" :disabled="form.isBaseMap" maxlength="80" class="w-full border rounded px-2 py-1 disabled:bg-gray-100" />
          </div>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.active" :disabled="form.isBaseMap" />
            <span class="text-[11px] font-medium">Active</span>
          </label>
          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.assignedEnemiesOnly" :disabled="form.isBaseMap" />
            <span class="text-[11px] font-medium">Assigned enemies only</span>
          </label>
        </div>
        <p class="text-[11px] text-gray-500">
          "Assigned enemies only" keeps this map OUT of the random pool entirely — it only ever shows up
          when it's a faction's default map or a specific raid boss's override map.
        </p>

        <div class="flex gap-2 flex-wrap items-end">
          <div class="w-36">
            <label class="block text-[11px] font-medium mb-1">Background animation</label>
            <select v-model="form.backgroundAnimation" :disabled="form.isBaseMap" class="w-full border rounded px-2 py-1 disabled:bg-gray-100">
              <option value="GLOW">Glow</option>
              <option value="SMOKE">Smoke</option>
              <option value="GLITTER">Glitter</option>
              <option value="STATIC_COLOR">Static color</option>
            </select>
          </div>
          <div class="w-28">
            <label class="block text-[11px] font-medium mb-1">Color</label>
            <input v-model="form.backgroundColor" :disabled="form.isBaseMap" type="color" class="w-full border rounded px-1 py-1 h-8 disabled:bg-gray-100" />
          </div>
          <div class="w-32">
            <label class="block text-[11px] font-medium mb-1">Occurrence weight (1-100)</label>
            <input v-model.number="form.occurrenceWeight" type="number" min="1" max="100" class="w-full border rounded px-2 py-1" />
          </div>
        </div>

        <div class="pt-2 border-t space-y-2">
          <h3 class="font-semibold text-xs">Effects</h3>

          <div class="w-48">
            <label class="block text-[11px] font-medium mb-1">Special-attack threshold reduction (0-9)</label>
            <input
              v-model.number="form.specialThresholdReduction" :disabled="form.isBaseMap"
              type="number" min="0" max="9" class="w-full border rounded px-2 py-1 disabled:bg-gray-100"
            />
          </div>
          <p class="text-[11px] text-gray-500">
            Lowers how many consecutive hits everyone needs to charge a special attack — applies
            symmetrically to players and NPCs alike. 0 = no change.
          </p>

          <div class="flex gap-2 flex-wrap items-end">
            <div class="w-28">
              <label class="block text-[11px] font-medium mb-1">Poison amount (0-100)</label>
              <input v-model.number="form.poisonAmount" :disabled="form.isBaseMap" type="number" min="0" max="100" class="w-full border rounded px-2 py-1 disabled:bg-gray-100" />
            </div>
            <div class="w-32">
              <label class="block text-[11px] font-medium mb-1">Every N rounds (0-50)</label>
              <input v-model.number="form.poisonIntervalRounds" :disabled="form.isBaseMap" type="number" min="0" max="50" class="w-full border rounded px-2 py-1 disabled:bg-gray-100" />
            </div>
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.poisonAffectsPlayers" :disabled="form.isBaseMap" />
              <span class="text-[11px] font-medium">Affects players</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.poisonAffectsEnemies" :disabled="form.isBaseMap" />
              <span class="text-[11px] font-medium">Affects NPCs</span>
            </label>
          </div>
          <p class="text-[11px] text-gray-500">
            0 for either field disables the poison tick entirely, regardless of the other. In PvP this
            always hits both teams (no "NPC" side there).
          </p>

          <div class="flex gap-2 flex-wrap items-end">
            <div class="w-28">
              <label class="block text-[11px] font-medium mb-1">Heal amount (0-100)</label>
              <input v-model.number="form.healAmount" :disabled="form.isBaseMap" type="number" min="0" max="100" class="w-full border rounded px-2 py-1 disabled:bg-gray-100" />
            </div>
            <div class="w-32">
              <label class="block text-[11px] font-medium mb-1">Every N rounds (0-50)</label>
              <input v-model.number="form.healIntervalRounds" :disabled="form.isBaseMap" type="number" min="0" max="50" class="w-full border rounded px-2 py-1 disabled:bg-gray-100" />
            </div>
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.healAffectsPlayers" :disabled="form.isBaseMap" />
              <span class="text-[11px] font-medium">Affects players</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="form.healAffectsEnemies" :disabled="form.isBaseMap" />
              <span class="text-[11px] font-medium">Affects NPCs</span>
            </label>
          </div>

          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="form.fogOfWarEnabled" :disabled="form.isBaseMap" />
            <span class="text-xs font-medium">Fog of war</span>
          </label>
          <p class="text-[11px] text-gray-500">
            In a raid: the boss's own wind-up telegraph never appears. In PvP: each side sees their own
            team's HP but never the opposing team's.
          </p>
        </div>

        <div class="flex gap-2">
          <button
            type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving" @click="saveMap"
          >{{ saving ? 'Saving…' : (selectedId ? 'Save changes' : 'Create map') }}</button>
          <button
            v-if="selectedId" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50"
            @click="selectedId = null; form = null"
          >Cancel</button>
        </div>
      </div>

      <button
        v-else type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
        @click="newMap"
      >+ New map</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const maps = ref([])
const loadError = ref('')
const selectedId = ref(null)
const form = ref(null)
const saving = ref(false)
const deleting = ref(false)
const formError = ref('')

function emptyForm() {
  return {
    name: '', active: false, isBaseMap: false, backgroundAnimation: 'STATIC_COLOR', backgroundColor: '#000000',
    occurrenceWeight: 50, assignedEnemiesOnly: false, specialThresholdReduction: 0,
    poisonAmount: 0, poisonIntervalRounds: 0, poisonAffectsPlayers: true, poisonAffectsEnemies: true,
    healAmount: 0, healIntervalRounds: 0, healAffectsPlayers: true, healAffectsEnemies: true,
    fogOfWarEnabled: false,
  }
}

async function loadMaps() {
  loadError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-enemy-maps')
    maps.value = res?.maps || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load maps'
  }
}

function selectMap(m) {
  selectedId.value = m.id
  formError.value = ''
  form.value = { ...emptyForm(), ...m }
}

function newMap() {
  selectedId.value = null
  formError.value = ''
  form.value = emptyForm()
}

async function saveMap() {
  formError.value = ''
  saving.value = true
  try {
    if (selectedId.value) {
      await $fetch(`/api/admin/cmoon-enemy-maps/${selectedId.value}`, { method: 'PUT', body: { ...form.value } })
    } else {
      await $fetch('/api/admin/cmoon-enemy-maps', { method: 'POST', body: { ...form.value } })
    }
    await loadMaps()
    selectedId.value = null
    form.value = null
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to save map'
  } finally {
    saving.value = false
  }
}

async function deleteMap() {
  if (!selectedId.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/cmoon-enemy-maps/${selectedId.value}`, { method: 'DELETE' })
    await loadMaps()
    selectedId.value = null
    form.value = null
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to delete map'
  } finally {
    deleting.value = false
  }
}

onMounted(loadMaps)
</script>
