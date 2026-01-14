// server/api/admin/users/[id]/additional-czones.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing user id' })

  const body = await readBody(event)
  const rawValue = body?.additionalCzones
  const nextValue = Number(rawValue)
  if (!Number.isFinite(nextValue) || nextValue < 0 || !Number.isInteger(nextValue)) {
    throw createError({ statusCode: 400, statusMessage: 'additionalCzones must be a non-negative integer' })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, additionalCzones: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  if (target.additionalCzones === nextValue) {
    return { ok: true, additionalCzones: nextValue }
  }

  const prev = { additionalCzones: target.additionalCzones ?? 0 }
  const wasReduced = nextValue < (target.additionalCzones ?? 0)

  await prisma.user.update({
    where: { id: target.id },
    data: { additionalCzones: nextValue }
  })

  if (wasReduced) {
    const config = await prisma.globalGameConfig.findUnique({
      where: { id: 'singleton' },
      select: { czoneCount: true }
    })
    const baseCount = Number(config?.czoneCount ?? 3)
    const maxZones = Math.max(1, baseCount + nextValue)

    const zone = await prisma.cZone.findUnique({
      where: { userId: target.id },
      select: { layoutData: true, background: true }
    })

    if (
      zone?.layoutData &&
      typeof zone.layoutData === 'object' &&
      Array.isArray(zone.layoutData.zones)
    ) {
      const existingZones = zone.layoutData.zones
      if (existingZones.length > maxZones) {
        const trimmed = existingZones.slice(0, maxZones)
        await prisma.cZone.update({
          where: { userId: target.id },
          data: {
            layoutData: { zones: trimmed },
            background: trimmed[0]?.background || ''
          }
        })
      }
    }
  }

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:Users',
    key: 'additionalCzones',
    prevValue: prev,
    newValue: { additionalCzones: nextValue }
  })

  return { ok: true, additionalCzones: nextValue }
})
