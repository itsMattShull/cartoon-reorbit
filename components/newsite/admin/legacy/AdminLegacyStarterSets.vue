/* =======================================
   pages/admin/starter-sets.vue (JS)
   ======================================= */
<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

    <div class="bg-white rounded border p-3">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2">
        <h1 class="text-base font-semibold">Starter Sets</h1>
        <!-- Create new set -->
        <form class="flex flex-wrap gap-2" @submit.prevent="createSet">
          <input v-model="createForm.name" type="text" required placeholder="New set name"
                 class="border rounded-md px-2 py-1.5 text-sm w-48" />
          <input v-model="createForm.key" type="text" placeholder="Key / slug (optional)"
                 class="border rounded-md px-2 py-1.5 text-sm w-48" />
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700">Create</button>
        </form>
      </div>

      <div class="grid md:grid-cols-3 gap-2">
        <section v-for="set in sets" :key="set.id" class="bg-white border rounded-lg shadow p-2">
          <header class="flex items-center gap-2 mb-2">
            <input v-model="set.name" @change="saveSetBasics(set)"
                   class="font-medium border rounded-md px-2 py-1 text-sm flex-1" />
            <label class="text-[11px] flex items-center gap-1">
              <input type="checkbox" v-model="set.isActive" @change="saveSetBasics(set)" /> Active
            </label>
          </header>

          <div class="flex items-center gap-2 text-[11px] mb-2">
            <span class="text-gray-500">Order</span>
            <input type="number" v-model.number="set.sortOrder" @change="saveSetBasics(set)"
                   class="w-16 border rounded px-1 py-0.5 text-xs" />
          </div>

          <textarea v-model="set.description" @change="saveSetBasics(set)" rows="2"
                    class="w-full border rounded-md px-2 py-1.5 text-sm mb-2" placeholder="Optional description"></textarea>

          <!-- Items -->
          <ul class="border rounded-md divide-y mb-2">
            <li v-for="(it, idx) in set.itemsSorted" :key="it.id" class="flex items-center gap-2 px-2 py-1.5">
              <img v-if="it.ctoon.assetPath" :src="it.ctoon.assetPath" class="w-8 h-8 object-contain flex-shrink-0" />
              <div class="min-w-0">
                <div class="truncate font-medium text-xs">{{ it.ctoon.name }}</div>
                <div class="text-[10px] text-gray-500">Rarity: {{ it.ctoon.rarity }}</div>
              </div>
              <div class="ml-auto flex items-center gap-1">
                <button class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50" :disabled="idx===0" @click="moveItem(set, it, idx-1)">↑</button>
                <button class="px-2 py-1 text-[11px] border rounded-md hover:bg-gray-50" :disabled="idx===set.itemsSorted.length-1" @click="moveItem(set, it, idx+1)">↓</button>
                <button class="px-2 py-1 text-[11px] border rounded-md text-red-700 border-red-200 hover:bg-red-50" @click="removeItem(set, it)">Remove</button>
              </div>
            </li>
            <li v-if="!set.itemsSorted.length" class="p-2 text-[11px] text-gray-500">No items yet.</li>
          </ul>

          <!-- Add item -->
          <div>
            <label class="text-xs font-medium block mb-1">Add cToons to this set</label>
            <input v-model="set.search" @input="onSearch(set)" type="text"
                   placeholder="Type 3+ characters to search by name"
                   class="w-full border rounded-md px-2 py-1.5 text-sm" />
            <div v-if="set.searching" class="text-[10px] text-gray-500 mt-1">Searching…</div>
            <ul v-if="set.results.length" class="mt-2 border rounded-md divide-y max-h-48 overflow-auto">
              <li v-for="r in set.results" :key="r.id" class="p-2 flex items-center gap-2 hover:bg-gray-50">
                <img v-if="r.assetPath" :src="r.assetPath" class="w-7 h-7 object-contain flex-shrink-0" />
                <div class="min-w-0">
                  <div class="text-xs font-medium truncate">{{ r.name }}</div>
                  <div class="text-[10px] text-gray-500">{{ r.rarity }}</div>
                </div>
                <button class="ml-auto px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="addItem(set, r)">Add</button>
              </li>
            </ul>
          </div>

          <footer class="mt-2 flex items-center justify-between text-[11px]">
            <span class="text-gray-500">{{ set.itemsSorted.length }} cToons</span>
            <button class="px-3 py-1 text-xs border rounded-md text-red-700 border-red-200 hover:bg-red-50" @click="deleteSet(set)">Delete Set</button>
          </footer>
        </section>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const sets = ref([])
const createForm = ref({ name: '', key: '' })

async function loadSets() {
  const headers = process.server ? useRequestHeaders(['cookie']) : {}
  const { data, error } = await useFetch('/api/admin/starter-sets', {
    query: { withItems: '1' },
    credentials: 'include',
    headers
  })
  if (error.value) { alert('Failed to load sets'); return }
  const list = (data.value || [])
  sets.value = list.map((s) => ({
    ...s,
    search: '',
    searching: false,
    results: [],
    itemsSorted: [...(s.items || [])].sort((a, b) => a.position - b.position),
  }))
}

onMounted(loadSets)

async function createSet() {
  if (!createForm.value.name.trim()) return
  const body = { name: createForm.value.name, key: createForm.value.key || undefined }
  const { error } = await useFetch('/api/admin/starter-sets', { method: 'POST', body, credentials: 'include' })
  if (error.value) { alert('Failed to create set'); return }
  createForm.value = { name: '', key: '' }
  await loadSets()
}

async function saveSetBasics(s) {
  await useFetch(`/api/admin/starter-sets/${s.id}`, {
    method: 'PATCH',
    body: { name: s.name, description: s.description, isActive: s.isActive, sortOrder: s.sortOrder },
  })
}

async function deleteSet(s) {
  if (!confirm(`Delete "${s.name}"?`)) return
  const { error } = await useFetch(`/api/admin/starter-sets/${s.id}`, { method: 'DELETE', credentials: 'include' })
  if (!error.value) await loadSets()
}

let searchTimer
function onSearch(s) {
  s.results = []
  if (searchTimer) window.clearTimeout(searchTimer)
  if (!s.search || s.search.trim().length < 3) return
  s.searching = true
  searchTimer = window.setTimeout(async () => {
    const { data } = await useFetch('/api/admin/search-ctoons', { query: { q: s.search } })
    s.results = (data.value || [])
    s.searching = false
  }, 350)
}

async function addItem(s, r) {
  if (s.itemsSorted.some((it) => it.ctoon.id === r.id)) return
  const { error } = await useFetch(`/api/admin/starter-sets/${s.id}/items`, { method: 'POST', body: { ctoonId: r.id } })
  if (!error.value) await loadSets()
}

async function moveItem(s, it, newIndex) {
  await useFetch(`/api/admin/starter-sets/${s.id}/items/${it.id}`, { method: 'PATCH', body: { position: newIndex } })
  await loadSets()
}

async function removeItem(s, it) {
  await useFetch(`/api/admin/starter-sets/${s.id}/items/${it.id}`, { method: 'DELETE' })
  await loadSets()
}
</script>

<style scoped>
/* Keep styles minimal to match your admin look */
</style>