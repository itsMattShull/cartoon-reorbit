<template>
  <div class="gtoons-classic-hub">
    <div class="ah-topbar">
      <div class="ah-tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="ah-tab"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >{{ t.label }}</button>
      </div>
    </div>

    <div class="gtoons-classic-content">
      <OgGtoonDecks v-if="activeTab === 'decks'" />
      <OgGtoonMatchmaking v-else-if="activeTab === 'matchmaking'" />
      <OgGtoonLeaderboard v-else-if="activeTab === 'leaderboard'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import OgGtoonDecks from '@/components/oggtoons/OgGtoonDecks.vue'
import OgGtoonMatchmaking from '@/components/oggtoons/OgGtoonMatchmaking.vue'
import OgGtoonLeaderboard from '@/components/oggtoons/OgGtoonLeaderboard.vue'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'gToons',
  description: 'Play gToons, the original 2002 Cartoon Orbit trading card game, on Cartoon ReOrbit. Build a 12-card deck and battle other players head-to-head.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const TABS = [
  { id: 'decks',       label: 'Manage Deck' },
  { id: 'matchmaking', label: 'Matchmaking' },
  { id: 'leaderboard', label: 'Leaderboard' }
]
const activeTab = ref('decks')
</script>

<style>
html {
  min-height: 100vh;
  background: linear-gradient(
    to bottom,
    #000000 0px,
    #000000 65px,
    #003466 115px,
    #003466 100%
  ) no-repeat fixed !important;
}

body {
  background: transparent !important;
  min-height: 100vh;
}
</style>

<style scoped>
.gtoons-classic-hub {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.ah-topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.ah-tabs { display: flex; flex: 1; gap: 2px; flex-wrap: wrap; }

.ah-tab {
  padding: 3px 8px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: rgba(0,0,0,0.2);
  color: rgba(255,255,255,0.45);
  font-size: 0.62rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}

.ah-tab.active { background: var(--OrbitLightBlue); color: #fff; }
.ah-tab:not(.active):hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }

.gtoons-classic-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.gtoons-classic-content > * {
  flex: 1;
  min-height: 0;
}
</style>
