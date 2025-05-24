<template>
  <Nav />
  <div class="p-6 space-y-6 mt-16">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">Packs</h1>

      <!-- Create New Pack button -->
      <NuxtLink
        to="/admin/new-pack"
        class="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        <!-- Plus icon -->
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create New Pack
      </NuxtLink>
    </div>

    <!-- Content -->
    <div>
      <!-- Loading / error states -->
      <div v-if="pending" class="flex items-center justify-center py-10 text-gray-500">Loading packs…</div>
      <div v-else-if="error" class="flex items-center justify-center py-10 text-red-600">{{ error.message || 'Failed to fetch packs' }}</div>

      <!-- Table -->
      <div v-else class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50 text-left text-sm font-semibold text-gray-700">
            <tr>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Price</th>
              <th class="px-4 py-3">Rarity Breakdown</th>
              <th class="px-4 py-3">Created</th>
              <th class="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 text-sm">
            <tr v-for="pack in packs" :key="pack.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 font-medium text-gray-900">{{ pack.name }}</td>
              <td class="px-4 py-3">{{ formatPrice(pack.price) }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ formatRarity(pack.rarityConfigs) }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(pack.createdAt) }}</td>
              <td class="px-4 py-3">
                <NuxtLink
                  :to="`/admin/edit-pack/${pack.id}`"
                  class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                  Edit
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: ['auth', 'admin'],
  layout: 'default'
})
const {
  data: packs,
  pending,
  error
} = await useFetch('/api/admin/packs', {
  key:  'packs',          // unique identifier for hydration
  credentials: 'include'  // send the session cookie in the browser
})

/* helper formatters */
function formatPrice (p) {
  return `${p.toLocaleString()} Points`
}
function formatRarity (arr) {
  return arr?.length ? arr.map(r => `${r.rarity} ×${r.count}`).join(', ') : '–'
}
function formatDate (d) {
  return new Date(d).toLocaleDateString()
}
</script>
