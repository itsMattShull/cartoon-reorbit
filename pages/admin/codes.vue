<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
    <Nav />

    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-semibold">Claim Codes</h1>
        <NuxtLink
          to="/admin/create-code"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create New Code
        </NuxtLink>
      </div>

      <div v-if="error" class="text-red-600 mb-4">{{ error.message }}</div>
      <div v-if="pending" class="text-gray-500">Loading…</div>

      <table v-if="codes && codes.length" class="w-full table-auto border-collapse">
        <thead>
          <tr class="bg-gray-100">
            <th class="px-4 py-2 text-left">Code</th>
            <th class="px-4 py-2 text-left">Expires At</th>
            <th class="px-4 py-2 text-right"># cToons</th>
            <th class="px-4 py-2 text-right">Points</th>
            <th class="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in codes"
            :key="c.code"
            class="border-b hover:bg-gray-50"
          >
            <td class="px-4 py-2">{{ c.code }}</td>
            <td class="px-4 py-2">
              <span v-if="c.expiresAt">
                {{ new Date(c.expiresAt).toLocaleDateString() }}
              </span>
              <span v-else class="text-gray-500">Never</span>
            </td>
            <td class="px-4 py-2 text-right">
              {{ countCtoons(c) }}
            </td>
            <td class="px-4 py-2 text-right">
              {{ countPoints(c) }}
            </td>
            <td class="px-4 py-2 text-right">
              <NuxtLink
                :to="`/admin/edit-code?code=${encodeURIComponent(c.code)}`"
                class="text-blue-600 hover:underline"
              >
                Edit
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-else class="text-gray-500">No codes found.</div>
    </div>
  </div>
</template>

<script setup>
import { useFetch } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth','admin'],
  layout: 'default'
})

// Fetch the list of codes from your admin API
const { data: codes, pending, error } = await useFetch('/api/admin/codes')

// Helper to sum up all points for a code
function countPoints(code) {
  return (code.rewards || []).reduce((sum, r) => sum + (r.points || 0), 0)
}

// Helper to sum up all cToon quantities
function countCtoons(code) {
  return (code.rewards || []).reduce(
    (sum, r) =>
      sum + ((r.ctoons || []).reduce((s2, rc) => s2 + (rc.quantity || 0), 0)),
    0
  )
}
</script>

<style scoped>
/* ensure the table columns align */
th,
td {
  vertical-align: middle;
}
</style>
