<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow mt-16 md:mt-20 relative">
      <h1 class="text-2xl font-semibold mb-4">Edit cToon</h1>

      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Image Display -->
        <div>
          <label class="block mb-1 font-medium">Current Image</label>
          <img :src="assetPath" alt="cToon" class="h-32" />
        </div>

        <!-- Upload New Image -->
        <div>
          <label class="block mb-1 font-medium">Upload New Image (PNG or GIF)</label>
          <input type="file" accept="image/png,image/gif" @change="handleNewFile" class="w-full" />
          <p class="text-sm text-gray-500">Optional. If set, the image and type will update. A timestamped filename will bypass cache.</p>
          <p v-if="err.image" class="text-red-600 text-sm mt-1">{{ err.image }}</p>
          <div v-if="newImagePreview" class="mt-2">
            <label class="block mb-1 font-medium">Preview</label>
            <img :src="newImagePreview" class="h-32" />
          </div>
        </div>

        <!-- Type (read-only) -->
        <div>
          <label class="block mb-1 font-medium">Type</label>
          <input v-model="type" disabled class="w-full border rounded p-2 bg-gray-100" />
        </div>

        <!-- Name -->
        <div>
          <label class="block mb-1 font-medium">Name</label>
          <input v-model="name" required class="w-full border rounded p-2" />
        </div>

        <!-- Series -->
        <div>
          <label class="block mb-1 font-medium">Series</label>
          <input v-model="series" list="series-list" required class="w-full border rounded p-2" />
          <datalist id="series-list">
            <option v-for="opt in seriesOptions" :key="opt" :value="opt" />
          </datalist>
        </div>

        <!-- Rarity -->
        <div>
          <label class="block mb-1 font-medium">Rarity</label>
          <select v-model="rarity" required class="w-full border rounded p-2">
            <option disabled value="">Select rarity</option>
            <option v-for="opt in rarityOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>

        <!-- Price (read-only) -->
        <div>
          <label class="block mb-1 font-medium">Price</label>
          <input type="number" v-model.number="price" readonly class="w-full border rounded p-2 bg-gray-100" />
        </div>

        <!-- Release Date (CDT) -->
        <div>
          <label class="block mb-1 font-medium">Release Date &amp; Time (CDT)</label>
          <input type="datetime-local" v-model="releaseDate" required class="w-full border rounded p-2" />
        </div>

        <!-- Per-User Limit / Quantities -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block mb-1 font-medium">Per-User Limit</label>
            <input v-model.number="perUserLimit" type="number" min="0" class="w-full border rounded p-2" />
          </div>
          <div>
            <label class="block mb-1 font-medium">Total Quantity</label>
            <input v-model.number="quantity" type="number" min="0" class="w-full border rounded p-2" />
          </div>
          <div>
            <label class="block mb-1 font-medium">Initial Quantity</label>
            <input v-model.number="initialQuantity" type="number" min="0" class="w-full border rounded p-2" />
          </div>
        </div>

        <!-- Release schedule (computed, read-only) -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4" v-if="schedule.initialQty != null && schedule.finalAtDisplay">
          <div>
            <label class="block mb-1 font-medium">Initial Release %</label>
            <input
              v-model.number="releasePercent"
              type="number"
              min="1"
              max="100"
              @input="clampReleasePercent"
              class="w-full border rounded p-2"
            />
          </div>
          <div>
            <label class="block mb-1 font-medium">Initial Release Qty</label>
            <input :value="schedule.initialQty" disabled class="w-full border rounded p-2 bg-gray-100" />
          </div>
          <div>
            <label class="block mb-1 font-medium">Final Release At (CST/CDT)</label>
            <input :value="schedule.finalAtDisplay" disabled class="w-full border rounded p-2 bg-gray-100" />
          </div>
          <div>
            <label class="block mb-1 font-medium">Final Release Qty</label>
            <input :value="schedule.finalQty" disabled class="w-full border rounded p-2 bg-gray-100" />
          </div>
        </div>

        <!-- In C-mart -->
        <div class="flex items-center">
          <input v-model="inCmart" type="checkbox" class="mr-2"
                 :disabled="['Prize Only','Code Only','Auction Only'].includes(rarity)" />
          <span>In C-mart</span>
        </div>

        <!-- Set -->
        <div>
          <label class="block mb-1 font-medium">Set</label>
          <input v-model="setField" required class="w-full border rounded p-2" />
        </div>

        <!-- Characters -->
        <div>
          <label class="block mb-1 font-medium">Characters (comma-separated)</label>
          <textarea v-model="characters" rows="2" class="w-full border rounded p-2"></textarea>
        </div>

        <!-- ── G-toon section ───────────────────────────────────── -->
        <div class="flex items-center space-x-4">
          <label class="flex items-center font-medium">
            <input type="checkbox" v-model="isGtoon" class="mr-2" />
            Is this a <strong>G-toon</strong>?
          </label>
        </div>

        <div v-if="isGtoon" class="border p-4 rounded bg-indigo-50 space-y-4">
          <!-- G-toon Type (free text, optional) -->
          <div>
            <label class="block mb-1 font-medium">Type (gToon)</label>
            <input v-model="gtoonType" type="text" class="w-full border rounded p-2" placeholder="e.g. Beast, Robot, Support" />
            <p class="text-sm text-gray-500">Optional. Leave blank if none.</p>
          </div>
          <!-- Cost -->
          <div>
            <label class="block mb-1 font-medium">Cost <span class="text-xs">(0–6)</span></label>
            <input v-model.number="cost" type="number" min="0" max="6" class="w-full border rounded p-2" />
            <p v-if="err.cost" class="text-red-600 text-sm">{{ err.cost }}</p>
          </div>

          <!-- Power -->
          <div>
            <label class="block mb-1 font-medium">Power <span class="text-xs">(0–12)</span></label>
            <input v-model.number="power" type="number" min="0" max="12" class="w-full border rounded p-2" />
            <p v-if="err.power" class="text-red-600 text-sm">{{ err.power }}</p>
          </div>

          <!-- Ability Key -->
          <div>
            <label class="block mb-1 font-medium">Ability</label>
            <select v-model="abilityKey" class="w-full border rounded p-2 bg-white">
              <option value="">None</option>
              <option v-for="a in abilityKeyOptions" :key="a.key" :value="a.key">{{ a.label }}</option>
            </select>
          </div>

          <!-- Ability Param -->
          <div v-if="selectedAbility && selectedAbility.params?.length">
            <label class="block mb-1 font-medium">{{ selectedAbility.paramLabel }}</label>
            <select v-model="abilityParam" class="w-full border rounded p-2 bg-white">
              <option disabled :value="null">Select value</option>
              <option v-for="p in selectedAbility.params" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <!-- Cheat-sheet -->
          <div class="text-xs text-gray-600">
            <p class="font-semibold">Ability cheat-sheet:</p>
            <ul class="list-disc list-inside">
              <li><strong>Flame Bug</strong> – Deals X damage to a random enemy on play.</li>
              <li><strong>Heal Ally</strong> – Heals all friendlies in lane by X.</li>
            </ul>
          </div>
        </div>

        <!-- Submit -->
        <div class="text-right">
          <button class="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            Update cToon
          </button>
        </div>
      </form>

      <Toast v-if="showToast" :message="toastMessage" :type="toastType" />
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Admin - Edit cToon', middleware:['auth','admin'], layout:'default' })

