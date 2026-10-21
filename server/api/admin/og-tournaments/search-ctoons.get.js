// GET /api/admin/og-tournaments/search-ctoons?q=  — name search for the prize picker. Lives under
// this tool's own API segment so a tournament admin does not also need the cToons tool.
import { defineEventHandler, getQuery } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const q = String(getQuery(event).q || '').trim()
  if (q.length < 3) return []
  const rows = await prisma.ctoon.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    take: 20,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, assetPath: true, quantity: true, rarity: true, set: true }
  })
  return rows
})
