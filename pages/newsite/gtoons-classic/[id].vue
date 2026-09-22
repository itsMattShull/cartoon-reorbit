<template>
  <div class="play-wrapper h-full">
    <OgGtoonMatchBoard @exit="onExit" />
  </div>
</template>

<script setup>
import { useRouter } from '#imports'
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

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

// The match id in the URL (route.params.id) is purely for navigation/bookmarking — the actual
// match state is entirely server-held and reattached over the socket (see useOgGtoonsSocket /
// ogGtoonsSocket.js's reattach()); the client never asserts anything about the match by way of
// this route param, so it is not otherwise read here.
const router = useRouter()
const { leaveMatch } = useOgGtoonsSocket()

function onExit() {
  leaveMatch()
  router.push('/newsite/gtoons-classic')
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
