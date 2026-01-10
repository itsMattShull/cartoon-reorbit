<template>
  <Nav />
  <div class="mt-12 max-w-6xl mx-auto p-4">
    <h1 class="mt-12 text-3xl font-bold mb-6">Achievements</h1>
    <div v-if="pending">Loading…</div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="a in achievements"
        :key="a.id"
        class="relative border rounded p-4 flex gap-4 cursor-pointer hover:bg-gray-50"
        @click="openModal(a)"
      >
        <span class="absolute top-2 right-2 inline-block text-xs px-2 py-1 rounded" :class="a.achieved ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'">
          {{ a.achieved ? 'Achieved' : 'Not achieved' }}
        </span>
        <img v-if="a.imagePath" :src="a.imagePath" alt="" class="w-20 h-20 object-cover rounded" />
        <div class="flex-1">
          <div class="font-semibold text-lg">{{ a.title }}</div>
          <div class="text-sm text-gray-600" v-if="a.description">{{ a.description }}</div>
          <div class="text-xs text-gray-500 mt-2">Achievers: {{ a.achievers }}</div>
        </div>
      </div>
    </div>
    
    <!-- Rewards Modal -->
    <div v-if="showModal && selected" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded shadow max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div class="px-4 pt-4 pb-2 flex items-center justify-between border-b">
          <h2 class="text-lg font-semibold">{{ selected.title }}</h2>
          <span v-if="selected.achieved" class="bg-green-600 text-white text-xs px-2 py-1 rounded">Achieved</span>
        </div>
        <div class="px-4 pb-4 pt-3 overflow-y-auto flex-1 min-h-0">
          <div class="space-y-4">
            <div v-if="selected.description" class="text-sm text-gray-700">
              {{ selected.description }}
            </div>
            <div v-if="selected.rewards?.points">
              <div class="font-medium">Points</div>
              <div class="text-sm">{{ formatNumber(selected.rewards.points) }}</div>
            </div>
            <div v-if="selected.rewards?.ctoons?.length">
              <div class="font-medium mb-2">cToons</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  v-for="(rc, i) in selected.rewards.ctoons"
                  :key="i"
                  class="relative bg-white border rounded p-3 flex flex-col items-center"
                >
                  <div class="w-full flex items-center justify-center mb-2 mt-2">
                    <img v-if="rc.imagePath" :src="rc.imagePath" class="max-w-full h-24 object-contain" alt="cToon image" />
                  </div>
                  <p class="text-sm font-medium text-center">{{ rc.name }}</p>
                  <p class="text-xs text-gray-600 text-center">× {{ rc.quantity }}</p>
                </div>
              </div>
            </div>
            <div v-if="selected.rewards?.backgrounds?.length">
              <div class="font-medium mb-2">Backgrounds</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div v-for="(rb, i) in selected.rewards.backgrounds" :key="i">
                  <img
                    v-if="rb.imagePath"
                    :src="rb.imagePath"
                    class="w-full h-auto object-contain rounded border"
                    :alt="rb.label || 'Background'"
                    :title="rb.label || 'Background'"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="px-4 py-3 border-t flex justify-end">
          <button class="px-4 py-2 border rounded" @click="closeModal">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ title: 'Achievements' })

const { data: achievements, pending } = await useFetch('/api/achievements')

const showModal = ref(false)
const selected = ref(null)

function openModal(a) {
  selected.value = a
  showModal.value = true
}
function closeModal() {
  showModal.value = false
  selected.value = null
}

function formatNumber(n) {
  const x = Number(n)
  return Number.isFinite(x) ? x.toLocaleString() : n
}
</script>
