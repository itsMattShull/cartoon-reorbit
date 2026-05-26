// server/api/admin/users/stats.get.js
// Returns summary counts used in the Admin Manage Users banner.

import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  // Admin check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Count users active in last 30 days who completed the survey
  const surveyCompletedLast30Days = await prisma.surveyAnswers.count({
    where: {
      user: {
        lastActivity: { gte: thirtyDaysAgo },
      },
    },
  })

  return {
    surveyCompletedLast30Days,
  }
})
