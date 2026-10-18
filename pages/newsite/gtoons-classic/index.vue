<template>
  <div class="gtoons-classic-hub">
    <div class="ah-topbar">
      <div class="ah-tabs">
        <button
          v-for="t in visibleTabs"
          :key="t.id"
          class="ah-tab"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >{{ t.label }}</button>
      </div>
      <!-- Reachable from every tab, so a player with no deck yet can still learn the game first. -->
      <button
        v-if="tutorialAvailable"
        class="ah-tutorial"
        data-tut-entry="hub"
        :disabled="startingTutorial"
        @click="launchTutorial"
      >{{ startingTutorial ? 'Starting…' : 'Tutorial' }}</button>
    </div>

    <div class="gtoons-classic-content">
      <p v-if="!visibleTabs.length" class="gtoons-classic-unavailable">
        gToons is currently unavailable. Check back soon!
      </p>
      <div v-else-if="!ready" class="gtoons-classic-loading"></div>
      <OgGtoonDecks v-else-if="activeTab === 'decks'" />
      <OgGtoonMatchmaking v-else-if="activeTab === 'matchmaking'" @start-tutorial="launchTutorial" />
      <OgGtoonLeaderboard v-else-if="activeTab === 'leaderboard'" />
    </div>

    <!-- First visit: offer the guided tutorial once. Either button counts as having seen it. -->
    <transition name="fade">
      <div v-if="promptOpen" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3">
        <div class="bg-gray-900 border border-white/20 rounded-xl p-5 w-[26rem] max-w-full text-white text-center">
          <h2 class="text-xl font-bold mb-2">New to gToons?</h2>
          <p class="text-sm text-gray-300 mb-4">
            Take a guided match with a ready-made deck. It walks you through every rule, step by step, with no timers,
            and it doesn't touch your points or your cards. You can replay it any time from the Tutorial button.
          </p>
          <div class="flex justify-center gap-2">
            <button class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm" @click="dismissPrompt">Maybe later</button>
            <button class="bg-green-500 hover:bg-green-600 px-5 py-2 rounded text-sm font-semibold" @click="acceptPrompt">Start the tutorial</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from '#imports'
import OgGtoonDecks from '@/components/oggtoons/OgGtoonDecks.vue'
import OgGtoonMatchmaking from '@/components/oggtoons/OgGtoonMatchmaking.vue'
import OgGtoonLeaderboard from '@/components/oggtoons/OgGtoonLeaderboard.vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

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

// Practice is a button on the Matchmaking tab, not a tab of its own.
const TABS = [
  { id: 'decks',       label: 'Manage Deck',  flag: 'deckBuildingEnabled' },
  { id: 'matchmaking', label: 'Matchmaking',  flag: 'matchmakingEnabled' },
  { id: 'leaderboard', label: 'Leaderboard',  flag: 'leaderboardEnabled' }
]
// Defaults to everything on so the tabs don't flash hidden-then-shown while the config fetch
// is in flight — an admin closing a section is a rare, deliberate action, not something that
// needs to race the page's first paint.
const config = ref({ matchmakingEnabled: true, gameEnabled: true, deckBuildingEnabled: true, leaderboardEnabled: true, practiceEnabled: true })
const visibleTabs = computed(() => TABS.filter(t => config.value[t.flag] !== false))
const route = useRoute()
const router = useRouter()
// ?tab=… (e.g. the match screen sending people back to Matchmaking) always wins; otherwise the tab is
// picked once the player's decks are known: Matchmaking if they have a deck they can play, else Manage Deck.
const requestedTab = TABS.some(t => t.id === route.query.tab) ? route.query.tab : null
const activeTab = ref(requestedTab || '')
const ready = ref(false)

watch([visibleTabs, ready], ([tabs, isReady]) => {
  if (isReady && tabs.length && !tabs.some(t => t.id === activeTab.value)) activeTab.value = tabs[0].id
}, { immediate: true })

/* ── Tutorial ────────────────────────────────────────────────────────────────────────────── */
const { currentMatchId, matchState, lastError, startTutorial } = useOgGtoonsSocket()
const tutorialAvailable = computed(() => config.value.gameEnabled !== false)
const startingTutorial = ref(false)
const promptOpen = ref(false)

function launchTutorial() {
  if (startingTutorial.value) return
  startingTutorial.value = true
  startTutorial()
  // The server answers with matchStart (we navigate below) or an error (re-enable the button).
  setTimeout(() => { startingTutorial.value = false }, 4000)
}
watch(lastError, (err) => { if (err) startingTutorial.value = false })
watch(currentMatchId, (id) => {
  if (id && matchState.value?.tutorial) router.push(`/newsite/gtoons-classic/${id}`)
})

function markTutorialSeen() {
  $fetch('/api/game/oggtoons/tutorial', { method: 'POST' }).catch(() => {})
}
function dismissPrompt() {
  promptOpen.value = false
  markTutorialSeen()
}
function acceptPrompt() {
  promptOpen.value = false
  markTutorialSeen()
  launchTutorial()
}

onMounted(async () => {
  const [cfg, decks, seen] = await Promise.allSettled([
    $fetch('/api/game/oggtoons/config'),
    $fetch('/api/game/oggtoons/decks'),
    $fetch('/api/game/oggtoons/tutorial')
  ])
  // A failed config fetch leaves the optimistic defaults in place — it shouldn't hide gameplay that
  // server-side enforcement will still gate correctly per-action.
  if (cfg.status === 'fulfilled') config.value = cfg.value
  if (!requestedTab) {
    const hasDeck = decks.status === 'fulfilled' && decks.value.some(d => d.valid)
    const matchmakingOpen = config.value.matchmakingEnabled !== false
    activeTab.value = hasDeck && matchmakingOpen ? 'matchmaking' : 'decks'
  }
  ready.value = true
  // First visit only; never over a match that is already running.
  if (seen.status === 'fulfilled' && !seen.value.seen && tutorialAvailable.value && !currentMatchId.value) promptOpen.value = true
})
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

.ah-tutorial {
  padding: 3px 10px;
  border: none;
  border-radius: 4px;
  background: #f59e0b;
  color: #000;
  font-size: 0.62rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  white-space: nowrap;
}
.ah-tutorial:disabled { opacity: 0.6; cursor: default; }
.ah-tutorial:not(:disabled):hover { background: #fbbf24; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }

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
