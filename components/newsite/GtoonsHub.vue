<template>
  <div class="gtoons-hub">
    <!-- Tab bar -->
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

    <!-- Tab content -->
    <div class="gtoons-content">
      <GtoonsClashPlayVsAI
        v-if="activeTab === 'play-ai'"
        @switch-tab="switchTab"
      />
      <GtoonsClashRooms v-else-if="activeTab === 'rooms'" />
      <GtoonsClashDecks v-else-if="activeTab === 'decks'" />
      <GtoonsClashTournaments v-else-if="activeTab === 'tournaments'" />
      <GtoonsClashLeaderboard v-else-if="activeTab === 'leaderboard'" />
      <GtoonsClashMeta v-else-if="activeTab === 'meta'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const TABS = [
  { id: 'play-ai',      label: 'Play vs AI'    },
  { id: 'rooms',        label: 'Play vs Others' },
  { id: 'decks',        label: 'Manage Decks'  },
  { id: 'tournaments',  label: 'Tournaments'   },
  { id: 'leaderboard',  label: 'Leaderboard'   },
  { id: 'meta',         label: 'Meta'          },
]

const activeTab = ref('play-ai')

function switchTab(tabId) {
  activeTab.value = tabId
}
</script>

<style scoped>
.gtoons-hub {
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

.gtoons-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.gtoons-content > * {
  flex: 1;
  min-height: 0;
}
</style>