import { ref, reactive, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Nav   from '~/components/Nav.vue'
import Toast from '~/components/Toast.vue'
import abilityMeta from '~/data/abilities.json'

const route = useRoute()
const router = useRouter()
const id = route.params.id

/* core refs */
const name = ref(''); const type = ref('')
const series = ref(''); const rarity = ref('')
const price = ref(0); const releaseDate = ref('')
const perUserLimit = ref(null); const quantity = ref(null)
const initialQuantity = ref(null); const inCmart = ref(false)
const assetPath = ref(''); const setField = ref('')
const characters = ref('')

/* new image refs */
const newImageFile = ref(null)
const newImagePreview = ref('')

/* G-toon refs */
const isGtoon = ref(false)
const cost = ref(0); const power = ref(0)
const abilityKey = ref('')
const abilityParam = ref(null)
const gtoonType = ref('')

const abilityKeyOptions = abilityMeta

const selectedAbility = computed(() =>
  abilityKeyOptions.find(a => a.key === abilityKey.value) || null
)

/* validation errors */
const err = reactive({ cost:'', power:'', image:'' })

/* series + rarity lists */
const seriesOptions = ref([])
const rarityOptions = ['Common','Uncommon','Rare','Very Rare','Crazy Rare','Prize Only','Code Only','Auction Only']
const releasePercent = ref(75)
const delayHours = ref(12)

function clampReleasePercent() {
  const next = Number(releasePercent.value)
  if (!Number.isFinite(next)) {
    releasePercent.value = 1
    return
  }
  releasePercent.value = Math.min(100, Math.max(1, next))
}

/* toast helpers */
const showToast = ref(false)
const toastMessage = ref(''); const toastType = ref('success')
function displayToast(msg, type='error'){ toastMessage.value = msg; toastType.value = type; showToast.value = true; setTimeout(()=>showToast.value = false, 4000) }

/* date helpers (pure JS; America/Chicago) */
function nthSundayDay(year, monthNumber) {
  const monthIdx = monthNumber - 1
  const first = new Date(Date.UTC(year, monthIdx, 1))
  const firstDow = first.getUTCDay() // 0=Sun
  const firstSunday = 1 + ((7 - firstDow) % 7)
  if (monthNumber === 3) return firstSunday + 7 // second Sunday in March
  if (monthNumber === 11) return firstSunday    // first Sunday in November
  return firstSunday
}
function isChicagoDstLocalParts(y, m, d) {
  if (m < 3 || m > 11) return false
  if (m > 3 && m < 11) return true
  if (m === 3) return d >= nthSundayDay(y, 3)
  if (m === 11) return d < nthSundayDay(y, 11)
  return false
}
function toDateTimeLocal(utc) {
  const dt = new Date(utc)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Chicago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
  const parts = Object.fromEntries(fmt.formatToParts(dt).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
function localToUtcIso(localStr) {
  // localStr is 'YYYY-MM-DDTHH:mm' in America/Chicago
  const [datePart, timePart] = localStr.split('T')
  const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10))
  const [hh, mm] = timePart.split(':').map(n => parseInt(n, 10))
  const isDst = isChicagoDstLocalParts(y, m, d)
  const offset = isDst ? '-05:00' : '-06:00'
  const isoLike = `${datePart}T${timePart}:00${offset}`
  return new Date(isoLike).toISOString()
}

/* reset param when ability cleared */
watch(abilityKey, val => {
  if (!val) abilityParam.value = null
})

/* load data */
onMounted(async ()=>{
  try{
    // load staged release settings
    try {
      const rs = await $fetch('/api/release-settings')
      releasePercent.value = Number(rs.initialReleasePercent ?? 75)
      delayHours.value = Number(rs.finalReleaseDelayHours ?? 12)
      clampReleasePercent()
    } catch {}
    const res = await fetch(`/api/admin/ctoon/${id}`,{credentials:'include'})
    if(!res.ok) throw new Error()
    const { ctoon } = await res.json()

    name.value = ctoon.name
    type.value = ctoon.type
    series.value = ctoon.series
    rarity.value = ctoon.rarity
    price.value = ctoon.price
    releaseDate.value = toDateTimeLocal(ctoon.releaseDate)
    perUserLimit.value = ctoon.perUserLimit
    quantity.value = ctoon.quantity
    initialQuantity.value = ctoon.initialQuantity
    inCmart.value = ctoon.inCmart
    assetPath.value = ctoon.assetPath
    setField.value = ctoon.set
    characters.value = (ctoon.characters||[]).join(', ')
    if (ctoon.quantity != null && ctoon.initialReleaseQty != null) {
      const qty = Number(ctoon.quantity)
      const initQty = Number(ctoon.initialReleaseQty)
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(initQty) && initQty > 0) {
        releasePercent.value = Math.round((initQty / qty) * 100)
        clampReleasePercent()
      }
    }

    isGtoon.value   = ctoon.isGtoon
    gtoonType.value = ctoon.gtoonType || ''
    cost.value      = ctoon.cost ?? 0
    power.value     = ctoon.power ?? 0
    abilityKey.value= ctoon.abilityKey || ''
    if(ctoon.abilityData && ctoon.abilityKey) {
      const param = Object.values(ctoon.abilityData)[0]
      if(param != null) abilityParam.value = param
    }

    const sRes = await fetch('/api/admin/series',{credentials:'include'})
    seriesOptions.value = await sRes.json()
  }catch{ displayToast('Error loading cToon') }
})

