// server/api/admin/scavenger/config.post.js
import { defineEventHandler, readBody, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event)
  const chance = Number(body?.scavengerChancePercent)
  const cooldown = Number(body?.scavengerCooldownHours)
  if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scavengerChancePercent (0–100)' })
  }
  if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 24 * 365) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid scavengerCooldownHours' })
  }

  const res = await db.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      dailyPointLimit: 250,
      scavengerChancePercent: Math.round(chance),
      scavengerCooldownHours: Math.round(cooldown)
    },
    update: {
      scavengerChancePercent: Math.round(chance),
      scavengerCooldownHours: Math.round(cooldown)
    }
  })
  return {
    scavengerChancePercent: res.scavengerChancePercent,
    scavengerCooldownHours: res.scavengerCooldownHours
  }
})

