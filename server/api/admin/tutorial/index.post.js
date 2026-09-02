// server/api/admin/tutorial/index.post.js
// Saves the tutorial's admin-editable prose sections (JSON body, not multipart —
// image upload is a separate endpoint). Sanitizes every section before storing.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { sanitizeSections, SECTION_KEYS } from '@/server/utils/sanitizeTutorialHtml'
import { clearTutorialConfigCache } from '@/server/utils/tutorialConfigCache'

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const body = await readBody(event)
  if (!body || typeof body !== 'object' || typeof body.sections !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'sections object required' })
  }

  const current = await db.tutorialConfig.findUnique({ where: { id: 'tutorial' } })
  const nextSections = sanitizeSections(body.sections)

  const cfg = await db.tutorialConfig.upsert({
    where: { id: 'tutorial' },
    create: { id: 'tutorial', sections: nextSections },
    update: { sections: nextSections, updatedAt: new Date() }
  })

  try {
    const prevSections = (current?.sections && typeof current.sections === 'object') ? current.sections : {}
    for (const key of SECTION_KEYS) {
      const prev = prevSections[key] ?? ''
      const now = nextSections[key] ?? ''
      if (prev !== now) {
        await logAdminChange(db, { userId: me.id, area: 'TutorialConfig', key: `sections.${key}`, prevValue: prev, newValue: now })
      }
    }
  } catch {}

  clearTutorialConfigCache()

  return {
    heroImagePath: cfg.heroImagePath,
    sections: cfg.sections,
    updatedAt: cfg.updatedAt
  }
})
