<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
      <!-- Header -->
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">Holiday Events</h1>

        <!-- Create New Holiday Event -->
        <NuxtLink
          to="/newsite/admin/holidayEvents/new"
          class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          + Create Holiday Event
        </NuxtLink>
      </div>

      <!-- Content -->
      <div>
        <!-- Loading / error -->
        <div v-if="pending" class="text-gray-500 py-6 text-center">
          Loading events…
        </div>
        <div v-else-if="error" class="text-red-600 py-6 text-center">
          {{ error.message || 'Failed to fetch holiday events' }}
        </div>

        <!-- Data views -->
        <div v-else>
          <!-- TABLE VIEW (sm and up) -->
          <div class="overflow-x-auto rounded-lg border bg-white shadow hidden sm:block">
            <table class="min-w-full text-xs">
              <thead>
                <tr>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Name</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Start</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">End</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Items</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Pool</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                <tr v-for="e in events" :key="e.id" class="hover:bg-gray-50">
                  <td class="px-2 py-1.5 font-medium text-gray-900">{{ e.name }}</td>
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ formatDate(e.startsAt) }}</td>
                  <td class="px-2 py-1.5 whitespace-nowrap">{{ formatDate(e.endsAt) }}</td>
                  <td class="px-2 py-1.5 text-center">{{ countItems(e) }}</td>
                  <td class="px-2 py-1.5 text-center">{{ countPool(e) }}</td>
                  <td class="px-2 py-1.5">
                    <NuxtLink
                      :to="`/newsite/admin/holidayEvents/edit/${e.id}`"
                      class="px-3 py-1 text-xs border rounded-md hover:bg-gray-50"
                    >
                      Edit
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- CARD VIEW (below sm) -->
          <div class="grid grid-cols-1 gap-2 sm:hidden">
            <div
              v-for="e in events"
              :key="e.id"
              class="bg-white border rounded-lg shadow p-2"
            >
              <div class="space-y-0.5">
                <h2 class="text-xs font-semibold">{{ e.name }}</h2>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Start:</span> {{ formatDate(e.startsAt) }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">End:</span> {{ formatDate(e.endsAt) }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Items:</span> {{ countItems(e) }}</p>
                <p class="text-[11px] text-gray-600"><span class="text-gray-500">Pool:</span> {{ countPool(e) }}</p>
              </div>
              <NuxtLink
                :to="`/newsite/admin/holidayEvents/edit/${e.id}`"
                class="mt-2 block text-center px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                Edit
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>

const {
  data: events,
  pending,
  error
} = await useFetch('/api/admin/holiday-events', {
  key: 'holiday-events',
  credentials: 'include'
})

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString() : '–'
}

// Robust count helpers support multiple API shapes:
// - Prisma include: {_count: { items, poolEntries }}
// - Explicit counts: itemsCount, poolCount
// - Loaded arrays: items[], poolEntries[]
function countItems(e) {
  return e?._count?.items ?? e?.itemsCount ?? e?.items?.length ?? 0
}
function countPool(e) {
  return e?._count?.poolEntries ?? e?.poolCount ?? e?.poolEntries?.length ?? 0
}
</script>
