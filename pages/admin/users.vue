<template>
  <Nav />

  <div class="p-4 mt-16 max-w-6xl mx-auto">
    <div class="mb-6">
      <input
        v-model="filter"
        type="text"
        placeholder="Search by username or discordTag…"
        class="w-full md:w-1/3 border rounded px-3 py-2"
      />
    </div>

    <!-- Desktop Table -->
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full bg-white rounded shadow">
        <thead class="bg-gray-100">
          <tr>
            <th class="px-4 py-2 text-left">Username</th>
            <th class="px-4 py-2 text-left">Discord Tag</th>
            <th class="px-4 py-2 text-center">In Discord?</th> 
            <th class="px-4 py-2 text-right"># Unique cToons</th>
            <th class="px-4 py-2 text-right">Points</th>
            <th class="px-4 py-2 text-left">Joined</th>
            <th class="px-4 py-2 text-left">Last Login</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in filtered" :key="u.id" class="border-t">
            <td class="px-4 py-2">{{ u.username }}</td>
            <td class="px-4 py-2">{{ u.discordTag }}</td>
            <td class="px-4 py-2 text-center">
              <span
                v-if="u.inGuild"
                class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs"
              >Yes</span>
              <span
                v-else
                class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs"
              >No</span>
            </td>
            <td class="px-4 py-2 text-right">{{ u.uniqueCtoons }}</td>
            <td class="px-4 py-2 text-right">{{ u.points }}</td>
            <td class="px-4 py-2">{{ formatDate(u.joined) }}</td>
            <td class="px-4 py-2">{{ formatDate(u.lastLogin) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Mobile Cards -->
    <div class="md:hidden grid grid-cols-1 gap-4">
      <div
        v-for="u in filtered"
        :key="u.id"
        class="border rounded p-4 shadow"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold text-lg">{{ u.username }}</div>
          <span
            v-if="u.inGuild"
            class="bg-green-100 text-green-800 px-2 py-1 rounded text-xs"
          >Active</span>
          <span
            v-else
            class="bg-red-100 text-red-800 px-2 py-1 rounded text-xs"
          >Off-guild</span>
        </div>
        <div class="text-sm text-gray-600 mb-2">{{ u.discordTag }}</div>
        <div class="flex justify-between text-sm mb-2">
          <div># cToons: {{ u.uniqueCtoons }}</div>
          <div>Pts: {{ u.points }}</div>
        </div>
        <div class="text-sm text-gray-600">Joined: {{ formatDate(u.joined) }}</div>
        <div class="text-sm text-gray-600">Last Login: {{ formatDate(u.lastLogin) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAsyncData } from '#app'
import Nav from '~/components/Nav.vue'

// page meta (assumes you have an 'admin' middleware)
definePageMeta({
  middleware: ['auth','admin'],
  layout: 'default'
})

// fetch the list
const { data: raw, error } = await useAsyncData('admin-users', () =>
  $fetch('/api/admin/users')
)
if (error.value) throw error.value

const users  = ref(raw.value || [])
const filter = ref('')

const filtered = computed(() => {
  const q = filter.value.toLowerCase().trim()
  if (!q) return users.value
  return users.value.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.discordTag.toLowerCase().includes(q)
  )
})

// helper to format the dates
const formatDate = dt => {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
/* any styling tweaks here */
</style>
