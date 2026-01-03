<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6 text-center">Lottery</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto text-center">
      <p class="mb-4 text-sm text-gray-600">
        You can buy
        <strong v-if="remaining !== -1">{{ remaining }}</strong>
        <strong v-else>unlimited</strong> more tickets today.
      </p>

      <div class="text-lg mb-4">Your current odds: <span class="font-semibold">{{ oddsDisplay }}%</span></div>

      <div class="flex justify-center gap-4">
        <button class="btn-primary" :disabled="buying || remaining===0" @click="buy">
          {{ buying ? 'Buying…' : `Buy Ticket (${cost} points)` }}
        </button>
      </div>

      <div class="mt-4 text-sm text-gray-500">Each loss increases your odds by the configured increment.</div>
    </div>

    <!-- result modal -->
    <transition name="fade">
      <div v-if="showModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 w-11/12 max-w-md text-center">
          <h2 class="text-2xl font-semibold mb-2">{{ modalTitle }}</h2>
          <!-- Prize Display -->
          <div class="mb-4">
            <div v-if="modalCtoon" class="flex flex-col items-center gap-2">
              <img :src="modalCtoon.assetPath" class="h-32 w-auto rounded" />
              <p class="font-semibold">{{ modalCtoon.name }}</p>
            </div>
            <div v-else-if="modalVerificationCode" class="text-sm text-left space-y-2">
              <p>{{ modalMessage }}</p>
              <div class="bg-gray-100 p-2 rounded">
                <p><strong>Code:</strong> {{ modalVerificationCode }}</p>
                <p class="break-all"><strong>Hash:</strong> <span class="font-mono text-xs">{{ modalVerificationHash }}</span></p>
              </div>
            </div>
            <p v-else>{{ modalMessage }}</p>
          </div>
          <div class="flex justify-center">
            <button class="btn-primary" @click="closeModal">Close</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- Prize Pool Display -->
    <div v-if="prizePool.length > 0" class="mt-8 max-w-4xl mx-auto">
      <h2 class="text-2xl font-bold mb-4 text-center text-gray-800">Available cToon Prizes</h2>
      <div class="flex justify-center flex-wrap gap-4">
        <div
          v-for="ctoon in prizePool"
          :key="ctoon.id"
          class="bg-white rounded-lg shadow p-3 flex flex-col items-center text-center w-[150px]"
        >
          <img :src="ctoon.assetPath" :alt="ctoon.name" class="w-full h-24 object-contain mb-2" />
          <p class="text-sm font-semibold flex-grow flex items-center text-gray-800">{{ ctoon.name }}</p>
          <!-- <p class="text-xs text-gray-500">{{ ctoon.rarity }}</p>
          <p class="text-xs text-gray-500">
            Stock: {{ ctoon.quantity !== null ? ctoon.quantity - ctoon.totalMinted : 'Unlimited' }}
          </p> -->
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ title: 'Lottery', middleware: ['auth'], layout: 'default' })

const { fetchSelf } = useAuth()

const odds = ref(0)
const remaining = ref(0)
const cost = ref(0)
const prizePool = ref([])
const buying = ref(false)
const showModal = ref(false)
const modalTitle = ref('')
const modalMessage = ref('')
const modalVerificationCode = ref(null)
const modalVerificationHash = ref(null)
const modalCtoon = ref(null)

const oddsDisplay = computed(() => Number(odds.value).toFixed(2))

async function load() {
  try {
    const res = await $fetch('/api/lottery')
    odds.value = Number(res?.odds ?? 0)
    remaining.value = res?.remaining ?? 0
    cost.value = res?.cost ?? 50
    prizePool.value = res?.prizePool || []
  } catch (e) {
    console.error('Failed to load lottery', e)
  }
}

async function buy() {
  buying.value = true
  modalCtoon.value = null // Reset ctoon prize
  try {
    const { win, newOdds, remaining: rem, awardedPoints, awardedCtoon, emptyPoolWin, verificationCode, verificationHash } = await $fetch('/api/lottery', { method: 'POST' })
    odds.value = Number(newOdds)
    remaining.value = rem
    modalVerificationCode.value = null // Reset verification
    modalVerificationHash.value = null

    if (win) {
      modalTitle.value = 'You won!'
      if (emptyPoolWin) {
        modalMessage.value = 'You WON... but the lotto pool has gone empty. Screen Shot this window and show it to a mod and we will make it right!'
        modalVerificationCode.value = verificationCode
        modalVerificationHash.value = verificationHash
      } else if (awardedCtoon) {
        modalCtoon.value = awardedCtoon
      } else {
        modalMessage.value = `You won ${awardedPoints ?? 0} points! Your odds have increased to ${Number(newOdds).toFixed(2)}%.`
      }
    } else {
      modalTitle.value = 'You lost'
      modalMessage.value = `Better luck next time. Your odds increased to ${Number(newOdds).toFixed(2)}%` 
    }
    showModal.value = true
  } catch (e) {
    console.error('Buy failed', e)
    modalTitle.value = 'Error'
    modalMessage.value = e?.statusMessage || 'Purchase failed'
    showModal.value = true
  } finally {
    await fetchSelf({ force: true })
    buying.value = false
  }
}

function closeModal() {
  showModal.value = false
}

onMounted(load)
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled { @apply opacity-50 cursor-not-allowed; }
</style>
