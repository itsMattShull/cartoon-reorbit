<template>
  <Nav />
  <div class="flex flex-col lg:flex-row h-screen mt-14">
    <!-- Left Column: Traders, Spectators, and Chat -->
    <div class="w-full lg:w-1/3 bg-gray-900 text-white p-4 md:overflow-y-auto md:h-screen">
      <div class="mb-4">
        <h2 class="text-xl font-bold">Trade Room: {{ roomName }}</h2>
        <div class="mt-2">
          <p>
            <strong>Trader A:</strong>
            <span v-if="traderA">
              <img
                :src="`/avatars/${traderA.avatar}`"
                alt="Trader A avatar"
                class="inline-block w-6 h-6 rounded-full mr-2"
              />
              {{ traderA.username }}
            </span>
            <span v-else>Waiting...</span>
          </p>
          <p>
            <strong>Trader B:</strong>
            <span v-if="traderB">
              <img
                :src="`/avatars/${traderB.avatar}`"
                alt="Trader B avatar"
                class="inline-block w-6 h-6 rounded-full mr-2"
              />
              {{ traderB.username }}
            </span>
            <span v-else>Waiting...</span>
          </p>
          <p class="mt-2"><strong>Spectators:</strong> {{ spectators }}</p>
        </div>
      </div>
      <button
        v-if="isSpectator"
        @click="requestTraderB"
        class="bg-green-600 text-white px-2 py-1 rounded mt-2 hover:bg-green-700"
      >
        Trade
      </button>

      <div class="mb-4 hidden md:block">
        <h3 class="text-lg font-semibold">Chat</h3>
        <div class="bg-gray-800 p-2 h-48 overflow-y-auto mb-2" ref="chatBox">
          <div v-for="(msg, index) in chatMessages" :key="index" class="text-sm py-1">
            <a
              :href="`/czone/${msg.user}`"
              class="font-semibold text-blue-400 hover:underline"
            >
              {{ msg.user }}
            </a>: {{ msg.message }}
          </div>
        </div>
        <div class="flex items-center mb-2">
          <select
            v-model="selectedMessage"
            class="flex-1 border rounded px-2 py-1 bg-white"
          >
            <option value="" disabled>Select a message</option>
            <option v-for="msg in predefinedMessages" :key="msg" :value="msg">{{ msg }}</option>
          </select>
          <button
            @click="sendChat(selectedMessage)"
            :disabled="!selectedMessage"
            class="ml-2 bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>

    <!-- Right Column: Trading Panel -->
    <div class="w-full lg:w-2/3 bg-gray-100 p-4 pt-0 relative lg:overflow-hidden">
      <div v-if="isTrader" class="mt-4 flex flex-col mb-6 gap-2 md:hidden">
        <button
          @click="removeAllCtoons"
          :disabled="isConfirmed || userItems.length === 0"
          class="bg-yellow-500 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Remove All cToons
        </button>
        <button
          @click="toggleConfirmTrade"
          :disabled="userItems.length === 0"
          :class="[
            isConfirmed ? 'bg-red-500' : 'bg-green-600',
            userItems.length === 0
              ? 'opacity-50 cursor-not-allowed'
              : (isConfirmed ? 'hover:bg-red-700' : 'hover:bg-green-700')
          ]"
          class="text-white px-4 py-2 rounded"
        >
          {{ isConfirmed ? 'Cancel Trade' : 'Confirm Trade' }}
        </button>
        <button
          @click="openAddPanel"
          :disabled="isConfirmed"
          class="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add cToons
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 class="font-bold mb-2">
            <span v-if="traderA">
              <img
                :src="`/avatars/${traderA.avatar}`"
                alt="Trader A avatar"
                class="inline-block w-6 h-6 rounded-full mr-2"
              />
              {{ traderA.username }}'s Trade
            </span>
            <span v-else>Trader A's Trade</span>
          </h3>
          <div class="min-h-[250px] max-h-[250px] bg-white border rounded p-2 overflow-y-auto">
            <div class="flex flex-wrap items-start gap-2">
              <img
                v-for="ctoon in traderAItems"
                :key="ctoon.id"
                :src="ctoon.assetPath"
                :title="`Mint #${ctoon.mintNumber}`"
                @contextmenu="onContextMenuTraderA(ctoon, $event)"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 class="font-bold mb-2">
            <span v-if="traderB">
              <img
                :src="`/avatars/${traderB.avatar}`"
                alt="Trader B avatar"
                class="inline-block w-6 h-6 rounded-full mr-2"
              />
              {{ traderB.username }}'s Trade
            </span>
            <span v-else>Trader B's Trade</span>
          </h3>
          <div class="min-h-[250px] max-h-[250px] bg-white border rounded p-2 overflow-y-auto">
            <div class="flex flex-wrap items-start gap-2">
              <img
                v-for="ctoon in traderBItems"
                :key="ctoon.id"
                :src="ctoon.assetPath"
                :title="`Mint #${ctoon.mintNumber}`"
                @contextmenu="onContextMenuTraderB(ctoon, $event)"
              />
            </div>
          </div>
        </div>
      </div>

