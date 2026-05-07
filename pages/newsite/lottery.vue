<template>
  <NuxtLayout name="newsite-template">
    <template #sidebar-top>
      <UserInfo />
    </template>
    <template #sidebar-bottom>
      <WinballAd />
    </template>
    <template #main-content>
      <div class="lottery-content">
        <div class="lottery-header-bar">
          <span class="lottery-header-title">Lottery</span>
        </div>

        <div class="lottery-section">
          <div class="lottery-ticket-card">
            <p class="ticket-limit-text">
              You can buy
              <strong v-if="remaining !== -1">{{ remaining }}</strong>
              <strong v-else>unlimited</strong> more tickets today.
            </p>

            <div class="ticket-odds-row">
              Your current odds: <span class="ticket-odds-value">{{ oddsDisplay }}%</span>
            </div>

            <div class="ticket-actions">
              <button class="btn-buy" :disabled="buying || remaining === 0" @click="buy">
                {{ buying ? 'Buying…' : `Buy Ticket (${Number(cost).toLocaleString()} points)` }}
              </button>
            </div>

            <p class="ticket-hint">Each loss increases your odds by the configured increment.</p>
          </div>

          <!-- Prize Pool -->
          <div v-if="prizePool.length > 0" class="prize-pool-section">
            <h2 class="prize-pool-title">Available cToon Prizes</h2>
            <div class="prize-pool-grid">
              <div
                v-for="ctoon in prizePool"
                :key="ctoon.id"
                class="prize-card"
              >
                <CtoonAsset
                  :src="ctoon.assetPath"
                  :alt="ctoon.name"
                  :name="ctoon.name"
                  :ctoon-id="ctoon.id"
                  image-class="prize-card-image"
                />
                <p class="prize-card-name">{{ ctoon.name }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Result modal -->
      <transition name="fade">
        <div v-if="showModal" class="modal-overlay" @click.self="closeModal">
          <div class="modal-box">
            <h2 class="modal-title">{{ modalTitle }}</h2>
            <div class="modal-body">
              <div v-if="modalCtoon" class="modal-ctoon">
                <CtoonAsset
                  :src="modalCtoon.assetPath"
                  :alt="modalCtoon.name"
                  :name="modalCtoon.name"
                  :ctoon-id="modalCtoon.id"
                  image-class="modal-ctoon-image"
                />
                <p class="modal-ctoon-name">{{ modalCtoon.name }}</p>
              </div>
              <div v-else-if="modalVerificationCode" class="modal-verification">
                <p>{{ modalMessage }}</p>
                <div class="verification-box">
                  <p><strong>Code:</strong> {{ modalVerificationCode }}</p>
                  <p class="break-all"><strong>Hash:</strong> <span class="verification-hash">{{ modalVerificationHash }}</span></p>
                </div>
              </div>
              <p v-else class="modal-message">{{ modalMessage }}</p>
            </div>
            <div class="modal-actions">
              <button class="btn-modal-close" @click="closeModal">Close</button>
            </div>
          </div>
        </div>
      </transition>
    </template>
  </NuxtLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import CtoonAsset from '@/components/CtoonAsset.vue'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: false, middleware: 'newsite', showAdbar: true, showNav: true })

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
  modalCtoon.value = null
  try {
    const { win, newOdds, remaining: rem, awardedPoints, awardedCtoon, emptyPoolWin, verificationCode, verificationHash } = await $fetch('/api/lottery', { method: 'POST' })
    odds.value = Number(newOdds)
    remaining.value = rem
    modalVerificationCode.value = null
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
.lottery-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: #fff;
}

.lottery-header-bar {
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 1px solid rgba(0, 153, 204, 0.3);
  padding: 10px 16px;
  display: flex;
  align-items: center;
}

.lottery-header-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0099cc;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.lottery-section {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.lottery-ticket-card {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 153, 204, 0.25);
  border-radius: 10px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.ticket-limit-text {
  font-size: 0.9rem;
  color: #aac8e0;
}

.ticket-limit-text strong {
  color: #66cc00;
}

.ticket-odds-row {
  font-size: 1.05rem;
  color: #cce0f0;
}

.ticket-odds-value {
  font-weight: 700;
  color: #66cc00;
}

.ticket-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-buy {
  background: #336699;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 10px 24px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.btn-buy:hover:not(:disabled) {
  background: #3399cc;
  transform: scale(1.02);
}

.btn-buy:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-buy:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ticket-hint {
  font-size: 0.8rem;
  color: #7a9ab5;
}

/* Prize Pool */
.prize-pool-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prize-pool-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0099cc;
  text-align: center;
}

.prize-pool-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.prize-card {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 153, 204, 0.2);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 130px;
  text-align: center;
}

.prize-card-image {
  width: 100%;
  height: 96px;
  object-fit: contain;
  margin-bottom: 6px;
}

.prize-card-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: #cce0f0;
  margin-top: 6px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: #fff;
  border-radius: 10px;
  padding: 28px 24px;
  width: 90%;
  max-width: 420px;
  text-align: center;
  color: #1a1a2e;
}

.modal-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: #336699;
  margin-bottom: 12px;
}

.modal-body {
  margin-bottom: 16px;
}

.modal-message {
  font-size: 0.95rem;
  color: #333;
}

.modal-ctoon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.modal-ctoon-image {
  height: 128px;
  width: auto;
  border-radius: 6px;
}

.modal-ctoon-name {
  font-weight: 600;
  color: #1a1a2e;
}

.modal-verification {
  font-size: 0.85rem;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.verification-box {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 10px;
}

.verification-hash {
  font-family: monospace;
  font-size: 0.75rem;
  word-break: break-all;
}

.modal-actions {
  display: flex;
  justify-content: center;
}

.btn-modal-close {
  background: #336699;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 28px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-modal-close:hover {
  background: #3399cc;
}

/* Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .lottery-ticket-card {
    padding: 16px;
  }
}
</style>
