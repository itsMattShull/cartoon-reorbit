<template>
  <svg
    class="lock-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Body is identical in both states so only the shackle moves, which is
         what makes the two icons read as one control changing rather than two
         unrelated glyphs. -->
    <rect x="4" y="10.5" width="16" height="10.5" rx="2" :fill="filled ? 'currentColor' : 'none'" />
    <!-- Closed: the shackle comes down on both sides. Open: it stays up on the
         right, the conventional "unlocked" silhouette. Shape carries the state,
         not just colour, so it survives a monochrome or colour-blind view. -->
    <path v-if="locked" d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    <path v-else d="M8 10.5V7a4 4 0 0 1 8 0" />
  </svg>
</template>

<script setup>
defineProps({
  locked: { type: Boolean, default: false },
  // Solid body for the "on" treatment, outline for the affordance in its
  // resting state.
  filled: { type: Boolean, default: false }
})
</script>

<style scoped>
.lock-icon {
  width: 1em;
  height: 1em;
  display: block;
  flex-shrink: 0;
}
</style>
