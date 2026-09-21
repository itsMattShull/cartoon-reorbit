// server/api/admin/cmoons.post.js
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { isValidHexColor, isValidDiscordSnowflake, isValidCMoonEffectType, reassignUserCMoon } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { provisionAllTiersForCMoon } from '@/server/utils/cmoonRankTiers'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const color = typeof body?.color === 'string' ? body.color.trim() : ''
  // Optional per-role color overrides (see prisma/schema.prisma's CMoon.pageBgColor/accentColor/
  // textColor/cardBgColor comment) — null/blank clears an override back to auto-derived.
  const pageBgColor = typeof body?.pageBgColor === 'string' ? body.pageBgColor.trim() : ''
  const accentColor = typeof body?.accentColor === 'string' ? body.accentColor.trim() : ''
  const textColor = typeof body?.textColor === 'string' ? body.textColor.trim() : ''
  const cardBgColor = typeof body?.cardBgColor === 'string' ? body.cardBgColor.trim() : ''
  const discordRoleId = typeof body?.discordRoleId === 'string' ? body.discordRoleId.trim() : ''
  const pageDescription = typeof body?.pageDescription === 'string' ? body.pageDescription.trim().slice(0, 2000) || null : null
  const captainIds = Array.isArray(body?.captainIds) ? [...new Set(body.captainIds.filter(x => typeof x === 'string'))] : []
  const prizeCtoons = Array.isArray(body?.prizeCtoons) ? body.prizeCtoons : []
  const effectType = body?.effectType === undefined || body?.effectType === '' ? null : body.effectType
  const customJoinEffectId = body?.customJoinEffectId === undefined || body?.customJoinEffectId === '' ? null : body.customJoinEffectId
  const joinLocked = !!body?.joinLocked
  const showOnNav = body?.showOnNav === undefined ? true : !!body.showOnNav
  const showButtonOnPages = !!body?.showButtonOnPages
  const allowOptOutJoin = body?.allowOptOutJoin === undefined ? true : !!body.allowOptOutJoin

  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })
  if (!isValidHexColor(color)) throw createError({ statusCode: 400, statusMessage: 'Color must be a hex value like #3366ff' })
  for (const [value, label] of [[pageBgColor, 'Page background color'], [accentColor, 'Accent color'], [textColor, 'Text color'], [cardBgColor, 'Card background color']]) {
    if (value && !isValidHexColor(value)) throw createError({ statusCode: 400, statusMessage: `${label} must be a hex value like #3366ff` })
  }
  if (discordRoleId && !isValidDiscordSnowflake(discordRoleId)) {
    throw createError({ statusCode: 400, statusMessage: 'Discord Role ID must be a numeric snowflake' })
  }
  if (!isValidCMoonEffectType(effectType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid effect type' })
  }
  if (effectType && customJoinEffectId) {
    throw createError({ statusCode: 400, statusMessage: 'Choose either a built-in effect or a custom join effect, not both' })
  }
  if (customJoinEffectId) {
    const validEffect = await db.cMoonJoinEffect.findUnique({ where: { id: customJoinEffectId }, select: { id: true } })
    if (!validEffect) throw createError({ statusCode: 400, statusMessage: 'Invalid custom join effect' })
  }

  if (captainIds.length) {
    const validAdmins = await db.user.count({ where: { id: { in: captainIds }, isAdmin: true } })
    if (validAdmins !== captainIds.length) throw createError({ statusCode: 400, statusMessage: 'Captains must be existing admins' })
  }

  const prizeCtoonRows = prizeCtoons
    .filter(p => p?.ctoonId && typeof p.ctoonId === 'string')
    .map(p => ({ ctoonId: p.ctoonId, quantity: Math.max(1, Number(p.quantity || 1)) }))
  if (prizeCtoonRows.length) {
    const validCtoons = await db.ctoon.count({ where: { id: { in: prizeCtoonRows.map(p => p.ctoonId) } } })
    if (validCtoons !== new Set(prizeCtoonRows.map(p => p.ctoonId)).size) {
      throw createError({ statusCode: 400, statusMessage: 'One or more prize cToons do not exist' })
    }
  }

  const existing = await db.cMoon.findUnique({ where: { name } })
  if (existing) throw createError({ statusCode: 409, statusMessage: 'A cMoon with that name already exists' })

  const created = await db.cMoon.create({
    data: {
      name,
      color,
      pageBgColor: pageBgColor || null,
      accentColor: accentColor || null,
      textColor: textColor || null,
      cardBgColor: cardBgColor || null,
      discordRoleId: discordRoleId || null,
      pageDescription,
      effectType,
      customJoinEffectId,
      joinLocked,
      showOnNav,
      showButtonOnPages,
      allowOptOutJoin,
      captains: { create: captainIds.map(userId => ({ userId })) },
      prizeCtoons: { create: prizeCtoonRows },
    },
  })

  // Captaincy implies membership: a captain can't already belong to a cMoon that didn't exist
  // until this call, so every captain here is "newly added" and gets moved in. Run in parallel —
  // reassignUserCMoon bounds its own Discord round trip, but N sequential calls would still
  // serialize N of those bounds into one request. A single captain's reassignment failing (e.g.
  // banned) shouldn't fail cMoon creation itself; the admin can fix that captain from the new
  // Members panel.
  if (captainIds.length) {
    await Promise.all(captainIds.map(userId => reassignUserCMoon(userId, created.id).catch(() => null)))
  }

  // Every existing universal rank tier applies to this cMoon too — provision its ladder now
  // rather than waiting for the next time an existing tier happens to be edited.
  await provisionAllTiersForCMoon(created.id)

  await logAdminChange(db, { userId: me.id, area: 'cMoon', key: `create:${created.id}`, prevValue: null, newValue: { id: created.id, name } })
  invalidateCMoonList()

  return { id: created.id }
})
