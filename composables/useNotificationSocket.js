// /composables/useNotificationSocket.js
// Thin Socket.IO listener for the live "you have a new notification" push (see
// server/utils/realtimeNotify.js) — same module-scoped-singleton shape as useCMoonRaidSocket.js so
// every component sharing one browser tab reuses the same connection rather than opening several.
// Deliberately carries no payload of its own: `pingCount` just ticks up on every push, and the
// caller (Onboarding.vue) reacts by re-fetching /api/notifications itself, the same request its
// own ~2-minute poll already makes — this only makes that happen immediately instead of waiting
// for the next tick, which matters for anything with a short deadline (a raid boss's 60-second
// join window in particular).
import { ref } from 'vue'
import { io } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

const pingCount = ref(0)
let socket

export function useNotificationSocket() {
  if (!socket) {
    const runtime = useRuntimeConfig()
    socket = io(
      import.meta.env.PROD ? undefined : `http://localhost:${runtime.public.socketPort}`,
      { reconnectionDelayMax: 5000, withCredentials: true }
    )
    socket.on('notification:new', () => { pingCount.value++ })
  }

  return { pingCount }
}
