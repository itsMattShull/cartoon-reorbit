<!-- components/HomepageVideoModal.vue -->
<!-- "Watch the video" popup for the logged-out homepage hero. The <video> element is only
     mounted while the modal is open (v-if) so an unopened homepage never fetches any video
     bytes, even with preload set. -->
<template>
  <Modal max-width-class="max-w-3xl" :hide-close-button="true" :close-on-backdrop="true" @close="$emit('close')">
    <div class="relative">
      <button
        type="button"
        aria-label="Close video"
        class="absolute z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
        style="top: max(0.5rem, env(safe-area-inset-top)); right: max(0.5rem, env(safe-area-inset-right));"
        @click="$emit('close')"
      >
        <svg viewBox="0 0 20 20" class="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.6l4.3-4.3a1 1 0 1 1 1.4 1.4L11.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 0 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </button>
      <video
        v-if="src"
        :src="src"
        :poster="poster || undefined"
        controls
        autoplay
        playsinline
        preload="none"
        class="w-full rounded-lg bg-black"
      ></video>
    </div>
  </Modal>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import Modal from '@/components/Modal.vue'

defineProps({
  src: { type: String, default: '' },
  poster: { type: String, default: '' }
})
const emit = defineEmits(['close'])

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>
