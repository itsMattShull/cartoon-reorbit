<template>
  <div
    class="absolute w-6 h-6 rounded-full bg-red-500 shadow-lg"
    :style="{
      bottom: `${position}px`,
      left: '50%',
      transform: `translateX(-50%) translateX(${xOffset}px)`
    }"
  ></div>
</template>

<script setup>
const props = defineProps({
  position: {
    type: Number,
    required: true
  },
  isDropping: {
    type: Boolean,
    required: true
  },
  xOffset: {
    type: Number,
    required: true
  }
})
</script>

<style scoped>
@keyframes bounce-horizontal {
  0%, 100% { transform: translateX(-50%) translateX(0); }
  25% { transform: translateX(-50%) translateX(-5px); }
  75% { transform: translateX(-50%) translateX(5px); }
}

/* Removed the animation class as per instructions */
</style>
