// server/api/monsters/items/use.post.js
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const id = body?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const owned = await db.userMonsterItem.findFirst({
    where: {
      id: String(id),
      userId: String(me.id),
      isUsed: false,
      item: { effect: 'HEAL' },
    },
    select: {
      id: true,
      item: {
        select: {
          name: true,
          power: true,
          effect: true,
          itemImage0Path: true,
          itemImage1Path: true,
          itemImage2Path: true,
        },
      },
    },
  })

  if (!owned) throw createError({ statusCode: 404, statusMessage: 'Item not found' })

  const monster = await db.userMonster.findFirst({
    where: { userId: String(me.id), lastSelected: true },
    select: { id: true, hp: true, maxHealth: true },
  })
  if (!monster) throw createError({ statusCode: 404, statusMessage: 'Monster not found' })

  const power = Number(owned.item?.power) || 0
  const maxHp = Number(monster.maxHealth) || 0
  const nextHp = Math.max(0, Math.min(maxHp || 0, Number(monster.hp) + power))

  await db.userMonsterItem.update({
    where: { id: owned.id },
    data: { isUsed: true },
  })

  await db.userMonster.update({
    where: { id: monster.id },
    data: { hp: nextHp, lastInteractionAt: new Date() },
  })

  return {
    ok: true,
    hp: nextHp,
    item: {
      id: owned.id,
      name: owned.item?.name || 'Item',
      power: owned.item?.power ?? 0,
      effect: owned.item?.effect || null,
      itemImage0Path: owned.item?.itemImage0Path || null,
      itemImage1Path: owned.item?.itemImage1Path || null,
      itemImage2Path: owned.item?.itemImage2Path || null,
    },
  }
})
