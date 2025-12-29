<template>
  <Nav />

  <div class="p-8 max-w-6xl mx-auto space-y-14 mt-16 md:mt-20">
    <!-- 🡐 Back & Title -->
    <div class="flex items-center gap-4">
      <NuxtLink
        to="/admin/packs"
        class="text-blue-700 hover:underline focus-visible:outline-blue-700"
      >
        ← Back to Packs
      </NuxtLink>
      <h1 class="text-3xl font-semibold tracking-tight">Create a New Pack</h1>
    </div>

    <!-- ✨ Intro -->
    <section class="prose prose-sm max-w-none text-gray-700">
      <p>
        Decide how many cards of each rarity the pack grants, then pick the eligible
        cToons. Weights auto-rebalance so each rarity totals <strong>100&nbsp;%</strong>.
      </p>
    </section>

    <!-- ╭──────────────────────── PACK FORM ─────────────────────────╮ -->
    <form
      @submit.prevent="submit"
      class="space-y-16 bg-white shadow-lg rounded-xl p-8 border border-gray-200"
    >
      <!-- 1️⃣  BASIC INFO --------------------------------------------------- -->
      <section class="grid lg:grid-cols-2 gap-6">
        <!-- Name -->
        <div class="flex flex-col gap-1">
          <label for="pack-name" class="text-sm font-medium">
            Pack name <span class="text-red-500">*</span>
          </label>
          <input
            id="pack-name"
            v-model="name"
            type="text"
            placeholder="e.g. Spring Starter Pack"
            class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            required
          />
        </div>

        <!-- Price -->
        <div class="flex flex-col gap-1">
          <label for="pack-price" class="text-sm font-medium">
            Price (points) <span class="text-red-500">*</span>
          </label>
          <input
            id="pack-price"
            v-model.number="price"
            type="number"
            min="0"
            placeholder="900"
            class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            required
          />
        </div>

        <!-- Description -->
        <div class="lg:col-span-2 flex flex-col gap-1">
          <label for="pack-desc" class="text-sm font-medium">Short description</label>
          <textarea
            id="pack-desc"
            v-model="description"
            rows="3"
            placeholder="A curated set perfect for new collectors!"
            class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          ></textarea>
        </div>

        <!-- Thumbnail upload -->
        <div class="lg:col-span-2 flex flex-col gap-1">
          <label for="pack-img" class="text-sm font-medium">
            Thumbnail image (PNG or JPEG) <span class="text-red-500">*</span>
          </label>
          <input
            id="pack-img"
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg"
            class="block w-full text-sm text-gray-700
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-md file:border-0
                   file:text-sm file:font-semibold
                   file:bg-blue-600 file:text-white
                   hover:file:bg-blue-700"
            @change="onFile"
          />
          <p class="text-xs text-gray-500 ml-1">
            Square image ≥ 400 px. Smaller images will be up-scaled.
          </p>

          <!-- preview -->
          <img
            v-if="imagePreview"
            :src="imagePreview"
            alt="Preview"
            class="mt-3 w-32 h-32 object-cover rounded border border-gray-300"
          />
        </div>

        <!-- Visibility toggle -->
        <div class="flex items-start gap-2 lg:col-span-2">
          <input
            id="incmart"
            v-model="inCmart"
            type="checkbox"
            class="mt-1 rounded border-gray-400 text-blue-600 focus:ring-blue-600 focus:border-blue-600"
          />
          <label for="incmart" class="select-none text-sm">
            List in cMart (uncheck to save as draft).
          </label>
        </div>

        <!-- Sell-out behavior -->
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

      <!-- 2️⃣  SEARCH / ADD CTOONS ---------------------------------------- -->
      <section class="space-y-4">
        <h2 class="text-xl font-semibold">Add cToons</h2>

        <!-- NEW: Add by Set -->
        <div class="flex items-center gap-3">
          <div class="relative flex-1 set-autocomplete">
            <input
              id="set-name-input"
              ref="setInput"
              v-model="setSearch"
              type="text"
              placeholder="Type a Set name…"
              class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              @focus="onSetFocus"
              @keydown.down.prevent="setHighlightNext"
              @keydown.up.prevent="setHighlightPrev"
              @keydown.enter.prevent="addSetViaKeyboard"
            />
            <!-- dropdown -->
            <ul
              v-if="setSuggestionsOpen && setSuggestions.length"
              class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
            >
              <li
                v-for="(s, idx) in setSuggestions"
                :key="s"
                @mousedown.prevent="selectSetSuggestion(s)"
                :class="[
                  'flex items-center gap-3 px-3 py-2 cursor-pointer',
                  idx === setHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                ]"
              >
                <div class="flex-1 truncate">
                  <p class="truncate font-medium">{{ s }}</p>
                </div>
              </li>
            </ul>
          </div>

          <button
            type="button"
            @click="addSetToSelection"
            class="rounded-md px-4 py-2 font-semibold bg-blue-700 text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-blue-700"
            :title="'Add all Common/Uncommon/Rare/Very Rare from the Set'"
          >
            Add Set
          </button>
        </div>
        <p class="text-xs text-gray-500">
          Only Common, Uncommon, Rare, and Very Rare are added from the Set.
        </p>

        <!-- Existing single cToon autocomplete -->
        <p class="text-xs text-gray-500">
          Leave the box empty then press <kbd>↓</kbd> / <kbd>↑</kbd> to browse all cToons.
          Already-selected cToons are hidden.
        </p>

        <div class="flex items-center gap-3">
          <div class="relative flex-1 cto-autocomplete">
            <input
              ref="searchInput"
              v-model="search"
              type="text"
              placeholder="Search cToons…"
              class="w-full rounded-md border border-gray-400 px-3 py-2 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              @focus="onInputFocus"
              @keydown.down.prevent="highlightNext"
              @keydown.up.prevent="highlightPrev"
              @keydown.enter.prevent="chooseHighlighted"
            />

            <!-- dropdown -->
            <ul
              v-if="suggestionsOpen && suggestions.length"
              class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg divide-y"
            >
              <li
                v-for="(s, idx) in suggestions"
                :key="s.id"
                @mousedown.prevent="toggleSelect(s)"
                :class="[
                  'flex items-center gap-3 px-3 py-2 cursor-pointer',
                  idx === highlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
                ]"
              >
                <img
                  v-if="s.assetPath"
                  :src="s.assetPath"
                  class="w-8 h-8 object-cover rounded border border-gray-300"
                />
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

      <!-- 3️⃣  SELECTED CTOONS GROUPED BY RARITY --------------------------- -->
      <section class="space-y-10">
        <div
          v-for="(ids, rarity) in grouped"
          :key="rarity"
          class="border border-gray-300 rounded-md"
        >
          <!-- header -->
          <div class="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-t-md">
            <div class="flex items-center gap-3">
              <h3 class="font-medium">{{ rarity }}</h3>

              <!-- cards per pack -->
              <div class="flex items-center gap-1">
                <input
                  v-model.number="countsByRarity[rarity].count"
                  type="number"
                  :min="1"
                  :max="ids.length"
                  class="w-16 rounded-md border border-gray-400 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  :title="'How many ' + rarity + ' cards per pack (1–' + ids.length + ')'"
                />
                <span class="text-xs text-gray-500">cards</span>
              </div>

              <!-- probability percent -->
              <div class="flex items-center gap-1 ml-3">
                <input
                  v-model.number="countsByRarity[rarity].probabilityPercent"
                  type="number"
                  min="1"
                  max="100"
                  class="w-20 rounded-md border border-gray-400 px-2 py-1 text-sm focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                  :title="'Probability of receiving ' + rarity + ' (1%–100%)'"
                />
                <span class="text-xs text-gray-500">%</span>
              </div>
            </div>

            <!-- total weight -->
            <span
              class="weight-badge"
              :class="sumWeights(rarity) === 100 ? 'weight-ok' : 'weight-bad'"
              :title="'Total weight = ' + sumWeights(rarity) + '%' "
            >
              {{ sumWeights(rarity) }} %
            </span>
          </div>

          <!-- rows -->
          <div>
            <div
              v-for="id in ids"
              :key="id"
              class="group-row flex items-center gap-3 px-4 py-2"
            >
              <img
                v-if="lookup[id]?.assetPath"
                :src="lookup[id].assetPath"
                class="w-10 h-10 object-cover rounded border border-gray-300"
              />
              <div class="flex-1 truncate">
                <p class="truncate font-medium">{{ lookup[id]?.name }}</p>
              </div>

              <!-- weight -->
              <div class="flex items-center gap-1">
                <input
                  v-model.number="weights[id]"
                  type="number"
                  min="1"
                  max="100"
                  class="w-20 rounded-md border border-gray-400 px-2 py-1 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
                  @input="onManualWeight(rarity, id)"
                  :title="'Drop chance for ' + lookup[id]?.name"
                />
                <span class="text-xs text-gray-500">%</span>
              </div>

              <!-- remove -->
              <button
                type="button"
                @click="toggleSelect(lookup[id])"
                class="text-red-700 hover:underline text-sm focus-visible:outline-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 4️⃣  SUBMIT ------------------------------------------------------ -->
      <div>
        <button
          type="submit"
          :disabled="!allValid || !imageFile"
          :title="submitTooltip"
          class="inline-flex items-center gap-2 rounded-md px-6 py-2.5 font-semibold transition
                 text-white
                 disabled:cursor-not-allowed
                 disabled:bg-gray-400
                 bg-blue-700 hover:bg-blue-800
                 focus-visible:outline-2 focus-visible:outline-blue-700"
        >
          Create Pack
        </button>
      </div>
    </form>
    <!-- ╰──────────────────────────────────────────────────────────────────╯ -->
  </div>
