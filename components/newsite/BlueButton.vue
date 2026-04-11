<template>
  <button class="blue-button">
    <slot />
  </button>
</template>

<style scoped>
.blue-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 14px;
  border-radius: 6px;
  border: 2px solid #1a5a9a;
  background: var(--OrbitLightBlue);
  color: white;
  font-weight: bold;
  font-size: 0.8rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    inset -1px 0 0 rgba(255, 255, 255, 0.4),
    -1px 1px 1px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}

.blue-button:hover {
  background: var(--OrbitLightBlue);
}

.blue-button:active {
  background: var(--OrbitLightBlue);
  box-shadow:
    inset 0 1px 0 rgba(0, 0, 0, 0.2),
    0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
