// server/api/tutorial/index.get.js
// Public, read-only. Content is admin-authored only, not user-generated, so
// this is safe to serve unauthenticated — the page itself still sits behind
// the newsite login middleware.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'
import { sanitizeSections, SECTION_KEYS } from '@/server/utils/sanitizeTutorialHtml'
import { DEFAULT_SECTIONS } from '@/server/utils/tutorialDefaultContent'
import { getTutorialConfigCache, setTutorialConfigCache } from '@/server/utils/tutorialConfigCache'

export default defineEventHandler(async () => {
  const cached = getTutorialConfigCache()
  if (cached) return cached

  const cfg = await db.tutorialConfig.findUnique({ where: { id: 'tutorial' } })
  // Sanitized again on read as cheap defense-in-depth — the stored value was
  // already sanitized on save, this guards against a schema/library change
  // or a future write path that skips that step.
  const stored = sanitizeSections(cfg?.sections)
  const sections = {}
  for (const key of SECTION_KEYS) {
    sections[key] = stored[key] || DEFAULT_SECTIONS[key] || ''
  }

  const result = {
    heroImagePath: cfg?.heroImagePath ?? null,
    sections,
    updatedAt: cfg?.updatedAt ?? null
  }

  setTutorialConfigCache(result)
  return result
})
