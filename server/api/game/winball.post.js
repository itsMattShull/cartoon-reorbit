// File: server/api/game/winball.post.js
import { defineEventHandler, createError, readBody } from 'h3'
import { mintQueue } from '../../utils/queues'  // import BullMQ queue

import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Login required' })

  // 1) parse payload
  let states
  try {
    states = await readBody(event)
    if (!Array.isArray(states)) throw new Error()
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid body' })
  }

  // 2) load Winball configuration
  const config = await prisma.gameConfig.findUnique({
    where: { gameName: 'Winball' },
    include: { grandPrizeCtoon: true }
  })
  if (!config) {
    throw createError({ statusCode: 500, statusMessage: 'GameConfig for Winball not found' })
  }

  // 3) geometry setup
  const boardLength   = 50
  const wallThickness = 0.5
  const ballRadius    = 1
  const southZ        = boardLength/2 + wallThickness/2

  const pockets = [
    { name: 'halfCircle1', x: -10, z: southZ - 12, r: 2, pts: config.leftCupPoints },
    { name: 'halfCircle2', x:   0, z: southZ -  6, r: 2, pts: config.goldCupPoints },
    { name: 'halfCircle3', x:  10, z: southZ - 12, r: 2, pts: config.rightCupPoints },
  ]

  function segmentHitsCircle(p0,p1,cx,cz,rawR) {
    const R = rawR + ballRadius
    const dx = p1.x-p0.x, dz = p1.z-p0.z
    const fx = p0.x-cx,   fz = p0.z-cz
    const a  = dx*dx + dz*dz
    const b  = 2*(fx*dx + fz*dz)
    const c  = fx*fx + fz*fz - R*R
    let disc = b*b - 4*a*c
    if (disc < 0) return false
    disc = Math.sqrt(disc)
    const t1 = (-b - disc)/(2*a), t2 = (-b + disc)/(2*a)
    return (t1>=0 && t1<=1) || (t2>=0 && t2<=1)
  }

  function segmentHitsFlat(p0,p1,xMin,xMax,rawZ) {
    const zLine = rawZ + ballRadius
    if ((p0.z-zLine)*(p1.z-zLine) > 0) return false
    const t = (zLine - p0.z)/(p1.z - p0.z)
    if (t<0 || t>1) return false
    const xi = p0.x + t*(p1.x - p0.x)
    return xi>=xMin && xi<=xMax
  }

  // 4) detect the first terminal event
  let award = null
  for (let i = 1; i < states.length; i++) {
    const p0 = states[i-1].position, p1 = states[i].position

    for (const pk of pockets) {
      if (
        segmentHitsCircle(p0, p1, pk.x, pk.z, pk.r) ||
        segmentHitsFlat(p0, p1, pk.x-pk.r, pk.x+pk.r, pk.z)
      ) {
        award = { type:'hit', pocket: pk.name, points: pk.pts, tick: i }
        break
      }
    }
    if (award) break

    // gutter
    const gutterZ = southZ - ballRadius
    if (p0.z < gutterZ && p1.z >= gutterZ) {
      award = { type:'gutter', pocket: null, points: 0, tick: i }
      break
    }
  }

  if (!award) {
    return { result:'gutter', pointsAwarded:0, pointsRemainingToday:0 }
  }

  // 5) compute 8 PM CST boundary
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year:   'numeric', month: 'numeric', day: 'numeric',
    hour:   'numeric', hour12: false
  }).formatToParts(now)
  let cYear, cMonth, cDay, cHour
  for (const p of parts) {
    if (p.type === 'year')  cYear  = Number(p.value)
    if (p.type === 'month') cMonth = Number(p.value)
    if (p.type === 'day')   cDay   = Number(p.value)
    if (p.type === 'hour')  cHour  = Number(p.value)
  }
  const utcHour = now.getUTCHours()
  let offsetHour = utcHour - cHour
  if (offsetHour > 12) offsetHour -= 24
  if (offsetHour < -12) offsetHour += 24
  let boundaryUtcMs = Date.UTC(cYear, cMonth - 1, cDay, 20 + offsetHour, 0, 0, 0)
  if (now.getTime() < boundaryUtcMs) boundaryUtcMs -= 24 * 60 * 60 * 1000
  const boundary = new Date(boundaryUtcMs)

  // 6) sum pts since boundary
  const agg = await prisma.gamePointLog.aggregate({
    where: { userId, createdAt: { gte: boundary } }, _sum:{ points:true }
  })
  const used = agg._sum.points || 0
  const global = await prisma.globalGameConfig.findUnique({ where:{ id:'singleton' } })
  const cap    = global.dailyPointLimit
  const remaining = Math.max(0, cap - used)
  const toGive = Math.min(award.points, remaining)

  // 7) persist points
  if (toGive > 0) {
    await prisma.gamePointLog.create({ data: { userId, points: toGive } })
    const updated = await prisma.userPoints.upsert({
      where: { userId },
      create: { userId, points: toGive },
      update: { points: { increment: toGive } }
    })
    await prisma.pointsLog.create({
      data: { userId, points: toGive, total: updated.points, method: "Game - Winball", direction: 'increase' }
    });
  }

  // 8) if gold cup, enqueue grand prize mint
  let grandPrizeCtoonName = null
  if (award.pocket === 'halfCircle2'
      && config.grandPrizeCtoonId
      && remaining > 0
  ) {
    const existing = await prisma.ctoonOwnerLog.findFirst({
      where: { userId, ctoonId: config.grandPrizeCtoonId }
    })
    if (!existing) {
      const gp = await prisma.ctoon.findUnique({ where: { id: config.grandPrizeCtoonId } })
      if (gp) {
        // enqueue mint job instead of direct DB write
        await mintQueue.add('mintCtoon', { userId, ctoonId: gp.id, isSpecial: true })
        grandPrizeCtoonName = gp.name
      }
    }
  }

  return {
    result: award.type,
    pocket: award.pocket,
    tick:   award.tick,
    pointsAwarded:        toGive,
    pointsRemainingToday: remaining - toGive,
    grandPrizeCtoon:      grandPrizeCtoonName
  }
})
