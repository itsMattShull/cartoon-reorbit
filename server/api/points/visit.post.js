import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const viewerId = event.context.user?.id
  const ownerId = body.zoneOwnerId

  if (!viewerId || !ownerId || viewerId === ownerId) {
    // Invalid or self-visit — don't award points
    return { success: false, message: 'Invalid visit' }
  }

  // Check if viewer already got points for this visit today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existingVisit = await prisma.visit.findFirst({
    where: {
      userId: viewerId,
      zoneOwnerId: ownerId,
      createdAt: {
        gte: today
      }
    }
  })

  if (existingVisit) {
    return { success: false, message: 'Already awarded today' }
  }

  // Log the visit
  await prisma.visit.create({
    data: {
      userId: viewerId,
      zoneOwnerId: ownerId
    }
  })

  // Add points
  await prisma.userPoints.upsert({
    where: { userId: viewerId },
    update: { points: { increment: 20 }},
    create: { userId: viewerId, points: 20 }
  })

  return { success: true, message: 'Points awarded' }
})