<template>
  <Nav />
  <!-- Mobile Layout Only -->
  <div v-if="!loading" class="lg:hidden pt-20 px-4 py-6 max-w-6xl mx-auto flex flex-col gap-6">
    <!-- Owner Section -->
    <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4">
      <div class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t">
        OWNER
      </div>
      <img :src="`/avatars/${ownerAvatar}`" alt="Owner Avatar" class="w-14 h-14 rounded-full border border-blue-300" />
      <div class="text-xl font-semibold text-blue-700">{{ ownerName }}</div>
    </div>

    <!-- CZone Canvas -->
    <!-- <div class="flex min-w-[800px] justify-center overflow-hidden">
      <div
        class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
        :style="`background: url(/backgrounds/${backgroundImage}) center center / cover no-repeat;`"
      >
        <div class="absolute top-0 left-0 w-full h-full">
          <div v-for="(item, index) in cZoneItems" :key="index" class="absolute" :style="item.style">
            <img :src="item.assetPath" :alt="item.name" class="object-contain cursor-pointer" @click="openSidebar(item)" />
          </div>
        </div>
      </div>
    </div> -->

    <div class="flex justify-center">
      <!-- scale wrapper: only on small screens -->
      <div :style="scaleStyle">
        <div
          class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden"
          :style="`background: url(/backgrounds/${backgroundImage}) center / cover no-repeat`"
        >
          <div class="absolute inset-0">
            <div
              v-for="(item, index) in cZoneItems"
              :key="index"
              class="absolute"
              :style="item.style"
            >
              <img
                :src="item.assetPath"
                :alt="item.name"
                class="object-contain cursor-pointer max-w-[initial]"
                @click="openSidebar(item)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation and Points -->
    <div class="flex justify-between items-center text-sm flex-wrap gap-4 mb-6">
      <div class="flex gap-2 flex-wrap">
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToPrevious">Previous cZone</button>
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToRandom">Random cZone</button>
        <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToNext">Next cZone</button>
        <button
            v-if="user?.id === ownerId"
            @click="navigateTo('/edit')"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
          >
            ✏️ Edit cZone
          </button>
      </div>
      <div class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm">
        My Points: {{ user?.points ?? 0 }}
      </div>
    </div>

    <!-- Visitors and Chat -->
    <div class="bg-white rounded-xl shadow-md p-4 flex flex-col">
      <h2 class="text-lg font-bold mb-2">Visitors: {{ visitorCount }}</h2>
      <div
        :ref="el => { if (el && chatContainer) chatContainer.value = el }"
        class="overflow-y-auto border rounded p-2 mb-4 text-sm h-64 flex flex-col-reverse"
      >
        <div
          v-for="(msg, index) in [...chatMessages].reverse()"
          :key="index"
          class="mb-1 flex gap-2 text-sm items-start"
        >
          <NuxtLink :to="`/czone/${msg.user}`" class="font-bold text-indigo-700 min-w-[80px] hover:underline-none no-underline">
            {{ msg.user }}
          </NuxtLink>
          <div class="flex-1 break-words">{{ msg.message }}</div>
        </div>
      </div>
      <form @submit.prevent="sendMessage" class="flex gap-2 items-center">
        <select v-model="newMessage" class="flex-1 border px-2 py-1 rounded text-sm">
          <option value="" disabled selected>Select a message</option>
          <option v-for="msg in predefinedMessages" :key="msg" :value="msg">
            {{ msg }}
          </option>
        </select>
        <button :disabled="!newMessage" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm">
          Send
        </button>
      </form>
    </div>
  </div>
  <div v-if="!loading" class="hidden lg:flex pt-20 px-4 py-6 max-w-6xl mx-auto flex gap-6">
    <ClientOnly>
      <!-- Left Column: Chat and Visitors -->
      <div class="w-1/3 bg-white rounded-xl shadow-md p-4 flex flex-col">
        <div class="relative border-2 border-blue-500 rounded p-4 flex items-center gap-4 mb-4">
          <div class="absolute -top-4 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-t">
            OWNER
          </div>
          <img :src="`/avatars/${ownerAvatar}`" alt="Owner Avatar" class="w-14 h-14 rounded-full border border-blue-300" />
          <div class="text-xl font-semibold text-blue-700">{{ ownerName }}</div>
        </div>
        <h2 class="text-lg font-bold mb-2">Visitors: {{ visitorCount }}</h2>
        <div
          :ref="el => { if (el && chatContainer) chatContainer.value = el }"
          class="overflow-y-auto border rounded p-2 mb-4 text-sm h-96 flex flex-col-reverse"
        >
          <div
            v-for="(msg, index) in [...chatMessages].reverse()"
            :key="index"
            class="mb-1 flex gap-2 text-sm items-start"
          >
            <NuxtLink :to="`/czone/${msg.user}`" class="font-bold text-indigo-700 min-w-[80px] hover:underline-none no-underline">
              {{ msg.user }}
            </NuxtLink>
            <div class="flex-1 break-words">{{ msg.message }}</div>
          </div>
        </div>
        <form @submit.prevent="sendMessage" class="flex gap-2 items-center">
          <select v-model="newMessage" class="flex-1 border px-2 py-1 rounded text-sm">
            <option value="" disabled selected>Select a message</option>
            <option v-for="msg in predefinedMessages" :key="msg" :value="msg">
              {{ msg }}
            </option>
          </select>
          <button type="submit" :disabled="!newMessage" class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded text-sm">
            Send
          </button>
        </form>
      </div>
    </ClientOnly>

    <!-- Right Column: CZone Display -->
    <div class="min-w-[800px] bg-white rounded-xl shadow-md">
      <div class="flex justify-center overflow-hidden mb-4">
        <div
          class="relative h-[600px] w-[800px] border border-gray-300 rounded overflow-hidden mx-auto"
          :style="`background: url(/backgrounds/${backgroundImage}) center center / cover no-repeat;`"
        >
          <!-- Fixed-size CZone canvas/display -->
          <div class="absolute top-0 left-0 w-full h-full">
            <!-- Placeholder for cToon layout, this should be updated to map cToons to positions -->
            <div v-for="(item, index) in cZoneItems" :key="index" class="absolute" :style="item.style">
              <img :src="item.assetPath" :alt="item.name" class="object-contain cursor-pointer max-w-[initial]" @click="openSidebar(item)" />
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-between items-center text-sm mb-6 pl-4 pr-4">
        <div class="flex gap-2">
          <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToPrevious">Previous cZone</button>
          <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToRandom">Random cZone</button>
          <button class="bg-gray-200 px-3 py-1 rounded hover:bg-gray-300" @click="goToNext">Next cZone</button>
          <button
            v-if="user?.id === ownerId"
            @click="navigateTo('/edit')"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded flex items-center gap-1"
          >
            ✏️ Edit cZone
          </button>
        </div>
        <div class="bg-indigo-100 text-indigo-800 font-semibold px-3 py-1 rounded shadow text-sm">
          My Points: {{ user?.points ?? 0 }}
        </div>
      </div>
    </div>
  </div>
  <div v-else class="pt-16 px-4 py-6 max-w-6xl mx-auto flex gap-6">
    <div class="w-1/3 bg-white rounded-xl shadow-md p-4">
      <div class="h-6 bg-gray-300 rounded w-32 mb-4"></div>
      <div class="h-10 bg-gray-300 rounded w-full mb-4"></div>
      <div class="h-48 bg-gray-200 rounded mb-4"></div>
      <div class="h-8 bg-gray-300 rounded w-full"></div>
    </div>
    <div class="w-2/3 bg-white rounded-xl shadow-md p-4">
      <div class="h-[400px] bg-gray-200 rounded mb-4"></div>
      <div class="h-8 bg-gray-300 rounded w-full"></div>
    </div>
  </div>
  <!-- Overlay -->
  <transition name="fade">
    <div v-if="showSidebar" class="fixed inset-0 bg-black bg-opacity-50 z-40" @click="showSidebar = false"></div>
  </transition>
  <!-- Sidebar -->
  <transition name="slide-panel">
    <div v-if="showSidebar" class="fixed top-0 right-0 h-screen w-80 bg-white shadow-lg border-l p-4 overflow-y-auto z-50">
      <button class="absolute top-2 right-2 text-gray-500 hover:text-black" @click="showSidebar = false">✖</button>
      <div v-if="selectedCtoon">
        <img :src="selectedCtoon.assetPath" class="max-w-full mb-4 mx-auto" :alt="selectedCtoon.name" />
        <h3 class="text-xl font-bold mb-2">{{ selectedCtoon.name }}</h3>
        <p><strong>Series:</strong> {{ selectedCtoon.series }}</p>
        <p v-if="selectedCtoon.set"><strong>Set:</strong> {{ selectedCtoon.set }}</p>
        <p><strong>Rarity:</strong> <span class="capitalize">{{ selectedCtoon.rarity }}</span></p>
        <p>
          <strong>Mint #: </strong>
          <span v-if="selectedCtoon.quantity === null">{{ selectedCtoon.mintNumber }} of Unlimited</span>
          <span v-else-if="selectedCtoon.mintNumber !== null && selectedCtoon.quantity !== null">
            {{ selectedCtoon.mintNumber }} of {{ selectedCtoon.quantity }}
          </span>
          <span v-else>Unknown</span>
        </p>
        <p>
          <strong>Edition:</strong>
          {{ selectedCtoon.isFirstEdition ? 'First Edition' : 'Unlimited Edition' }}
        </p>
        <p v-if="selectedCtoon.releaseDate">
          <strong>Release Date:</strong>
          {{ formatDate(selectedCtoon.releaseDate) }}
        </p>
      </div>
    </div>
  </transition>
