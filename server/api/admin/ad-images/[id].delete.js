import { defineEventHandler, getRouterParam, getRequestHeader, createError } from 'h3'
import { unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma as db } from '@/server/prisma'

const __dirname = dirname(fileURLToPath(import.meta.url))
const baseDir = process.env.NODE_ENV === 'production'
  ? join(__dirname, '..', '..', '..')
  : process.cwd()

const uploadDir = process.env.NODE_ENV === 'production'
  ? join(baseDir, 'cartoon-reorbit-images', 'ad-images')
  : join(baseDir, 'public', 'ad-images')

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const row = await db.adImage.findUnique({ where: { id } })
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  try {
    await unlink(join(uploadDir, row.filename))
  } catch {
    // file might already be gone; ignore
  }
  await db.adImage.delete({ where: { id } })

  return { ok: true }
})
