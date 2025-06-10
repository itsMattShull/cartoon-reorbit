<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Add New cToon</h1>
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Image Upload -->
        <div>
          <label class="block mb-1 font-medium">Upload Image (PNG or GIF)</label>
          <input type="file" accept="image/png,image/gif" @change="handleFile" required class="w-full" />
          <p class="text-sm text-gray-500">This image will represent the cToon visually. PNG or GIF only.</p>
          <p v-if="errors.image" class="text-red-600 text-sm mt-1">{{ errors.image }}</p>
        </div>

        <!-- Type (auto-filled) -->
        <div>
          <label class="block mb-1 font-medium">Type</label>
          <input type="text" v-model="type" disabled class="w-full border rounded p-2 bg-gray-100" />
          <p class="text-sm text-gray-500">Automatically determined from uploaded file.</p>
        </div>

        <!-- Name -->
        <div>
          <label class="block mb-1 font-medium">Name</label>
          <input v-model="name" type="text" required class="w-full border rounded p-2" placeholder="Enter cToon name" />
          <p class="text-sm text-gray-500">The display name for this cToon.</p>
          <p v-if="errors.name" class="text-red-600 text-sm mt-1">{{ errors.name }}</p>
        </div>

        <!-- Series -->
        <div>
          <label class="block mb-1 font-medium">Series</label>
          <input v-model="series" list="series-list" required class="w-full border rounded p-2" />
          <datalist id="series-list">
            <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
          </datalist>
          <p class="text-sm text-gray-500">Used to group similar cToons. Choose from existing or enter a new one.</p>
          <p v-if="errors.series" class="text-red-600 text-sm mt-1">{{ errors.series }}</p>
        </div>

        <!-- Set -->
        <div>
          <label class="block mb-1 font-medium">Set</label>
          <input v-model="set" list="sets-list" required class="w-full border rounded p-2" />
          <datalist id="sets-list">
            <option v-for="opt in setsOptions" :key="opt" :value="opt" />
          </datalist>
          <p class="text-sm text-gray-500">Which collectible set this cToon belongs to. Choose from existing or enter a new one.</p>
        </div>

        <!-- Characters -->
        <div>
          <label class="block mb-1 font-medium">Characters (comma-separated)</label>
          <input v-model="characters" required class="w-full border rounded p-2" placeholder="e.g. Amy,Bob" />
          <p class="text-sm text-gray-500">List all characters featured in this cToon.</p>
        </div>

        <!-- Release Date -->
        <div>
          <label class="block mb-1 font-medium">Release Date</label>
          <input v-model="releaseDate" type="datetime-local" required class="w-full border rounded p-2" />
          <p class="text-sm text-gray-500">Must be set in the future. Determines when the cToon becomes available.</p>
        </div>

        <!-- Quantities -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block mb-1 font-medium">Total Quantity</label>
            <input v-model.number="totalQuantity" type="number" min="1" class="w-full border rounded p-2" />
            <p class="text-sm text-gray-500">Maximum number that can be minted. Leave blank for unlimited.</p>
          </div>
          <div>
            <label class="block mb-1 font-medium">Initial Quantity</label>
            <input v-model.number="initialQuantity" type="number" min="0" class="w-full border rounded p-2" />
            <p class="text-sm text-gray-500">Number of First Editions available. Must be ≤ total quantity.</p>
          </div>
        </div>

        <!-- Per User Limit -->
        <div>
          <label class="block mb-1 font-medium">Per-User Limit</label>
          <input v-model.number="perUserLimit" type="number" min="0" class="w-full border rounded p-2" />
          <p class="text-sm text-gray-500">Limit on how many each user can mint within the first 48 hours of release. Leave blank for no limit.</p>
        </div>

        <!-- Code Only / In Cmart -->
        <div class="flex items-center space-x-4">
          <label class="flex items-center">
            <input type="checkbox" v-model="inCmart" class="mr-2" /> In Cmart
          </label>
        </div>
        <p class="text-sm text-gray-500">Check "Code Only" for exclusive reward drops. Check "In Cmart" to list in shop.</p>

        <!-- Price -->
        <div>
          <label class="block mb-1 font-medium">Price</label>
          <input type="number" v-model.number="price" class="w-full border rounded p-2" />
          <p class="text-sm text-gray-500">Defaults based on rarity, but you can adjust it here.</p>
        </div>

        <!-- Submit -->
        <div class="text-right">
          <button class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">Create cToon</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

