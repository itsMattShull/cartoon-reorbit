import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

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

  const ctoon = await prisma.ctoon.findUnique({
    where: { id: ctoonId },
    select: { id: true, name: true, series: true, set: true, characters: true, description: true }
  })
  if (!ctoon) throw createError({ statusCode: 404, statusMessage: 'cToon not found.' })

  const oldValues = {
    name: ctoon.name,
    series: ctoon.series,
    set: ctoon.set,
    characters: ctoon.characters || [],
    description: ctoon.description ?? null
  }
  const newValues = descriptionProvided
    ? { name, series, set, characters, description }
    : { name, series, set, characters }

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
