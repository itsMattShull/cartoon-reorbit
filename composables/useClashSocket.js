// /composables/useClashSocket.js
import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

// module-scoped so each client gets its own copy
const battleState = ref(null)
const isConnected = ref(false)
const currentBattleId = ref(null)
let socket

export function useClashSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD
        ? undefined
        : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000 }
    )

    socket.on('connect', () => {
      isConnected.value = true
      // Re-join an in-progress battle after reconnect
      if (currentBattleId.value) {
        socket.emit('battle:join', { battleId: currentBattleId.value })
      }
    })

    socket.on('disconnect', () => {
      isConnected.value = false
    })

    socket.on('gameStart',   state => { battleState.value = state })
    socket.on('phaseUpdate', state => { battleState.value = state })
    socket.on('gameEnd',     sum   => {
      battleState.value = { ...battleState.value, summary: sum }
    })
    socket.on('battle:state', state => { battleState.value = state })
  }

  onBeforeUnmount(() => {
    socket.off('gameStart')
    socket.off('phaseUpdate')
    socket.off('gameEnd')
    socket.off('battle:state')
    // do *not* socket.disconnect() here or you'll break the lobby→play transition
  })

  return { socket, battleState, isConnected, currentBattleId }
}
