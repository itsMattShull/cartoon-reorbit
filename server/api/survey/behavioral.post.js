// server/api/survey/behavioral.post.js
// Receives batched keystroke/touch timing events from the survey page and
// stores them in Redis for up to 2 hours.  The content-analyzer worker (or a
// future behavioral-extractor) can pull them for feature extraction.

import { defineEventHandler, readBody, createError } from 'h3'
import { redis } from '@/server/utils/redis'

const TTL_SECONDS = 7200 // 2 hours

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const body = await readBody(event)
  const { sessionId, deviceClass, events } = body || {}

  if (!sessionId || !Array.isArray(events)) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId or events array.' })
  }

  const key = `behavioral:${userId}:${sessionId}`

  // Append events to existing list (multiple batches from same session merge)
  const existing = await redis.get(key)
  const prev = existing ? JSON.parse(existing) : { deviceClass, events: [] }
  prev.events.push(...events)

  await redis.set(key, JSON.stringify(prev), 'EX', TTL_SECONDS)

  return { ok: true }
})
