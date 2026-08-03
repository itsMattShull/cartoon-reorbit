// server/api/czone-mail/templates.get.js
// The canned sentences offered in the send picker, grouped into categories.
// Served from a process-local cache, so this is normally zero queries.

import { defineEventHandler, createError } from 'h3'
import { getActiveCzoneMailTemplates, groupTemplatesByCategory } from '@/server/utils/czoneMailConfigCache'

export default defineEventHandler(async (event) => {
  if (!event.context.userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const rows = await getActiveCzoneMailTemplates()
  return {
    groups: groupTemplatesByCategory(rows).map(g => ({
      category: g.category,
      templates: g.templates.map(t => ({ id: t.id, text: t.text, emoji: t.emoji }))
    }))
  }
})
