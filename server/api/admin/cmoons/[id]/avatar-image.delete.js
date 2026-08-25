// server/api/admin/cmoons/[id]/avatar-image.delete.js
// Removes a cMoon's small avatar image; the cZone badge just shows the colored name pill alone.
import { defineEventHandler, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { cmoonAvatarFsPath } from '@/server/utils/cmoonImageStorage'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  if (!cmoon.avatarPath) return { id, avatarPath: null }

  const oldAvatarPath = cmoon.avatarPath
  await db.cMoon.update({ where: { id }, data: { avatarPath: null } })
  invalidateCMoonList()

  const oldFilename = oldAvatarPath.split('/').pop()
  if (oldFilename) { try { await unlink(cmoonAvatarFsPath(oldFilename)) } catch {} }

  await logAdminChange(db, {
    userId: me.id, area: 'cMoon', key: `avatarImage:${id}`, prevValue: oldAvatarPath, newValue: null,
  })

  return { id, avatarPath: null }
})
