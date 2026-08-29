// server/api/cmoon/[id]/rank-progress.get.js
// The caller's OWN progress up the universal Rank Ladder for this specific cMoon (their rank is
// per-cMoon — see User.currentCMoonRankId — even though the ladder's name/threshold is shared
// across every cMoon, see CMoonRankTier). Mirrors affinity.get.js's shape/reasoning: per-caller,
// never cacheable, so it stays its own lightweight endpoint rather than folding into the shared,
// briefly-cached GET /api/cmoon/[id] payload. Never accepts a target userId — only ever returns
// the authenticated caller's own progress.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const [tiers, me] = await Promise.all([
    db.cMoonRankTier.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, sortOrder: true, pointThreshold: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { cMoonId: true, cMoonPoints: true, currentCMoonRank: { select: { id: true, name: true, sortOrder: true } } },
    }),
  ])

  const isMember = me?.cMoonId === cMoonId
  const cMoonPoints = isMember ? (me?.cMoonPoints || 0) : 0
  const currentRank = isMember ? (me?.currentCMoonRank || null) : null
  const nextTier = isMember ? (tiers.find(t => t.pointThreshold > cMoonPoints) || null) : null

  return {
    isMember,
    cMoonPoints,
    currentRank,
    nextTier: nextTier ? { id: nextTier.id, name: nextTier.name, pointThreshold: nextTier.pointThreshold } : null,
    tiers,
  }
})
