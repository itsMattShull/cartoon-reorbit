// /composables/useClashSocket.js
import { ref, onBeforeUnmount } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

// module-scoped so each client gets its own copy
const battleState = ref(null)
let socket

export function useClashSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD
        ? undefined
        : `http://localhost:${runtime.public.socketPort}`
    )

    socket.on('gameStart',   state => { battleState.value = state })
    socket.on('phaseUpdate', state => { battleState.value = state })
    socket.on('gameEnd',     sum   => {
      battleState.value = { ...battleState.value, summary: sum }
    })
  }

  onBeforeUnmount(() => {
    // only remove listeners when this composable is truly torn down
    socket.off('gameStart')
    socket.off('phaseUpdate')
    socket.off('gameEnd')
    // do *not* socket.disconnect() here or you’ll break the lobby→play transition
  })

  return { socket, battleState }
}
