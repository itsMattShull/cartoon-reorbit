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

      <table class="min-w-full table-auto border-collapse">
        <thead>
          <tr class="bg-gray-100">
            <th class="px-4 py-2 text-left">Asset</th>
            <th class="px-4 py-2 text-left">Name</th>
            <th class="px-4 py-2 text-left">Release Date</th>
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
