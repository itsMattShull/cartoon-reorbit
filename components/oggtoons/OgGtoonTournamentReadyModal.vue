<!-- components/oggtoons/OgGtoonTournamentReadyModal.vue -->
<!-- "Your opponent is ready to play" — shown over whichever hub tab is open, with a one-tap Play. -->
<template>
  <transition name="fade">
    <div v-if="ping" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-3" role="alertdialog" aria-modal="true" aria-labelledby="ogt-ready-title">
      <div class="bg-gray-900 border border-white/20 rounded-xl p-5 w-[24rem] max-w-full text-white text-center">
        <h2 id="ogt-ready-title" class="text-lg font-bold mb-1">🏆 {{ ping.username }} is ready to play</h2>
        <p class="text-sm text-gray-300 mb-3">Your <strong>{{ ping.tournamentName }}</strong> match is waiting for you. Press Play and the game starts as soon as you both are in.</p>
        <p v-if="errorText" class="text-xs text-red-300 mb-2" role="alert">{{ errorText }}</p>
        <div class="flex justify-center gap-2">
          <button class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm" @click="dismiss">Later</button>
          <button class="bg-green-500 hover:bg-green-600 px-5 py-2 rounded text-sm font-semibold" @click="play">Play now</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'

const { tournamentOpponentReady, tournamentReady, lastError, currentMatchId } = useOgGtoonsSocket()
const ping = ref(null)
const errorText = ref('')

watch(tournamentOpponentReady, (p) => {
  if (!p || currentMatchId.value) return // already in a game: no popup
  ping.value = p
  errorText.value = ''
})
watch(lastError, (e) => { if (ping.value && e?.message) errorText.value = e.message })
// A game starting (this one) takes over the screen.
watch(currentMatchId, (id) => { if (id) ping.value = null })

function play() {
  errorText.value = ''
  tournamentReady(ping.value.tournamentMatchId)
  // Closes itself when the game starts; an error keeps it open so it can be read.
  setTimeout(() => { if (ping.value && !errorText.value && !currentMatchId.value) ping.value = null }, 1500)
}
function dismiss() { ping.value = null }
</script>
