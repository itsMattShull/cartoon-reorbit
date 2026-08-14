// Mark notifications read.
//
// POST, not GET. The session cookie is sameSite:'lax' (see
// server/api/auth/discord/callback.get.js), which does not travel on a
// cross-site POST but DOES travel on a top-level GET navigation — so exposing
// this as a GET would make `<img src=".../read?all=true">` a working CSRF that
// silently clears someone's hub.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { isUuid } from '@/server/utils/tradeOfferRules'

// The drawer only ever shows PAGE_SIZE (30) rows, so 100 is already generous.
// The cap is what stops `{ ids: [...200_000] }` from being turned into a
// Postgres IN-list past the bind-parameter ceiling by any logged-in account.
const MAX_IDS = 100

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const userId = me?.id
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const hasIds = body?.ids !== undefined
  const hasAll = body?.all !== undefined

  if (hasIds === hasAll) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide exactly one of `ids` or `all`'
    })
  }

  if (hasAll) {
    // Strict equality, not truthiness: `all: "false"` and `all: 0` must not
    // clear the hub, and neither must a body that forgot to say what it meant.
    if (body.all !== true) {
      throw createError({ statusCode: 400, statusMessage: '`all` must be true' })
    }
    const { count } = await db.notification.updateMany({
      // userId is in the WHERE clause, never a post-hoc check. Without it this
      // statement marks the entire table read for every user on the site.
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    })
    return { updated: count }
  }

  const ids = body.ids
  if (!Array.isArray(ids)) {
    throw createError({ statusCode: 400, statusMessage: '`ids` must be an array' })
  }
  if (ids.length === 0 || ids.length > MAX_IDS) {
    throw createError({
      statusCode: 400,
      statusMessage: `\`ids\` must contain between 1 and ${MAX_IDS} entries`
    })
  }
  for (const id of ids) {
    if (!isUuid(id)) {
      throw createError({ statusCode: 400, statusMessage: '`ids` contains an invalid id' })
    }
  }

  const { count } = await db.notification.updateMany({
    where: { id: { in: [...new Set(ids)] }, userId, readAt: null },
    data: { readAt: new Date() }
  })

  // Only a total. Reporting which ids failed to match would confirm whether a
  // given id exists on another account.
  return { updated: count }
})
