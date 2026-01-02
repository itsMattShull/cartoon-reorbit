<template>
  <div class="app-layout">
    <!-- Snow overlay (dashboard only)
    <div v-if="isDashboard" class="snow-overlay" aria-hidden="true">
      <div v-for="n in 80" :key="n" class="snowflake">
        <div class="snowflake-inner"></div>
      </div>
    </div> -->

    <!-- Page content -->
    <slot />
    <Onboarding />
  </div>
</template>

<script setup>
// Only show snow on the dashboard route
const route = useRoute()
const isDashboard = computed(() => route.path === '/dashboard')
</script>

<style scoped>
.app-layout {
  position: relative;
  min-height: 100vh;
}

/* Full-page overlay for snow, doesn't block clicks */
.snow-overlay {
  pointer-events: none;
  position: fixed;
  inset: 0;
  overflow: hidden;
  z-index: 9999;
}

/* Snowflake container – handles vertical fall */
.snowflake {
  position: absolute;
  top: -10px;
  animation-name: fall;
  animation-timing-function: linear;
  animation-iteration-count: infinite;

  /* Defaults that can be overridden via nth-child rules */
  --left: 50%;
  --duration: 15s;
  --delay: 0s;

  left: var(--left);
  animation-duration: var(--duration);
  animation-delay: var(--delay);
}

/* Inner flake – handles horizontal sway & size */
.snowflake-inner {
  width: var(--size, 6px);
  height: var(--size, 6px);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.8));
  animation-name: sway;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-duration: var(--sway-duration, 3s);
}

/* Keyframes */
@keyframes fall {
  0% {
    transform: translate3d(0, -10%, 0);
  }
  100% {
    transform: translate3d(0, 110vh, 0);
  }
}

@keyframes sway {
  0% {
    transform: translateX(-12px);
  }
  50% {
    transform: translateX(12px);
  }
  100% {
    transform: translateX(-12px);
  }
}

/* Variation across flakes – positions, sizes, speeds, delays */
.snowflake:nth-child(5n + 1) {
  --left: 5%;
  --duration: 18s;
  --delay: -2s;
  --size: 3px;
  --sway-duration: 4s;
}

.snowflake:nth-child(5n + 2) {
  --left: 25%;
  --duration: 14s;
  --delay: -4s;
  --size: 4px;
  --sway-duration: 3s;
}

.snowflake:nth-child(5n + 3) {
  --left: 45%;
  --duration: 20s;
  --delay: -1s;
  --size: 5px;
  --sway-duration: 5s;
}

.snowflake:nth-child(5n + 4) {
  --left: 65%;
  --duration: 16s;
  --delay: -3s;
  --size: 4px;
  --sway-duration: 3.5s;
}

.snowflake:nth-child(5n) {
  --left: 85%;
  --duration: 12s;
  --delay: -5s;
  --size: 6px;
  --sway-duration: 2.8s;
}

/* Extra randomness across more indices so it doesn't look too "striped" */
.snowflake:nth-child(7n + 1) {
  --left: 12%;
}
.snowflake:nth-child(7n + 3) {
  --left: 32%;
}
.snowflake:nth-child(7n + 5) {
  --left: 58%;
}
.snowflake:nth-child(7n + 6) {
  --left: 78%;
}
</style>
