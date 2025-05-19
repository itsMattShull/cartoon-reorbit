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
            name="image"
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
          <input
            type="text"
            v-model="type"
            disabled
            class="w-full border rounded p-2 bg-gray-100"
          />
        </div>

        <!-- Name -->
        <div>
          <label class="block mb-1 font-medium">Name</label>
          <input
            v-model="name"
            @blur="formatName"
            type="text"
            required
            class="w-full border rounded p-2"
            placeholder="Enter cToon name"
          />
          <p v-if="errors.name" class="text-red-600 text-sm mt-1">{{ errors.name }}</p>
        </div>

        <!-- Series with autocomplete -->
        <div>
          <label class="block mb-1 font-medium">Series</label>
          <input
            v-model="series"
            list="series-list"
            type="text"
            class="w-full border rounded p-2"
            placeholder="Select or type new series"
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

        <!-- Hidden Asset Path -->
        <input type="hidden" v-model="assetPath" />

        <!-- Release Date & Time (CDT) -->
        <div>
          <label class="block mb-1 font-medium">Release Date &amp; Time (CDT)</label>
          <input
            type="datetime-local"
            v-model="releaseDate"
            :min="minDateTime"
            required
            class="w-full border rounded p-2"
          />
          <p v-if="errors.releaseDate" class="text-red-600 text-sm mt-1">{{ errors.releaseDate }}</p>
        </div>

        <!-- Per-User Limit -->
        <div>
          <label class="block mb-1 font-medium">Per-User Limit</label>
          <input
            v-model.number="perUserLimit"
            type="number"
            min="0"
            class="w-full border rounded p-2"
            placeholder="Leave blank for unlimited"
          />
          <p class="text-sm text-gray-500">
            Leave blank for unlimited. This limit only applies to the first 48 hours after the cToon is released.
          </p>
        </div>

        <!-- Total Quantity -->
        <div>
          <label class="block mb-1 font-medium">Total Quantity in Store</label>
          <input
            v-model.number="totalQuantity"
            type="number"
            min="0"
            class="w-full border rounded p-2"
            placeholder="Leave blank for unlimited"
          />
          <p class="text-sm text-gray-500">
            Number you want available in the store.
          </p>
        </div>

        <!-- Initial Quantity -->
        <div>
          <label class="block mb-1 font-medium">Initial Quantity</label>
          <input
            v-model.number="initialQuantity"
            type="number"
            min="0"
            class="w-full border rounded p-2"
            placeholder="Leave blank for unlimited"
          />
          <p class="text-sm text-gray-500">
            Add a number of First Editions you want to have for this cToon. Leave blank for no First Editions.
          </p>
          <p v-if="errors.initialQuantity" class="text-red-600 text-sm mt-1">{{ errors.initialQuantity }}</p>
        </div>

        <!-- Hidden Code Only & In C-mart -->
        <div class="flex items-center space-x-6">
          <!-- hidden Code Only flag -->
          <input type="checkbox" v-model="codeOnly" hidden />

          <!-- In C-mart -->
          <label class="inline-flex items-center">
            <input
              v-model="inCmart"
              type="checkbox"
              class="mr-2"
              :disabled="['Prize Only','Code Only','Auction Only'].includes(rarity)"
            />
            <span>In C-mart</span>
          </label>
        </div>
        <p v-if="errors.codeOnly" class="text-red-600 text-sm mt-1">{{ errors.codeOnly }}</p>

        <!-- Set -->
        <div>
          <label class="block mb-1 font-medium">Set</label>
          <input v-model="setField" required placeholder="Select or type new series" class="w-full border rounded p-2">
          <p v-if="errors.setField" class="text-red-600 text-sm mt-1">{{ errors.setField }}</p>
        </div>

        <!-- Characters -->
        <div>
          <label class="block mb-1 font-medium">Characters (comma-separated)</label>
          <textarea
            v-model="characters"
            rows="2"
            class="w-full border rounded p-2"
            placeholder="e.g. Alice, Bob, Charlie"
          ></textarea>
          <p v-if="errors.characters" class="text-red-600 text-sm mt-1">{{ errors.characters }}</p>
        </div>

        <!-- Submit -->
        <div class="text-right">
          <button
            type="submit"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Create cToon
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth', 'admin']
})

const router = useRouter()

// --- Timezone helper ---
function getChicagoNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
}

// --- State ---
const name = ref('')
const series = ref('')
const seriesOptions = ref<string[]>([])
const imageFile = ref<File|null>(null)
const type = ref('')
const assetPath = ref('')
const releaseDate = ref('')
const perUserLimit = ref<number|null>(null)
const codeOnly = ref(false)
const inCmart = ref(false)
const price = ref(0)
const totalQuantity = ref<number|null>(null)
const initialQuantity = ref<number|null>(null)
const setField = ref('')
const characters = ref('')
const rarity = ref('')
const rarityOptions = ['Common','Uncommon','Rare','Very Rare','Crazy Rare','Prize Only','Code Only','Auction Only']

