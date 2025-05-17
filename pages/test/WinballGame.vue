<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-200 to-purple-300">
    <h1 class="text-4xl font-bold mb-6">Winball</h1>
    <div class="relative w-64 h-96 bg-white border-4 border-gray-700 rounded-xl flex flex-col justify-end">
      <div v-for="(row, rowIndex) in pinRows" :key="rowIndex" class="absolute w-full" :style="{ bottom: `${rowIndex * 40 + 80}px` }">
        <div class="flex justify-center gap-8" :class="{ 'ml-6': rowIndex % 2 !== 0 }">
          <div v-for="(pin, pinIndex) in row" :key="pinIndex" class="w-2 h-2 bg-black rounded-full"></div>
        </div>
      </div>
      <Ball v-if="isDropping" :position="ballPosition" :isDropping="isDropping" :xOffset="ballXOffset" />
      <div class="absolute bottom-0 w-full grid grid-cols-5 gap-1 px-2 py-2">
        <Slot v-for="(slot, index) in slots" :key="index" :points="slot.points" />
      </div>
    </div>
    <button @click="dropBall" class="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition">Drop Ball</button>
    <ScoreBoard :score="score" />
  </div>
</template>

<script setup>
import Ball from '~/components/Ball.vue'
import Slot from '~/components/Slot.vue'
import ScoreBoard from '~/components/ScoreBoard.vue'
import { ref } from 'vue'

const slots = ref([
  { points: 10 },
  { points: 50 },
  { points: 100 },
  { points: 50 },
  { points: 10 },
])

const score = ref(0)
const isDropping = ref(false)
const ballPosition = ref(350)
const selectedSlotIndex = ref(0)
const ballLeft = ref('50%')
const ballXOffset = ref(0)

const pinRows = ref(Array.from({ length: 8 }, (_, i) => Array.from({ length: i % 2 === 0 ? 7 : 6 })))

const startTime = ref(null)
const duration = 1200
const bounceSteps = 12
const bounceInterval = duration / bounceSteps
let bounceIndex = 0

function animatePlinkoDrop(timestamp) {
  if (!startTime.value) startTime.value = timestamp
  const elapsed = timestamp - startTime.value
  const progress = Math.min(elapsed / duration, 1)

  ballPosition.value = 350 - (290 * progress)

  const slotWidth = 256 / slots.value.length
  const baseX = (selectedSlotIndex.value * slotWidth) - 128 + (slotWidth / 2)

  if (elapsed >= bounceIndex * bounceInterval && bounceIndex <= bounceSteps) {
    const direction = bounceIndex % 2 === 0 ? -1 : 1
    const intensity = (1 - progress) * 20
    const bounceX = baseX + direction * intensity
    ballXOffset.value = bounceX
    bounceIndex++
  }

  if (progress < 1) {
    requestAnimationFrame(animatePlinkoDrop)
  } else {
    // Lock ball to center of the selected slot at end
    ballXOffset.value = baseX
    score.value += slots.value[selectedSlotIndex.value].points
    isDropping.value = false
    startTime.value = null
    bounceIndex = 0
  }
}

function dropBall() {
  if (isDropping.value) return
  isDropping.value = true
  ballPosition.value = 350

  const rand = Math.random()
  let index
  if (rand < 0.05) {
    index = 2 // 100 points
  } else if (rand < 0.35) {
    index = Math.random() < 0.5 ? 1 : 3 // 50 points
  } else {
    index = Math.random() < 0.5 ? 0 : 4 // 10 points
  }
  selectedSlotIndex.value = index
  ballLeft.value = `calc(${(index + 0.5) * (100 / slots.value.length)}% - 12px)`

  // Added targetX calculation for final horizontal placement
  const slotWidth = 256 / slots.value.length
  const targetX = (selectedSlotIndex.value * slotWidth) - 128 + (slotWidth / 2)

  bounceIndex = 0
  ballXOffset.value = 0

  requestAnimationFrame(animatePlinkoDrop)
}
</script>

<style scoped>
</style>
