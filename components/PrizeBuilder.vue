<!-- Reusable prize builder for cZone contests: ctoons (with qty), backgrounds, and points -->
<template>
  <div class="space-y-3 text-sm">
    <!-- Points -->
    <div>
      <label class="block text-gray-300 mb-1">Points</label>
      <input
        :value="modelValue.points"
        type="number"
        min="0"
        class="w-full border rounded p-2 bg-gray-700 text-white"
        @input="update('points', parseInt($event.target.value) || 0)"
      />
    </div>

    <!-- cToons -->
    <div>
      <label class="block text-gray-300 mb-1">cToons</label>
      <div class="relative mb-2">
        <input
          v-model="ctoonSearch"
          class="w-full border rounded p-2 bg-gray-700 text-white"
          placeholder="Search cToons..."
          @focus="ctoonFocused = true"
          @blur="setTimeout(() => { ctoonFocused = false }, 150)"
        />
        <ul
          v-if="ctoonSearch.length >= 3 && ctoonFocused && filteredCtoons.length"
          class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-48 overflow-y-auto shadow-lg"
        >
          <li
            v-for="ct in filteredCtoons"
            :key="ct.id"
            class="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 cursor-pointer text-gray-900"
            @mousedown.prevent="addCtoon(ct)"
          >
            <img v-if="ct.assetPath" :src="ct.assetPath" class="h-8 w-auto rounded" />
            <div>
              <p class="font-medium text-sm">{{ ct.name }}</p>
              <p class="text-xs text-gray-500">{{ ct.rarity }}</p>
            </div>
          </li>
        </ul>
      </div>
      <div v-if="modelValue.ctoons.length" class="space-y-2">
        <div
          v-for="(entry, i) in modelValue.ctoons"
          :key="entry.ctoonId"
          class="flex items-center gap-2 bg-gray-700 border border-gray-600 rounded p-2"
        >
          <img v-if="entry.assetPath" :src="entry.assetPath" class="h-8 w-auto rounded flex-shrink-0" />
          <span class="flex-1 text-white text-xs truncate">{{ entry.name }}</span>
          <div class="flex items-center gap-1">
            <label class="text-gray-400 text-xs">Qty</label>
            <input
              :value="entry.qty"
              type="number"
              min="1"
              class="w-14 border rounded p-1 bg-gray-600 text-white text-xs"
              @input="updateCtoonQty(i, parseInt($event.target.value) || 1)"
            />
          </div>
          <button class="text-red-400 hover:text-red-300 text-xs ml-1" @click="removeCtoon(i)">✕</button>
        </div>
      </div>
      <p v-else class="text-gray-400 text-xs">No cToons added.</p>
    </div>

    <!-- Backgrounds -->
    <div>
      <label class="block text-gray-300 mb-1">Backgrounds</label>
      <div class="relative mb-2">
        <button
          type="button"
          class="w-full border rounded p-2 bg-gray-700 text-white text-left flex items-center justify-between"
          @click="bgDropdownOpen = !bgDropdownOpen"
        >
          <span class="text-gray-400">— Select a background to add —</span>
          <span class="text-gray-400 text-xs">▾</span>
        </button>
        <div
          v-if="bgDropdownOpen"
          class="absolute z-20 w-full bg-gray-800 border border-gray-600 rounded-md mt-1 max-h-64 overflow-y-auto shadow-xl"
        >
          <div
            v-if="!availableBackgrounds.length"
            class="px-3 py-2 text-gray-400 text-xs"
          >No backgrounds available</div>
          <div
            v-for="bg in availableBackgrounds"
            :key="bg.id"
            class="flex items-center gap-3 px-3 py-2 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
            @mousedown.prevent="addBackground(bg.id); bgDropdownOpen = false"
          >
            <img
              v-if="bg.imagePath"
              :src="bg.imagePath"
              :alt="bg.label"
              class="h-12 w-20 object-cover rounded flex-shrink-0 bg-gray-900"
            />
            <div v-else class="h-12 w-20 rounded flex-shrink-0 bg-gray-900 flex items-center justify-center text-gray-500 text-xs">No image</div>
            <span class="text-white text-xs">{{ bg.label }}</span>
          </div>
        </div>
      </div>
      <div v-if="modelValue.backgroundIds.length" class="space-y-2">
        <div
          v-for="bgId in modelValue.backgroundIds"
          :key="bgId"
          class="bg-gray-700 border border-gray-600 rounded overflow-hidden"
        >
          <img
            v-if="bgImagePath(bgId)"
            :src="bgImagePath(bgId)"
            :alt="bgLabel(bgId)"
            class="w-full max-h-24 object-cover"
          />
          <div class="flex items-center gap-1 px-2 py-1 text-xs text-white">
            <span class="flex-1 truncate">{{ bgLabel(bgId) }}</span>
            <button class="text-red-400 hover:text-red-300 ml-1" @click="removeBackground(bgId)">✕</button>
          </div>
        </div>
      </div>
      <p v-else class="text-gray-400 text-xs">No backgrounds added.</p>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    required: true
    // shape: { ctoons: [{ctoonId, name, assetPath, qty}], backgroundIds: [], points: 0 }
  },
  ctoonOptions: { type: Array, default: () => [] },
  bgOptions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue'])

const ctoonSearch = ref('')
const ctoonFocused = ref(false)
const bgDropdownOpen = ref(false)

const filteredCtoons = computed(() => {
  const q = ctoonSearch.value.trim().toLowerCase()
  if (q.length < 3) return []
  return props.ctoonOptions.filter(ct =>
    ct.name.toLowerCase().includes(q) || ct.id.toLowerCase().includes(q)
  ).slice(0, 20)
})

const availableBackgrounds = computed(() =>
  props.bgOptions.filter(bg => !props.modelValue.backgroundIds.includes(bg.id))
)

function update(key, val) {
  emit('update:modelValue', { ...props.modelValue, [key]: val })
}

function addCtoon(ct) {
  if (props.modelValue.ctoons.find(e => e.ctoonId === ct.id)) return
  const newCtoons = [
    ...props.modelValue.ctoons,
    { ctoonId: ct.id, name: ct.name, assetPath: ct.assetPath || '', qty: 1 }
  ]
  emit('update:modelValue', { ...props.modelValue, ctoons: newCtoons })
  ctoonSearch.value = ''
}

function removeCtoon(i) {
  const newCtoons = props.modelValue.ctoons.filter((_, idx) => idx !== i)
  emit('update:modelValue', { ...props.modelValue, ctoons: newCtoons })
}

function updateCtoonQty(i, qty) {
  const newCtoons = props.modelValue.ctoons.map((e, idx) => idx === i ? { ...e, qty } : e)
  emit('update:modelValue', { ...props.modelValue, ctoons: newCtoons })
}

function addBackground(bgId) {
  if (!bgId || props.modelValue.backgroundIds.includes(bgId)) return
  emit('update:modelValue', { ...props.modelValue, backgroundIds: [...props.modelValue.backgroundIds, bgId] })
}

function removeBackground(bgId) {
  emit('update:modelValue', { ...props.modelValue, backgroundIds: props.modelValue.backgroundIds.filter(id => id !== bgId) })
}

function bgLabel(bgId) {
  return props.bgOptions.find(b => b.id === bgId)?.label || bgId
}

function bgImagePath(bgId) {
  return props.bgOptions.find(b => b.id === bgId)?.imagePath || ''
}
</script>
