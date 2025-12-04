// server/api/admin/scavenger/sessions.get.js
import { defineEventHandler, getQuery, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const { days = '30', limit = '50', offset = '0' } = getQuery(event)
  const d = Math.max(1, Math.min(365, Number(days) || 30))
  const to = new Date()
  const from = new Date(Date.now() - d * 24 * 3600 * 1000)
  const take = Math.max(1, Math.min(200, Number(limit) || 50))
  const skip = Math.max(0, Number(offset) || 0)

  const rows = await db.scavengerSession.findMany({
    where: { createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
    take, skip,
    select: {
      id: true,
      createdAt: true,
      triggerSource: true,
      status: true,
      resultType: true,
      pointsAwarded: true,
      ctoonIdAwarded: true,
      user: { select: { id: true, username: true } },
      story: { select: { id: true, title: true } },
    }
  })

  // attach ctoon details if any
  const ctoonIds = Array.from(new Set(rows.map(r => r.ctoonIdAwarded).filter(Boolean)))
  const ctoons = ctoonIds.length ? await db.ctoon.findMany({ where: { id: { in: ctoonIds } }, select: { id: true, name: true, assetPath: true } }) : []
  const ctoonById = Object.fromEntries(ctoons.map(c => [c.id, c]))

  return rows.map(r => ({
    id: r.id,
    createdAt: r.createdAt,
    triggerSource: r.triggerSource,
    status: r.status,
    resultType: r.resultType,
    pointsAwarded: r.pointsAwarded || 0,
    user: r.user,
    story: r.story,
    ctoon: r.ctoonIdAwarded ? ctoonById[r.ctoonIdAwarded] || null : null,
  }))
})

