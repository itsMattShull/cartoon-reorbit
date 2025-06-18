<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16">
    <Nav />

    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
      <div class="flex justify-between items-center mb-4">
        <h1 class="text-2xl font-semibold">Claim Codes Admin</h1>
        <NuxtLink
          to="/admin/create-code"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Create New Code
        </NuxtLink>
      </div>

      <!-- Tabs -->
      <div class="mb-6 border-b">
        <nav class="flex -mb-px">
          <button
            @click="activeTab = 'created'"
            :class="activeTab === 'created' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'"
            class="px-4 py-2 mr-4"
          >
            Created Codes
          </button>
          <button
            @click="activeTab = 'claimed'"
            :class="activeTab === 'claimed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'"
            class="px-4 py-2"
          >
            Claimed Codes
          </button>
        </nav>
      </div>

      <!-- Created Codes Tab -->
      <div v-if="activeTab === 'created'">
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
              <td class="px-4 py-2 break-words">{{ c.code }}</td>
              <td class="px-4 py-2">
                <span v-if="c.expiresAt">
                  {{ new Date(c.expiresAt).toLocaleDateString() }}
                </span>
                <span v-else class="text-gray-500">Never</span>
              </td>
              <td class="px-4 py-2 text-right">{{ countCtoons(c) }}</td>
              <td class="px-4 py-2 text-right">{{ countPoints(c) }}</td>
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

      <!-- Claimed Codes Tab -->
      <div v-if="activeTab === 'claimed'">
        <div v-if="claimedError" class="text-red-600 mb-4">{{ claimedError.message }}</div>
        <div v-if="claimedPending" class="text-gray-500">Loading…</div>

        <table v-if="claimed && claimed.length" class="w-full table-auto border-collapse">
          <thead>
            <tr class="bg-gray-100">
              <th class="px-4 py-2 text-left">Code</th>
              <th class="px-4 py-2 text-left">User</th>
              <th class="px-4 py-2 text-left">Claimed At</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in claimed"
              :key="row.id"
              class="border-b hover:bg-gray-50"
            >
              <td class="px-4 py-2 break-words">{{ row.code }}</td>
              <td class="px-4 py-2">{{ row.user.username }}</td>
              <td class="px-4 py-2">
                {{ new Date(row.claimedAt).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="text-gray-500">No claims found.</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useFetch } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({
  middleware: ['auth','admin'],
  layout: 'default'
})

// Tab state
const activeTab = ref('created')

// Created codes
const { data: codes, pending, error } = await useFetch('/api/admin/codes')

// Claimed codes
const {
  data: claimed,
  pending: claimedPending,
  error: claimedError
} = await useFetch('/api/admin/codes/claimed')

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
th,
td {
  vertical-align: middle;
}
</style>
