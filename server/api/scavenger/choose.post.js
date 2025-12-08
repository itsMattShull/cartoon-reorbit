// server/api/scavenger/choose.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { mintQueue } from '@/server/utils/queues'
import { QueueEvents } from 'bullmq'

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  let body = {}
  try { body = await readBody(event) || {} } catch {}
  const sessionId = String(body?.sessionId || '')
  const choice = (body?.choice === 'A' || body?.choice === 'B') ? body.choice : null
  if (!sessionId || !choice) {
    throw createError({ statusCode: 400, statusMessage: 'Missing sessionId or choice' })
  }

  const session = await db.scavengerSession.findUnique({ where: { id: sessionId } })
  if (!session || session.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }
  if (session.status !== 'PENDING') {
    // Return final state if already completed
    if (session.status === 'COMPLETED') {
      const ctoon = session.ctoonIdAwarded
        ? await db.ctoon.findUnique({ where: { id: session.ctoonIdAwarded }, select: { id: true, name: true, assetPath: true } })
        : null
      return {
        complete: true,
        result: {
          type: session.resultType || 'NOTHING',
          points: session.pointsAwarded || 0,
          ctoon
        }
      }
    }
    throw createError({ statusCode: 400, statusMessage: 'Session not active' })
  }

  // Compute next path
  const currentPath = session.path || ''
  const nextPath = currentPath + choice
  const nextLen = nextPath.length

  // If not terminal (len < 3), advance and return next step
  if (nextLen < 3) {
    const layer = nextLen + 1
    const nextStep = await db.scavengerStep.findFirst({ where: { storyId: session.storyId, layer, path: nextPath } })
    if (!nextStep) {
      // invalid story configuration; expire session gracefully
      await db.scavengerSession.update({ where: { id: sessionId }, data: { status: 'EXPIRED' } })
      return { complete: true, result: { type: 'NOTHING', points: 0 } }
    }
    await db.scavengerSession.update({ where: { id: sessionId }, data: { path: nextPath, stepIndex: layer } })
    return {
      continue: true,
      step: {
        layer: nextStep.layer,
        path: nextStep.path,
        description: nextStep.description,
        imagePath: nextStep.imagePath || null,
        optionA: nextStep.optionAText,
        optionB: nextStep.optionBText,
      }
    }
  }

  // Terminal (after 3rd choice)
  const finalPath = nextPath
  const outcome = await db.scavengerOutcome.findFirst({ where: { storyId: session.storyId, path: finalPath } })
  let resultType = outcome?.resultType || 'NOTHING'
  let points = 0
  let ctoonId = null

  if (resultType === 'POINTS' && (outcome?.points || 0) > 0) {
    points = outcome.points
    const updated = await db.userPoints.upsert({
      where: { userId },
      create: { userId, points },
      update: { points: { increment: points } }
    })
    await db.pointsLog.create({
      data: { userId, direction: 'increase', points, total: updated.points, method: 'Scavenger Hunt' }
    })
  } else if (resultType === 'EXCLUSIVE_CTOON') {
    // Pick random cToon from ScavengerExclusiveCtoon that still has supply
    const poolRows = await db.scavengerExclusiveCtoon.findMany({ select: { ctoonId: true } })
    const ids = poolRows.map(r => r.ctoonId)
    if (ids.length) {
      const raw = await db.ctoon.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          quantity: true,
          _count: { select: { owners: true } }
        }
      })
      const available = raw.filter(c => c.quantity === null || c._count.owners < c.quantity)
      if (available.length) {
        const pick = available[Math.floor(Math.random() * available.length)].id
        // Mint and wait
        const job = await mintQueue.add('mintCtoon', { userId, ctoonId: pick, isSpecial: true })
        const qe = new QueueEvents(mintQueue.name, { connection: redisConnection })
        await qe.waitUntilReady()
        try { await job.waitUntilFinished(qe); ctoonId = pick } finally { await qe.close() }
      } else {
        resultType = 'NOTHING'
      }
    } else {
      resultType = 'NOTHING'
    }
  }

  // finalize session
  await db.scavengerSession.update({
    where: { id: sessionId },
    data: {
      stepIndex: 4,
      path: finalPath,
      status: 'COMPLETED',
      resultType,
      pointsAwarded: points || null,
      ctoonIdAwarded: ctoonId
    }
  })

  const ctoon = ctoonId ? await db.ctoon.findUnique({ where: { id: ctoonId }, select: { id: true, name: true, assetPath: true } }) : null
  return { complete: true, result: { type: resultType, points: points || 0, ctoon, text: outcome?.text || null } }
})
