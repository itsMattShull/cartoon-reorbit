export default defineEventHandler(async (event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { layout, background } = body

  if (!Array.isArray(layout) || typeof background !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  const prisma = event.context.prisma

  // Get all UserCtoon IDs owned by the user
  const ownedCtoons = await prisma.userCtoon.findMany({
    where: { userId: user.id },
    select: { id: true }
  })
  const ownedIds = new Set(ownedCtoons.map(c => c.id))

  // Filter layout to only include cToons the user still owns
  const filteredLayout = layout.filter(item => ownedIds.has(item.id))

  await prisma.cZone.upsert({
    where: { userId: user.id },
    update: {
      layoutData: filteredLayout,
      background
    },
    create: {
      userId: user.id,
      layoutData: filteredLayout,
      background
    }
  })

  return { success: true }
})