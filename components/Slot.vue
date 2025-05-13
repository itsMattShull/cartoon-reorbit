<template>
  <div class="h-12 bg-gray-300 rounded text-center flex items-center justify-center font-bold">
    {{ points }}
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  points: {
    type: Number,
    required: true
  }
})
</script>

<style scoped>
</style>