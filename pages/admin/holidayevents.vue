<template>
  <Nav />
  <div class="p-6 space-y-6 mt-16 md:mt-20">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">Holiday Events</h1>

      <!-- Create New Holiday Event -->
      <NuxtLink
        to="/admin/addHolidayEvent"
        class="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Holiday Event
      </NuxtLink>
    </div>

    <!-- Content -->
    <div>
      <!-- Loading / error -->
      <div v-if="pending" class="flex items-center justify-center py-10 text-gray-500">
        Loading events…
      </div>
      <div v-else-if="error" class="flex items-center justify-center py-10 text-red-600">
        {{ error.message || 'Failed to fetch holiday events' }}
      </div>

      <!-- Data views -->
      <div v-else>
        <!-- TABLE VIEW (sm and up) -->
        <div class="overflow-x-auto rounded-lg border border-gray-200 shadow-sm hidden sm:block">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50 text-left text-sm font-semibold text-gray-700">
              <tr>
                <th class="px-4 py-3">Name</th>
                <th class="px-4 py-3">Start</th>
                <th class="px-4 py-3">End</th>
                <th class="px-4 py-3">Items</th>
                <th class="px-4 py-3">Pool</th>
                <th class="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 text-sm">
              <tr v-for="e in events" :key="e.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 font-medium text-gray-900">{{ e.name }}</td>
                <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(e.startsAt) }}</td>
                <td class="px-4 py-3 whitespace-nowrap">{{ formatDate(e.endsAt) }}</td>
                <td class="px-4 py-3 text-center">{{ countItems(e) }}</td>
                <td class="px-4 py-3 text-center">{{ countPool(e) }}</td>
                <td class="px-4 py-3">
                  <NuxtLink
                    :to="`/admin/edit-holidayevent/${e.id}`"
                    class="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Edit
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- CARD VIEW (below sm) -->
        <div class="space-y-4 block sm:hidden">
          <div
            v-for="e in events"
            :key="e.id"
            class="bg-white rounded-lg p-4 shadow hover:shadow-md"
          >
            <div class="space-y-1">
              <h2 class="text-lg font-semibold">{{ e.name }}</h2>
              <p class="text-sm"><strong>Start:</strong> {{ formatDate(e.startsAt) }}</p>
              <p class="text-sm"><strong>End:</strong> {{ formatDate(e.endsAt) }}</p>
              <p class="text-sm"><strong>Items:</strong> {{ countItems(e) }}</p>
              <p class="text-sm"><strong>Pool:</strong> {{ countPool(e) }}</p>
            </div>
            <NuxtLink
              :to="`/admin/edit-holidayevent/${e.id}`"
              class="mt-4 inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-center text-sm font-medium"
            >
              Edit
            </NuxtLink>
          </div>
        </div>
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
