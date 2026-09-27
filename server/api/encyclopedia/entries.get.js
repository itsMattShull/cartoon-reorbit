// server/api/encyclopedia/entries.get.js
// Public, unauthenticated list of active entries — backs both the Encyclopedia index grid and
// the search-autofill dropdown (title-match only, filtered client-side; entry counts here are
// expected to stay small, same assumption server/api/cmoons.get.js makes for its own nav list).
// Deliberately lightweight: no body HTML, so this stays cheap to fetch on every visit to the
// index page.
import { defineEventHandler } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async () => {
  const entries = await db.encyclopediaEntry.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: { title: true, slug: true, heroImagePath: true },
  })

  return { entries }
})
