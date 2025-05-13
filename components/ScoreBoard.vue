<template>
  <div class="mt-4 text-lg font-medium text-gray-800">
    Current Score: {{ score }}
  </div>
</template>

<script setup>
import { defineProps } from 'vue'

const props = defineProps({
  score: {
    type: Number,
    required: true
  }
})
</script>

<style scoped>
</style>