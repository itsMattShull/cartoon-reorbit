import { refreshDiscordTokenAndRoles } from '../utils/refreshDiscordTokenAndRoles.js'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) return

  const config = useRuntimeConfig(event)
  const prisma = event.context.prisma

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
