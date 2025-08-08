/* =======================================
   pages/games/clash/rooms.vue
   ======================================= */
<template>
  <Nav />
  <section class="pt-20 max-w-3xl mx-auto">
    <h1 class="text-2xl font-bold mb-4">Clash Lobby</h1>
    <button @click="createRoom" class="mb-6 px-4 py-2 bg-indigo-500 text-white rounded">
      Create New Room
    </button>
    <ul>
      <li v-for="r in rooms" :key="r.id" class="flex justify-between py-2 border-b">
        <span>Room {{ r.id }} (owner: {{ r.owner }})</span>
        <button @click="joinRoom(r.id)" class="px-2 py-1 bg-green-500 text-white rounded">
          Join
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import Nav from '@/components/Nav.vue';

definePageMeta({ middleware: 'auth', layout: 'default' });

const rooms = ref([]);
const { user, fetchSelf } = useAuth();
await fetchSelf();

function fetchRooms() {
  socket.emit('listClashRooms');
}

function createRoom() {
  const roomId = Date.now().toString();
  socket.emit('createClashRoom', { roomId, userId: user.value.id, deck });
  router.push(`/games/clash/${roomId}`);
}

function joinRoom(id) {
  router.push(`/games/clash/${id}`);
}

const socket = io();

socket.on('clashRooms', list => { rooms.value = list });

onMounted(fetchRooms);
</script>