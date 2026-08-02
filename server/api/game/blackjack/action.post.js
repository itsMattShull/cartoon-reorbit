import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import {
  getDailyTotals, findActiveSession, playAction, buildTableView
} from '@/server/utils/blackjackRuntime'

const MAX_BODY_BYTES = 1024

// A Set rather than an object literal. `{ hit: ... }['__proto__']` resolves to an inherited
// truthy value, so an object-backed lookup would accept '__proto__' or 'constructor' as an
// action name.
const ACTIONS = new Set(['hit', 'stand', 'double', 'split', 'insurance', 'declineInsurance'])

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  if (Number(event.node.req.headers['content-length'] || 0) > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Request too large' })
  }

  const body = await readBody(event)
  const action = body?.action
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid move' })
  }

  const mode = body?.mode === 'practice' ? 'practice' : 'gamble'
  const session = await findActiveSession(userId, mode)
  if (!session) throw createError({ statusCode: 409, statusMessage: 'No table. Start a game first.' })

  let result
  try {
    result = await playAction(userId, session, action)
  } catch (err) {
    throw createError({
      statusCode: err?.statusCode ?? 500,
      statusMessage: err?.statusCode ? err.statusMessage : 'Could not play that move.'
    })
  }

  const [daily, pointsRow] = await Promise.all([
    mode === 'gamble' ? getDailyTotals(userId) : null,
    prisma.userPoints.findUnique({ where: { userId }, select: { points: true } })
  ])

  return buildTableView({
    session: result.session,
    state: result.state,
    rules: session.rules,
    daily,
    points: pointsRow?.points ?? 0
  })
})
