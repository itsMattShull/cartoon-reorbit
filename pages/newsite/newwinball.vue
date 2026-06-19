<template>
  <div class="new-winball-page">
    <ClientOnly>
      <main class="shell" aria-label="Winball">
        <div id="stage" class="svg-stage" data-src="svg/frames/3_layer_back.svg" aria-hidden="true"></div>
        <div id="actors-back" aria-hidden="true"></div>
        <div id="stage-foreground" class="svg-stage" data-src="svg/frames/3_layer_foreground.svg" aria-hidden="true"></div>
        <div id="actors-effects" aria-hidden="true"></div>
        <canvas id="game" width="507" height="430" aria-label="Winball game canvas"></canvas>
        <div id="actors-playfield" aria-hidden="true"></div>
        <div id="actors-top" aria-hidden="true"></div>
        <div id="stage-top" class="svg-stage" data-src="svg/frames/3_layer_top.svg" aria-hidden="true"></div>
        <div id="brand-replacement" aria-hidden="true">
          <img src="/newwinball/images/newlogo.gif" alt="">
        </div>
        <div id="rules-replacement" aria-hidden="true">
          <p>WINBALL is your chance to WIN<br>Points or Prizes!</p>
          <p>To play, click the lever. Your prize<br>is determined by where<br>the ball lands:</p>
          <p>Cup 1 = {{ leftCupPoints }} Points</p>
          <p>Cup 2 = {{ rightCupPoints }} Points</p>
          <p>GOLDEN CUP = {{ goldCupPoints }} Points + PRIZE!</p>
          <p>If the ball misses the cups and<br>lands in the gutter, you don't win<br>anything, but you can try again.</p>
        </div>
      </main>

      <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
        <div class="modal">
          <h2 class="modal-title">{{ modal.title }}</h2>
          <p class="modal-msg">{{ modal.message }}</p>
          <img
            v-if="modal.imageUrl"
            :src="modal.imageUrl"
            alt="Won cToon"
            class="modal-img"
          >
          <button class="modal-btn" @click="closeModal">OK</button>
        </div>
      </div>

      <ScavengerHuntModal v-if="!modal.open && scavenger.isOpen && scavenger.sessionId" />
    </ClientOnly>
  </div>
</template>

<script setup>
import { useHead } from '#imports'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ScavengerHuntModal from '@/components/ScavengerHuntModal.vue'
import { useAuth } from '~/composables/useAuth'
import { useScavengerHunt } from '@/composables/useScavengerHunt'

definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Winball',
  description: 'Play Winball, the pinball-style game on Cartoon ReOrbit, for a chance to win points and exclusive cToons.'
})

useHead({
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
    }
  ]
})

const { clearSidebarMiddle } = useNewsiteLayout()
const { fetchSelf } = useAuth()
const scavenger = useScavengerHunt()

clearSidebarMiddle()

const config = ref({})
const modal = ref({ open: false, title: '', message: '', imageUrl: '' })

const leftCupPoints = computed(() => config.value.leftCupPoints ?? 150)
const rightCupPoints = computed(() => config.value.rightCupPoints ?? 150)
const goldCupPoints = computed(() => config.value.goldCupPoints ?? 300)

let scriptEl = null

function showModal({ title, message, imageUrl }) {
  modal.value = { open: true, title, message, imageUrl: imageUrl || '' }
}

async function closeModal() {
  modal.value.open = false
  await fetchSelf({ force: true })
  scavenger.openIfPending()
}

function stateHistoryForCup(cup) {
  const pockets = {
    1: { x: 0, z: 19.25 },
    2: { x: -10, z: 13.25 },
    3: { x: 10, z: 13.25 }
  }
  const pocket = pockets[cup]
  if (!pocket) {
    return [
      { position: { x: 15, z: 23 }, velocity: { x: 0, z: 4 } },
      { position: { x: 15, z: 25 }, velocity: { x: 0, z: 0 } }
    ]
  }
  return [
    { position: { x: pocket.x, z: pocket.z - 3 }, velocity: { x: 0, z: 3 } },
    { position: { x: pocket.x, z: pocket.z + 1 }, velocity: { x: 0, z: 0 } }
  ]
}

async function submitRound({ cup }) {
  try {
    const result = await $fetch('/api/game/winball', {
      method: 'POST',
      body: stateHistoryForCup(cup)
    })

    if (result.result === 'hit') {
      if (result.grandPrizeCtoon) {
        showModal({
          title: 'Winner',
          message: `You won ${result.pointsAwarded} points and a grand prize cToon: "${result.grandPrizeCtoon}".\n\nYou have ${result.pointsRemainingToday} points remaining today.`,
          imageUrl: result.grandPrizeCtoonImage || ''
        })
      } else {
        showModal({
          title: 'Winner',
          message: `You won ${result.pointsAwarded} points.\n\nYou have ${result.pointsRemainingToday} points remaining today.`
        })
      }
      await scavenger.maybeTrigger('winball_win', { open: false })
    } else {
      showModal({ title: 'Gutter', message: 'You hit the gutter.' })
    }

    await fetchSelf({ force: true })
  } catch (err) {
    console.error('Error verifying Winball result:', err)
    showModal({
      title: 'Winball',
      message: 'Could not verify this round. Please try again.'
    })
  }
}

