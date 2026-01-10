<template>
  <div v-if="story && sessionId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="onBackdrop">
    <div class="bg-white rounded-lg shadow-lg w-full max-w-md overflow-hidden">
      <!-- Header -->
      <div class="p-4 border-b">
        <h2 class="text-xl font-bold">{{ story?.title || 'Scavenger Hunt' }}</h2>
      </div>

      <!-- Body -->
      <div class="p-4 space-y-4">
        <template v-if="!result">
          <div v-if="step">
            <img v-if="step.imagePath" :src="step.imagePath" alt="" class="w-full h-40 object-cover rounded" />
            <p class="text-gray-800 whitespace-pre-line">{{ step.description }}</p>
            <div class="mt-4 flex gap-2">
              <button :disabled="loading" class="flex-1 px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50" @click="choose('A')">
                {{ step.optionA }}
              </button>
              <button :disabled="loading" class="flex-1 px-4 py-2 rounded bg-gray-200 text-gray-900 disabled:opacity-50" @click="choose('B')">
                {{ step.optionB }}
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="text-center">
            <template v-if="result.type === 'NOTHING'">
              <p class="text-lg font-semibold">You found nothing this time.</p>
              <p v-if="result.text" class="mt-2 text-sm text-gray-700">{{ result.text }}</p>
            </template>
            <template v-else-if="result.type === 'POINTS'">
              <p class="text-lg font-semibold">You won {{ result.points }} points! 🎉</p>
              <p v-if="result.text" class="mt-2 text-sm text-gray-700">{{ result.text }}</p>
            </template>
            <template v-else>
              <p class="text-lg font-semibold">You found an exclusive cToon! 🎉</p>
              <div v-if="result.ctoon" class="mt-3">
                <img :src="result.ctoon.assetPath" :alt="result.ctoon.name" class="w-24 h-24 object-contain mx-auto mb-2" />
                <div class="font-medium">{{ result.ctoon.name }}</div>
              </div>
              <p v-if="result.text" class="mt-2 text-sm text-gray-700">{{ result.text }}</p>
            </template>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="p-4 border-t text-right">
        <button class="px-4 py-2 rounded bg-indigo-600 text-white" @click="close">{{ result ? 'Close' : 'Cancel' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

const { sessionId, story, currentStep, result, loading, choose, close } = useScavengerHunt()
const step = computed(() => currentStep.value)

function onBackdrop() { close() }
</script>

<style scoped>
/* Tailwind handles the styling */
</style>
