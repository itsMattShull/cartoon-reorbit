<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Lottery</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto text-center">
      <p class="mb-4 text-sm text-gray-600">Try your luck! Buy up to <strong v-if="remaining!==-1">{{ remaining }}</strong><strong v-else>unlimited</strong> tickets per day.</p>

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
          <div class="text-lg mb-4">Rolled: <span class="font-mono">{{ modalRoll }}</span></div>
          <div class="mb-4">{{ modalMessage }}</div>
          <div class="flex justify-center">
            <button class="btn-primary" @click="closeModal">Close</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ middleware: ['auth'], layout: 'default' })

const { fetchSelf } = useAuth()

const odds = ref(0)
const remaining = ref(0)
const cost = ref(0)
const buying = ref(false)
const showModal = ref(false)
const modalTitle = ref('')
const modalRoll = ref('')
const modalMessage = ref('')

const oddsDisplay = computed(() => Number(odds.value).toFixed(2))

async function load() {
  try {
    const res = await $fetch('/api/lottery')
    odds.value = Number(res?.odds ?? 0)
    remaining.value = res?.remaining ?? 0
    cost.value = res?.cost ?? 50
  } catch (e) {
    console.error('Failed to load lottery', e)
  }
}

async function buy() {
  buying.value = true
  try {
    const res = await $fetch('/api/lottery', { method: 'POST' })
    const { roll, win, newOdds, remaining: rem, awardedPoints } = res
    odds.value = Number(newOdds)
    remaining.value = rem
    modalRoll.value = Number(roll).toFixed(2)
    if (win) {
      modalTitle.value = 'You won!'
      modalMessage.value = `You won ${awardedPoints ?? 0} points!` 
    } else {
      modalTitle.value = 'You lost'
      modalMessage.value = `Better luck next time. Your odds increased to ${Number(newOdds).toFixed(2)}%` 
    }
    showModal.value = true
  } catch (e) {
    console.error('Buy failed', e)
    modalTitle.value = 'Error'
    modalMessage.value = e?.statusMessage || 'Purchase failed'
    modalRoll.value = ''
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
.btn-primary:disabled{ opacity:.5 }
</style>