</template>

<script setup>
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { onMounted, ref, onBeforeUnmount, watch, nextTick, watchEffect, computed } from 'vue'
import { io } from 'socket.io-client'

const predefinedMessages = [
  'Cool cZone!',
  'Love your cToons!',
  'Nice layout!',
  'Wow!',
  'Awesome collection!',
  'Want to trade?',
  'Thanks!',
  "You're Welcome :-)",
  'This place rocks!',
  'So nostalgic!',
  'Love the vibe here!',
  'Totally bringing back memories!',
  'Such a clean setup!',
  'You’ve got style!',
  'Trade you a rare for this one?',
  'This collection is fire!',
  'Whoa, didn’t expect that one!',
  'Classic combo!',
  'Can’t stop looking at these!',
  'Great theme!',
  'I need that cToon!',
  "You're a collector pro!",
  'Impressive layout!',
  'Cartoon goals right here!',
  'This gave me chills!',
  'Super unique choices!',
  'Totally underrated!',
  'I wish I had this setup!',
  'Nice flex!',
  "You're a legend!",
  '10/10 would visit again!',
  'Mind if I screenshot this?',
  'One word: EPIC!'
]

const route = useRoute()
const username = ref(route.params.username)
const ownerName = ref(username.value)
const ownerAvatar = ref('/avatars/default.png')
const ownerId = ref(null)
const visitorCount = ref(1)
const chatMessages = ref([])
const newMessage = ref('')
const cZoneItems = ref([])
const loading = ref(true)
const chatContainer = ref(null)
const backgroundImage = ref('')
const selectedCtoon = ref(null)
const showSidebar = ref(false)
const config = useRuntimeConfig()
const socket = io(import.meta.env.PROD ? undefined : `http://localhost:${config.public.socketPort}`);
const { user, fetchSelf } = useAuth()

