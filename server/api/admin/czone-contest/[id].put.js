// PUT /api/admin/czone-contest/[id] — update a contest
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id } = event.context.params
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const contest = await prisma.cZoneContest.findUnique({ where: { id } })
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  const body = await readBody(event)
  const { name, startDate, endDate, endVotingDate, maxVotesPerUser, winnerPrizes, participantPrizes } = body

  if (name !== undefined && !name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })

  const resolvedEndDate = endDate ? new Date(endDate) : contest.endDate
  if (startDate && new Date(startDate) >= resolvedEndDate) {
    throw createError({ statusCode: 400, statusMessage: 'Submission End Date must be after start date' })
  }
  if (endVotingDate && new Date(endVotingDate) <= resolvedEndDate) {
    throw createError({ statusCode: 400, statusMessage: 'End Voting Date must be after the Submission End Date' })
  }

  const updated = await prisma.cZoneContest.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(endVotingDate !== undefined && { endVotingDate: endVotingDate ? new Date(endVotingDate) : null }),
      ...(maxVotesPerUser !== undefined && { maxVotesPerUser: parseInt(maxVotesPerUser, 10) }),
      ...(winnerPrizes !== undefined && { winnerPrizes }),
      ...(participantPrizes !== undefined && { participantPrizes })
    }
  })

  return updated
})
