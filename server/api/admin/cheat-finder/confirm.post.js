import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { redis } from '@/server/utils/redis'
import {
  isValidCheatFinderType,
  computeGroupKey,
  normalizeAliasUsernames,
  groupsCacheKey
} from '@/server/utils/cheatFinderKey'

const MAX_NOTE_LENGTH = 500

export default defineEventHandler(async (event) => {
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

  const body = await readBody(event)
  const type = String(body?.type || '')
  if (!isValidCheatFinderType(type)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid type' })
  }

  let aliasUsernames
  let groupKey
  try {
    aliasUsernames = normalizeAliasUsernames(body?.aliasUsernames)
    groupKey = computeGroupKey(type, aliasUsernames)
  } catch (err) {
    throw createError({ statusCode: 400, statusMessage: err.message })
  }

  let note = body?.note != null ? String(body.note).trim() : null
  if (note) {
    if (note.length > MAX_NOTE_LENGTH) {
      throw createError({ statusCode: 400, statusMessage: 'Note too long' })
    }
  } else {
    note = null
  }

  // confirmedByUserId/Username come from the trusted session, never the
  // request body, so the audit trail can't be forged.
  await prisma.cheatFinderConfirmation.upsert({
    where: { type_groupKey: { type, groupKey } },
    create: {
      type,
      groupKey,
      aliasUsernames,
      note,
      confirmedByUserId: me.id,
      confirmedByUsername: me.username || null
    },
    update: {
      aliasUsernames,
      note,
      confirmedByUserId: me.id,
      confirmedByUsername: me.username || null,
      confirmedAt: new Date()
    }
  })

  try { await redis.del(groupsCacheKey(type)) } catch {}

  return { success: true, groupKey }
})
