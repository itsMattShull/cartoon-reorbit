import { startOfDay, endOfDay } from 'date-fns'

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context?.userId
  if (!userId) return

  const ip = getRequestIP(event)
  if (!ip) return

  const todayStart = startOfDay(new Date())
  const todayEnd = endOfDay(new Date())

  const existingLog = await prisma.loginLog.findFirst({
    where: {
      userId,
      ip,
      createdAt: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
  })

  if (!existingLog) {
    await prisma.loginLog.create({
      data: {
        userId,
        ip,
      },
    })
  }
})

function getRequestIP(event) {
  const headers = event.node.req.headers
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim()
    if (firstIp) return firstIp
  }

  return event.node.req.socket?.remoteAddress || null
}
