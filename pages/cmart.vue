<template>
  <Nav />
  <div class="pt-16 px-4 py-6 max-w-5xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">cMart - Gotta collect'em all</h1>

    <div class="flex justify-between items-center mb-4">
      <div class="flex items-center">
        <label class="mr-2 font-medium text-sm" for="sortBy">Sort / Filter by:</label>
        <select id="sortBy" v-model="sortBy" class="border rounded px-2 py-1 text-sm">
          <option value="releaseDateDesc">Release Time - Descending</option>
          <option value="releaseDateAsc">Release Time - Ascending</option>
          <option value="rarity">Rarity</option>
          <option value="series">Series</option>
          <option value="priceAsc">Price - Ascending</option>
          <option value="priceDesc">Price - Descending</option>
          <option value="owned">Owned</option>
          <option value="unowned">Unowned</option>
        </select>
      </div>
      <div class="bg-indigo-100 text-indigo-800 font-semibold px-4 py-2 rounded text-sm">
        My Points: {{ user?.points || 0 }}
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="ctoon in pagedCtoons"
        :key="ctoon.id"
        class="bg-white rounded-lg shadow-md p-4 flex flex-col items-center justify-between h-full"
      >
        <h2 class="text-xl font-semibold mb-2">{{ ctoon.name }}</h2>
        <div class="flex-grow flex items-center justify-center w-full mb-4">
          <img
            :src="ctoon.assetPath"
            alt="Ctoon Image"
            class="max-w-full h-auto"
            style="width: auto;"
          />
        </div>
        <div class="mt-auto w-full flex flex-col items-center">
          <p><span class="capitalize">{{ ctoon.series }}</span> &bull; <span class="capitalize">{{ ctoon.rarity }}</span></p>
          <p>Minted: {{ ctoon.minted }} out of {{ ctoon.quantity === null ? 'Unlimited' : ctoon.quantity }}</p>
        </div>
        <div class="w-full flex justify-end">
          <button
            @click="buyCtoon(ctoon)"
            :disabled="ctoon.quantity && ctoon.minted >= ctoon.quantity"
            class="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Buy for {{ ctoon.price }} Points
          </button>
        </div>
      </div>
    </div>

    <div class="mt-8 flex justify-center gap-4">
      <button
        @click="currentPage--"
        :disabled="currentPage === 1"
        class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
      >
        Previous
      </button>
      <button
        @click="currentPage++"
        :disabled="currentPage * itemsPerPage >= (sortedCtoons?.value?.length || 0)"
        class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
      >
        Next
      </button>
    </div>

    <Toast v-if="toastMessage" :message="toastMessage" :type="toastType" />
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'auth'
})
import { ref, onMounted, computed } from 'vue'
import { useAuth } from '@/composables/useAuth'
import Toast from '@/components/Toast.vue'
import Nav from '@/components/Nav.vue'
import * as Sentry from "@sentry/nuxt"

const { user, fetchSelf } = useAuth()
const ctoons = ref([])
const toastMessage = ref('')
const toastType = ref('error')
const sortBy = ref('releaseDateDesc')

const currentPage = ref(1)
const itemsPerPage = 50

const sortedCtoons = computed(() => {
  switch (sortBy.value) {
    case 'rarity':
      return [...ctoons.value].sort((a, b) => a.rarity.localeCompare(b.rarity))
    case 'series':
      return [...ctoons.value].sort((a, b) => a.series.localeCompare(b.series))
    case 'priceAsc':
      return [...ctoons.value].sort((a, b) => a.price - b.price)
    case 'priceDesc':
      return [...ctoons.value].sort((a, b) => b.price - a.price)
    case 'releaseDateAsc':
      return [...ctoons.value].sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))
    case 'owned':
      return [...ctoons.value].filter(c => c.owned).sort((a, b) => a.name.localeCompare(b.name))
    case 'unowned':
      return [...ctoons.value].filter(c => !c.owned).sort((a, b) => a.name.localeCompare(b.name))
    default: // 'releaseDateDesc'
      return [...ctoons.value].sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
  }
})

const pagedCtoons = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return sortedCtoons.value.slice(start, end)
})

onMounted(async () => {
  await fetchSelf()
  const ownedIds = new Set((user.value.ctoons || []).map(ct => ct.ctoonId))
  const response = await $fetch('/api/cmart')
  ctoons.value = response.map(ctoon => ({
    ...ctoon,
    minted: ctoon.owners?.length || 0,
    owned: ownedIds.has(ctoon.id)
  }))
})

const buyCtoon = async (ctoon) => {
  if (user.value.points < ctoon.price) {
    toastType.value = 'error'
    toastMessage.value = "You don't have enough points to buy this cToon."
    setTimeout(() => toastMessage.value = '', 5000)
    return
  }

  try {
    await $fetch('/api/cmart/buy', {
      method: 'POST',
      body: { ctoonId: ctoon.id }
    })
    await fetchSelf()
    // Explicitly update user points after fetching self
    if (user.value && typeof user.value.points === 'number') {
      user.value.points -= ctoon.price
    }
    const target = ctoons.value.find(x => x.id === ctoon.id)
    if (target) {
      target.minted++
    }
    toastType.value = 'success'
    toastMessage.value = 'Purchase successful!'
    setTimeout(() => toastMessage.value = '', 5000)
  } catch (err) {
    Sentry.withScope(scope => {
      // add any custom metadata you like:
      scope.setTag('page', 'dashboard');
      scope.setTag('user', user?.username);
      scope.setExtra('moreInfo', 'Failed while loading purchsing cToon');
      Sentry.captureException(err);
    });
    toastType.value = 'error'
    toastMessage.value = 'An error occurred while purchasing.'
    setTimeout(() => toastMessage.value = '', 5000)
  }
}
</script>
