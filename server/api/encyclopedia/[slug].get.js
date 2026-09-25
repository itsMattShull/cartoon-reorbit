// server/api/encyclopedia/[slug].get.js
// Public single-entry lookup by slug. An inactive entry, or a slug matching no entry at all
// (including a stale cross-entry link to something since deleted — see EncyclopediaEntry's own
// schema comment), returns the same 404 either way, so a visitor can never tell the difference
// between "never existed" and "an admin turned it off."
import { defineEventHandler, createError } from 'h3'
import { prisma as db } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug
  const entry = slug ? await db.encyclopediaEntry.findUnique({ where: { slug } }) : null
  if (!entry || !entry.active) {
    throw createError({ statusCode: 404, statusMessage: 'Encyclopedia entry not found' })
  }

  return {
    title: entry.title,
    slug: entry.slug,
    heroImagePath: entry.heroImagePath,
    body: entry.body,
    updatedAt: entry.updatedAt,
  }
})
