// server/api/admin/scavenger/stories/[id].put.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { id } = event.context.params
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const body = await readBody(event)

  const story = await db.scavengerStory.findUnique({ where: { id: String(id) } })
  if (!story) throw createError({ statusCode: 404, statusMessage: 'Story not found' })

  await db.$transaction(async (tx) => {
    await tx.scavengerStory.update({
      where: { id: story.id },
      data: {
        title: typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : story.title,
        isActive: typeof body?.isActive === 'boolean' ? body.isActive : story.isActive
      }
    })

    if (Array.isArray(body?.steps)) {
      // Replace steps fully (expected 7 by path)
      await tx.scavengerStep.deleteMany({ where: { storyId: story.id } })
      const requiredPaths = ['', 'A','B','AA','AB','BA','BB']
      const byPath = Object.fromEntries(body.steps.map(s => [String(s.path || ''), s]))
      const rows = requiredPaths.map(p => ({
        storyId: story.id,
        layer: (p.length || 0) + 1,
        path: p,
        description: String(byPath[p]?.description || ''),
        imagePath: byPath[p]?.imagePath || null,
        optionAText: String(byPath[p]?.optionA || ''),
        optionBText: String(byPath[p]?.optionB || ''),
      }))
      await tx.scavengerStep.createMany({ data: rows })
    }

    if (Array.isArray(body?.outcomes)) {
      await tx.scavengerOutcome.deleteMany({ where: { storyId: story.id } })
      const rows = []
      const seen = new Set()
      for (const o of body.outcomes) {
        const path = String(o.path || '').toUpperCase()
        if (path.length !== 3 || /[^AB]/.test(path)) continue
        if (seen.has(path)) continue
        seen.add(path)
        const rt = (o.resultType === 'POINTS' || o.resultType === 'EXCLUSIVE_CTOON') ? o.resultType : 'NOTHING'
        rows.push({
          storyId: story.id,
          path,
          resultType: rt,
          points: rt === 'POINTS' ? Math.max(0, Number(o.points || 0)) : null,
          text: (typeof o.text === 'string' && o.text.length) ? o.text : null
        })
      }
      if (rows.length) await tx.scavengerOutcome.createMany({ data: rows })
    }
  })

  return { ok: true }
})
