// server/api/admin/cmoons/balance-teams.post.js
import { defineEventHandler, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { executeBalancePlan, getGlobalConfig } from '@/server/utils/cmoon'
import { invalidateCMoonList } from '@/server/api/cmoons.get'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  // Bulk-moving players into/out of teams that aren't live yet (cMoons globally disabled,
  // e.g. mid-setup before launch) isn't a meaningful operation — block it rather than
  // silently allowing it just because reassignUserCMoon's single-user path does.
  const config = await getGlobalConfig({ fresh: true })
  if (!config?.cMoonEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'cMoons are not currently enabled' })
  }

  // Always recomputes the plan fresh server-side (never trusts a client-submitted plan) —
  // see executeBalancePlan's own comment. This also makes a double-click/retry safe: the
  // second call just finds teams already balanced and moves nobody.
  const result = await executeBalancePlan()

  if (result.moved > 0) {
    invalidateCMoonList()
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'Admin:cMoons',
      key: 'balanceTeams',
      prevValue: null,
      newValue: {
        moved: result.moved,
        moves: result.moves.map((m) => ({ userId: m.userId, username: m.username, from: m.fromName, to: m.toName })),
      },
    })
  }

  return { ok: true, moved: result.moved, teams: result.teams }
})
