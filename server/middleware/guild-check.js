import { refreshDiscordTokenAndRoles } from '../utils/refreshDiscordTokenAndRoles.js'
import { prisma } from '@/server/prisma'

const lastSync = new Map() // userId -> timestamp ms
const SYNC_TTL_MS = Number(process.env.GUILD_SYNC_TTL_MS || 5 * 60_000)

function isStaticOrAsset(event) {
  try {
    const url = getRequestURL(event)
    const p = url.pathname || ''
    if (p.startsWith('/_nuxt') || p.startsWith('/public') || p === '/favicon.ico') return true
    if (/(\.js|\.css|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.webp|\.mp3|\.woff2?)$/i.test(p)) return true
    const accept = String(event.node.req.headers['accept'] || '')
    const isHtml = accept.includes('text/html')
    const isApi  = p.startsWith('/api')
    return !(isHtml || isApi)
  } catch { return false }
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) return
  if (isStaticOrAsset(event)) return

  const now = Date.now()
  const prev = lastSync.get(userId) || 0
  if (now - prev < SYNC_TTL_MS) return
  lastSync.set(userId, now)

  const config = useRuntimeConfig(event)

  const user = await prisma.user.findUnique({
    where: { id: userId }
  })

  if (!user || !user.discordId) return

  // Try refreshing their token and syncing roles
  await refreshDiscordTokenAndRoles(prisma, user, config)

  // If the user has no roles, assume they're not in the guild
  if (!user.roles) {
    console.warn('User not in guild – skipping invite redirect for now.')
  }

  event.context.user = user
})
