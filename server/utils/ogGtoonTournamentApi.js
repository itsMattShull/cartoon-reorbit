// server/utils/ogGtoonTournamentApi.js
//
// Shared pieces of the OG gToons tournament REST endpoints (server/api/game/oggtoons/tournaments/*).
// Nuxt-only (uses the '@/...' alias) — the cron and socket processes use ogGtoonTournament.js and
// ogGtoonTournamentLive.js instead.
import { createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getOgGtoonsConfig } from '@/server/utils/ogGtoonsConfig'
import { enqueueOgTournamentJob, bestEffort } from '@/server/utils/queues'
import { bracketRoundLabel, effectiveOptInStatus } from '@/server/utils/tournamentCore'

/** The signed-in player, read straight from the session (no loopback HTTP). 401/403 otherwise. */
export async function ogtRequireUser(event) {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, banned: true, active: true, isAdmin: true }
  })
  if (!me || me.banned || me.active === false) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  return me
}

/** Refuses the request while an admin has tournaments (or live matches) switched off. */
export async function ogtRequireEnabled() {
  const cfg = await getOgGtoonsConfig()
  if (!cfg.gameEnabled || !cfg.tournamentsEnabled) {
    throw createError({ statusCode: 404, statusMessage: 'Tournaments are currently unavailable.' })
  }
  return cfg
}

export function ogtId(event) {
  const id = event.context.params?.id
  if (!id || typeof id !== 'string') throw createError({ statusCode: 400, statusMessage: 'Missing tournament id' })
  return id
}

/**
 * The status to show (and enforce) for a tournament row `{ id, status, optInStartAt, optInEndAt }`.
 *
 * The scheduler opens the opt-in window a few minutes late, and every player-facing read used to return the stored
 * DRAFT in that gap, so the page said "opt-in hasn't opened" (and offered no button) inside the real window. This
 * applies the same flip the scheduler would — the identical guarded update, so announcements still go out from the
 * start time — and returns what the clock says. A window that has run out is reported as closed even if the scheduler
 * hasn't closed it yet (it still owns that: closing builds the pairings).
 */
export async function ogtResolveStatus(t, now = new Date()) {
  const status = effectiveOptInStatus(t.status, t.optInStartAt, t.optInEndAt, now)
  if (t.status === 'DRAFT' && status === 'OPT_IN_OPEN') {
    await prisma.ogGtoonTournament.updateMany({
      where: { id: t.id, status: 'DRAFT' },
      data: { status: 'OPT_IN_OPEN', nextAnnouncementAt: t.optInStartAt, lastAnnouncementAt: null, finalOptInMidnightAnnouncementSent: false }
    })
  }
  return status
}

/** Wakes the worker to score a pairing and build the next round. Best effort: the cron is the net. */
export async function ogtQueueAdvance(tournamentId, matchId = null) {
  await bestEffort('og tournament advance', () =>
    enqueueOgTournamentJob('ogTournamentAdvance', { tournamentId, matchId }, { key: matchId || tournamentId }))
}

/** "Swiss Round 2" / "Quarterfinals" for a pairing (a bracket label needs the round's size). */
export async function ogtRoundLabel(match) {
  if (match.stage === 'SWISS') return `Swiss Round ${match.roundNumber}`
  const count = await prisma.ogGtoonTournamentMatch.count({ where: { roundId: match.roundId } })
  return bracketRoundLabel(count)
}

export const hasPrize = (b) => !!b && !!(Number(b.points) > 0 || b.ctoons?.length || b.backgrounds?.length || b.packs?.length)

/** A prize bundle with names and images resolved, ready to show on the page. */
export async function ogtPrizeView(bundle) {
  if (!hasPrize(bundle)) return null
  const ctoonIds = (bundle.ctoons || []).map(c => c.ctoonId)
  const bgIds = (bundle.backgrounds || []).map(b => b.backgroundId)
  const packIds = (bundle.packs || []).map(p => p.packId)
  const [ctoons, bgs, packs] = await Promise.all([
    ctoonIds.length ? prisma.ctoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, name: true, assetPath: true } }) : [],
    bgIds.length ? prisma.background.findMany({ where: { id: { in: bgIds } }, select: { id: true, imagePath: true, filename: true } }) : [],
    packIds.length ? prisma.pack.findMany({ where: { id: { in: packIds } }, select: { id: true, name: true, imagePath: true } }) : []
  ])
  const cById = new Map(ctoons.map(c => [c.id, c]))
  const bById = new Map(bgs.map(b => [b.id, b]))
  const pById = new Map(packs.map(p => [p.id, p]))
  return {
    points: Number(bundle.points) || 0,
    ctoons: (bundle.ctoons || []).map(c => ({ ctoonId: c.ctoonId, quantity: c.quantity, name: cById.get(c.ctoonId)?.name || 'cToon', assetPath: cById.get(c.ctoonId)?.assetPath || null })),
    backgrounds: (bundle.backgrounds || []).map(b => ({ backgroundId: b.backgroundId, imagePath: bById.get(b.backgroundId)?.imagePath || null, name: bById.get(b.backgroundId)?.filename || 'Background' })),
    packs: (bundle.packs || []).map(p => ({ packId: p.packId, quantity: p.quantity, name: pById.get(p.packId)?.name || 'Pack', imagePath: pById.get(p.packId)?.imagePath || null }))
  }
}

/** Statuses that show up as an "active" sub-tab. */
export const OGT_ACTIVE_STATUSES = ['DRAFT', 'OPT_IN_OPEN', 'OPT_IN_CLOSED', 'SWISS_ACTIVE', 'BRACKET_ACTIVE']
