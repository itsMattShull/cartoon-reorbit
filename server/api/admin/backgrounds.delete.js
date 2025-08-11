import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unlink } from 'node:fs/promises'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..', '..')
  : process.cwd()

function fsPathFromFilename(filename) {
  return process.env.NODE_ENV === 'production'
    ? join(baseDir, 'cartoon-reorbit-images', 'backgrounds', filename)
    : join(baseDir, 'public', 'backgrounds', filename)
}

export default defineEventHandler(async (event) => {
  // Authz
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

  const id = event.context.params?.id
  const bg = await db.background.findUnique({ where: { id } })
  if (!bg) throw createError({ statusCode: 404, statusMessage: 'Background not found' })

  // block delete if any zone uses this exact imagePath
  const used = await db.cZone.count({ where: { background: bg.imagePath } })
  if (used > 0) throw createError({ statusCode: 409, statusMessage: 'In use by some cZones' })

  try { await unlink(fsPathFromFilename(bg.filename)) } catch {}
  await db.background.delete({ where: { id } })
  return { ok: true }
})