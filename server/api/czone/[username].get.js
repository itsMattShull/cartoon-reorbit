import { PrismaClient } from '@prisma/client'

export default defineEventHandler(async (event) => {
  const prisma = new PrismaClient()
  const { username } = event.context.params

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      cZones: true
    }
  })

  let zone = user.cZones?.[0]

  // Remove cToons from layoutData if the user no longer owns them
  for (const z of user.cZones || []) {
    if (z.layoutData?.length) {
      const ids = z.layoutData.map(item => item.id).filter(Boolean)
      // Fetch only the userCtoons still owned by this user
      const owned = await prisma.userCtoon.findMany({
        where: { id: { in: ids }, userId: user.id },
        select: { id: true }
      })
      const ownedSet = new Set(owned.map(o => o.id))
      const filtered = z.layoutData.filter(item => ownedSet.has(item.id))
      if (filtered.length !== z.layoutData.length) {
        // Persist the cleaned layoutData
        await prisma.cZone.update({
          where: { id: z.id },
          data: { layoutData: filtered }
        })
        // Update in-memory zone entry
        z.layoutData = filtered
      }
    }
  }

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found'
    })
  }
  
  if (zone && zone.layoutData?.length) {
    // Ensure we use the id of the userCtoon for filtering and mapping
    const userCtoonIds = zone.layoutData.map(item => item.id).filter(Boolean)

    const userCtoons = await prisma.userCtoon.findMany({
      where: {
        id: { in: userCtoonIds }
      },
      include: {
        ctoon: true
      }
    })

    const ctoonMap = {}
    for (const entry of userCtoons) {
      ctoonMap[entry.id] = entry
    }

    // Use the full userCtoon object including nested ctoon details
    zone.layoutData = zone.layoutData.map(item => {
      const match = ctoonMap[item.id]
      return {
        ...item,
        mintNumber: match?.mintNumber ?? null,
        quantity: match?.ctoon?.quantity ?? null,
        series: match?.ctoon?.series ?? null,
        rarity: match?.ctoon?.rarity ?? null
      }
    })
  }

  if (!zone) {
    zone = {
      id: null,
      layoutData: [],
      background: '/IMG_3433.GIF',
      isPublic: true
    }
  }

  return {
    ownerId: user.id,
    avatar: user.avatar,
    ownerName: user.username,
    cZone: {
      id: zone.id,
      layoutData: zone.layoutData || [],
      background: zone.background || '/IMG_3433.GIF',
      isPublic: zone.isPublic
    }
  }
})