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
import { NOTIFICATION_TYPES } from '@/server/utils/notifications'

// The drawer only ever shows PAGE_SIZE (30) rows, so 100 is already generous.
// The cap is what stops `{ ids: [...200_000] }` from being turned into a
// Postgres IN-list past the bind-parameter ceiling by any logged-in account.
const MAX_IDS = 100

function validateTypes (types, field) {
  if (!Array.isArray(types) || types.length === 0) {
    throw createError({ statusCode: 400, statusMessage: `\`${field}\` must be a non-empty array` })
  }
  for (const t of types) {
    if (!NOTIFICATION_TYPES[t]) {
      throw createError({ statusCode: 400, statusMessage: `\`${field}\` contains an invalid type` })
    }
  }
  return [...new Set(types)]
}

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
  const hasTypes = body?.types !== undefined
  const hasExcludeTypes = body?.excludeTypes !== undefined

  if ([hasIds, hasAll, hasTypes, hasExcludeTypes].filter(Boolean).length !== 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Provide exactly one of `ids`, `all`, `types`, or `excludeTypes`'
    })
  }

  // Both scoped the same way `all` is below (userId + readAt:null in the WHERE
  // clause), but filtered to a type set instead of every row — this is what lets
  // the drawer's per-tab "Mark all read" (see Onboarding.vue's markAllRead) clear
  // every matching unread row for this user, not just whichever ≤30 are currently
  // loaded client-side (GET /api/notifications caps at PAGE_SIZE). `types` marks
  // just the given type(s) read (the Raid Boss tab); `excludeTypes` marks every
  // OTHER type read (the Alerts tab) without needing to enumerate every non-raid
  // type here.
  if (hasTypes) {
    const types = validateTypes(body.types, 'types')
    const { count } = await db.notification.updateMany({
      where: { userId, readAt: null, type: { in: types } },
      data: { readAt: new Date() }
    })
    return { updated: count }
  }

  if (hasExcludeTypes) {
    const excludeTypes = validateTypes(body.excludeTypes, 'excludeTypes')
    const { count } = await db.notification.updateMany({
      where: { userId, readAt: null, type: { notIn: excludeTypes } },
      data: { readAt: new Date() }
    })
    return { updated: count }
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
