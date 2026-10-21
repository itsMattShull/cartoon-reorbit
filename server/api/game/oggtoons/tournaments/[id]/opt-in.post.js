// POST /api/game/oggtoons/tournaments/:id/opt-in   { deckId }
// Enter (or change the deck of) an entry while the opt-in window is open. The chosen deck is
// verified and its exact cards are locked for the whole tournament.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { lockTournamentDeck } from '@/server/utils/ogGtoonTournamentLive'
import { ogtRequireUser, ogtRequireEnabled, ogtId } from '@/server/utils/ogGtoonTournamentApi'

export default defineEventHandler(async (event) => {
  const me = await ogtRequireUser(event)
  await ogtRequireEnabled()
  const id = ogtId(event)
  const body = await readBody(event)

  const t = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true, status: true, optInStartAt: true, optInEndAt: true } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  const now = new Date()

  // The cron opens the window a few minutes late; don't make players wait for it.
  if (t.status === 'DRAFT' && now >= t.optInStartAt && now <= t.optInEndAt) {
    await prisma.ogGtoonTournament.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'OPT_IN_OPEN', nextAnnouncementAt: t.optInStartAt, lastAnnouncementAt: null, finalOptInMidnightAnnouncementSent: false }
    })
    t.status = 'OPT_IN_OPEN'
  }
  if (t.status !== 'OPT_IN_OPEN' || now > t.optInEndAt) throw createError({ statusCode: 400, statusMessage: 'Opt-in is closed' })

  const existing = await prisma.ogGtoonTournamentOptIn.findUnique({ where: { tournamentId_userId: { tournamentId: id, userId: me.id } } })
  if (existing?.disqualified) throw createError({ statusCode: 403, statusMessage: 'You cannot enter this tournament' })

  const locked = await lockTournamentDeck(me.id, String(body?.deckId || ''))
  if (locked.error) throw createError({ statusCode: 400, statusMessage: locked.error })

  await prisma.ogGtoonTournamentOptIn.upsert({
    where: { tournamentId_userId: { tournamentId: id, userId: me.id } },
    create: { tournamentId: id, userId: me.id, optedInAt: now, isActive: true, sourceDeckId: String(body.deckId), deckSnapshotJson: locked.snapshot },
    update: { isActive: true, sourceDeckId: String(body.deckId), deckSnapshotJson: locked.snapshot, optedInAt: existing?.isActive ? existing.optedInAt : now }
  })
  return { ok: true }
})