</template>

<script setup>
// Meta & imports
definePageMeta({ middleware: ['auth','admin'], layout: 'default' })
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter } from '#app'

// 1️⃣ Basic pack fields
const name        = ref('')
const price       = ref(900)
const description = ref('')
const inCmart     = ref(true)
const sellOutBehavior = ref('REMOVE_ON_ANY_RARITY_EMPTY')

// 2️⃣ Thumbnail upload
const fileInput    = ref(null)
const imageFile    = ref(null)
const imagePreview = ref('')
function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  if (!['image/png','image/jpeg'].includes(file.type)) {
    alert('Only PNG or JPEG images are allowed.')
    fileInput.value.value = ''
    return
  }
  imageFile.value    = file
  imagePreview.value = URL.createObjectURL(file)
}

// 3️⃣ Rarity counts
const rarities = ['Common','Uncommon','Rare','Very Rare','Crazy Rare']
const countsByRarity = reactive({
  Common:      { count: 4, probabilityPercent: 100 },
  Uncommon:    { count: 2, probabilityPercent: 100 },
  Rare:        { count: 1, probabilityPercent: 100 },
  'Very Rare': { count: 1, probabilityPercent: 25 },
  'Crazy Rare':{ count: 1, probabilityPercent: 10 }
})
const rarityConfigs = computed(() =>
  Object.entries(countsByRarity)
    .filter(([rarity,cfg]) => cfg.count > 0 && (grouped.value[rarity]||[]).length > 0)
    .map(([rarity,cfg]) => ({
      rarity,
      count: cfg.count,
      probabilityPercent: cfg.probabilityPercent
    }))
)

