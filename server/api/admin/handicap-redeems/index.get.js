// Combined read for the Handicap Redeems admin panel: who's currently flagged, plus every
// still-open hold (so the admin can see the tool is actually doing something — which code,
// since when, how many more redemptions it's waiting on).
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { HANDICAP_REQUIRED_RELEASE_CLAIMS, claimsSinceHold } from '@/server/utils/handicapRedeem'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const [flagged, holds] = await Promise.all([
    db.handicapRedeemer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { username: true } },
        flaggedBy: { select: { username: true } }
      }
    }),
    db.handicapRedeemHold.findMany({
      // RELEASING is the brief in-between state a release attempt claims a hold with before the
      // redemption itself finishes (see codeRedemption.js's releaseHold) — included here too so
      // the admin doesn't see a hold vanish and reappear if they happen to load this panel
      // during that narrow window.
      where: { status: { in: ['PENDING', 'RELEASING'] } },
      orderBy: { requestedAt: 'asc' },
      include: {
        user: { select: { username: true } },
        code: { select: { code: true } }
      }
    })
  ])

  const holdsWithProgress = await Promise.all(holds.map(async (h) => {
    const othersSoFar = await claimsSinceHold(h.codeId, h.requestedAt)
    return {
      id: h.id,
      username: h.user.username,
      code: h.code.code,
      requestedAt: h.requestedAt,
      releasing: h.status === 'RELEASING',
      othersSoFar,
      stillNeeded: Math.max(0, HANDICAP_REQUIRED_RELEASE_CLAIMS - othersSoFar)
    }
  }))

  return {
    requiredReleaseClaims: HANDICAP_REQUIRED_RELEASE_CLAIMS,
    flagged: flagged.map(f => ({
      id: f.id,
      userId: f.userId,
      username: f.user.username,
      reason: f.reason,
      flaggedByUsername: f.flaggedBy.username,
      createdAt: f.createdAt
    })),
    holds: holdsWithProgress
  }
})
