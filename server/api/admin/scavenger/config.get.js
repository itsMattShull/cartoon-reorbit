// server/api/admin/scavenger/config.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  let cfg = await db.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  if (!cfg) {
    cfg = await db.globalGameConfig.create({
      data: { id: 'singleton', dailyPointLimit: 250, scavengerChancePercent: 5, scavengerCooldownHours: 24 }
    })
  }

  return {
    scavengerChancePercent: cfg.scavengerChancePercent,
    scavengerCooldownHours: cfg.scavengerCooldownHours,
  }
})

