// server/api/admin/cmoon-pvp-tournaments/index.post.js — create a new cMoon PvP tournament shell,
// status DRAFT (not yet visible/joinable — see CMoonPvpTournamentStatus's own schema comment).
// Entries, and opening the bracket itself, are separate follow-up calls (this file's sibling
// endpoints, plus server/utils/cmoonPvpTournament.js's bracket pairing in Phase 5).
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) throw createError({ statusCode: 400, statusMessage: 'Name is required' })

  const maxTeamSize = Number(body?.maxTeamSize ?? 4)
  if (!Number.isInteger(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 8) {
    throw createError({ statusCode: 400, statusMessage: 'Max team size must be a whole number between 1 and 8' })
  }

  const announcementText = typeof body?.announcementText === 'string' ? body.announcementText.trim() || null : null
  const discordChannelId = typeof body?.discordChannelId === 'string' ? body.discordChannelId.trim() || null : null

  const created = await db.cMoonPvpTournament.create({
    data: { name, maxTeamSize, announcementText, discordChannelId },
  })

  await logAdminChange(db, {
    userId: me.id,
    area: 'CMoonPvpTournament',
    key: `create:${created.id}`,
    prevValue: null,
    newValue: { id: created.id, name, maxTeamSize, announcementText, discordChannelId },
  })

  return { id: created.id }
})
