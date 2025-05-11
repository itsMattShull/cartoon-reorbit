<!-- components/Modal.vue -->
<template>
  <div class="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
    <div class="bg-gray-800 rounded-lg p-6 w-11/12 max-w-md">
      <slot></slot>
      <button
        v-if="!hideCloseButton"
        @click="$emit('close')"
        class="mt-4 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
      >
        Close
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: "Modal",
  props: {
    hideCloseButton: {
      type: Boolean,
      default: false
    }
  }
}
</script>
