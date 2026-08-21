// server/api/admin/cmoons/[id]/join-effect-images/[imageId].delete.js
import { defineEventHandler, getRouterParam, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { cmoonJoinEffectFsPath } from '@/server/utils/cmoonJoinEffectStorage'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, banned: true, active: true }
  })
  if (!me?.isAdmin || me.banned || me.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Admins only' })
  }

  const cMoonId = getRouterParam(event, 'id')
  const imageId = getRouterParam(event, 'imageId')

  // Scoped to both ids so a valid imageId from a different cMoon can't be
  // deleted via this route.
  const image = await db.cMoonJoinEffectImage.findFirst({ where: { id: imageId, cMoonId } })
  if (!image) throw createError({ statusCode: 404, statusMessage: 'Image not found' })

  await db.cMoonJoinEffectImage.delete({ where: { id: image.id } })

  // File cleanup happens after the DB commit and is non-fatal if the file is
  // already gone — same ordering as server/api/admin/backgrounds/[id].delete.js.
  try { await unlink(cmoonJoinEffectFsPath(image.filename)) } catch {}

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoon:joinEffectImages',
    key: `remove:${cMoonId}`,
    prevValue: { id: image.id, imagePath: image.imagePath },
    newValue: null,
  }).catch(() => {})

  return { ok: true }
})
