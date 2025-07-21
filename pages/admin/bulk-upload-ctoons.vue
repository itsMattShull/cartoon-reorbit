<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <!-- Toast notifications -->
    <Toast
      v-for="t in toasts"
      :key="t.id"
      :message="t.message"
      :type="t.type"
    />

    <div class="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow mt-16">
      <h1 class="text-2xl font-semibold mb-4">Bulk Upload cToons</h1>

      <!-- STEP 1: Image Upload -->
      <div v-if="step === 1" class="space-y-4">
        <label class="block font-medium">Select Images</label>
        <input
          type="file"
          accept="image/png,image/gif"
          multiple
          @change="handleFiles"
          class="w-full"
        />
        <div class="flex flex-wrap gap-4">
          <div
            v-for="(file, i) in imageFiles"
            :key="i"
            class="w-24 h-24 border rounded overflow-hidden"
          >
            <img
              :src="file.preview"
              :alt="file.name"
              class="object-cover w-full h-full"
            />
          </div>
        </div>
        <div class="text-right">
          <button
            @click="step = 2"
            :disabled="!imageFiles.length"
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Next: Details
          </button>
        </div>
      </div>

      <!-- STEP 2: Metadata & Table -->
      <div v-else class="space-y-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="block mb-1 font-medium">Set</label>
            <input
              v-model="bulkSet"
              list="sets-list"
              required
              class="w-full border rounded p-2"
            />
            <datalist v-if="bulkSet.length >= 2" id="sets-list">
              <option
                v-for="opt in filteredBulkSetsOptions"
                :key="opt"
                :value="opt"
              />
            </datalist>
          </div>
          <div>
            <label class="block mb-1 font-medium">Series</label>
            <input
              v-model="bulkSeries"
              list="series-list"
              required
              class="w-full border rounded p-2"
            />
            <datalist v-if="bulkSeries.length >= 2" id="series-list">
              <option
                v-for="opt in filteredBulkSeriesOptions"
                :key="opt"
                :value="opt"
              />
            </datalist>
          </div>
          <div>
            <label class="block mb-1 font-medium">Release Date</label>
            <input
              v-model="bulkReleaseDate"
              type="datetime-local"
              required
              class="w-full border rounded p-2"
            />
          </div>
        </div>

        <!-- Desktop Table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-max table-auto border-separate border-spacing-0">
            <thead>
              <tr class="bg-gray-100">
                <th class="px-4 py-2">Preview</th>
                <th class="px-4 py-2">Name</th>
                <th class="px-4 py-2">Rarity</th>
                <th class="px-4 py-2">Characters</th>
                <th class="px-4 py-2">Total Qty</th>
                <th class="px-4 py-2">Initial Qty</th>
                <th class="px-4 py-2">Per-User Limit</th>
                <th class="px-4 py-2">In cMart</th>
                <th class="px-4 py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in imageFiles" :key="f.nameField+'-'+i" class="border-b">
                <td class="px-4 py-2">
                  <img :src="f.preview" alt class="h-12 w-auto rounded" />
                </td>
                <td class="px-4 py-2">
                  <input v-model="f.nameField" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2">
                  <select v-model="f.rarity" class="w-full border rounded p-1" @change="updateDefaults(f)">
                    <option v-for="opt in rarityOptions" :key="opt" :value="opt">
                      {{ opt }}
                    </option>
                  </select>
                </td>
                <td class="px-4 py-2">
                  <input v-model="f.characters" class="w-full border rounded p-1" placeholder="e.g. Amy,Bob"/>
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="f.totalQuantity" type="number" min="1" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="f.initialQuantity" type="number" min="0" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="f.perUserLimit" type="number" min="0" class="w-full border rounded p-1" />
                </td>
                <td class="px-4 py-2 text-center">
                  <input type="checkbox" v-model="f.inCmart" />
                </td>
                <td class="px-4 py-2">
                  <input v-model.number="f.price" type="number" class="w-full border rounded p-1" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="space-y-4 block sm:hidden">
          <div
            v-for="(f, i) in imageFiles"
            :key="`${f.nameField}-${i}`"
            class="bg-gray-100 rounded-lg p-4"
          >
            <!-- Image on top -->
            <img
              :src="f.preview"
              :alt="f.nameField"
              class="w-full h-40 object-cover rounded mb-4"
            />

            <!-- Fields underneath -->
            <div class="space-y-4">
              <!-- Name -->
              <div>
                <label class="block mb-1 font-medium">Name</label>
                <input
                  v-model="f.nameField"
                  class="w-full border rounded p-2"
                  placeholder="Enter cToon name"
                />
                <p class="text-sm text-gray-500">
                  The display name for this cToon.
                </p>
              </div>

              <!-- Rarity -->
              <div>
                <label class="block mb-1 font-medium">Rarity</label>
                <select
                  v-model="f.rarity"
                  @change="updateDefaults(f)"
                  class="w-full border rounded p-2 bg-white"
                >
                  <option disabled value="">Select rarity</option>
                  <option
                    v-for="opt in rarityOptions"
                    :key="opt"
                    :value="opt"
                  >{{ opt }}</option>
                </select>
                <p class="text-sm text-gray-500">
                  Choose the rarity tier for this cToon.
                </p>
              </div>

              <!-- Characters -->
              <div>
                <label class="block mb-1 font-medium">
                  Characters (comma-separated)
                </label>
                <input
                  v-model="f.characters"
                  class="w-full border rounded p-2"
                  placeholder="e.g. Amy,Bob"
                />
                <p class="text-sm text-gray-500">
                  List all characters featured in this cToon.
                </p>
              </div>

              <!-- Total Quantity -->
              <div>
                <label class="block mb-1 font-medium">Total Quantity</label>
                <input
                  v-model.number="f.totalQuantity"
                  type="number"
                  min="1"
                  class="w-full border rounded p-2"
                  placeholder="Leave blank for unlimited"
                />
                <p class="text-sm text-gray-500">
                  Maximum number that can be minted. Leave blank for unlimited.
                </p>
              </div>

              <!-- Initial Quantity -->
              <div>
                <label class="block mb-1 font-medium">Initial Quantity</label>
                <input
                  v-model.number="f.initialQuantity"
                  type="number"
                  min="0"
                  class="w-full border rounded p-2"
                  placeholder="Number of first editions"
                />
                <p class="text-sm text-gray-500">
                  Number of first editions available. Must be ≤ total quantity.
                </p>
              </div>

              <!-- Per-User Limit -->
              <div>
                <label class="block mb-1 font-medium">Per-User Limit</label>
                <input
                  v-model.number="f.perUserLimit"
                  type="number"
                  min="0"
                  class="w-full border rounded p-2"
                  placeholder="Limit per user"
                />
                <p class="text-sm text-gray-500">
                  Limit on how many each user can mint within the first 48 hours of
                  release. Leave blank for no limit.
                </p>
              </div>

              <!-- In cMart -->
              <div class="flex items-center space-x-2">
                <input
                  type="checkbox"
                  v-model="f.inCmart"
                  class="mr-2"
                />
                <label class="font-medium">In cMart</label>
              </div>
              <p class="text-sm text-gray-500">
                Check to list this cToon in the shop.
              </p>

              <!-- Price -->
              <div>
                <label class="block mb-1 font-medium">Price</label>
                <input
                  v-model.number="f.price"
                  type="number"
                  class="w-full border rounded p-2"
                />
                <p class="text-sm text-gray-500">
                  Defaults based on rarity, but you can adjust it here.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Upload Button -->
        <div class="text-right">
          <button
            @click="uploadAll"
            :disabled="uploading || !canUpload"
            class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {{ uploading ? 'Uploading cToons...' : 'Upload cToons' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import Nav from '~/components/Nav.vue'
import Toast from '~/components/Toast.vue'

const router = useRouter()
const step = ref(1)
const imageFiles = ref([])
const setsOptions = ref([])
const seriesOptions = ref([])
const bulkSet = ref('')
const bulkSeries = ref('')
const bulkReleaseDate = ref('')
const uploading = ref(false)

// only allow upload once every file has a rarity AND a non-empty characters string
const canUpload = computed(() => {
  return (
    // at least one file
    imageFiles.value.length > 0 &&
    // bulk metadata filled
    Boolean(bulkSet.value.trim()) &&
    Boolean(bulkSeries.value.trim()) &&
    Boolean(bulkReleaseDate.value) &&
    // each row has rarity + non-empty characters
    imageFiles.value.every(f =>
      Boolean(f.rarity) &&
      f.characters.trim().length > 0
    )
  )
})

const rarityOptions = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Crazy Rare',
  'Prize Only',
  'Code Only',
  'Auction Only'
]

// toast state
const toasts = ref([])
function showToast(message, type = 'error') {
  const id = Date.now() + Math.random()
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 5000)
}

