// /composables/useClashSocket.js
import { ref } from 'vue'
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

  // Module-level handlers are intentionally not removed on component unmount —
  // they must persist across page navigations to keep battleState in sync.
  // Individual pages register and clean up their own additional handlers.

  return { socket, battleState, isConnected, currentBattleId }
}
