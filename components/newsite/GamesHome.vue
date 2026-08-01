<template>
  <div class="gameshome-wrap">
    <div class="gh-nav">
      <GreenButton :active="true">Games Home</GreenButton>
      <NuxtLink to="/newsite/leaderboards" class="gh-nav-link">
        <GreenButton>Leaderboards</GreenButton>
      </NuxtLink>
    </div>
    <div class="gameshome">
      <NuxtLink to="/newsite/newwinball" class="quadrant quadrant--shop">
        <img v-if="tiles.winball" :src="tiles.winball" alt="Winball" class="tile-img" />
        <span v-else>Winball</span>
      </NuxtLink>
      <NuxtLink to="/newsite/lottery" class="quadrant quadrant--collection">
        <img v-if="tiles.lotto" :src="tiles.lotto" alt="Lotto" class="tile-img" />
        <span v-else>Lotto</span>
      </NuxtLink>
      <NuxtLink to="/newsite/winwheel" class="quadrant quadrant--games">
        <img v-if="tiles.winwheel" :src="tiles.winwheel" alt="Win Wheel" class="tile-img" />
        <span v-else>Win Wheel</span>
      </NuxtLink>
      <NuxtLink to="/newsite/gtoons" class="quadrant quadrant--profile">
        <img v-if="tiles.clash" :src="tiles.clash" alt="gToons Clash" class="tile-img" />
        <span v-else>gToons Clash</span>
      </NuxtLink>
      <a
        href="https://playtko.win"
        target="_blank"
        rel="noopener noreferrer"
        class="quadrant quadrant--tko"
      >
        <img v-if="tiles.tko" :src="tiles.tko" alt="TKO" class="tile-img" />
        <span v-else>TKO</span>
      </a>
      <NuxtLink to="/newsite/reorbitmatch" class="quadrant quadrant--reorbit">
        <img v-if="tiles.reorbitmatch" :src="tiles.reorbitmatch" alt="ReOrbit Match" class="tile-img" />
        <span v-else>ReOrbit Match</span>
      </NuxtLink>
      <NuxtLink to="/newsite/tower" class="quadrant quadrant--tower">
        <img v-if="tiles.tower" :src="tiles.tower" alt="Tower Stack" class="tile-img" />
        <span v-else>Tower Stack</span>
      </NuxtLink>
      <NuxtLink to="/newsite/reorbitmemory" class="quadrant quadrant--reorbitmemory">
        <img v-if="tiles.reorbitmemory" :src="tiles.reorbitmemory" alt="ReOrbit Memory" class="tile-img" />
        <span v-else>ReOrbit Memory</span>
      </NuxtLink>
      <NuxtLink to="/newsite/guessctoon" class="quadrant quadrant--guessctoon">
        <img v-if="tiles.guessctoon" :src="tiles.guessctoon" alt="Guess that cToon!" class="tile-img" />
        <span v-else>Guess that cToon!</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
const { data: tileData } = useFetch('/api/game-tile-images', { default: () => ({}) })
const tiles = computed(() => tileData.value ?? {})
</script>

<style scoped>
.gameshome-wrap {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.gh-nav {
  display: flex;
  flex-direction: row;
  gap: 6px;
  padding: 6px 6px 0;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.gh-nav::-webkit-scrollbar { display: none; }

.gh-nav-link {
  text-decoration: none;
}

.gameshome {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(5, 1fr);
  width: 100%;
  flex: 1;
  gap: 6px;
  padding: 6px;
  box-sizing: border-box;
}

.quadrant {
  position: relative;
  overflow: hidden;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.tile-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.quadrant:hover {
  filter: brightness(1.15);
  transform: scale(1.02);
}

.quadrant:active {
  filter: brightness(0.9);
  transform: scale(0.98);
}

.quadrant--shop       { background: #1a6e3c; }
.quadrant--collection { background: #1a3e8a; }
.quadrant--games      { background: #7c2d8a; }
.quadrant--profile    { background: #8a4a1a; }
.quadrant--tko        { background: #8a1a32; }
.quadrant--reorbit    { background: #1a6a8a; }
.quadrant--tower      { background: #5a2a8a; }
.quadrant--reorbitmemory { background: #2a7a5a; }
.quadrant--guessctoon    { background: #8a2a5a; }

/* Ninth tile in a two-column grid would otherwise sit alone with an empty cell beside it. */
.quadrant--guessctoon { grid-column: 1 / -1; }

@media (max-width: 768px) {
  .gameshome {
    grid-template-columns: 1fr;
    /* Nine 70px-minimum rows can't fit in a fixed 100dvh-based height, so the grid used to
       overflow into a nested scroller inside the page's own scroller — on iOS the outer
       page then refuses to scroll until the inner one bottoms out. Let the page scroll
       instead. svh, not dvh, so the URL bar collapsing doesn't resize the tiles. */
    grid-template-rows: none;
    grid-auto-rows: minmax(84px, auto);
    height: auto;
    min-height: calc(100svh - 276px);
  }

  .quadrant--guessctoon { grid-column: auto; }
}
</style>