<div v-if="isTrader" class="mt-6 hidden md:flex justify-end gap-4">
  <button
    @click="removeAllCtoons"
    :disabled="isConfirmed || userItems.length === 0"
    class="bg-yellow-500 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Remove All cToons
  </button>
  <button
    @click="toggleConfirmTrade"
    :disabled="userItems.length === 0"
    :class="[
      isConfirmed ? 'bg-red-500' : 'bg-green-600',
      userItems.length === 0
        ? 'opacity-50 cursor-not-allowed'
        : (isConfirmed ? 'hover:bg-red-700' : 'hover:bg-green-700')
    ]"
    class="text-white px-4 py-2 rounded"
  >
    {{ isConfirmed ? 'Cancel Trade' : 'Confirm Trade' }}
  </button>
  <button
    @click="openAddPanel"
    :disabled="isConfirmed"
    class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    Add cToons
  </button>
</div>

      <!-- Confirm Status -->
      <div class="mt-4">
        <p><strong>Status:</strong></p>
        <ul>
          <li>
            <span v-if="traderA">
              <img
                :src="`/avatars/${traderA.avatar}`"
                alt="Trader A avatar"
                class="inline-block w-4 h-4 rounded-full mr-1"
              />
              {{ traderA.username }}:
            </span>
            <span v-else>Trader A:</span>
            {{ confirmedBy.traderA ? '✅ Confirmed' : '❌ Not Confirmed' }}
          </li>
          <li>
            <span v-if="traderB">
              <img
                :src="`/avatars/${traderB.avatar}`"
                alt="Trader B avatar"
                class="inline-block w-4 h-4 rounded-full mr-1"
              />
              {{ traderB.username }}:
            </span>
            <span v-else>Trader B:</span>
            {{ confirmedBy.traderB ? '✅ Confirmed' : '❌ Not Confirmed' }}
          </li>
        </ul>
      </div>

      <div class="mt-4 mb-4 md:hidden">
        <h3 class="text-lg font-semibold">Chat</h3>
        <div class="bg-gray-800 text-white p-2 h-48 overflow-y-auto mb-2" ref="chatBox">
          <div v-for="(msg, index) in chatMessages" :key="index" class="text-sm py-1">
            <a
              :href="`/czone/${msg.user}`"
              class="font-semibold text-blue-400 hover:underline"
            >
              {{ msg.user }}
            </a>: {{ msg.message }}
          </div>
        </div>
        <div class="flex items-center mb-2">
          <select
            v-model="selectedMessage"
            class="flex-1 border rounded px-2 py-1 bg-white"
          >
            <option value="" disabled>Select a message</option>
            <option v-for="msg in predefinedMessages" :key="msg" :value="msg">{{ msg }}</option>
          </select>
          <button
            @click="sendChat(selectedMessage)"
            :disabled="!selectedMessage"
            class="ml-2 bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
    
    <!-- Add Panel -->
    <transition name="slide-panel">
      <div v-if="showPanel" class="absolute top-0 right-0 w-full md:w-1/3 h-full bg-white border-l p-4 overflow-y-auto z-50">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg">Your cToons</h3>
            <button @click="showPanel = false" class="text-gray-500">✕</button>
          </div>
          <div class="flex flex-wrap items-start gap-2">
            <img
              v-for="ctoon in availableCtoons"
              :key="ctoon.id"
              :src="ctoon.assetPath"
              @click="addToTrade(ctoon)"
              :title="`Mint #${ctoon.mintNumber}`"
              class="cursor-pointer w-auto h-auto flex-none"
            />
          </div>
        </div>
    </transition>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'auth'
})
import { ref, reactive, onMounted, nextTick, computed, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import Nav from '@/components/Nav.vue'

const socket = io(import.meta.env.PROD ? '/socket' : 'http://localhost:3001')
const router = useRouter()
const route = useRoute()
const roomName = route.params.room
const { user } = useAuth()
const traderA = ref(null)
const traderB = ref(null)
const spectators = ref(0)
const chatMessages = ref([])
const selectedMessage = ref('')
const chatBox = ref(null)
const predefinedMessages = [
  'Hello!',
  'Hi there!',
  'Greetings!',
  'Trade ready?',
  'Proceed?',
  'I accept',
  'I decline',
  'Thanks!',
  'Thank you!',
  'Please wait',
  'Hold on',
  'Cancel trade?',
  'Good luck!',
  'Well played!',
  'Good trade!',
  'Almost done',
  'One sec',
  'Oops',
  'Sorry',
  'Perfect!',
  'Great deal',
  'Sounds good',
  'Let\'s go',
  'Deal',
  'Bring it on',
  'Sure',
  'No problem',
  'Yes',
  'No',
  'Maybe',
  'What\'s up?',
  'Nice',
  'Awesome',
  'Epic!',
  'Legendary!',
  'Cheers',
  'Good job',
  'Well done',
  'Solid deal',
  'Looking good',
  'Finalize?',
  'Ready to swap?',
  'Swap now',
  'Hold trade',
  'Confirm?',
  'Denied',
  'Accepted',
  'Excellent',
  'Fab',
  'See you'
]
const traderAItems = ref([])
const traderBItems = ref([])
const isTrader = ref(false)
const isSpectator = computed(() => {
  // A spectator is anyone not a trader when Trader A exists but Trader B is open
  return !isTrader.value && !!traderA.value && !traderB.value
})
const confirmedBy = reactive({ traderA: false, traderB: false })
const finalizedBy = reactive({ traderA: false, traderB: false })
const isConfirmed = ref(false)
const showPanel = ref(false)
const availableCtoons = ref([])

const userItems = computed(() => {
  const name = user.value.username;
  if (traderA.value?.username === name) return traderAItems.value;
  if (traderB.value?.username === name) return traderBItems.value;
  return [];
})

onMounted(() => {
  socket.emit('join-trade-room', { room: roomName, user: user.value.username })

  socket.on('trade-room-update', ({ traderA: ta, traderB: tb, spectators: spec, offers, confirmed }) => {
    traderA.value = ta
    traderB.value = tb
    spectators.value = spec
    // Update trade item lists
    traderAItems.value = offers?.[ta?.username] || []
    traderBItems.value = offers?.[tb?.username] || []
    // Update confirmation statuses
    confirmedBy.traderA = confirmed?.[ta?.username] || false
    confirmedBy.traderB = confirmed?.[tb?.username] || false
    isTrader.value = (ta?.username === user.value.username) || (tb?.username === user.value.username)

    // Sync local isConfirmed to match server state, so both traders reset after cancel
    const me = user.value.username
    if (traderA.value?.username === me) {
      isConfirmed.value = confirmedBy.traderA
    } else if (traderB.value?.username === me) {
      isConfirmed.value = confirmedBy.traderB
    } else {
      isConfirmed.value = false
    }

    // Reset finalize flags whenever both traders are not simultaneously confirmed
    if (!(confirmedBy.traderA && confirmedBy.traderB)) {
      finalizedBy.traderA = false
      finalizedBy.traderB = false
    }

    // Only allow Trader A or Trader B to see the finalize prompt once both have confirmed
    const isActualTrader =
      traderA.value?.username === me || traderB.value?.username === me
    if (traderA.value && traderB.value && isActualTrader &&
        confirmedBy.traderA && confirmedBy.traderB) {
      const role = traderA.value.username === me ? 'traderA' : 'traderB'
      if (!finalizedBy[role]) {
        finalizedBy[role] = true
        const proceed = window.confirm(
          'Both traders have confirmed. Finalize trade?'
        )
        if (proceed) {
          // Signal server this trader finalized; server will only execute once both have
          socket.emit('finalize-trade', { room: roomName, user: me })
        } else {
          // A trader declined finalization: reset both sides completely
          traderAItems.value = []
          traderBItems.value = []
          if (traderA.value) {
            socket.emit('remove-all-trade-offer', {
              room: roomName,
              user: traderA.value.username
            })
          }
          if (traderB.value) {
            socket.emit('remove-all-trade-offer', {
              room: roomName,
              user: traderB.value.username
            })
          }
          // Reset all confirmation and finalization flags
          isConfirmed.value = false
          confirmedBy.traderA = false
          confirmedBy.traderB = false
          finalizedBy.traderA = false
          finalizedBy.traderB = false
          socket.emit('cancel-trade', { room: roomName, user: me })
        }
      }
    }
  })

  socket.on('trade-chat', (msg) => {
    chatMessages.value.push(msg)
    nextTick(() => {
      if (chatBox.value) {
        chatBox.value.scrollTop = chatBox.value.scrollHeight
      }
    })
  })

  socket.on('trade-room-inactive', () => {
    router.push('/live-trading')
  })

  socket.on('trade-complete', ({ message }) => {
    alert(message);
    // Clear the local panels so both tables are empty
    traderAItems.value = [];
    traderBItems.value = [];
    // Reset confirmations and allow adding again
    isConfirmed.value = false;
    confirmedBy.traderA = false;
    confirmedBy.traderB = false;
  });

  socket.on('trade-error', ({ message }) => {
    alert(message);
  });
})

function onContextMenuTraderA(ctoon, event) {
  // Only allow Trader A to remove their own items
  if (!isConfirmed.value && traderA.value?.username === user.value.username) {
    event.preventDefault();
    removeFromTrade(ctoon);
  }
}

function onContextMenuTraderB(ctoon, event) {
  // Only allow Trader B to remove their own items
  if (!isConfirmed.value && traderB.value?.username === user.value.username) {
    event.preventDefault();
    removeFromTrade(ctoon);
  }
}

function sendChat(message) {
  if (!message) return
  socket.emit('trade-chat', {
    room: roomName,
    user: user.value.username,
    message
  })
  selectedMessage.value = ''
}

function openAddPanel() {
  showPanel.value = true
  const excludeIds = JSON.stringify(
    [...traderAItems.value, ...traderBItems.value].map(c => c.id)
  )
  fetch(`/api/user/ctoons?exclude=${excludeIds}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch cToons')
      return res.json()
    })
    .then(data => {
      console.log('ctoons:', data)
      availableCtoons.value = data
    })
    .catch(err => {
      console.error('Error loading cToons:', err)
    })
}

function addToTrade(ctoon) {
  if (isConfirmed.value) return
  const currentUser = user.value.username
  // Determine which side to add to
  if (traderA.value?.username === currentUser) {
    traderAItems.value.push(ctoon)
    socket.emit('add-trade-offer', {
      room: roomName,
      user: currentUser,
      ctoons: traderAItems.value
    })
  } else if (traderB.value?.username === currentUser) {
    traderBItems.value.push(ctoon)
    socket.emit('add-trade-offer', {
      room: roomName,
      user: currentUser,
      ctoons: traderBItems.value
    })
  } else {
    return
  }
  // Remove from availableCtoons panel
  availableCtoons.value = availableCtoons.value.filter(c => c.id !== ctoon.id)
}

function removeFromTrade(ctoon) {
  if (isConfirmed.value) return;
  const currentUser = user.value.username;
  if (traderA.value?.username === currentUser) {
    traderAItems.value = traderAItems.value.filter(c => c.id !== ctoon.id);
    socket.emit('add-trade-offer', {
      room: roomName,
      user: currentUser,
      ctoons: traderAItems.value
    });
    // Refresh available cToons in side panel
    const excludeIds = JSON.stringify(
      [...traderAItems.value, ...traderBItems.value].map(c => c.id)
    );
    fetch(`/api/user/ctoons?exclude=${excludeIds}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch cToons');
        return res.json();
      })
      .then(data => {
        availableCtoons.value = data;
      })
      .catch(err => console.error('Error refreshing cToons:', err));
  } else if (traderB.value?.username === currentUser) {
    traderBItems.value = traderBItems.value.filter(c => c.id !== ctoon.id);
    socket.emit('add-trade-offer', {
      room: roomName,
      user: currentUser,
      ctoons: traderBItems.value
    });
    // Refresh available cToons in side panel
    const excludeIds = JSON.stringify(
      [...traderAItems.value, ...traderBItems.value].map(c => c.id)
    );
    fetch(`/api/user/ctoons?exclude=${excludeIds}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch cToons');
        return res.json();
      })
      .then(data => {
        availableCtoons.value = data;
      })
      .catch(err => console.error('Error refreshing cToons:', err));
  }
}

function removeAllCtoons() {
  traderAItems.value = []
  socket.emit('remove-all-trade-offer', { room: roomName, user: user.value.username })
  // Refresh available cToons in side panel
  const excludeIds = JSON.stringify(
    [...traderAItems.value, ...traderBItems.value].map(c => c.id)
  )
  fetch(`/api/user/ctoons?exclude=${excludeIds}`)
    .then(res => {
      if (!res.ok) throw new Error('Failed to fetch cToons')
      return res.json()
    })
    .then(data => {
      availableCtoons.value = data
    })
    .catch(err => console.error('Error refreshing cToons:', err))
}

function toggleConfirmTrade() {
  isConfirmed.value = !isConfirmed.value
  if (isConfirmed.value) {
    socket.emit('confirm-trade', { room: roomName, user: user.value.username })
  } else {
    socket.emit('cancel-trade', { room: roomName, user: user.value.username })
  }
}

function requestTraderB() {
  socket.emit('become-traderB', { room: roomName, user: user.value.username })
}

socket.on('become-traderB-failed', ({ message }) => {
  alert(message)
})

onBeforeUnmount(() => {
  socket.emit('leave-traderoom')
})
</script>

<style scoped>
/* Optional styling */

.slide-panel-enter-active, .slide-panel-leave-active {
  transition: transform 0.3s ease;
}
.slide-panel-enter-from {
  transform: translateX(100%);
}
.slide-panel-enter-to {
  transform: translateX(0);
}
.slide-panel-leave-from {
  transform: translateX(0);
}
.slide-panel-leave-to {
  transform: translateX(100%);
}
</style>