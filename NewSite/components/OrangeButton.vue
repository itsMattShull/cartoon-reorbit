<template>
  <button class="orange-btn" v-bind="$attrs"><slot /></button>
</template>

<style scoped>
.orange-btn {
  background: #f47b00;
  color: #fff;
  font-weight: bold;
  font-size: 0.72rem;
  border: 2px solid #c05a00;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.orange-btn:hover:not(:disabled) { filter: brightness(1.1); }
.orange-btn:disabled { opacity: 0.5; cursor: default; }
</style>
