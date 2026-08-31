// server/api/admin/cmoon-change-requests.get.js
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const statusQuery = typeof query.status === 'string' && query.status.trim()
    ? query.status.trim().toUpperCase()
    : 'IN_REVIEW'
  const where = statusQuery === 'HISTORY'
    ? { status: { in: ['ACCEPTED', 'REJECTED'] } }
    : { status: statusQuery }

  const page = Math.max(parseInt(query.page || '1', 10), 1)
  const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 100)
  const skip = (page - 1) * limit

  const [total, requests] = await Promise.all([
    prisma.cMoonChangeRequest.count({ where }),
    prisma.cMoonChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, discordTag: true } },
        currentCMoon: { select: { id: true, name: true, color: true } },
        requestedCMoon: { select: { id: true, name: true, color: true } },
      },
      skip,
      take: limit,
    }),
  ])

  return {
    items: requests.map((r) => ({
      id: r.id,
      status: r.status,
      rejectionReason: r.rejectionReason,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user,
      currentCMoon: r.currentCMoon,
      requestedCMoon: r.requestedCMoon,
    })),
    total,
    page,
    limit,
  }
})
