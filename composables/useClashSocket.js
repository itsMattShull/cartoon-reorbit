// /composables/useClashSocket.js
import { io } from 'socket.io-client'
import { useRuntimeConfig, useState } from '#imports'

export function useClashSocket() {
  const battleState = useState('battle-state', () => null)
  const socketState = useState('clash-socket',  () => null)

  if (!socketState.value && process.client) {
    const { public: { socketPort } } = useRuntimeConfig()
    socketState.value = io(
      import.meta.env.PROD
        ? undefined
        : `http://localhost:${socketPort}`
    )
  }

  return { socket: socketState.value, battleState }
}
