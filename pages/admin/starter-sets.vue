/* =======================================
   pages/admin/starter-sets.vue (JS)
   ======================================= */
<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow mt-16 md:mt-20">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 class="text-2xl font-semibold">Starter Sets</h1>
        <!-- Create new set -->
        <form class="flex gap-2" @submit.prevent="createSet">
          <input v-model="createForm.name" type="text" required placeholder="New set name"
                 class="border rounded p-2 w-56" />
          <input v-model="createForm.key" type="text" placeholder="Key / slug (optional)"
                 class="border rounded p-2 w-56" />
          <button class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Create</button>
        </form>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        <section v-for="set in sets" :key="set.id" class="border rounded-lg p-4">
          <header class="flex items-center gap-2 mb-3">
            <input v-model="set.name" @change="saveSetBasics(set)"
                   class="font-medium text-lg border rounded px-2 py-1 flex-1" />
            <label class="text-sm flex items-center gap-2">
              <input type="checkbox" v-model="set.isActive" @change="saveSetBasics(set)" /> Active
            </label>
          </header>

          <div class="flex items-center gap-3 text-sm mb-3">
            <span class="text-gray-600">Order</span>
            <input type="number" v-model.number="set.sortOrder" @change="saveSetBasics(set)"
                   class="w-20 border rounded px-2 py-1" />
          </div>

          <textarea v-model="set.description" @change="saveSetBasics(set)" rows="2"
                    class="w-full border rounded px-2 py-1 mb-3" placeholder="Optional description"></textarea>

          <!-- Items -->
          <ul class="border rounded divide-y mb-3">
            <li v-for="(it, idx) in set.itemsSorted" :key="it.id" class="flex items-center gap-3 p-2">
              <img v-if="it.ctoon.assetPath" :src="it.ctoon.assetPath" class="w-10 h-10 object-contain" />
              <div class="min-w-0">
                <div class="truncate font-medium">{{ it.ctoon.name }}</div>
                <div class="text-xs text-gray-500">Rarity: {{ it.ctoon.rarity }}</div>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <button class="px-2 py-1 border rounded" :disabled="idx===0" @click="moveItem(set, it, idx-1)">↑</button>
                <button class="px-2 py-1 border rounded" :disabled="idx===set.itemsSorted.length-1" @click="moveItem(set, it, idx+1)">↓</button>
                <button class="px-2 py-1 border rounded text-red-600" @click="removeItem(set, it)">Remove</button>
              </div>
            </li>
            <li v-if="!set.itemsSorted.length" class="p-3 text-sm text-gray-500">No items yet.</li>
          </ul>

          <!-- Add item -->
          <div>
            <label class="block mb-1 font-medium">Add cToons to this set</label>
            <input v-model="set.search" @input="onSearch(set)" type="text"
                   placeholder="Type 3+ characters to search by name"
                   class="w-full border rounded px-3 py-2" />
            <div v-if="set.searching" class="text-xs text-gray-500 mt-1">Searching…</div>
            <ul v-if="set.results.length" class="mt-2 border rounded divide-y max-h-48 overflow-auto">
              <li v-for="r in set.results" :key="r.id" class="p-2 flex items-center gap-2 hover:bg-gray-50">
                <img v-if="r.assetPath" :src="r.assetPath" class="w-8 h-8 object-contain" />
                <div class="min-w-0">
                  <div class="text-sm font-medium truncate">{{ r.name }}</div>
                  <div class="text-xs text-gray-500">{{ r.rarity }}</div>
                </div>
                <button class="ml-auto px-2 py-1 bg-indigo-600 text-white rounded" @click="addItem(set, r)">Add</button>
              </li>
            </ul>
          </div>

          <footer class="mt-4 flex items-center justify-between text-sm">
            <span class="text-gray-500">{{ set.itemsSorted.length }} cToons</span>
            <button class="text-red-600" @click="deleteSet(set)">Delete Set</button>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - Starter Sets', middleware: ['auth', 'admin'], layout: 'default' })
import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

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