<template>
  <div
    :class="[
      'fixed top-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded shadow-lg z-50',
      type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
    ]"
  >
    {{ message }}
  </div>
</template>

<script setup>
defineProps({
  message: String,
  type: {
    type: String,
    default: 'error' // can be 'error' or 'success'
  }
})
</script>

<style scoped>
/* Optional animation */
@keyframes fadeInOut {
  0% { opacity: 0; transform: translateY(-10px); }
  10% { opacity: 1; transform: translateY(0); }
  90% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-10px); }
}

.div {
  animation: fadeInOut 5s ease-in-out;
}
</style>
