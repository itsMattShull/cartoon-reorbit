// Releases long-lived handles on shutdown so PM2 doesn't have to SIGKILL us.
// Without this the Redis connection keeps the event loop alive after Nitro's
// close hooks finish, and PM2 logs "still alive after 5000ms, sending SIGKILL".
import { redis } from '../utils/redis.js'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', async () => {
    // Failsafe: exit before PM2's kill_timeout (5000ms) if something else hangs.
    setTimeout(() => process.exit(0), 3500).unref()
    try { await redis.quit() } catch { try { redis.disconnect() } catch {} }
  })
})
