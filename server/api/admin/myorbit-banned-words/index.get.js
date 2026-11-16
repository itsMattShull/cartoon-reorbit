import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const words = await db.myOrbitBannedWord.findMany({ orderBy: { phrase: 'asc' } })
  return { words: words.map(w => ({ id: w.id, phrase: w.phrase })) }
})
