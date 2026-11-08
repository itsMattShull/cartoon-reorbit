<!-- pages/newsite/gtoons-classic/tournaments/[tid].vue -->
<!-- One OG gToons tournament on its own address: /newsite/gtoons-classic/tournaments/<id>.
     This is where every tournament Discord message links. It shows everything about the tournament — opt in / out while
     the window is open, who your next match is with, the Start next game button, standings and rounds while it runs,
     and the prizes and final placings — and sends you to the board the moment a game starts. -->
<template>
  <div class="ogt-page h-full flex flex-col text-white">
    <div class="ogt-topbar">
      <NuxtLink to="/newsite/gtoons-classic?tab=tournaments" class="ogt-back">← All tournaments</NuxtLink>
      <NuxtLink to="/newsite/gtoons-classic?tab=matchmaking" class="ogt-back">Matchmaking</NuxtLink>
    </div>

    <div class="flex-1 overflow-y-auto">
      <div v-if="unavailable" class="px-3 py-6 max-w-5xl mx-auto">
        <p class="p-3 rounded bg-white/10 border border-white/20 text-sm">{{ unavailable }}</p>
      </div>
      <!-- :key so moving between two tournaments reloads the panel instead of reusing the old one's state -->
      <OgGtoonTournamentPanel
        v-else
        :key="tournamentId"
        :tournament-id="tournamentId"
        @switch-tab="goTab"
        @open-match="openMatch"
      />
    </div>

    <!-- "Your opponent is ready" — over this page too, so a ping for another pairing isn't missed. -->
    <OgGtoonTournamentReadyModal />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from '#imports'
import OgGtoonTournamentPanel from '@/components/oggtoons/OgGtoonTournamentPanel.vue'
import OgGtoonTournamentReadyModal from '@/components/oggtoons/OgGtoonTournamentReadyModal.vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'gToons Tournament',
  description: 'An original gToons tournament on Cartoon ReOrbit: enter with a locked deck, see your next match and the standings.'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

const route = useRoute()
const router = useRouter()
const tournamentId = computed(() => String(route.params.tid || ''))
const unavailable = ref('')

const { currentMatchId } = useOgGtoonsSocket()

// Both players pressed Start next game: the server starts the game and every client is told its id. Take them to the
// board, the same as the hub does for any match (a request someone accepted, the random queue, practice...).
watch(currentMatchId, (id) => {
  if (id) router.push(`/newsite/gtoons-classic/${id}`)
})

function openMatch(id) {
  if (id) router.push(`/newsite/gtoons-classic/${id}`)
}
// The panel asks for another hub tab (e.g. "Build one on the Manage Deck tab").
function goTab(tab) {
  router.push(`/newsite/gtoons-classic?tab=${encodeURIComponent(tab)}`)
}

// A tournaments switch that is off (Manage Games → OG gToons) makes every endpoint answer 404; say so rather than
// leaving a blank page. The panel shows its own load errors, so this is only the up-front check.
onMounted(async () => {
  try {
    const cfg = await $fetch('/api/game/oggtoons/config')
    if (cfg?.gameEnabled === false || cfg?.tournamentsEnabled !== true) unavailable.value = 'Tournaments are currently unavailable.'
  } catch { /* leave it to the panel's own error handling */ }
})
// No clear on unmount: this page sets no sidebar of its own, and when a game starts the match page has already set
// OgGtoonSidebar by the time this unmounts — clearing here would wipe the player-stats sidebar on the board.
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
.ogt-page { width: 100%; height: 100%; overflow: hidden; box-sizing: border-box; }
.ogt-topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 10px;
  background: var(--OrbitDarkBlue);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.ogt-back { font-size: 0.75rem; font-weight: 600; color: rgba(255, 255, 255, 0.75); text-decoration: none; }
.ogt-back:hover, .ogt-back:focus-visible { color: #fff; text-decoration: underline; }
</style>
