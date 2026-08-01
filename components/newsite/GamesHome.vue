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
      <NuxtLink to="/newsite/flappypowerpuff" class="quadrant quadrant--flappy">
        <img v-if="tiles.flappy" :src="tiles.flappy" alt="Flappy Powerpuff!" class="tile-img" />
        <span v-else>Flappy Powerpuff!</span>
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

/* 3x3 rather than 2 columns: there are 9 tiles, and 9 in a 2-column grid leaves an orphan in
   an implicit auto-height row. Because .tile-img is absolutely positioned it has no intrinsic
   height, so that row would collapse to nothing whenever the tile has an image configured.
   3x3 also fits the 800x669 desktop main-content box far better than 2x5 would. */
.gameshome {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  grid-auto-rows: 1fr;
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
.quadrant--flappy     { background: #2f6f9e; }

/* Hover is emulated on touch devices and sticks after a tap, leaving a tile permanently
   scaled and brightened. */
@media (hover: none) {
  .quadrant:hover { filter: none; transform: none; }
}

@media (max-width: 768px) {
  /* Two columns and auto rows rather than one column at a fixed height: 9 single-column rows
     need ~690px of minimum content inside a box capped near 576px on a modern phone, which
     overflows into a nested scroller inside an already-scrolling page. The tiles are images,
     so 2-up at ~190px is still a comfortable tap target. */
  .gameshome {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: none;
    grid-auto-rows: minmax(88px, auto);
    height: auto;
  }
}
</style>
