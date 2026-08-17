// Removes a cosmetic trainer from Pokemon: Fire, Water, Grass!.
//
// A real DELETE, never reachable by GET. The session cookie is SameSite=Lax, which does block
// cross-site POST/DELETE — but Lax DOES send on a top-level GET navigation, so a mutating route
// answering GET would hand that protection straight back.
//
// The row is soft-deleted rather than removed. Finished matches store the trainer id, and the
// admin match log resolves it to a name; a hard delete would turn every historical row that
// used this trainer into an unresolvable id.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { invalidateTrainerRoster } from '@/server/utils/pokemonBattleConfig'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)

  const body = await readBody(event)
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trainer id' })
  }

  const before = await db.pokemonBattleTrainer.findUnique({ where: { id } })
  if (!before) throw createError({ statusCode: 404, statusMessage: 'Trainer not found' })

  await db.pokemonBattleTrainer.update({ where: { id }, data: { active: false } })
  invalidateTrainerRoster()

  await logAdminChange(db, {
    userId: me.id,
    area: 'PokemonBattleTrainer',
    key: `retire:${id}`,
    prevValue: before.name,
    newValue: null
  }).catch(() => {})

  return { ok: true }
})
