// POST /api/admin/cmoon-enemy-members/auto-balance-7hp — the "Automate stats for 7hp players"
// button's backend (see server/utils/cmoonRaidBalance.js for the solver itself and the
// assumptions it bakes in). Pure compute — no DB read or write — so it works identically for a
// brand-new, not-yet-saved raid boss as for one already being edited: the admin only needs to
// have chosen a Max HP (and optionally already-entered wind-up moves) in the form.
import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { solveForTargetWinRate } from '@/server/utils/cmoonRaidBalance'

const MAX_HP_MIN = 1
const MAX_HP_MAX = 10000 // matches CMoonEnemyMember.maxHp's own admin-form bound

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const maxHp = Math.round(Number(body?.maxHp))
  if (!Number.isFinite(maxHp) || maxHp < MAX_HP_MIN || maxHp > MAX_HP_MAX) {
    throw createError({ statusCode: 400, statusMessage: `maxHp must be a whole number between ${MAX_HP_MIN} and ${MAX_HP_MAX}` })
  }

  // Only meaningful when the admin has turned wind-up on AND actually configured at least one
  // move — otherwise solve with an empty list, same as a boss with the feature off entirely.
  const windUpEnabled = !!body?.windUpEnabled
  const rawMoves = windUpEnabled && Array.isArray(body?.windUpMoves) ? body.windUpMoves : []
  const windUpMoves = rawMoves
    .map(m => ({
      occurrencePercent: Number(m?.occurrencePercent),
      bonusType: m?.bonusType === 'DAMAGE_ENEMY' ? 'DAMAGE_ENEMY' : 'HEAL_PARTY',
      bonusAmount: Number(m?.bonusAmount),
    }))
    .filter(m => Number.isFinite(m.occurrencePercent) && m.occurrencePercent > 0 && Number.isFinite(m.bonusAmount) && m.bonusAmount >= 0)

  const result = solveForTargetWinRate({ bossHp: maxHp, windUpMoves })

  return result
})
