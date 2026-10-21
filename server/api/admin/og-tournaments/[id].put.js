// PUT /api/admin/og-tournaments/:id — edit. What can change narrows as the tournament progresses:
//   DRAFT / OPT_IN_OPEN : everything
//   after opt-in closes  : name and description only (rules and prizes are locked once people have
//                          entered on them; per-match deadlines are extended from the match instead)
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTournamentBody, OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const id = String(event.context.params?.id || '')
  const t = await prisma.ogGtoonTournament.findUnique({ where: { id }, select: { id: true, status: true, name: true } })
  if (!t) throw createError({ statusCode: 404, statusMessage: 'Tournament not found' })
  const body = await readBody(event)

  const open = ['DRAFT', 'OPT_IN_OPEN'].includes(t.status)
  const only = open ? ['basics', 'window', 'rules', 'prizes'] : ['basics']
  if (t.status === 'CANCELLED') throw createError({ statusCode: 400, statusMessage: 'A cancelled tournament cannot be edited' })
  const { data, warnings } = await parseTournamentBody(body, { only })
  await prisma.ogGtoonTournament.update({ where: { id }, data })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `edit:${id}`, prevValue: t.name, newValue: data.name })
  return { id, warnings, locked: !open }
})
