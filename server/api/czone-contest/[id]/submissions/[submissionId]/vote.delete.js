// DELETE /api/czone-contest/[id]/submissions/[submissionId]/vote — votes cannot be removed
import { defineEventHandler, createError } from 'h3'

export default defineEventHandler(async () => {
  throw createError({ statusCode: 400, statusMessage: 'Votes cannot be removed once cast' })
})
