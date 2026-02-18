<template>
  <div class="gtoon-overlay" aria-hidden="true">
    <div class="gtoon-power">
      <span class="gtoon-power-text">{{ power }}</span>
    </div>
    <div class="gtoon-cost">
      <span class="gtoon-cost-text">{{ cost }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  power: { type: [Number, String], required: true },
  cost: { type: [Number, String], required: true }
})
</script>

<style scoped>
.gtoon-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}
.gtoon-power {
  position: absolute;
  top: 65.5%;
  left: 65.7%;
  transform: translate(-50%, -50%);
}
.gtoon-cost {
  position: absolute;
  top: 47.8%;
  left: 79.5%;
  transform: translate(-50%, 0);
}
.gtoon-power-text {
  color: #fff;
  font-weight: 700;
  font-size: clamp(0.6rem, 24cqw, 1.5rem);
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
}
.gtoon-cost-text {
  color: #fff;
  font-weight: 700;
  font-size: clamp(0.35rem, 10cqw, 0.7rem);
  text-shadow: 0 0 2px rgba(0,0,0,0.8);
}
</style>
