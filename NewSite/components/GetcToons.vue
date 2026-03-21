<template>
  <div class="getctoons">
    <NuxtLink to="/newcmart" class="quadrant-link">
      <button class="quadrant quadrant--shop">cMart</button>
    </NuxtLink>
    <button class="quadrant quadrant--collection">Auctions</button>
    <button class="quadrant quadrant--games">Trades</button>
    <button class="quadrant quadrant--profile">Placeholder</button>
  </div>
</template>

<style scoped>
.getctoons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  width: 100%;
  height: 100%;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
}

.quadrant {
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
  user-select: none;
}

.quadrant:hover {
  filter: brightness(1.15);
  transform: scale(1.02);
}

.quadrant:active {
  filter: brightness(0.9);
  transform: scale(0.98);
}

.quadrant-link {
  display: contents;
  text-decoration: none;
}

.quadrant--shop       { background: #1a6e3c; }
.quadrant--collection { background: #1a3e8a; }
.quadrant--games      { background: #7c2d8a; }
.quadrant--profile    { background: #8a4a1a; }
</style>
