<!-- pages/admin/edit-pack/[id].vue -->
<template>
  <Nav />

  <div class="p-8 max-w-6xl mx-auto space-y-14 mt-16 md:mt-20">
    <!-- 🡐 Back & title -->
    <div class="flex items-center gap-4">
      <NuxtLink
        to="/admin/packs"
        class="text-blue-700 hover:underline focus-visible:outline-blue-700"
      >
        ← Back to Packs
      </NuxtLink>
      <h1 class="text-3xl font-semibold tracking-tight">Edit Pack</h1>
    </div>

    <!-- loading / 404 states -->
    <div v-if="pending" class="text-center text-gray-500">Loading…</div>
    <div v-else-if="!loadedOk" class="text-center text-red-600">Pack not found.</div>

    <!-- ───────────── FORM ───────────── -->
    <template v-else>
      <p class="text-sm text-gray-600">
        Change the thumbnail, counts or drop odds. All validation rules from the&nbsp;create form
        still apply (card-counts between <code>1 – N</code> &amp; weights totalling 100 %).
      </p>

      <form
        @submit.prevent="submit"
        class="space-y-16 bg-white shadow-lg rounded-xl p-8 border border-gray-200"
      >
        <!-- 1️⃣  BASIC INFO --------------------------------------------------- -->
        <section class="grid lg:grid-cols-2 gap-6">
          <!-- name -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Pack name</label>
            <input v-model="name" required
              class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"/>
          </div>

          <!-- price -->
          <div class="flex flex-col gap-1">
            <label class="text-sm font-medium">Price (points)</label>
            <input v-model.number="price" type="number" min="0" required
              class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"/>
          </div>

          <!-- description -->
          <div class="lg:col-span-2 flex flex-col gap-1">
            <label class="text-sm font-medium">Short description</label>
            <textarea v-model="description" rows="3"
              class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"/>
          </div>

          <!-- thumbnail -->
          <div class="lg:col-span-2 flex flex-col gap-1">
            <label class="text-sm font-medium">Thumbnail (png / jpeg)</label>

            <img v-if="!newImageFile && imagePreview"
                 :src="imagePreview"
                 class="w-32 h-32 object-cover rounded border border-gray-300 mb-3"/>

            <input ref="fileInput" type="file" accept="image/png,image/jpeg"
              class="block w-full text-sm text-gray-700
                     file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0
                     file:text-sm file:font-semibold file:bg-blue-600 file:text-white
                     hover:file:bg-blue-700"
              @change="onFile"/>

            <p class="text-xs text-gray-500 ml-1">Leave blank to keep current image.</p>

            <img v-if="newImageFile" :src="imagePreview"
                 class="mt-3 w-32 h-32 object-cover rounded border border-gray-300"/>
          </div>

          <!-- list in cmart -->
          <div class="flex items-start gap-2 lg:col-span-2">
            <input v-model="inCmart" type="checkbox"
              class="mt-1 rounded border-gray-400 text-blue-600 focus:ring-blue-600"/>
            <label class="select-none text-sm">List in cMart</label>
          </div>

          <!-- sell-out behavior -->
          <div class="lg:col-span-2 space-y-2">
            <p class="text-sm font-medium">Pack sell-out behavior</p>
            <div class="flex flex-col gap-2 text-sm text-gray-700">
              <label class="inline-flex items-start gap-2">
                <input
                  v-model="sellOutBehavior"
                  type="radio"
                  value="REMOVE_ON_ANY_RARITY_EMPTY"
                  class="mt-1 rounded border-gray-400 text-blue-600 focus:ring-blue-600"
                />
                <span>Remove pack when any rarity sells out</span>
              </label>
              <label class="inline-flex items-start gap-2">
                <input
                  v-model="sellOutBehavior"
                  type="radio"
                  value="KEEP_IF_SINGLE_RARITY_EMPTY"
                  class="mt-1 rounded border-gray-400 text-blue-600 focus:ring-blue-600"
                />
                <span>Keep pack even if a rarity is sold out</span>
              </label>
            </div>
          </div>
        </section>

        <!-- 2️⃣  ADD / REMOVE CTOONS ---------------------------------------- -->
        <section class="space-y-4">
          <h2 class="text-xl font-semibold">Add / remove cToons</h2>
          <div class="flex items-center gap-3">
            <div class="relative flex-1 cto-autocomplete">
              <input
                ref="searchInput"
                v-model="search"
                placeholder="Search cToons…"
                class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                @focus="onInputFocus"
                @keydown.down.prevent="highlightNext"
                @keydown.up.prevent="highlightPrev"
                @keydown.enter.prevent="chooseHighlighted"/>

              <ul v-if="suggestionsOpen && suggestions.length"
                  class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y">
                <li v-for="(s,idx) in suggestions" :key="s.id"
                    @mousedown.prevent="toggleSelect(s)"
                    :class="['flex items-center gap-3 px-3 py-2 cursor-pointer',
                             idx===highlighted?'bg-blue-50':'hover:bg-gray-50']">
                  <img v-if="s.assetPath" :src="s.assetPath"
                       class="w-8 h-8 object-cover rounded border border-gray-300"/>
                  <div class="flex-1 truncate">
                    <p class="truncate font-medium">{{ s.name }}</p>
                    <p class="text-xs text-gray-500">{{ s.rarity }}</p>
                  </div>
                </li>
              </ul>
            </div>
            <span class="text-sm text-gray-600">Selected: {{ selectedCount }}</span>
          </div>
        </section>

        <!-- 3️⃣  GROUPED BY RARITY ------------------------------------------- -->
        <section class="space-y-10">
          <div v-for="(ids, rarity) in grouped" :key="rarity"
               class="border border-gray-300 rounded-md">
            <div class="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-t-md">
              <div class="flex items-center gap-3">
                <h3 class="font-medium">{{ rarity }}</h3>

                <!-- cards / pack -->
                <div class="flex items-center gap-1">
                  <input v-model.number="countsByRarity[rarity].count" type="number"
                         :min="1" :max="ids.length"
                         class="w-16 rounded-md border border-gray-400 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-600 focus:border-blue-600"/>
                  <span class="text-xs text-gray-500">cards</span>
                </div>

                <!-- probability -->
                <div class="flex items-center gap-1 ml-4">
                  <input v-model.number="countsByRarity[rarity].probabilityPercent" type="number"
                         min="1" max="100"
                         class="w-20 rounded-md border border-gray-400 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-600 focus:border-blue-600"/>
                  <span class="text-xs text-gray-500">%</span>
                </div>
              </div>

              <span class="weight-badge"
                    :class="sumWeights(rarity)===100?'weight-ok':'weight-bad'">
                {{ sumWeights(rarity) }} %
              </span>
            </div>

            <div>
              <div v-for="id in ids" :key="id"
                   class="group-row flex items-center gap-3 px-4 py-2">
                <img v-if="lookup[id]?.assetPath" :src="lookup[id].assetPath"
                     class="w-10 h-10 object-cover rounded border border-gray-300"/>
                <div class="flex-1 truncate">
                  <p class="truncate font-medium">{{ lookup[id]?.name }}</p>
                </div>

                <div class="flex items-center gap-1">
                  <input v-model.number="weights[id]" type="number" min="1" max="100"
                         class="w-20 rounded-md border border-gray-400 px-2 py-1 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                         @input="onManualWeight(rarity,id)"/>
                  <span class="text-xs text-gray-500">%</span>
                </div>

                <button type="button" @click="toggleSelect(lookup[id])"
                        class="text-red-700 hover:underline text-sm">
                  Remove
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 4️⃣  SUBMIT ------------------------------------------------------- -->
        <div>
          <button type="submit" :disabled="!allValid"
                  class="inline-flex items-center gap-2 rounded-md px-6 py-2.5 font-semibold
                         transition text-white disabled:bg-gray-400 bg-blue-700 hover:bg-blue-800
                         disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-blue-700">
            Save Changes
          </button>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
