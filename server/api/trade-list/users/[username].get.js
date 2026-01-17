// server/api/trade-list/users/[username].get.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const username = event.context.params?.username
  if (!username) {
    throw createError({ statusCode: 400, statusMessage: 'Missing username' })
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  })
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  await prisma.userTradeListItem.deleteMany({
    where: {
      userId: user.id,
      userCtoon: { userId: { not: user.id } }
    }
  })

  const items = await prisma.userTradeListItem.findMany({
    where: { userId: user.id, userCtoon: { userId: user.id } },
    include: { userCtoon: { include: { ctoon: true } } }
  })

  const rows = items.map(item => ({
    id: item.id,
    userCtoonId: item.userCtoonId,
    ctoonId: item.userCtoon.ctoonId,
    assetPath: item.userCtoon.ctoon.assetPath,
    name: item.userCtoon.ctoon.name,
    series: item.userCtoon.ctoon.series?.trim() || null,
    set: item.userCtoon.ctoon.set?.trim() || null,
    rarity: item.userCtoon.ctoon.rarity?.trim() || null,
    isGtoon: item.userCtoon.ctoon.isGtoon,
    mintNumber: item.userCtoon.mintNumber
  }))

  rows.sort((a, b) => {
    const byName = (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    if (byName) return byName
    const byId = (a.ctoonId || '').localeCompare(b.ctoonId || '')
    if (byId) return byId
    const mA = a.mintNumber ?? Number.POSITIVE_INFINITY
    const mB = b.mintNumber ?? Number.POSITIVE_INFINITY
    return mA - mB
  })

  return rows
})
