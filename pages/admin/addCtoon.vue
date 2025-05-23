<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Add New cToon</h1>
      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Image Upload -->
        <div>
          <label class="block mb-1 font-medium">Upload Image (PNG or GIF)</label>
          <input
            type="file"
            accept="image/png,image/gif"
            @change="handleFile"
            required
            class="w-full"
          />
          <p v-if="errors.image" class="text-red-600 text-sm mt-1">{{ errors.image }}</p>
        </div>

        <!-- Type (auto-filled) -->
        <div>
          <label class="block mb-1 font-medium">Type</label>
          <input type="text" v-model="type" disabled class="w-full border rounded p-2 bg-gray-100" />
        </div>

        <!-- Name -->
        <div>
          <label class="block mb-1 font-medium">Name</label>
          <input
            v-model="name"
            type="text"
            required
            class="w-full border rounded p-2"
            placeholder="Enter cToon name"
          />
          <p v-if="errors.name" class="text-red-600 text-sm mt-1">{{ errors.name }}</p>
        </div>

        <!-- Series -->
        <div>
          <label class="block mb-1 font-medium">Series</label>
          <input
            v-model="series"
            list="series-list"
            required
            class="w-full border rounded p-2"
          />
          <datalist id="series-list">
            <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
          </datalist>
          <p v-if="errors.series" class="text-red-600 text-sm mt-1">{{ errors.series }}</p>
        </div>

        <!-- Rarity -->
        <div>
          <label class="block mb-1 font-medium">Rarity</label>
          <select v-model="rarity" required class="w-full border rounded p-2">
            <option disabled value="">Select rarity</option>
            <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <p v-if="errors.rarity" class="text-red-600 text-sm mt-1">{{ errors.rarity }}</p>
        </div>

        <!-- Price (auto-set) -->
        <div>
          <label class="block mb-1 font-medium">Price</label>
          <input
            type="number"
            v-model.number="price"
            readonly
            class="w-full border rounded p-2 bg-gray-100"
          />
        </div>

        <!-- Submit -->
        <div class="text-right">
          <button class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            Create cToon
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth', 'admin']
})
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

const router = useRouter()

const name = ref('')
const series = ref('')
const type = ref('')
const rarity = ref('')
const price = ref(0)
const imageFile = ref(null)
const seriesOptions = ref([])

const errors = reactive({
  image: '',
  name: '',
  series: '',
  rarity: ''
})

const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

onMounted(async () => {
  const res = await fetch('/api/admin/series', { credentials: 'include' })
  seriesOptions.value = await res.json()
})

watch(rarity, val => {
  const pricing = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }
  price.value = pricing[val] || 0
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