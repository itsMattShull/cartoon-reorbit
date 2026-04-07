import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { METRIC_DEFINITIONS } from '@/server/utils/suspiciousActivityMetrics'

const VALID_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq']

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Admins only' })

  const body = await readBody(event)
  const { name, description, isActive, timeWindowDays, conditionLogic, conditions } = body

  if (!name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name is required' })
  if (!Array.isArray(conditions) || conditions.length === 0)
    throw createError({ statusCode: 400, statusMessage: 'At least one condition is required' })

  const validMetrics = new Set(Object.keys(METRIC_DEFINITIONS))
  for (const c of conditions) {
    if (!validMetrics.has(c.metric))
      throw createError({ statusCode: 400, statusMessage: `Unknown metric: ${c.metric}` })
    if (!VALID_OPERATORS.includes(c.operator))
      throw createError({ statusCode: 400, statusMessage: `Invalid operator: ${c.operator}` })
    if (typeof c.threshold !== 'number' || isNaN(c.threshold))
      throw createError({ statusCode: 400, statusMessage: 'threshold must be a number' })
  }

  const rule = await db.suspiciousActivityRule.create({
    data: {
      name: name.trim(),
      description: description?.trim() ?? '',
      isActive: isActive !== false,
      timeWindowDays: timeWindowDays ? Number(timeWindowDays) : null,
      conditionLogic: conditionLogic === 'OR' ? 'OR' : 'AND',
      createdById: me.id,
      conditions: {
        create: conditions.map((c, i) => ({
          metric: c.metric,
          operator: c.operator,
          threshold: Number(c.threshold),
          order: i,
        })),
      },
    },
    include: { conditions: { orderBy: { order: 'asc' } } },
  })

  return rule
})