onMounted(async () => {
  scavenger.reset()

  try {
    config.value = await $fetch('/api/winball-config')
  } catch (err) {
    console.warn('Could not load Winball config, using defaults', err)
  }

  window.__newWinballAssetBase = '/newwinball/'
  window.__newWinballSubmitRound = submitRound

  scriptEl = document.createElement('script')
  scriptEl.src = '/newwinball/game.js'
  scriptEl.async = true
  document.body.appendChild(scriptEl)
})

onBeforeUnmount(() => {
  window.__newWinballDispose?.()
  delete window.__newWinballDispose
  delete window.__newWinballSubmitRound
  delete window.__newWinballAssetBase
  scriptEl?.remove()
})
</script>

<style>
@font-face {
  font-family: "FuturaBdCnBT";
  src: url("/newwinball/fonts/84_Futura BdCn BT.ttf") format("truetype");
  font-weight: 700;
}

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

@media (max-width: 768px) {
  body.page-newsite-newwinball .main-content {
    min-height: calc(100svh - 190px);
    max-width: 100% !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }
}
</style>

<style scoped>
.new-winball-page {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #111134;
  font-family: Arial, Helvetica, sans-serif;
  user-select: none;
  touch-action: none;
}

.shell {
  position: relative;
  width: min(100%, calc(100% * 507 / 430));
  max-width: 100%;
  aspect-ratio: 507 / 430;
  container-type: inline-size;
}

#stage,
#stage-foreground,
#stage-top,
#game,
#actors-back,
#actors-effects,
#actors-playfield,
#actors-top {
  display: block;
  width: 100%;
  height: 100%;
}

#stage,
#stage-foreground,
#stage-top {
  position: absolute;
  inset: 0;
  user-select: none;
  pointer-events: none;
}

#stage {
  z-index: 0;
}

#stage-foreground {
  z-index: 2;
}

#stage-top {
  z-index: 7;
}

:deep(.svg-stage svg) {
  display: block;
  width: 100%;
  height: 100%;
}

#game {
  position: absolute;
  inset: 0;
  image-rendering: auto;
  cursor: pointer;
  touch-action: none;
  z-index: 4;
}

#actors-back,
#actors-effects,
#actors-playfield,
#actors-top {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#actors-back {
  z-index: 1;
}

#actors-effects {
  z-index: 3;
}

#actors-playfield {
  z-index: 5;
}

#actors-top {
  z-index: 6;
}

#brand-replacement,
#rules-replacement {
  position: absolute;
  pointer-events: none;
  z-index: 8;
}

#brand-replacement {
  left: 63.5%;
  top: 4.7%;
  width: 32.6%;
  height: 17.9%;
  display: grid;
  place-items: center;
  overflow: hidden;
}

#brand-replacement img {
  display: block;
  width: 96%;
  height: 92%;
  object-fit: contain;
}

#rules-replacement {
  left: 65%;
  top: 32.7%;
  width: 29.6%;
  height: 44.2%;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  color: #000033;
  font-family: "FuturaBdCnBT", "Arial Narrow", Arial, Helvetica, sans-serif;
  font-size: clamp(10px, 2.17cqw, 22px);
  font-weight: 700;
  line-height: 1.02;
  text-align: center;
}

#rules-replacement p {
  margin: 0 0 0.76em;
}

#rules-replacement p:nth-child(3),
#rules-replacement p:nth-child(4),
#rules-replacement p:nth-child(5) {
  margin-bottom: 0.2em;
}

:deep(.actor) {
  position: absolute;
  display: block;
  user-select: none;
}

.modal-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.modal {
  display: grid;
  justify-items: center;
  width: fit-content;
  max-width: 92%;
  padding: 20px;
  color: #fff;
  text-align: center;
  background: #111;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.modal-img {
  display: block;
  max-width: 92%;
  height: auto;
}

.modal-title {
  margin: 0 0 8px;
  font: 600 20px/1.2 system-ui;
}

.modal-msg {
  margin: 0 0 12px;
  font: 400 16px/1.5 system-ui;
  white-space: pre-line;
}

.modal-btn {
  padding: 8px 14px;
  color: #000;
  cursor: pointer;
  background: #fff;
  border: 0;
  border-radius: 6px;
}

.modal-btn:hover {
  background: #e6e6e6;
}

@media (max-width: 768px) {
  .new-winball-page {
    min-height: calc(100svh - 190px);
    max-width: 100%;
    box-sizing: border-box;
  }
}
</style>
