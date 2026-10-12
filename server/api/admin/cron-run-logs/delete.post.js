// server/api/admin/cron-run-logs/delete.post.js
// POST /api/admin/cron-run-logs/delete
//   { ids: string[] }                      delete exactly those rows
//   { all: true, job?: string, status?: } delete every row matching the filter (the page's
//                                          "select all N matching" across pages)
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

const STATUSES = ['SUCCESS', 'FAILED', 'SKIPPED']
const MAX_IDS = 5000

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = (await readBody(event).catch(() => null)) || {}

  if (body.all === true) {
    const where = {}
    if (body.job) where.job = String(body.job)
    if (body.status && STATUSES.includes(String(body.status))) where.status = String(body.status)
    const { count } = await prisma.cronRunLog.deleteMany({ where })
    return { ok: true, deleted: count }
  }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String).filter(Boolean))] : []
  if (!ids.length) throw createError({ statusCode: 400, statusMessage: 'No ids provided' })
  if (ids.length > MAX_IDS) throw createError({ statusCode: 400, statusMessage: `Too many ids (max ${MAX_IDS})` })

  const { count } = await prisma.cronRunLog.deleteMany({ where: { id: { in: ids } } })
  return { ok: true, deleted: count }
})
