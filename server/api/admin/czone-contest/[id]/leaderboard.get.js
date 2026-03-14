// GET /api/admin/czone-contest/[id]/leaderboard — submissions sorted by vote count for admin
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const contest = await prisma.cZoneContest.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      winnerId: true,
      distributedAt: true,
      submissions: {
        select: {
          id: true,
          userId: true,
          imageUrl: true,
          zoneIndex: true,
          createdAt: true,
          user: { select: { id: true, username: true, avatar: true } },
          _count: { select: { votes: true } }
        }
      }
    }
  })

  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  const submissions = contest.submissions
    .map(s => ({
      id: s.id,
      userId: s.userId,
      username: s.user.username,
      avatar: s.user.avatar,
      imageUrl: s.imageUrl,
      zoneIndex: s.zoneIndex,
      voteCount: s._count.votes,
      createdAt: s.createdAt
    }))
    .sort((a, b) => b.voteCount - a.voteCount)

  return {
    id: contest.id,
    name: contest.name,
    winnerId: contest.winnerId,
    distributedAt: contest.distributedAt,
    submissions
  }
})
