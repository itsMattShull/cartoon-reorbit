import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { getGlobalConfig } from '@/server/utils/cmoon'

function asString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCharacters(value) {
  if (!Array.isArray(value)) return []
  return value
    .map(v => String(v || '').trim())
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody(event)
  const ctoonId = asString(body?.ctoonId)
  const name = asString(body?.name)
  const series = asString(body?.series)
  const set = asString(body?.set)
  const characters = normalizeCharacters(body?.characters)
  const descriptionProvided = Object.prototype.hasOwnProperty.call(body || {}, 'description')
  const descriptionValue = descriptionProvided && typeof body?.description === 'string'
    ? body.description.trim()
    : null
  const description = descriptionProvided ? (descriptionValue || null) : undefined

  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId required.' })
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name required.' })
  if (!series) throw createError({ statusCode: 400, statusMessage: 'Series required.' })
  if (!set) throw createError({ statusCode: 400, statusMessage: 'Set required.' })
  if (!characters.length) throw createError({ statusCode: 400, statusMessage: 'Characters required.' })

  // One pending suggestion per (user, cToon) at a time — mirrors the single-pending-row rule on
  // /api/cmoon/change-request. Without this, the cMoon field below (a subjective, low-friction
  // change) would make it trivial to flood the admin review queue with repeat submissions for the
  // same cToon.
  const existingPending = await prisma.ctoonUserSuggestion.findFirst({
    where: { ctoonId, userId: me.id, status: 'IN_REVIEW' },
    select: { id: true }
  })
  if (existingPending) {
    throw createError({ statusCode: 409, statusMessage: 'You already have a suggestion pending review for this cToon.' })
  }

  const ctoon = await prisma.ctoon.findUnique({
    where: { id: ctoonId },
    select: {
      id: true, name: true, series: true, set: true, characters: true, description: true,
      cMoon: { select: { id: true, name: true } }
    }
  })
  if (!ctoon) throw createError({ statusCode: 404, statusMessage: 'cToon not found.' })

  // cMoonId is only honored while the cMoon feature is globally enabled — the dropdown is hidden
  // client-side in that case, but the form's pre-filled value could otherwise still ride along in
  // the request body and get recorded as a "change".
  const cMoonIdProvided = Object.prototype.hasOwnProperty.call(body || {}, 'cMoonId')
  let cMoonId = null
  let cMoonName = null
  let recordCMoonChange = false
  if (cMoonIdProvided) {
    const config = await getGlobalConfig()
    if (config?.cMoonEnabled) {
      const requestedId = asString(body.cMoonId)
      if (requestedId) {
        const cMoon = await prisma.cMoon.findUnique({ where: { id: requestedId }, select: { id: true, name: true } })
        if (!cMoon) throw createError({ statusCode: 400, statusMessage: 'Selected cMoon does not exist.' })
        cMoonId = cMoon.id
        cMoonName = cMoon.name
      }
      recordCMoonChange = true
    }
  }

  const oldValues = {
    name: ctoon.name,
    series: ctoon.series,
    set: ctoon.set,
    characters: ctoon.characters || [],
    description: ctoon.description ?? null,
    cMoonId: ctoon.cMoon?.id ?? null,
    cMoonName: ctoon.cMoon?.name ?? null
  }
  const newValues = {
    name, series, set, characters,
    ...(descriptionProvided ? { description } : {}),
    ...(recordCMoonChange ? { cMoonId, cMoonName } : {})
  }

  const suggestion = await prisma.ctoonUserSuggestion.create({
    data: {
      ctoonId: ctoon.id,
      userId: me.id,
      oldValues,
      newValues
    }
  })

  return { success: true, suggestionId: suggestion.id }
})
