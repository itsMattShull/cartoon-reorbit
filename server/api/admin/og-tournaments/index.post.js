// POST /api/admin/og-tournaments — create a tournament (starts as a DRAFT; opens at its start time).
import { defineEventHandler, readBody } from 'h3'
import { prisma } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { parseTournamentBody, OGT_AUDIT_AREA } from '@/server/utils/ogGtoonTournamentAdmin'

export default defineEventHandler(async (event) => {
  assertSameOrigin(event)
  const me = await requireAdmin(event)
  const { data, warnings } = await parseTournamentBody(await readBody(event))
  const created = await prisma.ogGtoonTournament.create({
    data: {
      ...data, status: 'DRAFT', createdById: me.id,
      // Blank falls back to DISCORD_ANNOUNCEMENT_CHANNEL when announcements go out.
      announcementChannelId: String(process.env.DISCORD_ANNOUNCEMENT_CHANNEL || '').trim()
    },
    select: { id: true }
  })
  await logAdminChange(prisma, { userId: me.id, area: OGT_AUDIT_AREA, key: `create:${created.id}`, prevValue: null, newValue: data.name })
  return { id: created.id, warnings }
})
