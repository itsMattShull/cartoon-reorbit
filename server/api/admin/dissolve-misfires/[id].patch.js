// server/api/admin/dissolve-misfires/[id].patch.js
// Marks a logged misfire as reviewed, with an optional note — the actual remediation (returning
// the item, any point adjustment) is a manual admin action outside this tool; this just records
// that a human looked at it, same "surface the facts, don't auto-act" stance as the touch-trades
// dismiss endpoint.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'

const MAX_NOTE_LENGTH = 1000

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { id } = event.context.params || {}
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readBody(event)
  let note = body?.note != null ? String(body.note).trim() : null
  if (note && note.length > MAX_NOTE_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Note too long' })
  }
  if (!note) note = null

  const existing = await prisma.dissolveMisfireLog.findUnique({ where: { id } })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const updated = await prisma.dissolveMisfireLog.update({
    where: { id },
    data: {
      reviewedAt: new Date(),
      reviewedByUserId: me.id,
      reviewedByUsername: me.username || null,
      reviewNote: note
    }
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:DissolveMisfires',
    key: 'review',
    targetUserId: existing.rightfulOwnerUserId || undefined,
    targetUsername: existing.rightfulOwnerUsername || undefined,
    prevValue: { reviewedAt: existing.reviewedAt },
    newValue: { id, note }
  })

  return updated
})
