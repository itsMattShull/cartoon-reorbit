// server/api/czone-mail/send.post.js
//
// Leave a pre-made message on another player's cZone.
//
// The client sends a templateId, never text: the body is snapshotted from the
// admin-authored template server-side, so no free text can ever reach another
// player.

import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { findActiveCzoneMailTemplate, getCzoneMailSettings } from '@/server/utils/czoneMailConfigCache'
import {
  consumeCzoneMailQuota,
  refundCzoneMailQuota,
  RateLimiterUnavailableError
} from '@/server/utils/czoneMailRateLimit'
import { evaluateSendAttempt, sendRejectionMessage } from '@/server/utils/czoneMailRules'
import { scheduleCzoneMailNotify } from '@/server/utils/czoneMailQueue'

export default defineEventHandler(async (event) => {
  const senderId = event.context.userId
  if (!senderId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody(event)
  const username = String(body?.username || '').trim()
  const templateId = String(body?.templateId || '').trim()
  if (!username || !templateId) {
    throw createError({ statusCode: 400, statusMessage: 'A recipient and a message are required.' })
  }

  const settings = await getCzoneMailSettings()

  // One query for both parties. The session middleware only verifies the JWT —
  // it does not check `banned`, so without this an account banned mid-session
  // would keep sending (and keep Discord-pinging its victim) until the cookie
  // expired.
  const [sender, recipient] = await Promise.all([
    db.user.findUnique({
      where: { id: senderId },
      select: { id: true, username: true, banned: true, active: true, czoneMailBlockedUntil: true }
    }),
    db.user.findUnique({
      where: { username },
      select: { id: true, username: true, banned: true, active: true }
    })
  ])

  if (!sender || sender.banned || sender.active === false) {
    throw createError({ statusCode: 403, statusMessage: 'Your account cannot send cMail.' })
  }
  if (!recipient) {
    // Usernames are already public (the cZone navigation endpoints serve the
    // full list), so a 404 here reveals nothing new.
    throw createError({ statusCode: 404, statusMessage: 'That player was not found.' })
  }
  if (recipient.id === sender.id) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot send cMail to yourself.' })
  }
  if (recipient.banned || recipient.active === false) {
    throw createError({ statusCode: 404, statusMessage: 'That player was not found.' })
  }

  const template = await findActiveCzoneMailTemplate(templateId)
  if (!template) {
    throw createError({ statusCode: 400, statusMessage: 'That message is no longer available.' })
  }

  const now = Date.now()
  const blockedUntil = sender.czoneMailBlockedUntil ? new Date(sender.czoneMailBlockedUntil).getTime() : null

  // Postgres is authoritative for an active burst block, so a Redis flush or
  // restart cannot quietly cancel one.
  if (blockedUntil && blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((blockedUntil - now) / 1000)
    throw createError({
      statusCode: 429,
      statusMessage: sendRejectionMessage('spam_block', retryAfterSeconds),
      data: { reason: 'spam_block', retryAfterSeconds }
    })
  }

  // Consume quota BEFORE the block check below so that a blocked recipient costs
  // the sender exactly the same as a successful send — see the shadow-drop note.
  let quota
  try {
    quota = await consumeCzoneMailQuota({ senderId: sender.id, recipientId: recipient.id, settings })
  } catch (err) {
    if (err instanceof RateLimiterUnavailableError) {
      // Fail closed. Losing rate limiting on a kids' messaging feature is worse
      // than a short outage.
      throw createError({ statusCode: 503, statusMessage: 'cMail is temporarily unavailable. Try again shortly.' })
    }
    throw err
  }

  if (!quota.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: sendRejectionMessage(quota.reason, quota.retryAfterSeconds),
      data: { reason: quota.reason, retryAfterSeconds: quota.retryAfterSeconds }
    })
  }

  const verdict = evaluateSendAttempt({ now, windowCount: quota.windowCount - 1 }, settings)

  // Trip the burst guard when this send crosses the threshold. The message that
  // crosses it is still delivered; the NEXT attempt is refused.
  if (verdict.tripsSpamBlock) {
    const until = new Date(verdict.blockUntil)
    await Promise.all([
      db.user.update({ where: { id: sender.id }, data: { czoneMailBlockedUntil: until } }),
      db.cZoneMailSpamLog.create({
        data: {
          userId: sender.id,
          count: quota.windowCount,
          windowMinutes: settings.spamWindowMinutes,
          blockedUntil: until
        }
      })
    ]).catch(() => {
      // Never fail the send because the audit write failed.
    })
  }

  // Shadow-drop when the recipient has blocked the sender: return the identical
  // success shape and burn the identical quota, just don't store or notify. Any
  // distinguishable response — even a generic error — tells the sender they were
  // blocked, and "she blocked me" is exactly the trigger that escalates a
  // playground conflict.
  const blocked = await db.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: recipient.id, blockedId: sender.id } },
    select: { id: true }
  })
  if (blocked) {
    return { success: true }
  }

  try {
    await db.cZoneMail.create({
      data: {
        senderId: sender.id,
        recipientId: recipient.id,
        templateId: template.id,
        body: template.text,
        emoji: template.emoji
      }
    })
  } catch (err) {
    await refundCzoneMailQuota({ senderId: sender.id, recipientId: recipient.id })
    throw createError({ statusCode: 500, statusMessage: 'That cMail could not be sent. Try again.' })
  }

  // Discord delivery is queued, never awaited inline: this process exits on
  // SIGINT/SIGTERM without draining in-flight work, so an un-awaited fetch here
  // would be lost on every deploy.
  try {
    await scheduleCzoneMailNotify(recipient.id)
  } catch {
    // The message is saved and visible on the site regardless.
  }

  return { success: true }
})
