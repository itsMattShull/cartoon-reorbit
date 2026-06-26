// GET /api/admin/czone-contest-automation — return the singleton automation config
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

const DEFAULTS = {
  id: 'singleton',
  enabled: false,
  startDayOfWeek: 6,
  startHour: 8,
  startMinute: 0,
  submissionEndDayOfWeek: 1,
  submissionEndHour: 20,
  submissionEndMinute: 0,
  votingEndDayOfWeek: 3,
  votingEndHour: 8,
  votingEndMinute: 0,
  winnerPoints: 1000,
  participantPoints: 250,
  titleTemplate: 'Weekly cZone Contest {startDate}',
  maxVotesPerUser: 5,
  lastCreatedFor: null,
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const config = await prisma.cZoneContestAutomationConfig.findUnique({ where: { id: 'singleton' } })
  return config ?? DEFAULTS
})
