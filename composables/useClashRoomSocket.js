// /composables/useClashRoomSocket.js
import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'

const roomState = ref(null)
const isConnected = ref(false)
let socket
let _roomId = null
let _userId = null

export function useClashRoomSocket(roomId, userId) {
  if (!socket) {
    socket = io({ reconnectionDelayMax: 5000 })

    socket.on('connect', () => {
      isConnected.value = true
      // Re-join the PvP lobby room after reconnect
      if (_roomId && _userId) {
        socket.emit('joinClashRoom', { roomId: _roomId, userId: _userId })
        socket.emit('listClashDecks', { userId: _userId })
      }
    })

    socket.on('disconnect', () => {
      isConnected.value = false
    })

    socket.on('gameStart',    state => { roomState.value = state })
    socket.on('phaseUpdate',  state => { roomState.value = state })
    socket.on('gameEnd',      sum   => { roomState.value = { ...roomState.value, summary: sum } })
    socket.on('pvpLobbyState', snap => { roomState.value = snap })
  }

  if (roomId) _roomId = roomId
  if (userId) _userId = userId

  onBeforeUnmount(() => {
    socket.off('gameStart')
    socket.off('phaseUpdate')
    socket.off('gameEnd')
    socket.off('pvpLobbyState')
  })

  return { socket, roomState, isConnected }
}
