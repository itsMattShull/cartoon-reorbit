// POST /api/admin/touch-trades/dismiss
// Marks a flagged touch-trade pair as reviewed so it stops resurfacing on
// future report runs — same dismiss pattern as CheatFinderConfirmation (see
// server/api/admin/cheat-finder/confirm.post.js). Body: { groupKey, ctoonId,
// mintNumber, userAId, userBId, note? }. The groupKey is trusted only insofar
// as it's re-derived from the other fields server-side, never taken as-is
// from the client, so a forged/CSRF'd request can't dismiss an arbitrary key.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireSuperAdmin } from '@/server/utils/adminAuth'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { groupKeyFor } from '@/server/utils/touchTrades'

const MAX_NOTE_LENGTH = 500

export default defineEventHandler(async (event) => {
  const me = await requireSuperAdmin(event)

  const body = await readBody(event)
  const ctoonId = String(body?.ctoonId || '')
  const mintNumber = Number.isInteger(body?.mintNumber) ? body.mintNumber : parseInt(body?.mintNumber)
  const userAId = String(body?.userAId || '')
  const userBId = String(body?.userBId || '')
  if (!ctoonId || !Number.isFinite(mintNumber) || !userAId || !userBId || userAId === userBId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid group identity' })
  }

  const [userLo, userHi] = [userAId, userBId].sort()
  const groupKey = groupKeyFor(ctoonId, mintNumber, userLo, userHi)

  let note = body?.note != null ? String(body.note).trim() : null
  if (note && note.length > MAX_NOTE_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Note too long' })
  }
  if (!note) note = null

  await prisma.touchTradeConfirmation.upsert({
    where: { groupKey },
    create: {
      groupKey,
      ctoonId,
      mintNumber,
      userAId: userLo,
      userBId: userHi,
      note,
      confirmedByUserId: me.id,
      confirmedByUsername: me.username || null
    },
    update: {
      note,
      confirmedByUserId: me.id,
      confirmedByUsername: me.username || null,
      confirmedAt: new Date()
    }
  })

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:TouchTrades',
    key: 'dismiss',
    newValue: { groupKey, ctoonId, mintNumber, userLo, userHi, note }
  })

  return { success: true, groupKey }
})
