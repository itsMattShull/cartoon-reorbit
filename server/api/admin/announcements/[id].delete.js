import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const id = String(event.context.params?.id || '').trim()
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })

  const existing = await db.announcement.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Announcement not found' })
  if (existing.sentAt) throw createError({ statusCode: 400, statusMessage: 'Cannot delete a sent announcement' })

  await db.announcement.delete({ where: { id } })

  if (existing.imageFilename) {
    const uploadDir = process.env.NODE_ENV === 'production'
      ? join(baseDir, 'cartoon-reorbit-images', 'announcements')
      : join(baseDir, 'public', 'announcements')
    try { await unlink(join(uploadDir, existing.imageFilename)) } catch {}
  }

  return { ok: true }
})
