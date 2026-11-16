// server/utils/socketBridge.js
// Shared helper for pushing ONE trusted event from the Nuxt API process into the separate
// socket-server.js process — the same bridge mechanic server/api/auction/[id]/bid.post.js (and
// autobid.post.js, autoBid.js) each already open ad-hoc for their own single 'new-bid' emit (see
// socket-server.js's own SOCKET_BRIDGE_SECRET comment for how the receiving side authenticates
// this). Factored out here, rather than copied a fourth/fifth/sixth time inline, because
// MyOrbit's admin moderation actions (kicking a banned user live, retracting a deleted chat
// message) need this exact "connect, emit, briefly wait, disconnect" dance at more than one new
// call site.
import { io as createSocket } from 'socket.io-client'
import { useRuntimeConfig } from '#imports'

/**
 * Opens a short-lived bridge connection to socket-server.js, emits ONE event, and resolves once
 * either the emit has had a brief chance to actually reach the socket (25ms after 'connect') or
 * the connection attempt fails/times out (1500ms cap). Never throws and never rejects — a missed
 * live-update bridge emit means an admin action's EFFECT (e.g. a live kick) is delayed until the
 * next DB-backed check already performs on its own, not a reason to fail the HTTP request that
 * triggered it (same "best effort" stance bid.post.js's own call site takes toward 'new-bid').
 */
export function emitToSocketServer(event, payload) {
  return new Promise((resolve) => {
    const config = useRuntimeConfig()
    const socket = createSocket(config.socketOrigin, {
      path: config.socketPath,
      transports: ['websocket', 'polling'],
      auth: { bridgeSecret: config.socketBridgeSecret }
    })
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      try { socket.disconnect() } catch {}
      resolve()
    }
    socket.on('connect', () => {
      socket.emit(event, payload)
      setTimeout(finish, 25)
    })
    socket.on('connect_error', (err) => {
      console.error(`[socketBridge] connect_error emitting ${event}:`, err?.message || err)
      finish()
    })
    setTimeout(finish, 1500)
  })
}
