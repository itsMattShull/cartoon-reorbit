// server/api/czone.post.js

import { PrismaClient } from '@prisma/client'
import { defineEventHandler, readBody, createError } from 'h3'

const prisma = new PrismaClient()

export default defineEventHandler(async (event) => {
  // 1. Auth check
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Parse & validate body
  const { layout, background } = await readBody(event)
  if (!Array.isArray(layout) || typeof background !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
  }

  // 3. Fetch all UserCtoon records for this user, including their Ctoon
  const userCtoons = await prisma.userCtoon.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      ctoon: {
        select: {
          id: true,
          name: true,
          assetPath: true
        }
      }
    }
  })

  // Build a map: userCtoonId -> { name, assetPath }
  const lookup = new Map(
    userCtoons.map(uc => [uc.id, {
      name: uc.ctoon.name,
      assetPath: uc.ctoon.assetPath
    }])
  )

  // 4. Filter & enrich layout items
  const enrichedLayout = layout
    .filter(item => lookup.has(item.id))
    .map(item => {
      const { name, assetPath } = lookup.get(item.id)
      return {
        ...item,
        name,
        assetPath
      }
    })

  // 5. Upsert the CZone
  await prisma.cZone.upsert({
    where: { userId: user.id },
    update: {
      layoutData: enrichedLayout,
      background
    },
    create: {
      userId: user.id,
      layoutData: enrichedLayout,
      background
    }
  })

  return { success: true }
})
