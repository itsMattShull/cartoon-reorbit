<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <!-- Toast Notifications -->
    <div v-for="t in toasts" :key="t.id">
      <Toast :message="t.message" :type="t.type" />
    </div>

    <!-- Step 1: Image Selection -->
    <div v-if="step === 1" class="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Bulk Upload cToons - Step 1: Select Images</h1>
      <div>
        <label class="block mb-1 font-medium">Upload Images (PNG or GIF, multiple)</label>
        <input
          type="file"
          accept="image/png,image/gif"
          multiple
          @change="handleFiles"
          class="w-full"
        />
        <p class="text-sm text-gray-500">Select all the images you want to include.</p>
      </div>
      <div v-if="ctoons.length" class="mt-4 grid grid-cols-4 gap-4">
        <div v-for="(c, idx) in ctoons" :key="idx" class="p-2 border rounded">
          <img :src="c.preview" class="h-24 w-full object-contain rounded" />
          <p class="text-sm text-center mt-2 truncate">{{ c.name }}</p>
        </div>
      </div>
      <div class="mt-6 text-right">
        <button
          class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          :disabled="!ctoons.length"
          @click="nextStep"
        >
          Next: Details
        </button>
      </div>
    </div>

    <!-- Step 2: Details & Upload -->
    <div v-else class="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Bulk Upload cToons - Step 2: Details</h1>
      <form @submit.prevent="uploadCtoons" class="space-y-6">
        <!-- Set, Series, Release Date -->
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block mb-1 font-medium">Set</label>
            <input v-model="bulkSet" list="sets-list" required class="w-full border rounded p-2" />
            <datalist id="sets-list">
              <option v-for="opt in setsOptions" :key="opt" :value="opt" />
            </datalist>
          </div>
          <div>
            <label class="block mb-1 font-medium">Series</label>
            <input v-model="bulkSeries" list="series-list" required class="w-full border rounded p-2" />
            <datalist id="series-list">
              <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
            </datalist>
          </div>
          <div>
            <label class="block mb-1 font-medium">Release Date</label>
            <input v-model="bulkReleaseDate" type="datetime-local" required class="w-full border rounded p-2" />
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full table-auto border-collapse">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-4 py-2 text-left">Preview</th>
                <th class="px-4 py-2 text-left">Name</th>
                <th class="px-4 py-2 text-left">Rarity</th>
                <th class="px-4 py-2 text-left">Characters</th>
                <th class="px-4 py-2 text-right">Total Quantity</th>
                <th class="px-4 py-2 text-right">Initial Quantity</th>
                <th class="px-4 py-2 text-right">Per-User Limit</th>
                <th class="px-4 py-2 text-center">In C-mart</th>
                <th class="px-4 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, idx) in ctoons" :key="idx" class="border-b hover:bg-gray-50">
                <td class="px-4 py-2">
                  <img :src="c.preview" class="h-16 w-auto rounded" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="c.name" type="text" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2">
                  <select v-model="c.rarity" @change="updateDefaults(idx)" class="w-full border rounded p-1">
                    <option disabled value="">Select</option>
                    <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </td>
                <td class="px-4 py-2">
                  <input v-model="c.characters" type="text" placeholder="Amy,Bob" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input v-model.number="c.totalQuantity" type="number" min="1" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input v-model.number="c.initialQuantity" type="number" min="0" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input v-model.number="c.perUserLimit" type="number" min="0" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2 text-center">
                  <input type="checkbox" v-model="c.inCmart" />
                </td>
                <td class="px-4 py-2 text-right">
                  <input v-model.number="c.price" type="number" class="w-full border rounded p-1" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="space-y-4 block sm:hidden">
          <div v-for="(c, idx) in ctoons" :key="idx" class="bg-gray-100 rounded-lg p-4">
            <div class="flex items-center space-x-4">
              <img :src="c.preview" class="w-20 h-20 object-contain rounded" />
              <div class="flex-1 space-y-2">
                <input v-model="c.name" type="text" class="w-full border rounded p-1" placeholder="Name" />
                <select v-model="c.rarity" @change="updateDefaults(idx)" class="w-full border rounded p-1">
                  <option disabled value="">Select Rarity</option>
                  <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <input v-model="c.characters" type="text" placeholder="Characters (comma-separated)" class="w-full border rounded p-1" />
                <div class="grid grid-cols-2 gap-2">
                  <input v-model.number="c.totalQuantity" type="number" min="1" placeholder="Total Qty" class="w-full border rounded p-1" />
                  <input v-model.number="c.initialQuantity" type="number" min="0" placeholder="Initial Qty" class="w-full border rounded p-1" />
                  <input v-model.number="c.perUserLimit" type="number" min="0" placeholder="Per-User" class="w-full border rounded p-1" />
                  <div class="flex items-center">  
                    <input type="checkbox" v-model="c.inCmart" class="mr-2" /> In C-mart
                  </div>
                </div>
                <input v-model.number="c.price" type="number" placeholder="Price" class="w-full border rounded p-1" />
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="flex justify-between">
          <button
            type="button"
            class="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
            @click="prevStep"
            :disabled="uploading"
          >
            Back
          </button>
          <button
            type="submit"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
            :disabled="uploading"
          >
            {{ uploading ? 'Uploading cToons...' : 'Upload cToons' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'
import Toast from '~/components/Toast.vue'

definePageMeta({ middleware: ['auth', 'admin'], layout: 'default' })

const router = useRouter()
const toasts = ref([])

function addToast(message, type = 'error') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }, 5000)
}