definePageMeta({ middleware:['auth','admin'], layout:'default' })

/* ---------------- imports ---------------- */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute, useFetch } from '#app'

/* ---------------- route & pack fetch ---------------- */
const route = useRoute()
const id    = route.params.id

const { data: packData, pending, error } = await useFetch(`/api/admin/packs/${id}`, {
  key: `pack-${id}`,
  credentials: 'include'
})

const loadedOk = computed(() => !pending.value && !error.value)

/* ---------------- basic meta refs ---------------- */
const name        = ref('')
const price       = ref(0)
const description = ref('')
const inCmart     = ref(true)
const sellOutBehavior = ref('REMOVE_ON_ANY_RARITY_EMPTY')

/* ---------------- thumbnail upload ---------------- */
const fileInput    = ref(null)
const imagePreview = ref('')
const newImageFile = ref(null)
function onFile (e) {
  const file = e.target.files[0]
  if (!file) return
  if (!['image/png','image/jpeg'].includes(file.type)) {
    alert('Only PNG or JPEG images are allowed')
    fileInput.value.value = ''
    return
  }
  newImageFile.value = file
  imagePreview.value = URL.createObjectURL(file)
}

const defaultWeightConfigs = {
  Common:      { true:  12,   false: 20   },
  Uncommon:    { true:   7.5, false: 35   },
  Rare:        { true:  18,   false: 45   },
  'Very Rare': { true:  12.5, false: 75   },
  'Crazy Rare':{ true:  10,   false: 90   }
}

