// server/api/admin/scavenger/stories.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function validatePayload(p) {
  if (!p || typeof p.title !== 'string' || !p.title.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid title' })
  }
  const requiredPaths = ['', 'A', 'B', 'AA', 'AB', 'BA', 'BB']
  if (!Array.isArray(p.steps)) throw createError({ statusCode: 400, statusMessage: 'Missing steps' })
  const byPath = Object.fromEntries(p.steps.map(s => [String(s.path || ''), s]))
  for (const path of requiredPaths) {
    const s = byPath[path]
    if (!s) throw createError({ statusCode: 400, statusMessage: `Missing step for path "${path || '(root)'}"` })
    if (typeof s.description !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid description for path "${path}"` })
    if (typeof s.optionA !== 'string' || typeof s.optionB !== 'string') throw createError({ statusCode: 400, statusMessage: `Invalid options for path "${path}"` })
  }
  if (!Array.isArray(p.outcomes)) throw createError({ statusCode: 400, statusMessage: 'Missing outcomes array' })
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  validatePayload(body)

  const created = await db.$transaction(async (tx) => {
    const story = await tx.scavengerStory.create({
      data: { title: body.title.trim(), isActive: body.isActive !== false }
    })

    // Create 7 fixed steps by path/layer
    const requiredPaths = ['', 'A', 'B', 'AA', 'AB', 'BA', 'BB']
    const byPath = Object.fromEntries(body.steps.map(s => [String(s.path || ''), s]))
    const rows = requiredPaths.map(p => ({
      storyId: story.id,
      layer: (p.length || 0) + 1,
      path: p,
      description: byPath[p].description,
      imagePath: byPath[p].imagePath || null,
      optionAText: byPath[p].optionA,
      optionBText: byPath[p].optionB
    }))
    await tx.scavengerStep.createMany({ data: rows })

    if (Array.isArray(body.outcomes) && body.outcomes.length) {
      // Normalize and keep unique by path
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

    return story
  })

  return created
})