// 4️⃣ cToon pool & selection
const ctoons        = ref([])
const lookup        = ref({})
const search        = ref('')
const searchInput   = ref(null)
const selectedIds   = ref([])
const weights       = ref({})
const selectedCount = computed(() => selectedIds.value.length)

const grouped = computed(() => {
  const map = {}
  for (const id of selectedIds.value) {
    const r = lookup.value[id]?.rarity || 'Unknown'
    if (!map[r]) map[r] = []
    map[r].push(id)
  }
  return map
})

// rarity × cToon.inCmart → static default weight map
const defaultWeightConfigs = {
  Common:      { true: 18,  false: 28 },
  Uncommon:    { true: 14,  false: 44 },
  Rare:        { true: 18,  false: 45 },
  'Very Rare': { true: 13,  false: 74 },
  'Crazy Rare':{ true: 20,  false: 80 }
}

/** return a map of id → default weight for this rarity */
function assignDefaultWeights(rarity) {
  const ids = grouped.value[rarity] || []
  const result = {}
  const map = defaultWeightConfigs[rarity] || {}
  ids.forEach(id => {
    const c = lookup.value[id]
    result[id] = map[ Boolean(c?.inCmart) ] ?? 0
  })
  return result
}

function sumWeights(rarity) {
  return (grouped.value[rarity]||[])
    .reduce((sum,id) => sum + (weights.value[id]||0), 0)
}