const router = useRouter()
const name = ref('')
const series = ref('')
const type = ref('')
const rarity = ref('')
const set = ref('')
const characters = ref('')
const releaseDate = ref('')
const totalQuantity = ref(null)
const initialQuantity = ref(null)
const perUserLimit = ref(null)
const codeOnly = ref(false)
const inCmart = ref(false)
const price = ref(0)
const imageFile = ref(null)
const seriesOptions = ref([])
const setsOptions = ref([])

const errors = reactive({ image: '', name: '', series: '', rarity: '' })
const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

onMounted(async () => {
  const [seriesRes, setsRes] = await Promise.all([
    fetch('/api/admin/series', { credentials: 'include' }),
    fetch('/api/admin/sets', { credentials: 'include' })
  ])
  seriesOptions.value = await seriesRes.json()
  setsOptions.value = await setsRes.json()
})

watch(rarity, val => {
  const pricing = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }
  price.value = pricing[val] || 0
  codeOnly.value = val === 'Code Only'
  if (val === 'Code Only') inCmart.value = false

  switch (val) {
    case 'Common':
      initialQuantity.value = 100
      totalQuantity.value = 100
      perUserLimit.value = null
      break
    case 'Uncommon':
      initialQuantity.value = 75
      totalQuantity.value = 75
      perUserLimit.value = null
      break
    case 'Rare':
      initialQuantity.value = 50
      totalQuantity.value = 50
      perUserLimit.value = 3
      break
    case 'Very Rare':
      initialQuantity.value = 35
      totalQuantity.value = 35
      perUserLimit.value = 2
      break
    case 'Crazy Rare':
      initialQuantity.value = 25
      totalQuantity.value = 25
      perUserLimit.value = 1
      break
  }
})

function handleFile(e) {
  const file = e.target.files[0]
  errors.image = ''
  if (!file) {
    errors.image = 'Image is required.'
    return
  }
  if (!['image/png', 'image/gif'].includes(file.type)) {
    errors.image = 'Only PNG or GIF files allowed.'
    return
  }
  imageFile.value = file
  type.value = file.type
}

async function submitForm() {
  if (!name.value.trim()) errors.name = 'Name is required.'
  if (!series.value.trim()) errors.series = 'Series is required.'
  if (!rarity.value) errors.rarity = 'Rarity is required.'
  if (Object.values(errors).some(e => e)) return

  const formData = new FormData()
  formData.append('image', imageFile.value)
  formData.append('name', name.value)
  formData.append('series', series.value)
  formData.append('type', type.value)
  formData.append('rarity', rarity.value)
  formData.append('set', set.value)
  formData.append('characters', JSON.stringify(characters.value.split(',').map(c => c.trim())))
  const utcRelease = new Date(releaseDate.value).toISOString()
  formData.append('releaseDate', utcRelease)
  formData.append('totalQuantity', totalQuantity.value ?? '')
  formData.append('initialQuantity', initialQuantity.value ?? '')
  formData.append('perUserLimit', perUserLimit.value ?? '')
  formData.append('codeOnly', codeOnly.value)
  formData.append('inCmart', inCmart.value)
  formData.append('price', price.value)

  const res = await fetch('/api/admin/ctoon', {
    method: 'POST',
    credentials: 'include',
    body: formData
  })

  if (res.ok) router.push('/admin/ctoons')
  else alert('Failed to create cToon')
}
</script>

<style scoped>
th, td { vertical-align: middle; }
.max-w-2xl { max-width: 768px; }
</style>
