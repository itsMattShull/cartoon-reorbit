// PUT /api/admin/czone-contest-automation — upsert the singleton automation config
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'

function intInRange(val, min, max, field) {
  const n = parseInt(val, 10)
  if (!Number.isInteger(n) || n < min || n > max) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be an integer between ${min} and ${max}` })
  }
  return n
}

function sanitizeTemplate(raw) {
  if (typeof raw !== 'string') throw createError({ statusCode: 400, statusMessage: 'titleTemplate must be a string' })
  // Strip any HTML tags and disallow characters that could cause injection
  const stripped = raw.replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').trim()
  if (!stripped) throw createError({ statusCode: 400, statusMessage: 'titleTemplate cannot be empty' })
  if (stripped.length > 120) throw createError({ statusCode: 400, statusMessage: 'titleTemplate must be 120 characters or fewer' })
  return stripped
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)

  const data = {
    enabled: Boolean(body.enabled),
    startDayOfWeek:         intInRange(body.startDayOfWeek,         0, 6,     'startDayOfWeek'),
    startHour:              intInRange(body.startHour,              0, 23,    'startHour'),
    startMinute:            intInRange(body.startMinute,            0, 59,    'startMinute'),
    submissionEndDayOfWeek: intInRange(body.submissionEndDayOfWeek, 0, 6,     'submissionEndDayOfWeek'),
    submissionEndHour:      intInRange(body.submissionEndHour,      0, 23,    'submissionEndHour'),
    submissionEndMinute:    intInRange(body.submissionEndMinute,    0, 59,    'submissionEndMinute'),
    votingEndDayOfWeek:     intInRange(body.votingEndDayOfWeek,     0, 6,     'votingEndDayOfWeek'),
    votingEndHour:          intInRange(body.votingEndHour,          0, 23,    'votingEndHour'),
    votingEndMinute:        intInRange(body.votingEndMinute,        0, 59,    'votingEndMinute'),
    winnerPoints:           intInRange(body.winnerPoints,           0, 10000, 'winnerPoints'),
    participantPoints:      intInRange(body.participantPoints,      0, 10000, 'participantPoints'),
    maxVotesPerUser:        intInRange(body.maxVotesPerUser,        1, 100,   'maxVotesPerUser'),
    titleTemplate:          sanitizeTemplate(body.titleTemplate),
  }

  // Validate that submission end is after start (at least 1 day forward)
  const submissionDays = (data.submissionEndDayOfWeek - data.startDayOfWeek + 7) % 7
  const votingDays     = (data.votingEndDayOfWeek     - data.startDayOfWeek + 7) % 7

  const submissionMinutesOffset = (submissionDays || 7) * 24 * 60
    + (data.submissionEndHour - data.startHour) * 60
    + (data.submissionEndMinute - data.startMinute)
  const votingMinutesOffset = (votingDays || 7) * 24 * 60
    + (data.votingEndHour - data.startHour) * 60
    + (data.votingEndMinute - data.startMinute)

  if (submissionMinutesOffset < 60) {
    throw createError({ statusCode: 400, statusMessage: 'Submission end must be at least 1 hour after start' })
  }
  if (votingMinutesOffset <= submissionMinutesOffset) {
    throw createError({ statusCode: 400, statusMessage: 'Voting end must be after submission end' })
  }

  const config = await prisma.cZoneContestAutomationConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  })

  return config
})
