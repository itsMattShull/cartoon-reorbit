// GET /api/admin/og-tournaments/backgrounds — backgrounds that can be given as a prize.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return prisma.background.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: { id: true, imagePath: true, filename: true, label: true }
  })
})
