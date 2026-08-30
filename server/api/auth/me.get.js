// server/api/auth/me.get.js
import { defineEventHandler, createError, getCookie } from 'h3'
import jwt from 'jsonwebtoken'
import { prisma } from '@/server/prisma'
import { refreshDiscordTokenAndRoles } from '../../utils/refreshDiscordTokenAndRoles.js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  // Try middleware‑injected userId first; otherwise fall back to the persistent JWT cookie.
  let userId = event.context.userId

  if (!userId) {
    const token = getCookie(event, 'session')
    if (token) {
      try {
        const payload = jwt.verify(token, config.jwtSecret)
        userId = payload.sub
        event.context.userId = userId // make it available to downstream handlers
      } catch {
        // Invalid or expired cookie – treat as unauthenticated
      }
    }
  }

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  }

  // Fetch only the fields we need, including inGuild as a scalar
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      discordId: true,
      discordTag: true,
      discordAvatar: true,
      avatar: true,
      username: true,
      roles: true,
      banned: true,
      active: true,
      isAdmin: true,
      inGuild: true,
      points: true,
      isBooster: true,
      additionalCzones: true,
      surveyAnswers: { select: { userId: true } },
      equippedBorderCMoonId: true,
    }
  })

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  }

  if (user.banned) {
    throw createError({ statusCode: 403, statusMessage: 'Banned' })
  }

  // Ensure fresh tokens and up-to-date roles
  await refreshDiscordTokenAndRoles(prisma, user, config)

  const [ctoonCount, uniqueCtoonRows, lockAgg, unreadNotifications, ownedBorders] = await Promise.all([
    prisma.userCtoon.count({
      where: {
        userId: user.id,
        burnedAt: null
      }
    }),
    prisma.userCtoon.groupBy({
      by: ['ctoonId'],
      where: {
        userId: user.id,
        burnedAt: null
      }
    }),
    // Points committed to live auction bids and pending trade offers. UserPoints
    // .points is the GROSS balance — locks are an overlay that every spend path
    // subtracts at spend time — so without this the sidebar shows a number the
    // user cannot actually spend.
    //
    // Both of these ride the /api/auth/me request rather than getting endpoints
    // of their own. Every handler here authenticates by internally re-fetching
    // this route, so a separate endpoint for either figure would re-derive this
    // entire payload (including the two collection aggregates above) to return
    // one integer. Added to the existing Promise.all, they cost one extra
    // round trip each on a request that was happening anyway.
    prisma.lockedPoints.aggregate({
      _sum: { amount: true },
      where: { userId: user.id, status: 'ACTIVE' }
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    // Every cMoon this user has ever earned a border for (small — one row per cMoon they've
    // reached a border-granting affinity level in), so the cZone editor can offer an equip
    // picker without a dedicated round trip.
    prisma.userCMoonBorder.findMany({
      where: { userId: user.id },
      select: { cMoonId: true, cMoon: { select: { name: true, color: true } } }
    })
  ])

  const lockedPoints = lockAgg._sum.amount || 0
  const grossPoints  = user.points?.points || 0

  // Return full session data
  return {
    id: user.id,
    discordId: user.discordId,
    discordTag: user.discordTag,
    discordAvatar: user.discordAvatar,
    avatar: user.avatar,
    username: user.username || null,
    roles: user.roles,
    points: grossPoints,
    lockedPoints,
    // What the user can actually commit right now. Clamped for display only; the
    // spend paths do their own arithmetic and must not be fed a clamped figure.
    availablePoints: Math.max(0, grossPoints - lockedPoints),
    unreadNotifications,
    needsSetup: !(user.username && user.avatar && ctoonCount > 0),
    inGuild: user.inGuild,
    isAdmin: user.isAdmin,
    active: user.active,
    ctoonCount,
    uniqueCtoonCount: uniqueCtoonRows.length,
    isBooster: user.isBooster,
    additionalCzones: user.additionalCzones ?? 0,
    surveyComplete: !!user.surveyAnswers,
    equippedBorderCMoonId: user.equippedBorderCMoonId || null,
    ownedBorders: ownedBorders.map(b => ({ cMoonId: b.cMoonId, name: b.cMoon?.name || '', color: b.cMoon?.color || '#888888' })),
  }
})