const step = ref(1)
const ctoons = reactive([])
const setsOptions = ref([])
const seriesOptions = ref([])
const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']
const bulkSet = ref('')
const bulkSeries = ref('')
const bulkReleaseDate = ref('')
const uploading = ref(false)

onMounted(async () => {
  const [seriesRes, setsRes] = await Promise.all([
    fetch('/api/admin/series', { credentials: 'include' }),
    fetch('/api/admin/sets', { credentials: 'include' })
  ])
  seriesOptions.value = await seriesRes.json()
  setsOptions.value = await setsRes.json()
})

function handleFiles(e) {
  const files = Array.from(e.target.files || [])
  ctoons.splice(0)
  files.forEach(file => {
    const name = file.name.replace(/\.[^.]+$/, '')
    ctoons.push({
      file,
      preview: URL.createObjectURL(file),
      name,
      rarity: '',
      characters: '',
      totalQuantity: null,
      initialQuantity: null,
      perUserLimit: null,
      inCmart: false,
      price: 0
    })
  })
}

function nextStep() { if (ctoons.length) step.value = 2 }
function prevStep() { step.value = 1 }

function updateDefaults(idx) {
  const c = ctoons[idx]
  const pricing = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }
  c.price = pricing[c.rarity] || 0
  switch (c.rarity) {
    case 'Common': c.totalQuantity = 100; c.initialQuantity = 100; c.perUserLimit = null; c.inCmart = true; break
    case 'Uncommon': c.totalQuantity = 75; c.initialQuantity = 75; c.perUserLimit = null; c.inCmart = true; break
    case 'Rare': c.totalQuantity = 50; c.initialQuantity = 50; c.perUserLimit = 3; c.inCmart = true; break
    case 'Very Rare': c.totalQuantity = 35; c.initialQuantity = 35; c.perUserLimit = 2; c.inCmart = true; break
    case 'Crazy Rare': c.totalQuantity = 25; c.initialQuantity = 25; c.perUserLimit = 2; c.inCmart = true; break
  }
}

async function uploadCtoons() {
  uploading.value = true
  const errors = []
  for (const c of ctoons) {
    if (!c.name.trim() || !c.rarity || !bulkSet.value || !bulkSeries.value || !bulkReleaseDate.value) {
      errors.push(`${c.name}: missing required fields`)
      continue
    }
    const form = new FormData()
    form.append('image', c.file)
    form.append('name', c.name)
    form.append('series', bulkSeries.value)
    form.append('type', c.file.type)
    form.append('rarity', c.rarity)
    form.append('set', bulkSet.value)
    form.append('characters', JSON.stringify(c.characters.split(',').map(x => x.trim())))
    form.append('releaseDate', new Date(bulkReleaseDate.value).toISOString())
    form.append('totalQuantity', c.totalQuantity ?? '')
    form.append('initialQuantity', c.initialQuantity ?? '')
    form.append('perUserLimit', c.perUserLimit ?? '')
    form.append('inCmart', c.inCmart)
    form.append('price', c.price)
    try {
      const res = await fetch('/api/admin/ctoon', {
        method: 'POST', credentials: 'include', body: form
      })
      if (!res.ok) {
        const msg = await res.text()
        errors.push(`${c.name}: ${msg}`)
      }
    } catch (err) {
      errors.push(`${c.name}: ${err.message}`)
    }
  }
  uploading.value = false
  if (!errors.length) {
    addToast('All cToons uploaded successfully!', 'success')
    router.push('/admin/ctoons')
  } else {
    errors.forEach(e => addToast(e, 'error'))
  }
}
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
