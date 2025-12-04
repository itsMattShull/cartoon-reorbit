// server/api/admin/scavenger/stories.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const stories = await db.scavengerStory.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      steps: { orderBy: [{ layer: 'asc' }, { path: 'asc' }] },
      outcomes: true
    }
  })

  return stories.map(s => ({
    id: s.id,
    title: s.title,
    isActive: s.isActive,
    steps: s.steps.map(st => ({
      layer: st.layer,
      path: st.path,
      description: st.description,
      imagePath: st.imagePath || null,
      optionA: st.optionAText,
      optionB: st.optionBText
    })),
    outcomes: s.outcomes.map(o => ({ path: o.path, resultType: o.resultType, points: o.points || 0, text: o.text || '' }))
  }))
})