watch(rarity, v => {
  const map = { Common:100, Uncommon:200, Rare:400, 'Very Rare':750, 'Crazy Rare':1250 }
  price.value = map[v]||0
})

function handleNewFile(e){
  err.image = ''
  const file = e.target.files?.[0]
  if (!file){ newImageFile.value = null; newImagePreview.value = ''; return }
  if (!['image/png','image/gif'].includes(file.type)){
    err.image = 'Only PNG or GIF files allowed.'
    return
  }
  newImageFile.value = file
  type.value = file.type // reflect pending change
  const reader = new FileReader()
  reader.onload = () => { newImagePreview.value = reader.result }
  reader.readAsDataURL(file)
}

// computed schedule for display + advisory persistence
const schedule = computed(() => {
  const qty = Number(quantity.value)
  const hasQty = Number.isFinite(qty) && qty > 0
  const hasDate = Boolean(releaseDate.value)
  if (!hasQty || !hasDate) return { initialQty: null, finalQty: null, finalAt: null, finalAtDisplay: '' }
  const init = Math.max(1, Math.floor((qty * Number(releasePercent.value)) / 100))
  const fin = Math.max(0, qty - init)
  const base = new Date(releaseDate.value)
  const finAt = new Date(base.getTime() + Number(delayHours.value) * 60 * 60 * 1000)
  const finDisplay = finAt.toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false })
  return { initialQty: init, finalQty: fin, finalAt: finAt, finalAtDisplay: finDisplay }
})

