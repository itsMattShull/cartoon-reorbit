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
  const { name, startDate, endDate, maxVotesPerUser, winnerPrizes, participantPrizes } = body

  if (name !== undefined && !name?.trim()) throw createError({ statusCode: 400, statusMessage: 'Name cannot be empty' })
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    throw createError({ statusCode: 400, statusMessage: 'End date must be after start date' })
  }

  const updated = await prisma.cZoneContest.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(startDate !== undefined && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: new Date(endDate) }),
      ...(maxVotesPerUser !== undefined && { maxVotesPerUser: parseInt(maxVotesPerUser, 10) }),
      ...(winnerPrizes !== undefined && { winnerPrizes }),
      ...(participantPrizes !== undefined && { participantPrizes })
    }
  })

  return updated
})
