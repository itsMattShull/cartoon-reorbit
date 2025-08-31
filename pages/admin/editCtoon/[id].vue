<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow mt-16 relative">
      <h1 class="text-2xl font-semibold mb-4">Edit cToon</h1>

      <form @submit.prevent="submitForm" class="space-y-4">
        <!-- Image Display -->
        <div>
          <label class="block mb-1 font-medium">Current Image</label>
          <img :src="assetPath" alt="cToon" class="h-32" />
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
definePageMeta({ middleware:['auth','admin'], layout:'default' })

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
const err = reactive({ cost:'', power:'' })

/* series + rarity lists */
const seriesOptions = ref([])
const rarityOptions = ['Common','Uncommon','Rare','Very Rare','Crazy Rare','Prize Only','Code Only','Auction Only']

/* toast helpers */
const showToast = ref(false)
const toastMessage = ref(''); const toastType = ref('success')
function displayToast(msg, type='error'){ toastMessage.value = msg; toastType.value = type; showToast.value = true; setTimeout(()=>showToast.value = false, 4000) }

/* date helpers */
function toDateTimeLocal(utc){
  const dt = new Date(utc)
  return new Date(dt.getTime() - dt.getTimezoneOffset()*60000).toISOString().slice(0,16)
}
const localToUtcIso = l => new Date(l).toISOString()

/* reset param when ability cleared */
watch(abilityKey, val => {
  if (!val) abilityParam.value = null
})

/* load data */
onMounted(async ()=>{
  try{
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

/* submit */
async function submitForm(){
  err.cost=''; err.power=''
  if (isGtoon.value) {
    if (cost.value<0||cost.value>6)   err.cost='Cost 0-6'
    if (power.value<0||power.value>12) err.power='Power 0-12'
    if (err.cost || err.power) return
  }

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
    gtoonType:       gtoonType.value || null,
    cost:            cost.value,
    power:          power.value,
    abilityKey:      abilityKey.value || null,
    abilityData:     abilityKey.value
                      ? JSON.stringify({ value: abilityParam.value })
                      : null
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
