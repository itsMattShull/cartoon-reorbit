// server/api/my-packs.get.js
// Lists the caller's own sealed (unopened) packs — powers the "Sealed Packs" panel on My
// Collection (components/newsite/MyCollection.vue). Read-only; opening a pack is still the
// existing server/api/cmart/open-pack.get.js, unchanged.
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await db.userPack.findMany({
    where: { userId: me.id, opened: false },
    select: {
      id: true,
      createdAt: true,
      pack: { select: { id: true, name: true, imagePath: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map(r => ({
    userPackId: r.id,
    packId: r.pack.id,
    name: r.pack.name,
    imagePath: r.pack.imagePath,
    createdAt: r.createdAt,
  }))
})
