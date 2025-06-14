<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-16">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold">All cToons</h1>
        <NuxtLink
          to="/admin/addCtoon"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >Create cToon</NuxtLink>
      </div>

      <!-- TABLE VIEW (hidden on small screens) -->
      <div class="overflow-x-auto hidden sm:block">
        <table class="min-w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">Asset</th>
              <th class="px-4 py-2 text-left">Name</th>
              <th class="px-4 py-2 text-left">Release Date (CDT)</th>
              <th class="px-4 py-2 text-left">Rarity</th>
              <th class="px-4 py-2 text-right">Highest Mint</th>
              <th class="px-4 py-2 text-right">Quantity</th>
              <th class="px-4 py-2 text-center">In C-mart</th>
              <th class="px-4 py-2 text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in ctoons"
              :key="c.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2">
                <img
                  :src="c.assetPath"
                  :alt="c.name"
                  class="h-16 w-auto mx-auto rounded"
                />
              </td>
              <td class="px-4 py-2">{{ c.name }}</td>
              <td class="px-4 py-2">
                {{
                  new Date(c.releaseDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Chicago',
                    timeZoneName: 'short'
                  })
                }}
              </td>
              <td class="px-4 py-2">{{ c.rarity }}</td>
              <td class="px-4 py-2 text-right">{{ c.highestMint }}</td>
              <td class="px-4 py-2 text-right">
                {{ c.quantity == null ? 'Unlimited' : c.quantity }}
              </td>
              <td class="px-4 py-2 text-center">
                {{ c.inCmart ? 'Yes' : 'No' }}
              </td>
              <td class="px-4 py-2 text-right">
                <NuxtLink
                  :to="`/admin/editCtoon/${c.id}`"
                  class="text-blue-600 hover:text-blue-800"
                >Edit</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- CARD VIEW (visible on small devices only) -->
      <div class="space-y-4 block sm:hidden">
        <div
          v-for="c in ctoons"
          :key="c.id"
          class="bg-gray-100 rounded-lg p-4 flex items-start space-x-4"
        >
          <img
            :src="c.assetPath"
            :alt="c.name"
            class="max-w-[80px] w-auto flex-shrink-0 object-contain rounded"
          />
          <div class="flex-1 flex flex-col justify-between">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">{{ c.name }}</h2>
              <p class="text-sm text-gray-600">
                {{
                  new Date(c.releaseDate).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Chicago'
                  })
                }}
              </p>
              <p class="mt-1 text-sm"><strong>Rarity:</strong> {{ c.rarity }}</p>
              <p class="text-sm"><strong>Highest Mint:</strong> {{ c.highestMint }}</p>
              <p class="text-sm"><strong>Quantity:</strong> {{ c.quantity == null ? 'Unlimited' : c.quantity }}</p>
              <p class="text-sm"><strong>In C-mart:</strong> {{ c.inCmart ? 'Yes' : 'No' }}</p>
            </div>
            <NuxtLink
              :to="`/admin/editCtoon/${c.id}`"
              class="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center text-sm font-medium self-end"
            >
              Edit
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- sentinel for infinite scroll -->
      <div ref="sentinel" class="h-2"></div>

      <!-- loading & end indicators -->
      <div v-if="loading" class="text-center py-4">Loading more…</div>
      <div v-if="finished" class="text-center py-4 text-gray-500">No more cToons.</div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})
import { ref, onMounted } from 'vue'
import Nav from '~/components/Nav.vue'

const take = 20
const skip = ref(0)
const ctoons = ref([])
const loading = ref(false)
const finished = ref(false)
const sentinel = ref(null)

async function loadNext() {
  if (loading.value || finished.value) return
  loading.value = true

  const res = await fetch(
    `/api/admin/all-ctoons?skip=${skip.value}&take=${take}`,
    { credentials: 'include' }
  )
  if (!res.ok) {
    loading.value = false
    return
  }
  const page = await res.json()
  if (page.length < take) finished.value = true
  ctoons.value.push(...page)
  skip.value += take
  loading.value = false
}

onMounted(() => {
  loadNext()

  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadNext()
    },
    { rootMargin: '200px' }
  )
  if (sentinel.value) obs.observe(sentinel.value)
})
</script>

<style scoped>
th, td { vertical-align: middle; }
</style>