// apply the same defaults logic as addCtoon.vue
function updateDefaults(f) {
  const pricing = {
    Common: 100,
    Uncommon: 200,
    Rare: 400,
    'Very Rare': 750,
    'Crazy Rare': 1250
  }
  f.price = pricing[f.rarity] ?? 0
  f.inCmart = f.rarity !== 'Code Only'

  switch (f.rarity) {
    case 'Common':
      f.totalQuantity   = 100
      f.initialQuantity = 100
      f.perUserLimit    = null
      break
    case 'Uncommon':
      f.totalQuantity   = 75
      f.initialQuantity = 75
      f.perUserLimit    = null
      break
    case 'Rare':
      f.totalQuantity   = 50
      f.initialQuantity = 50
      f.perUserLimit    = 3
      break
    case 'Very Rare':
      f.totalQuantity   = 35
      f.initialQuantity = 35
      f.perUserLimit    = 2
      break
    case 'Crazy Rare':
      f.totalQuantity   = 25
      f.initialQuantity = 25
      f.perUserLimit    = 2
      break
    default:
      // for Prize Only / Auction Only or others, leave as-is
      break
  }
}

const filteredBulkSetsOptions = computed(() => {
  if (bulkSet.value.length < 2) return []
  return setsOptions.value.filter(opt =>
    opt.toLowerCase().includes(bulkSet.value.toLowerCase())
  )
})

