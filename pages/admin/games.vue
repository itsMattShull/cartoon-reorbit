<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-12">
    <h1 class="text-3xl font-bold mb-6">Admin: Game Configuration</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
      <h2 class="text-2xl font-semibold mb-4">Winball Settings</h2>

      <!-- Points Inputs -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div>
          <label class="block text-sm font-medium text-gray-700">Left Cup Points</label>
          <input
            type="number"
            v-model.number="leftCupPoints"
            class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Right Cup Points</label>
          <input
            type="number"
            v-model.number="rightCupPoints"
            class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700">Gold Cup Points</label>
          <input
            type="number"
            v-model.number="goldCupPoints"
            class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <!-- Grand Prize cToon Autocomplete -->
      <div class="mb-6 relative">
        <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
        <input
          type="text"
          v-model="searchTerm"
          @focus="showDropdown = true"
          @input="onSearchInput"
          :placeholder="grandPrizeCtoon ? grandPrizeCtoon.name : 'Type a cToon name…'"
          class="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
        <!-- Dropdown of matches -->
        <ul
          v-if="showDropdown && filteredMatches.length > 0"
          class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          <li
            v-for="c in filteredMatches"
            :key="c.id"
            @mousedown.prevent="selectCtoon(c)"
            class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-100"
          >
            <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
            <div>
              <p class="text-sm font-medium">{{ c.name }}</p>
              <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
            </div>
          </li>
        </ul>
        <!-- Clear selection button -->
        <button
          v-if="grandPrizeCtoon"
          @click="clearSelection"
          class="absolute top-0 right-0 mt-2 mr-2 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <!-- Display selected cToon preview -->
      <div v-if="grandPrizeCtoon" class="mt-4 flex items-center space-x-4">
        <img
          :src="grandPrizeCtoon.assetPath"
          alt="Grand Prize cToon Preview"
          class="w-16 h-16 rounded border"
        />
        <div>
          <p class="font-medium">{{ grandPrizeCtoon.name }}</p>
          <p class="text-sm text-gray-600 capitalize">{{ grandPrizeCtoon.rarity }}</p>
        </div>
      </div>

      <!-- Save Button -->
      <button
        @click="saveConfig"
        :disabled="loading"
        class="inline-flex items-center px-6 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50"
      >
        <span v-if="!loading">Save Settings</span>
        <span v-else>Saving...</span>
      </button>

      <!-- Toast -->
      <div
        v-if="toastMessage"
        :class="[
          'mt-4 px-4 py-2 rounded',
          toastType === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        ]"
      >
        {{ toastMessage }}
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed, watch } from 'vue'

  const leftCupPoints   = ref(0)
  const rightCupPoints  = ref(0)
  const goldCupPoints   = ref(0)

  const allCtoons       = ref([])
  const grandPrizeCtoon = ref(null)
  const selectedCtoonId = ref('')
  const searchTerm      = ref('')
  const showDropdown    = ref(false)

  const loading      = ref(false)
  const toastMessage = ref('')
  const toastType    = ref('')

  // Fetch existing config and C Toon list on mount
  onMounted(async () => {
    try {
      // 1) load Winball config
      const config = await $fetch('/api/admin/game-config?gameName=Winball')
      if (config) {
        leftCupPoints.value  = config.leftCupPoints
        rightCupPoints.value = config.rightCupPoints
        goldCupPoints.value  = config.goldCupPoints
        if (config.grandPrizeCtoon) {
          selectedCtoonId.value = config.grandPrizeCtoon.id
          grandPrizeCtoon.value = {
            id:        config.grandPrizeCtoon.id,
            name:      config.grandPrizeCtoon.name,
            rarity:    config.grandPrizeCtoon.rarity,
            assetPath: config.grandPrizeCtoon.assetPath
          }
          searchTerm.value = config.grandPrizeCtoon.name
        }
      }

      // 2) load all cToons for autocomplete
      allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath')

      window.addEventListener('click', (e) => {
        const dropdownEl = document.querySelector('.relative')
        if (dropdownEl && !dropdownEl.contains(e.target)) {
          showDropdown.value = false
        }
      })
    } catch (err) {
      console.error(err)
      toastMessage.value = 'Failed to load initial data'
      toastType.value    = 'error'
    }
  })

  // Compute matches based on searchTerm
  const filteredMatches = computed(() => {
    const term = searchTerm.value.trim().toLowerCase()
    if (!term) return []
    return allCtoons.value
      .filter(c => c.name.toLowerCase().includes(term))
      .slice(0, 8)  // limit to top 8 suggestions
  })

  // When user types, keep dropdown open
  function onSearchInput() {
    showDropdown.value = !!searchTerm.value.trim()
    // If the user clears input, also clear selection
    if (!searchTerm.value.trim()) {
      clearSelection()
    }
  }

  // When user clicks a suggestion
  function selectCtoon(c) {
    selectedCtoonId.value = c.id
    grandPrizeCtoon.value = c
    searchTerm.value = c.name
    showDropdown.value = false
  }

  // Clear the selection and input
  function clearSelection() {
    selectedCtoonId.value = ''
    grandPrizeCtoon.value = null
    searchTerm.value = ''
    showDropdown.value = false
  }

  // Save updated config
  async function saveConfig() {
    loading.value = true
    toastMessage.value = ''
    try {
      await $fetch('/api/admin/game-config', {
        method: 'POST',
        body: {
          gameName:          'Winball',
          leftCupPoints:     leftCupPoints.value,
          rightCupPoints:    rightCupPoints.value,
          goldCupPoints:     goldCupPoints.value,
          grandPrizeCtoonId: selectedCtoonId.value || null
        }
      })
      toastMessage.value = 'Settings saved successfully'
      toastType.value    = 'success'
    } catch (err) {
      console.error(err)
      toastMessage.value = 'Error saving settings'
      toastType.value    = 'error'
    } finally {
      loading.value = false
    }
  }
</script>

<style scoped>
img {
  object-fit: cover;
}
</style>