// 5️⃣ Autocomplete & selection (single cToon)
const suggestionsOpen = ref(false)
const highlighted     = ref(-1)
const suggestions = computed(() => {
  const term = search.value.toLowerCase().trim()
  let list = ctoons.value.filter(c => !selectedIds.value.includes(c.id))
  if (term) list = list.filter(c => c.name.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function onInputFocus() { suggestionsOpen.value = true }
watch(search, () => { suggestionsOpen.value = true })
function highlightNext() {
  if (!suggestions.value.length) return
  highlighted.value = (highlighted.value + 1) % suggestions.value.length
}
function highlightPrev() {
  if (!suggestions.value.length) return
  highlighted.value =
    (highlighted.value - 1 + suggestions.value.length) % suggestions.value.length
}
function chooseHighlighted() {
  if (highlighted.value >= 0) toggleSelect(suggestions.value[highlighted.value])
}
function toggleSelect(cto) {
  const { id, rarity } = cto
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    selectedIds.value.push(id)
  } else {
    selectedIds.value.splice(idx, 1)
    delete weights.value[id]
  }
  // apply defaults
  const norm = assignDefaultWeights(rarity)
  Object.entries(norm).forEach(([iid,val]) => {
    weights.value[iid] = val
  })
  suggestionsOpen.value = false
  highlighted.value     = -1
  searchInput.value?.blur()
}
function onManualWeight(rarity, id) {
  weights.value[id] = Math.min(99, Math.max(1, Number(weights.value[id] || 0)))
}

// 6️⃣ NEW: Set picker + bulk add by Set
const sets                 = ref([])
const setSearch            = ref('')
const setInput             = ref(null)
const setSuggestionsOpen   = ref(false)
const setHighlighted       = ref(-1)
const allowedSetRarities   = new Set(['Common','Uncommon','Rare','Very Rare'])

const setSuggestions = computed(() => {
  const term = setSearch.value.trim().toLowerCase()
  if (term.length < 3) return []
  const list = sets.value.filter(s => s && s.toLowerCase().includes(term))
  return list.slice(0, 50)
})
function onSetFocus() { setSuggestionsOpen.value = true }
watch(setSearch, () => { setSuggestionsOpen.value = setSearch.value.trim().length >= 3 })

function setHighlightNext() {
  if (!setSuggestions.value.length) return
  setHighlighted.value = (setHighlighted.value + 1) % setSuggestions.value.length
}
function setHighlightPrev() {
  if (!setSuggestions.value.length) return
  setHighlighted.value =
    (setHighlighted.value - 1 + setSuggestions.value.length) % setSuggestions.value.length
}
function selectSetSuggestion(s) {
  setSearch.value = s
  addSetToSelection()
}
function addSetViaKeyboard() {
  if (setHighlighted.value >= 0) {
    selectSetSuggestion(setSuggestions.value[setHighlighted.value])
  } else {
    addSetToSelection()
  }
}
function addSetToSelection() {
  const raw = setSearch.value.trim()
  if (!raw) return

  const canonical =
    sets.value.find(s => s && s.toLowerCase() === raw.toLowerCase()) || raw

  const addables = ctoons.value.filter(c =>
    c.set === canonical &&
    allowedSetRarities.has(c.rarity) &&
    !selectedIds.value.includes(c.id)
  )

  if (!addables.length) {
    alert('No eligible cToons found in that Set.')
    return
  }

  // add ids
  addables.forEach(c => selectedIds.value.push(c.id))

  // assign weights just like single add
  const affected = new Set(addables.map(c => c.rarity))
  for (const r of affected) {
    const norm = assignDefaultWeights(r)
    Object.entries(norm).forEach(([iid, val]) => { weights.value[iid] = val })
  }

  setSuggestionsOpen.value = false
  setHighlighted.value = -1
  setInput.value?.blur()
}


// Close dropdowns on outside click
if (process.client) {
  window.addEventListener('click', e => {
    if (!e.target.closest('.cto-autocomplete')) suggestionsOpen.value = false
    if (!e.target.closest('.set-autocomplete')) setSuggestionsOpen.value = false
  })
}

// 7️⃣ Validation
const countsValid = computed(() =>
  Object.entries(grouped.value).every(([r,ids]) =>
    !ids.length ||
    (
      countsByRarity[r].count >= 1 && countsByRarity[r].count <= ids.length &&
      countsByRarity[r].probabilityPercent >= 1 && countsByRarity[r].probabilityPercent <= 100
    )
  ) && rarityConfigs.value.some(r => r.probabilityPercent === 100)
)
const allValid = computed(() => {
  const groups = Object.keys(grouped.value)
  return groups.length > 0 && groups.every(r => sumWeights(r) === 100)
})
const submitTooltip = computed(() => {
  if (!imageFile.value) return 'Thumbnail image required'
  if (!countsValid.value) return 'Ensure at least one rarity has 100% and others 1–100%'
  if (!allValid.value) return 'Fix card counts or weights'
  return ''
})

// 8️⃣ Fetch data
onMounted(async () => {
  try {
    const data = await $fetch('/api/admin/ctoon-pool')
    ctoons.value = data
    lookup.value = Object.fromEntries(data.map(c => [c.id, c]))
  } catch (err) {
    console.error('Failed to load cToons', err)
  }

  try {
    const setNames = await $fetch('/api/admin/sets')
    sets.value = (setNames || []).filter(Boolean).sort((a,b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  } catch (err) {
    console.error('Failed to load Sets', err)
  }
})

// watch for bulk changes → apply default weights per rarity
watch(selectedIds, () => {
  Object.keys(grouped.value).forEach(r => {
    const norm = assignDefaultWeights(r)
    Object.entries(norm).forEach(([iid,val]) => { weights.value[iid] = val })
  })
}, { flush: 'post' })

// 9️⃣ Submit
const router = useRouter()
async function submit() {
  if (!allValid.value || !countsValid.value || !imageFile.value) return
  const form = new FormData()
  const meta = {
    name: name.value,
    price: price.value,
    description: description.value,
    inCmart: inCmart.value,
    sellOutBehavior: sellOutBehavior.value,
    rarityConfigs: rarityConfigs.value,
    ctoonOptions: selectedIds.value.map(id => ({ ctoonId: id, weight: weights.value[id] }))
  }
  form.append('meta', JSON.stringify(meta))
  form.append('image', imageFile.value)
  try {
    await $fetch('/api/admin/packs', { method: 'POST', body: form })
    router.push('/admin/packs')
  } catch (err) {
    console.error(err)
    alert('Failed to create pack')
  }
}
</script>

<style scoped>
/* dropdown above modals */
.cto-autocomplete ul,
.set-autocomplete ul {
  z-index: 60;
}
.weight-badge {
  @apply inline-block rounded-full px-2 py-0.5 text-xs font-semibold;
}
.weight-ok  { @apply bg-green-100 text-green-700; }
.weight-bad { @apply bg-red-100   text-red-700;   }
.group-row:not(:last-child) {
  border-bottom: 1px solid theme('colors.gray.200');
}
input[type='number'] {
  min-width: 4rem;
}
</style>