// new: only show bulk-series suggestions once user typed ≥2 chars
const filteredBulkSeriesOptions = computed(() => {
  if (bulkSeries.value.length < 2) return []
  return seriesOptions.value.filter(opt =>
    opt.toLowerCase().includes(bulkSeries.value.toLowerCase())
  )
})

onMounted(async () => {
  const [setsRes, seriesRes] = await Promise.all([
    fetch('/api/admin/sets', { credentials: 'include' }),
    fetch('/api/admin/series', { credentials: 'include' })
  ])
  setsOptions.value = await setsRes.json()
  seriesOptions.value = await seriesRes.json()
})

function handleFiles(e) {
  const files = Array.from(e.target.files)
  imageFiles.value = files.map(file => ({
    file,
    preview: URL.createObjectURL(file),
    nameField: file.name.replace(/\.[^/.]+$/, ''),
    rarity: '',
    characters: '',
    totalQuantity: null,
    initialQuantity: null,
    perUserLimit: null,
    inCmart: false,
    price: 0
  }))
}

async function uploadAll() {
  uploading.value = true
  let allSuccess = true

  for (const f of imageFiles.value) {
    // validate required fields
    if (
      !f.nameField ||
      !f.rarity ||
      !bulkSet.value ||
      !bulkSeries.value ||
      !bulkReleaseDate.value
    ) {
      showToast(`Missing required fields for ${f.nameField}`, 'error')
      allSuccess = false
      continue
    }

    const formData = new FormData()
    formData.append('image', f.file)
    formData.append('name', f.nameField)
    formData.append('series', bulkSeries.value)
    formData.append('type', f.file.type)
    formData.append('rarity', f.rarity)
    formData.append('set', bulkSet.value)
    formData.append(
      'characters',
      JSON.stringify(f.characters.split(',').map(c => c.trim()))
    )
    formData.append(
      'releaseDate',
      new Date(bulkReleaseDate.value).toISOString()
    )
    formData.append('totalQuantity', f.totalQuantity ?? '')
    formData.append('initialQuantity', f.initialQuantity ?? '')
    formData.append('perUserLimit', f.perUserLimit ?? '')
    formData.append('inCmart', f.inCmart)
    formData.append('price', f.price)

    try {
      const res = await fetch('/api/admin/ctoon', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })
      if (!res.ok) {
        const err = await res.text()
        showToast(`Failed upload ${f.nameField}: ${err}`, 'error')
        allSuccess = false
      }
    } catch (err) {
      showToast(`Error uploading ${f.nameField}`, 'error')
      allSuccess = false
    }
  }

  uploading.value = false
  if (allSuccess) {
    showToast('All cToons uploaded successfully!', 'success')
    setTimeout(() => router.push('/admin/ctoons'), 1000)
  }
}
</script>

