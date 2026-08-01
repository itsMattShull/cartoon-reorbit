import { refreshDiscordTokenAndRoles } from '../utils/refreshDiscordTokenAndRoles.js'
import { prisma } from '@/server/prisma'
import { isHotPath } from '@/server/utils/hotPaths'

export default defineEventHandler(async (event) => {
  // Only API routes need user context. Without this gate the middleware runs
  // for every static asset too (cToon images, backgrounds, JS chunks), and a
  // cZone full of cToons turns one page load into dozens of DB lookups.
  if (!event.path.startsWith('/api')) return

  // Per-interaction game endpoints: one full-row User lookup per answer/image is pure
  // overhead for handlers that never read event.context.user.
  if (isHotPath(event.path)) return

  const userId = event.context.userId
  if (!userId) return

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