// --- Validation errors ---
const errors = reactive({
  image: '',
  name: '',
  series: '',
  rarity: '',
  releaseDate: '',
  initialQuantity: '',
  codeOnly: '',
  setField: '',
  characters: ''
})

// --- Min date/time for release in CDT ---
const minDateTime = computed(() => {
  const now = getChicagoNow()
  const pad = (n: number) => n.toString().padStart(2,'0')
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
})

// --- Fetch existing series ---
onMounted(async () => {
  try {
    const res = await fetch('/api/admin/series', { credentials: 'include' })
    if (res.ok) seriesOptions.value = await res.json()
  } catch (e) {
    console.error('Failed to load series options', e)
  }
})

// Auto-set price & manage flags based on rarity
watch(rarity, val => {
  switch (val) {
    case 'Common': price.value = 100; break
    case 'Uncommon': price.value = 200; break
    case 'Rare': price.value = 400; break
    case 'Very Rare': price.value = 750; break
    case 'Crazy Rare': price.value = 1250; break
    default: price.value = 0
  }
  codeOnly.value = (val === 'Code Only')
  if (['Prize Only','Code Only','Auction Only'].includes(val)) {
    inCmart.value = false
  }
})

// Update assetPath when series or file changes
watch([series, imageFile], ([s,f]) => {
  if (s && f) assetPath.value = `/public/cToons/${s}/${f.name}`
})

// --- Handle file upload & set MIME type ---
function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  imageFile.value = null
  errors.image = ''
  if (!f) {
    errors.image = 'Image is required.'
    return
  }
  if (!['image/png','image/gif'].includes(f.type)) {
    errors.image = 'Only PNG or GIF files allowed.'
    return
  }
  imageFile.value = f
  type.value = f.type
}

// --- Validation ---
function validate() {
  for (const key in errors) errors[key] = ''
  if (!imageFile.value) errors.image = 'Image is required.'
  if (!name.value.trim()) errors.name = 'Name is required.'
  if (!series.value.trim()) errors.series = 'Series is required.'
  if (!rarity.value) errors.rarity = 'Rarity is required.'
  if (!releaseDate.value) {
    errors.releaseDate = 'Release date/time is required.'
  } else if (new Date(releaseDate.value) <= new Date()) {
    errors.releaseDate = 'Release date/time must be in the future.'
  }
  const init = initialQuantity.value
  const tot = totalQuantity.value
  if (init != null && tot != null && init > tot) {
    errors.initialQuantity = 'Initial must be less than total quantity.'
  }
  if (codeOnly.value && inCmart.value) {
    errors.codeOnly = 'If Code Only is true, In C-mart must be false.'
  }
  if (!setField.value) errors.setField = 'Set is required.'
  const charsArr = characters.value.split(',').map(c=>c.trim()).filter(c=>c)
  if (charsArr.length === 0) errors.characters = 'At least one character is required.'
  return Object.values(errors).every(msg => !msg)
}

// --- Submission ---
async function submitForm() {
  if (!validate()) return
  const charsArr = characters.value.split(',').map(c=>c.trim()).filter(c=>c)
  const localDate = new Date(releaseDate.value)
  const utcRelease = localDate.toISOString()

  const formData = new FormData()
  formData.append('image', imageFile.value!)
  formData.append('name', name.value)
  formData.append('series', series.value)
  formData.append('type', type.value)
  formData.append('rarity', rarity.value)
  formData.append('assetPath', assetPath.value)
  formData.append('releaseDate', utcRelease)
  if (perUserLimit.value != null) formData.append('perUserLimit', `${perUserLimit.value}`)
  formData.append('codeOnly', `${codeOnly.value}`)
  formData.append('inCmart', `${inCmart.value}`)
  formData.append('price', `${price.value}`)
  if (totalQuantity.value != null) formData.append('totalQuantity', `${totalQuantity.value}`)
  if (initialQuantity.value != null) formData.append('initialQuantity', `${initialQuantity.value}`)
  formData.append('set', setField.value)
  formData.append('characters', JSON.stringify(charsArr))

  try {
    const res = await fetch('/api/admin/ctoon', {
      method: 'POST',
      credentials: 'include',
      body: formData
    })
    if (!res.ok) throw new Error(await res.text() || 'Failed to create cToon')
    router.push('/admin/ctoons')
  } catch (e) {
    console.error(e)
    alert('Error: ' + (e as Error).message)
  }
}
</script>

<style scoped>
th, td { vertical-align: middle; }
.max-w-2xl { max-width: 768px; }
</style>