/** assign default weights based on each cToon.inCmart flag */
function assignDefaultWeights(rarity) {
  const ids = grouped.value[rarity] || []
  const map = defaultWeightConfigs[rarity] || {}
  ids.forEach(id => {
    const c = lookup.value[id]
    weights.value[id] = map[ Boolean(c?.inCmart) ] ?? 0
  })
}

/* ---------------- rarity / cToon state ------------ */
const rarities = ['Common','Uncommon','Rare','Very Rare','Crazy Rare']
const countsByRarity = reactive(
  Object.fromEntries(rarities.map(r => [r,{ count:0, probabilityPercent:100 }]))
)
const rarityConfigs = computed(() =>
  Object.entries(countsByRarity)
        .filter(([,c]) => c.count>0)
        .map(([rarity,c]) => ({ rarity, count:c.count, probabilityPercent:c.probabilityPercent }))
)

/* cToon collections */
const ctoons        = ref([])
const lookup        = ref({})
const selectedIds   = ref([])
const weights       = ref({})
const selectedCount = computed(() => selectedIds.value.length)

/* group by rarity */
const grouped = computed(() => {
  const m = {}
  for (const id of selectedIds.value) {
    const c = lookup.value[id]
    if (!c) continue                // ← skip any ID we don’t know about
    const r = c.rarity
    ;(m[r] ||= []).push(id)
  }
  return m
})


/* ------------- weight helpers ------------------ */
const sumWeights = rarity =>
  (grouped.value[rarity]||[]).reduce((s,id)=>s+(weights.value[id]||0),0)

function rebalance (rarity, fixedId=null) {
  const ids = grouped.value[rarity]||[]
  if (!ids.length) return
  let remaining = 100
  if (fixedId) remaining -= weights.value[fixedId]
  const others  = fixedId ? ids.filter(i=>i!==fixedId) : ids
  const base    = Math.floor(remaining/others.length)
  let extra     = remaining - base*others.length
  for (const id of others) {
    weights.value[id] = base + (extra-- > 0 ? 1 : 0)
  }
}

/* rebalance only when totals are off */
function rebalanceIfNeeded (rarity, fixedId=null) {
  if (sumWeights(rarity) !== 100) rebalance(rarity,fixedId)
}

/* ------------- autocomplete -------------------- */
const search          = ref('')
const searchInput     = ref(null)
const suggestionsOpen = ref(false)
const highlighted     = ref(-1)

const suggestions = computed(() => {
  const t = search.value.toLowerCase().trim()
  let list = ctoons.value.filter(c => !selectedIds.value.includes(c.id))
  if (t) list = list.filter(c => c.name.toLowerCase().includes(t))
  return list.slice(0,50)
})

function onInputFocus () { suggestionsOpen.value = true }
watch(search, () => { suggestionsOpen.value = true })

