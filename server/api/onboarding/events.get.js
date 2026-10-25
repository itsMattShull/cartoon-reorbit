import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  const [holidayEvents, czoneSearches, czoneContests, config, cmoonUser] = await Promise.all([
    db.holidayEvent.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gt: now }
      },
      orderBy: { endsAt: 'asc' },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true
      }
    }),
    db.cZoneSearch.findMany({
      where: {
        startAt: { lte: now },
        endAt: { gte: now }
      },
      orderBy: { endAt: 'asc' },
      select: {
        id: true,
        name: true,
        linkInOnboarding: true,
        startAt: true,
        endAt: true
      }
    }),
    db.cZoneContest.findMany({
      where: {
        OR: [
          // Active for submission
          { startDate: { lte: now }, endDate: { gte: now } },
          // Active for voting
          { endVotingDate: { not: null, gte: now }, endDate: { lt: now } },
          // Closed but not yet distributed
          {
            distributedAt: null,
            OR: [
              { endVotingDate: null, endDate: { lt: now } },
              { endVotingDate: { not: null, lt: now } }
            ]
          },
          // Closed and distributed within the last 3 days
          { distributedAt: { gte: threeDaysAgo } }
        ]
      },
      orderBy: { endDate: 'asc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        endVotingDate: true,
        distributedAt: true
      }
    }),
    // Cheap to add here: a cached global-config read (see getGlobalConfig's own caching) plus a
    // single indexed primary-key User lookup for a handful of scalar fields — no extra queries
    // beyond this one row, mirroring exactly what /api/cmoon/battle/consider.post.js already reads
    // to gate the popup, so the countdown below can never drift from the real eligibility check.
    getGlobalConfig(),
    db.user.findUnique({
      where: { id: userId },
      select: { lastCMoonBattlePopupAt: true, allowCMoonEnemyPopups: true }
    })
  ])

  // Mirrors server/api/cmoon/battle/consider.post.js's own cooldown math exactly — this must never
  // compute a different "next available" time than what that endpoint actually enforces.
  let cMoonEnemyCountdown = null
  if (config?.cMoonEnemyBattlesEnabled) {
    if (!cmoonUser?.allowCMoonEnemyPopups) {
      cMoonEnemyCountdown = { enabled: true, optedOut: true, nextAvailableAt: null }
    } else {
      const cooldownMinutes = config?.cMoonBattlePopupCooldownMinutes ?? 0
      let nextAvailableAt = null
      if (cooldownMinutes > 0 && cmoonUser?.lastCMoonBattlePopupAt) {
        const nextAllowed = new Date(cmoonUser.lastCMoonBattlePopupAt.getTime() + cooldownMinutes * 60 * 1000)
        if (nextAllowed > now) nextAvailableAt = nextAllowed.toISOString()
      }
      cMoonEnemyCountdown = { enabled: true, optedOut: false, nextAvailableAt }
    }
  }

  return {
    holidayEvents: holidayEvents.map((row) => ({
      id: row.id,
      name: row.name,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString()
    })),
    czoneSearches: czoneSearches.map((row) => ({
      id: row.id,
      name: row.name,
      linkInOnboarding: row.linkInOnboarding,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString()
    })),
    czoneContests: czoneContests.map((row) => {
      let status = 'closed'
      if (row.startDate <= now && row.endDate >= now) {
        status = 'submission'
      } else if (row.endVotingDate && row.endDate < now && row.endVotingDate >= now) {
        status = 'voting'
      } else if (row.distributedAt) {
        status = 'distributed'
      }

      return {
        id: row.id,
        name: row.name,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        endVotingDate: row.endVotingDate ? row.endVotingDate.toISOString() : null,
        distributedAt: row.distributedAt ? row.distributedAt.toISOString() : null,
        status
      }
    }),
    cMoonEnemyCountdown
  }
})
