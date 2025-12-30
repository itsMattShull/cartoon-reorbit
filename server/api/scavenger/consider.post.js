// server/api/scavenger/consider.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

const PENDING_EXPIRE_MINUTES = 10

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  let payload = {}
  try { payload = await readBody(event) || {} } catch {}
  const trigger = typeof payload?.trigger === 'string' ? payload.trigger.slice(0, 64) : 'unknown'

  // Expire any stale pending sessions for this user
  const cutoff = new Date(Date.now() - PENDING_EXPIRE_MINUTES * 60 * 1000)
  await db.scavengerSession.updateMany({
    where: { userId, status: 'PENDING', createdAt: { lt: cutoff } },
    data: { status: 'EXPIRED' }
  })

  // Helper: load the current step (based on path length)
  async function stepForPath(storyId, pathStr) {
    const layer = (pathStr?.length || 0) + 1
    const row = await db.scavengerStep.findFirst({
      where: { storyId, layer, path: pathStr || '' }
    })
    if (!row) return null
    return {
      layer: row.layer,
      path: row.path,
      description: row.description,
      imagePath: row.imagePath || null,
      optionA: row.optionAText,
      optionB: row.optionBText,
    }
  }

  // Resume current pending session if exists
  const pending = await db.scavengerSession.findFirst({
    where: { userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: { story: true }
  })
  if (pending) {
    // log resume; not counted as a new attempt
    await db.scavengerTriggerLog.create({ data: { userId, triggerSource: trigger, started: false, reason: 'resumed' } })
    const story = pending.story
    const step = await stepForPath(story.id, pending.path || '')
    return {
      started: true,
      resumed: true,
      sessionId: pending.id,
      path: pending.path,
      story: { id: story.id, title: story.title },
      step
    }
  }

  // Load global config (create with defaults if missing)
  let global = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  if (!global) {
    global = await db.globalGameConfig.create({
      data: {
        id: 'singleton',
        dailyPointLimit: 250,
        scavengerChancePercent: 5,
        scavengerCooldownHours: 24
      }
    })
  }

  // Enforce cooldown (time since last COMPLETED session)
  const last = await db.scavengerSession.findFirst({
    where: { userId, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  })
  if (last && global.scavengerCooldownHours > 0) {
    const nextAllowed = new Date(last.createdAt.getTime() + global.scavengerCooldownHours * 3600 * 1000)
    if (nextAllowed.getTime() > Date.now()) {
      return { started: false, cooldownUntil: nextAllowed.toISOString() }
    }
  }

  // Roll chance
  const pct = Math.max(0, Math.min(100, global.scavengerChancePercent || 0))
  if (pct <= 0) {
    await db.scavengerTriggerLog.create({ data: { userId, triggerSource: trigger, started: false, reason: 'disabled' } })
    return { started: false }
  }
  const roll = Math.random() * 100
  if (roll >= pct) {
    return { started: false }
  }

  // Pick a random active story with 3 steps
  const stories = await db.scavengerStory.findMany({ where: { isActive: true } })
  const eligible = stories
  if (!eligible.length) {
    await db.scavengerTriggerLog.create({ data: { userId, triggerSource: trigger, started: false, reason: 'no_stories' } })
    return { started: false }
  }
  const idx = Math.floor(Math.random() * eligible.length)
  const chosen = eligible[idx]

  // Create pending session
  const session = await db.scavengerSession.create({
    data: {
      userId,
      storyId: chosen.id,
      stepIndex: 1,
      path: '',
      status: 'PENDING',
      triggerSource: trigger
    }
  })

  const step = await stepForPath(chosen.id, '')
  await db.scavengerTriggerLog.create({ data: { userId, triggerSource: trigger, started: true, reason: 'started' } })

  return {
    started: true,
    resumed: false,
    sessionId: session.id,
    path: '',
    story: { id: chosen.id, title: chosen.title },
    step
  }
})
