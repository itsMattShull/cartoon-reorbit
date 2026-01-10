// server/api/monsters/list.get.js
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

function rarityToDisplay(r) {
  if (r === 'VERY_RARE') return 'Very Rare'
  if (r === 'CRAZY_RARE') return 'Crazy Rare'
  return r ? r.charAt(0) + r.slice(1).toLowerCase() : 'Unknown'
}

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  const me = await $fetch('/api/auth/me', { headers: { cookie } }).catch(() => null)
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await db.userMonster.findMany({
    where: { userId: String(me.id) },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      customName: true,
      name: true,
      hp: true,
      atk: true,
      def: true,
      rarity: true,
      lastSelected: true,
    },
  })

  const monsters = rows.map((m) => ({
    id: m.id,
    displayName: m.customName || m.name,
    hp: m.hp,
    atk: m.atk,
    def: m.def,
    rarity: rarityToDisplay(m.rarity),
    lastSelected: m.lastSelected,
  }))

  return { monsters }
})
