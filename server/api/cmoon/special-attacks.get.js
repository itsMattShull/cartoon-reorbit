// server/api/cmoon/special-attacks.get.js
// Lists every CMoonSpecialAttack an admin has opted into player choice (playerChoice: true — see
// that column's own schema comment), for the "Choose cMoon Special Attack" picker on the settings
// page (pages/newsite/settings.vue). Public battle fields only (name/description/effect/amount/
// sound) — nothing here reveals anything the solo/raid battle UIs don't already show once a
// player has it equipped.
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const userId = event.context.userId
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })

  const attacks = await db.cMoonSpecialAttack.findMany({
    where: { playerChoice: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true, effectType: true, amount: true, soundPath: true, healsAllies: true },
  })

  return { attacks }
})
