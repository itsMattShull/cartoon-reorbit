// server/api/admin/tutorial/index.get.js
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin } from '@/server/utils/requireAdmin'
import { SECTION_KEYS } from '@/server/utils/sanitizeTutorialHtml'
import { DEFAULT_SECTIONS } from '@/server/utils/tutorialDefaultContent'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const cfg = await db.tutorialConfig.findUnique({ where: { id: 'tutorial' } })
  const stored = (cfg?.sections && typeof cfg.sections === 'object') ? cfg.sections : {}
  const sections = {}
  for (const key of SECTION_KEYS) {
    sections[key] = stored[key] || DEFAULT_SECTIONS[key] || ''
  }

  return {
    heroImagePath: cfg?.heroImagePath ?? null,
    sections,
    updatedAt: cfg?.updatedAt ?? null
  }
})
