<template>
  <div ref="root" class="w-full h-auto flex items-center justify-center" :style="{ minHeight: placeholderHeight }">
    <img
      v-if="visible"
      :src="src"
      loading="lazy"
      :class="imageClass"
      :alt="alt"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  src:       { type: String, required: true },
  alt:       { type: String, default: '' },
  imageClass:{ type: String, default: '' },
  placeholderHeight: { type: String, default: '8rem' } // reserve space until loaded
})

const root    = ref(null)
const visible = ref(false)
let   io

onMounted(() => {
  io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      visible.value = true
      io.disconnect()
    }
  }, { rootMargin: '200px' })

  if (root.value) io.observe(root.value)
})

onBeforeUnmount(() => {
  if (io) io.disconnect()
})
</script>
