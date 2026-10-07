// server/api/admin/global-config/logo.delete.js
// Clears logoPath back to null, reverting the topbar to the bundled default logo.
import { defineEventHandler } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const before = await prisma.globalGameConfig.findUnique({ where: { id: 'singleton' } })
  await prisma.globalGameConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', logoPath: null },
    update: { logoPath: null }
  })

  try {
    await logAdminChange(prisma, {
      userId: me.id,
      area: 'GlobalGameConfig',
      key: 'logoPath',
      prevValue: before?.logoPath ?? null,
      newValue: null
    })
  } catch {}

  return { logoPath: null }
})
