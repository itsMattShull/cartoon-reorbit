// server/api/admin/cmoons/[id].put.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor, isValidDiscordSnowflake, isValidCMoonEffectType, reassignUserCMoon } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const id = event.context.params?.id
  const cmoon = await db.cMoon.findUnique({ where: { id } })
  if (!cmoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : cmoon.name
  const color = typeof body?.color === 'string' ? body.color.trim() : cmoon.color
  const discordRoleId = body?.discordRoleId === undefined ? cmoon.discordRoleId : (typeof body.discordRoleId === 'string' ? body.discordRoleId.trim() : '')
  const captainIds = Array.isArray(body?.captainIds) ? [...new Set(body.captainIds.filter(x => typeof x === 'string'))] : null
  const prizeCtoons = Array.isArray(body?.prizeCtoons) ? body.prizeCtoons : null
  const pageDescription = body?.pageDescription === undefined
    ? cmoon.pageDescription
    : (typeof body.pageDescription === 'string' ? body.pageDescription.trim().slice(0, 2000) || null : null)
  const effectType = body?.effectType === undefined
    ? cmoon.effectType
    : (body.effectType === '' ? null : body.effectType)
  const joinLocked = body?.joinLocked === undefined ? cmoon.joinLocked : !!body.joinLocked
  const showOnNav = body?.showOnNav === undefined ? cmoon.showOnNav : !!body.showOnNav
  const showButtonOnPages = body?.showButtonOnPages === undefined ? cmoon.showButtonOnPages : !!body.showButtonOnPages
  const allowOptOutJoin = body?.allowOptOutJoin === undefined ? cmoon.allowOptOutJoin : !!body.allowOptOutJoin

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!isValidHexColor(color)) throw createError({ statusCode: 400, statusMessage: 'Color must be a hex value like #3366ff' })
  if (discordRoleId && !isValidDiscordSnowflake(discordRoleId)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Role ID must be a numeric snowflake' })
  }
  if (!isValidCMoonEffectType(effectType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid effect type' })
  }

  if (captainIds && captainIds.length) {
    const validAdmins = await db.user.count({ where: { id: { in: captainIds }, isAdmin: true } })
    if (validAdmins !== captainIds.length) throw createError({ statusCode: 400, statusMessage: 'Captains must be existing admins' })
  }

  let prizeCtoonRows = null
  if (prizeCtoons) {
    prizeCtoonRows = prizeCtoons
      .filter(p => p?.ctoonId && typeof p.ctoonId === 'string')
      .map(p => ({ ctoonId: p.ctoonId, quantity: Math.max(1, Number(p.quantity || 1)) }))
    if (prizeCtoonRows.length) {
      const validCtoons = await db.ctoon.count({ where: { id: { in: prizeCtoonRows.map(p => p.ctoonId) } } })
      if (validCtoons !== new Set(prizeCtoonRows.map(p => p.ctoonId)).size) {
        throw createError({ statusCode: 400, statusMessage: 'One or more prize cToons do not exist' })
      }
    }
  }

  if (name !== cmoon.name) {
    const dup = await db.cMoon.findUnique({ where: { name } })
    if (dup && dup.id !== id) throw createError({ statusCode: 409, statusMessage: 'A cMoon with that name already exists' })
  }

  // Captured before the transaction below replaces the captain list, so it reflects who
  // captained this cMoon BEFORE this save — the set this save adds to it, if any.
  const priorCaptainIds = captainIds
    ? new Set((await db.cMoonCaptain.findMany({ where: { cMoonId: id }, select: { userId: true } })).map(c => c.userId))
    : null

  await db.$transaction(async (tx) => {
    await tx.cMoon.update({
      where: { id },
      data: { name, color, discordRoleId: discordRoleId || null, pageDescription, effectType, joinLocked, showOnNav, showButtonOnPages, allowOptOutJoin },
    })
    if (captainIds) {
      await tx.cMoonCaptain.deleteMany({ where: { cMoonId: id } })
      if (captainIds.length) await tx.cMoonCaptain.createMany({ data: captainIds.map(userId => ({ cMoonId: id, userId })), skipDuplicates: true })
    }
    if (prizeCtoonRows) {
      await tx.cMoonPrizeCtoon.deleteMany({ where: { cMoonId: id } })
      if (prizeCtoonRows.length) await tx.cMoonPrizeCtoon.createMany({ data: prizeCtoonRows.map(p => ({ cMoonId: id, ...p })), skipDuplicates: true })
    }
  })

  // Captaincy implies membership: a newly-added captain (one who wasn't already captaining this
  // cMoon before this save) who doesn't already belong to it gets moved in. Removing someone from
  // captainIds does NOT remove their membership — that's a separate, more destructive action the
  // admin can take explicitly via the Members panel if they want it.
  if (priorCaptainIds) {
    const newlyAdded = captainIds.filter(uid => !priorCaptainIds.has(uid))
    if (newlyAdded.length) {
      await Promise.all(newlyAdded.map(userId => reassignUserCMoon(userId, id).catch(() => null)))
    }
  }

  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `update:${id}`, prevValue: { name: cmoon.name, color: cmoon.color }, newValue: { name, color } })
  invalidateCMoonList()

  return { ok: true }
})
