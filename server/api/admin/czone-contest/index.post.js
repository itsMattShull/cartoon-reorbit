// POST /api/admin/czone-contest — create a contest
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const { name, startDate, endDate, endVotingDate, maxVotesPerUser, winnerPrizes, participantPrizes } = body

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!startDate || !endDate) throw createError({ statusCode: 400, statusMessage: 'Start and end dates are required' })
  if (new Date(startDate) >= new Date(endDate)) throw createError({ statusCode: 400, statusMessage: 'End date must be after start date' })
  if (endVotingDate && new Date(endVotingDate) <= new Date(endDate)) throw createError({ statusCode: 400, statusMessage: 'End Voting Date must be after the Submission End Date' })
  if (!maxVotesPerUser || maxVotesPerUser < 1) throw createError({ statusCode: 400, statusMessage: 'maxVotesPerUser must be at least 1' })

  const contest = await prisma.cZoneContest.create({
    data: {
      name: name.trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(endVotingDate ? { endVotingDate: new Date(endVotingDate) } : {}),
      maxVotesPerUser: parseInt(maxVotesPerUser, 10),
      winnerPrizes: winnerPrizes ?? { ctoons: [], backgroundIds: [], points: 0 },
      participantPrizes: participantPrizes ?? { ctoons: [], backgroundIds: [], points: 0 }
    }
  })

  return contest
})
