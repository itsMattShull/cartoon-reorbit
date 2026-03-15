// DELETE /api/czone-contest/[id]/submissions/[submissionId] — delete own submission
import { defineEventHandler, getRequestHeader, createError } from 'h3'
import { prisma } from '@/server/prisma'

export default defineEventHandler(async (event) => {
  const { id, submissionId } = event.context.params

  // Auth check
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me = null
  try { me = await $fetch('/api/auth/me', { headers: { cookie } }) } catch {}
  if (!me?.id) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  // Verify submission exists and belongs to this user
  const submission = await prisma.cZoneContestSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, contestId: true, userId: true }
  })
  if (!submission || submission.contestId !== id) {
    throw createError({ statusCode: 404, statusMessage: 'Submission not found' })
  }
  if (submission.userId !== me.id) {
    throw createError({ statusCode: 403, statusMessage: 'You can only delete your own submission' })
  }

  // Delete submission (votes cascade via DB constraint)
  await prisma.cZoneContestSubmission.delete({ where: { id: submissionId } })

  return { ok: true }
})
