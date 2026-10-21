<template>
  <div class="play-wrapper h-full">
    <OgGtoonMatchBoard @exit="onExit" />
  </div>
</template>

<script setup>
import { useRouter, useRoute, watch, onBeforeUnmount } from '#imports'
import OgGtoonMatchBoard from '@/components/OgGtoonMatchBoard.vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'gToons Match',
  description: 'A live gToons match on Cartoon ReOrbit.'
})

// The sidebar's middle section shows both players' name, points and goal-color counts during the match.
const { setSidebarMiddle, clearSidebarMiddle } = useNewsiteLayout()
setSidebarMiddle('OgGtoonSidebar')
onBeforeUnmount(clearSidebarMiddle)

// The match id in the URL (route.params.id) is purely for navigation/bookmarking — the actual
// match state is entirely server-held and reattached over the socket (see useOgGtoonsSocket /
// ogGtoonsSocket.js's reattach()); the client never asserts anything about the match by way of
// this route param, so it is not otherwise read here.
const router = useRouter()
const route = useRoute()
const { leaveMatch, matchState, currentMatchId } = useOgGtoonsSocket()

// A tournament series is several games in a row: when the next one starts, keep the address bar in step.
watch(currentMatchId, (id) => {
  if (id && matchState.value?.tournament && id !== route.params.id) router.replace(`/newsite/gtoons-classic/${id}`)
})

function onExit() {
  // Read before leaveMatch() clears the state: practice and the tutorial send people back to the
  // Matchmaking tab (where their Practice button and the Tutorial replay live), and a tournament
  // game goes back to its tournament.
  const tournament = matchState.value?.tournament
  const wasPractice = !!matchState.value?.practice
  // Leaving the tutorial (finished, skipped or exited) is what stops it auto-offering itself again.
  if (matchState.value?.tutorial) $fetch('/api/game/oggtoons/tutorial', { method: 'POST' }).catch(() => {})
  leaveMatch()
  router.push(
    tournament ? `/newsite/gtoons-classic?tab=tournaments&t=${tournament.tournamentId}`
      : wasPractice ? '/newsite/gtoons-classic?tab=matchmaking' : '/newsite/gtoons-classic'
  )
}
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
