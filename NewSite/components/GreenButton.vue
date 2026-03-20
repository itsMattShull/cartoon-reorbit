<template>
  <button class="green-button">
    <slot />
  </button>
</template>

<style scoped>
.green-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 14px;
  border-radius: 6px;
  border: 2px solid #2a6a00;
  background: var(--OrbitGreen);
  color: white;
  font-weight: bold;
  font-size: 0.8rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset -1px 0 0 rgba(255, 255, 255, 0.4),
    -1px 1px 1px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}

.green-button:hover {
  background: var(--OrbitGreen);
}

.green-button:active {
  background: var(--OrbitGreen);
  box-shadow:
    inset 0 1px 0 rgba(0, 0, 0, 0.2),
    0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