function highlightNext () {
  if (suggestions.value.length)
    highlighted.value = (highlighted.value+1)%suggestions.value.length
}
function highlightPrev () {
  if (suggestions.value.length)
    highlighted.value = (highlighted.value-1+suggestions.value.length)%suggestions.value.length
}
function chooseHighlighted () {
  if (highlighted.value>=0) toggleSelect(suggestions.value[highlighted.value])
}

function toggleSelect (cto) {
  const { id, rarity } = cto
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    selectedIds.value.push(id)
    weights.value[id] = 0
  } else {
    selectedIds.value.splice(idx,1)
    delete weights.value[id]
  }
  assignDefaultWeights(rarity)
  search.value       = ''
  suggestionsOpen.value = false
  highlighted.value  = -1
  searchInput.value?.blur()
}

function onManualWeight (rarity,id) {
  // weights.value[id] = Math.min(99,Math.max(1,Number(weights.value[id]||0)))
  // rebalanceIfNeeded(rarity,id)
}

if (process.client) {
  window.addEventListener('click', e => {
    if (!e.target.closest('.cto-autocomplete'))
      suggestionsOpen.value = false
  })
}

/* ------------- load cToons & hydrate ------------ */
const router = useRouter()

onMounted(async () => {
  try {
    const all = await $fetch('/api/admin/ctoon-pool',{ credentials:'include' })
    ctoons.value = all
    lookup.value = Object.fromEntries(all.map(c=>[c.id,c]))

    if (!packData.value) return
    const p = packData.value

    /* base meta */
    name.value        = p.name
    price.value       = p.price
    description.value = p.description
    inCmart.value     = p.inCmart
    sellOutBehavior.value = p.sellOutBehavior || 'REMOVE_ON_ANY_RARITY_EMPTY'
    imagePreview.value= p.imagePath

    /* rarity configs */
    p.rarityConfigs.forEach(rc => {
      countsByRarity[rc.rarity] = {
        count: rc.count,
        probabilityPercent: rc.probabilityPercent ?? 100
      }
    })

    /* cToon options & weights */
    p.ctoonOptions.forEach(o => {
      selectedIds.value.push(o.ctoonId)
      weights.value[o.ctoonId] = o.weight
    })
    /* ⬅️ NO auto-rebalance here – we want DB weights intact */
  } catch (err) { console.error('Load error',err) }
})

/* ------------- validation / submit ------------- */
const countsValid = computed(() =>
  Object.entries(grouped.value).every(([r,ids]) =>
    !ids.length || (
      countsByRarity[r].count >= 1 &&
      countsByRarity[r].count <= ids.length &&
      countsByRarity[r].probabilityPercent >= 1 &&
      countsByRarity[r].probabilityPercent <= 100
    )
  ) && rarityConfigs.value.some(r=>r.probabilityPercent===100)
)

const allValid = computed(() =>
  countsValid.value &&
  rarities.every(r => !grouped.value[r]?.length || sumWeights(r)===100)
)

async function submit () {
  if (!allValid.value) return
  const form = new FormData()
  form.append('meta', JSON.stringify({
    name: name.value.trim(),
    price: price.value,
    description: description.value,
    inCmart: inCmart.value,
    sellOutBehavior: sellOutBehavior.value,
    rarityConfigs: rarityConfigs.value,
    ctoonOptions: selectedIds.value.map(id => ({
      ctoonId: id,
      weight:  weights.value[id]
    }))
  }))
  if (newImageFile.value) form.append('image', newImageFile.value)

  try {
    await $fetch(`/api/admin/packs/${id}`,{
      method:'PATCH',
      body: form,
      credentials:'include'
    })
    router.push('/admin/packs')
  } catch (err) {
    console.error(err)
    alert('Failed to save pack')
  }
}
</script>

<style scoped>
.cto-autocomplete ul { z-index: 60; }
.weight-badge { @apply inline-block rounded-full px-2 py-0.5 text-xs font-semibold; }
.weight-ok  { @apply bg-green-100 text-green-700; }
.weight-bad { @apply bg-red-100 text-red-700; }
.group-row:not(:last-child){ border-bottom:1px solid theme('colors.gray.200'); }
input[type='number']{ min-width:4rem; }
</style>
