// server/api/admin/achievements/[id].delete.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

function fsPathFromImagePath(imagePath) {
  if (!imagePath) return null
  const filename = String(imagePath).split('/').pop()
  if (!filename) return null
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'achievements', filename)
    : join(baseDir, 'public', 'achievements', filename)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch { throw createError({ statusCode: 401, statusMessage: 'Unauthorized' }) }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = event.context.params?.id
  const ach = await db.achievement.findUnique({ where: { id } })
  if (!ach) throw createError({ statusCode: 404, statusMessage: 'Achievement not found' })

  // Do not block delete if users already achieved — keep their rows
  // but with onDelete: Cascade on AchievementUser, they will be removed with achievement.
  const fsPath = fsPathFromImagePath(ach.imagePath)
  if (fsPath) { try { await unlink(fsPath) } catch {} }

  await db.achievement.delete({ where: { id } })
  await logAdminChange(db, { userId: me.id, area: 'Achievements', key: `delete:${ach.slug}`, prevValue: { id }, newValue: null })
  return { ok: true }
})

