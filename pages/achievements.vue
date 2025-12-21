<template>
  <Nav />
  <div class="max-w-6xl mx-auto p-4">
    <h1 class="text-3xl font-bold mb-6">Achievements</h1>
    <div v-if="pending">Loading…</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div v-for="a in achievements" :key="a.id" class="border rounded p-4 flex gap-4">
        <img v-if="a.imagePath" :src="a.imagePath" alt="" class="w-20 h-20 object-cover rounded" />
        <div class="flex-1">
          <div class="font-semibold text-lg">{{ a.title }}</div>
          <div class="text-sm text-gray-600" v-if="a.description">{{ a.description }}</div>
          <div class="text-xs text-gray-500 mt-2">Achievers: {{ a.achievers }}</div>
          <div class="mt-2">
            <span class="inline-block text-xs px-2 py-1 rounded" :class="a.achieved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'">
              {{ a.achieved ? 'Achieved' : 'Not achieved' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const { data: achievements, pending } = await useFetch('/api/achievements')
</script>

