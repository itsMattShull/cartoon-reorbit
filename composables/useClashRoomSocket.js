// /composables/useClashRoomSocket.js
import { ref, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';

const roomState = ref(null);
let socket;

export function useClashRoomSocket(roomId) {
  if (!socket) {
    socket = io();
    socket.emit('joinClashRoom', { roomId, /* include deck & userId */ });
    socket.on('gameStart', state => { roomState.value = state });
    socket.on('phaseUpdate', state => { roomState.value = state });
    socket.on('gameEnd', sum => {
      roomState.value = { ...roomState.value, summary: sum };
    });
  }
  onBeforeUnmount(() => {
    socket.off('gameStart');
    socket.off('phaseUpdate');
    socket.off('gameEnd');
  });
  return { socket, roomState };
}