watchEffect(() => {
  username.value = route.params.username
})

// --- mobile canvas scaling ---
const scale = ref(1)

const recalcScale = () => {
  // 800 is the logical canvas width
  scale.value = Math.min(1, window.innerWidth / 800)
}

onMounted(async () => {
  await fetchSelf()
  try {
    const res = await $fetch(`/api/czone/${username.value}`)
    ownerName.value = res.ownerName
    ownerAvatar.value = res.avatar || '/avatars/default.png'
    ownerId.value = res.ownerId
    cZoneItems.value = (res.cZone.layoutData || []).map(item => ({
      ...item,
      style: `top: ${item.y}px; left: ${item.x}px; width: ${item.width}px; height: ${item.height}px;`
    }))

    // hi there

    console.log(cZoneItems.value)

    backgroundImage.value = res.cZone.background || ''

    if (user.value && res.ownerId !== user.value.id) {
      await $fetch('/api/points/visit', {
        method: 'POST',
        body: { zoneOwnerId: res.ownerId }
      })
      await fetchSelf()
    }
  } catch (err) {
    console.error(err)
    cZoneItems.value = []
    backgroundImage.value = 'IMG_3433.GIF'
  }

  recalcScale()
  window.addEventListener('resize', recalcScale)

  if (socket) {
    socket.emit('join-zone', { zone: username.value })

    socket.on('visitor-count', count => {
      visitorCount.value = count
    })

    socket.on('chat-message', msg => {
      chatMessages.value.push(msg)
      if (chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight
      }
    })
  }

  loading.value = false
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    year:   'numeric',
    month:  'long',
    day:    'numeric'
  })
}

const openSidebar = (item) => {
  const selected = { ...item }
  selectedCtoon.value = selected
  showSidebar.value = true
}

const sendMessage = () => {
  if (!user.value || !process.client || !socket) return
  
  const msg = {
    zone: username.value,
    user: user.value.username,
    message: newMessage.value
  }

  socket.emit('chat-message', msg)

  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
  newMessage.value = ''
}

const goToPrevious = async () => {
  try {
    const res = await $fetch(`/api/czone/${username.value}/previous`)
    if (res?.username) {
      navigateTo(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch previous user:', err)
  }
}

const goToNext = async () => {
  try {
    const res = await $fetch(`/api/czone/${username.value}/next`)
    if (res?.username) {
      navigateTo(`/czone/${res.username}`)
    }
  } catch (err) {
    console.error('Failed to fetch next user:', err)
  }
}

const goToRandom = async () => {
  const res = await $fetch(`/api/czone/${username}/random`)
  if (res?.username) {
    navigateTo(`/czone/${res.username}`)
  }
}

const router = useRouter()

onBeforeUnmount(() => {
  if (socket && username.value) {
    socket.emit('leave-zone', { zone: username.value })
  }
  window.removeEventListener('resize', recalcScale)
})

const scaleStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  transformOrigin: 'top left',
  width: `${800 * scale.value}px`,
  height: `${600 * scale.value}px`
}))

// Also watch for username changes (i.e., navigating to another cZone) via route param
watch(() => route.params.username, async (newUsername, oldUsername) => {
  username.value = newUsername

  if (socket && oldUsername) {
    socket.emit('leave-zone', { zone: oldUsername })
  }

  if (socket && newUsername && socket.connected) {
    await nextTick()
    socket.emit('join-zone', { zone: newUsername })
  } else {
    console.warn('socket not connected or newUsername missing')
  }
})
</script>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}
.slide-enter-from {
  transform: translateX(100%);
}
.slide-leave-to {
  transform: translateX(100%);
}
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.3s ease;
}
.slide-panel-enter-from {
  transform: translateX(100%);
}
.slide-panel-leave-to {
  transform: translateX(100%);
}
</style>
