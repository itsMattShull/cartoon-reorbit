import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { runAllRules } from '@/server/utils/suspiciousActivityMetrics'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const rules = await db.suspiciousActivityRule.findMany({
    where: { isActive: true },
    include: { conditions: { orderBy: { order: 'asc' } } },
  })

  const { flaggedUsers, rulesEvaluated } = await runAllRules(db, rules)

  return {
    flaggedUsers,
    rulesEvaluated,
    evaluatedAt: new Date().toISOString(),
  }
})
