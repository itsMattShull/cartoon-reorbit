// GET /api/admin/czone/[username]/edit
// Returns the target user's cZone layout for admin editing (view + remove only)

import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const adminUser = event.context.user
  if (!adminUser?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const { username } = event.context.params

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true }
  })
  if (!targetUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const zone = await prisma.cZone.findFirst({
    where: { userId: targetUser.id }
  })

  if (
    zone?.layoutData &&
    typeof zone.layoutData === 'object' &&
    Array.isArray(zone.layoutData.zones)
  ) {
    return { zones: zone.layoutData.zones }
  }

  // Legacy single-zone or no zone at all
  const singleLayout = Array.isArray(zone?.layoutData) ? zone.layoutData : []
  const singleBg = typeof zone?.background === 'string' ? zone.background : ''
  return { zones: [{ background: singleBg, toons: singleLayout }] }
})