/* submit */
async function submitForm(){
  err.cost=''; err.power=''
  if (isGtoon.value) {
    if (cost.value<0||cost.value>6)    err.cost='Cost 0-6'
    if (power.value<0||power.value>12) err.power='Power 0-12'
    if (err.cost || err.power) return
  }
  const gtoonTypeValue = isGtoon.value ? gtoonType.value.trim() : ''

  // If a new image is selected, send multipart; else JSON.
  if (newImageFile.value){
    const fd = new FormData()
    fd.append('image', newImageFile.value)
    fd.append('name', name.value.trim())
    fd.append('series', series.value.trim())
    fd.append('rarity', rarity.value)
    fd.append('price', String(price.value))
    fd.append('releaseDate', localToUtcIso(releaseDate.value))
    fd.append('perUserLimit', perUserLimit.value ?? '')
    fd.append('quantity', quantity.value ?? '')
    fd.append('initialQuantity', initialQuantity.value ?? '')
    fd.append('inCmart', inCmart.value)
    fd.append('set', setField.value)
    fd.append('characters', JSON.stringify(characters.value.split(',').map(s=>s.trim()).filter(Boolean)))
    fd.append('isGtoon', isGtoon.value)
    fd.append('gtoonType', gtoonTypeValue)
    fd.append('cost', String(cost.value))
    fd.append('power', String(power.value))
    fd.append('abilityKey', abilityKey.value || '')
    if (abilityKey.value){
      fd.append('abilityData', JSON.stringify({ value: abilityParam.value }))
    }

    // advisory schedule fields
    fd.append('initialReleaseAt', releaseDate.value ? new Date(releaseDate.value).toISOString() : '')
    fd.append('finalReleaseAt', schedule.value.finalAt ? schedule.value.finalAt.toISOString() : '')
    fd.append('initialReleaseQty', schedule.value.initialQty ?? '')
    fd.append('finalReleaseQty', schedule.value.finalQty ?? '')

    const res = await fetch(`/api/admin/ctoon/${id}`, {
      method: 'PUT',
      credentials: 'include',
      body: fd
    })
    if (!res.ok) return displayToast('Update failed')
    displayToast('Updated','success')
    router.push('/admin/ctoons')
    return
  }

  // JSON path (no image change)
  const body = {
    name:            name.value.trim(),
    series:          series.value.trim(),
    rarity:          rarity.value,
    price:           price.value,
    releaseDate:     localToUtcIso(releaseDate.value),

    perUserLimit:    perUserLimit.value,
    quantity:        quantity.value,
    initialQuantity: initialQuantity.value,
    inCmart:         inCmart.value,

    set:             setField.value,
    characters:      characters.value.split(',').map(s => s.trim()),

    isGtoon:         isGtoon.value,
    gtoonType:       gtoonTypeValue || null,
    cost:            cost.value,
    power:           power.value,
    abilityKey:      abilityKey.value || null,
    abilityData:     abilityKey.value
                      ? JSON.stringify({ value: abilityParam.value })
                      : null,

    // advisory schedule fields
    initialReleaseAt: releaseDate.value ? new Date(releaseDate.value).toISOString() : null,
    finalReleaseAt:   schedule.value.finalAt ? schedule.value.finalAt.toISOString() : null,
    initialReleaseQty: schedule.value.initialQty ?? null,
    finalReleaseQty:   schedule.value.finalQty ?? null
  }

  const res = await fetch(`/api/admin/ctoon/${id}`, {
    method:      'PUT',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify(body)
  })

  if (!res.ok) return displayToast('Update failed')
  displayToast('Updated','success')
  router.push('/admin/ctoons')
}
</script>
