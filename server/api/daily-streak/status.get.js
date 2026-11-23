// server/api/daily-streak/status.get.js — the viewer's current Daily Streak count plus every
// configured milestone (day, reward preview, reached state) so the client never has to resolve
// cToon/pack names itself — same "resolve on the server, render dumb data client-side" shape
// GET /api/cmoon/[id]/rank-progress already uses for CMoonRankLadderModal.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const [user, config, rewardRows] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { dailyStreakCount: true } }),
    db.globalGameConfig.findUnique({ where: { id: 'singleton' }, select: { dailyStreakRepeatEnabled: true } }),
    db.dailyStreakReward.findMany({
      orderBy: [{ day: 'asc' }, { createdAt: 'asc' }],
      include: {
        ctoon: { select: { id: true, name: true, assetPath: true } },
        pack: { select: { id: true, name: true, imagePath: true } }
      }
    })
  ])

  const byDay = new Map()
  for (const r of rewardRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, [])
    byDay.get(r.day).push({
      rewardType: r.rewardType,
      amount: r.amount,
      ctoon: r.ctoon ? { id: r.ctoon.id, name: r.ctoon.name, assetPath: r.ctoon.assetPath } : null,
      pack: r.pack ? { id: r.pack.id, name: r.pack.name, imagePath: r.pack.imagePath } : null
    })
  }
  const streakCount = user?.dailyStreakCount || 0
  const milestones = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, rewards]) => ({ day, rewards, reached: streakCount >= day }))

  return {
    streakCount,
    maxDay: milestones.length ? milestones[milestones.length - 1].day : 0,
    repeatEnabled: !!config?.dailyStreakRepeatEnabled,
    milestones
  }
})
