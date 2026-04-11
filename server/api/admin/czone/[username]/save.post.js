// POST /api/admin/czone/[username]/save
// Allows admin users to save a modified cZone layout for any user.
// Only removals are permitted — submitted toon IDs must be a subset of originals.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const adminUser = event.context.user
  if (!adminUser?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const { username } = event.context.params

  const targetUser = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  })
  if (!targetUser) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  const { zones } = await readBody(event)

  if (!Array.isArray(zones) || zones.length < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body: zones must be a non-empty array' })
  }

  // Load the original cZone to validate no additions
  const existing = await prisma.cZone.findFirst({
    where: { userId: targetUser.id }
  })

  // Build set of all toon IDs currently in the cZone
  const originalIds = new Set()
  if (
    existing?.layoutData &&
    typeof existing.layoutData === 'object' &&
    Array.isArray(existing.layoutData.zones)
  ) {
    for (const z of existing.layoutData.zones) {
      if (Array.isArray(z.toons)) {
        for (const t of z.toons) {
          if (t?.id) originalIds.add(t.id)
        }
      }
    }
  } else if (Array.isArray(existing?.layoutData)) {
    for (const t of existing.layoutData) {
      if (t?.id) originalIds.add(t.id)
    }
  }

  // Validate: submitted toons must be a subset of originals (no additions allowed)
  for (const zone of zones) {
    if (!Array.isArray(zone.toons)) continue
    for (const toon of zone.toons) {
      if (toon?.id && !originalIds.has(toon.id)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Toon ID "${toon.id}" was not in the original cZone — additions are not permitted`
        })
      }
    }
  }

  // Save the updated layout
  const upsertData = {
    layoutData: { zones },
    background: typeof zones[0]?.background === 'string' ? zones[0].background : ''
  }

  await prisma.cZone.upsert({
    where: { userId: targetUser.id },
    update: upsertData,
    create: {
      userId: targetUser.id,
      ...upsertData
    }
  })

  return { success: true }
})
