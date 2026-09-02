// server/api/admin/avatars.get.js — list the restricted Avatar catalog (for the affinity-level
// reward picker in Admin cMoon). Free filesystem avatars aren't catalog rows, so they don't
// appear here — only avatars actually grantable as a reward.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const avatars = await db.avatar.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, label: true, filename: true, imagePath: true },
  })
  return avatars
})
