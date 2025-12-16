// Ensures Prisma connects during Nitro boot, before handling requests.
// Loaded automatically by Nitro (files in server/plugins/* run at startup).
import { prisma } from '../prisma.js'

export default defineNitroPlugin(async (nitroApp) => {
  try {
    // Deduplicate concurrent connects on cold start
    if (!global.__prismaConnectPromise) {
      global.__prismaConnectPromise = (async () => {
        await prisma.$connect()
        try { await prisma.$queryRaw`SELECT 1` } catch {}
        return true
      })()
    }
    await global.__prismaConnectPromise
    console.log('[Prisma] Connected (Nitro)')
  } catch (err) {
    console.error('[Prisma] Failed to connect in Nitro plugin:', err)
  }

  // Graceful shutdown for Nitro close hook
  nitroApp.hooks.hook('close', async () => {
    try { await prisma.$disconnect() } catch {}
  })
})

