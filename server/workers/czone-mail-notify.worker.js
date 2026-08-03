import { Worker } from 'bullmq'
import { prisma } from '../prisma.js'
import { deliverCzoneMailNotification } from '../utils/czoneMailDiscord.js'
import { getCzoneMailSettings } from '../utils/czoneMailConfigCache.js'
import { scheduleCzoneMailNotify } from '../utils/czoneMailQueue.js'
import { logCronError } from '../utils/cronErrorLog.js'

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
}

const QUEUE_KEY = process.env.CZONE_MAIL_NOTIFY_QUEUE_KEY || 'czoneMailNotify'

// Never ping about more than this many messages in one batch; the rest are still
// marked notified so a backlog can't wedge the queue.
const MAX_ITEMS_PER_BATCH = 50

/**
 * Deliver the pending cMail notification for one recipient.
 *
 * Rows are claimed by stamping notifiedAt BEFORE the Discord call. A duplicate
 * ping is a worse failure here than a missed one: this queue retries, and a kid
 * being pinged twice for the same message reads as the spam the feature is
 * supposed to prevent.
 */
async function processRecipient(recipientId) {
  const pending = await prisma.cZoneMail.findMany({
    where: { recipientId, notifiedAt: null, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: MAX_ITEMS_PER_BATCH,
    select: {
      id: true,
      body: true,
      emoji: true,
      templateId: true,
      sender: { select: { username: true } }
    }
  })
  if (pending.length === 0) return { delivered: false, reason: 'nothing pending' }

  const ids = pending.map(p => p.id)
  await prisma.cZoneMail.updateMany({
    where: { id: { in: ids } },
    data: { notifiedAt: new Date() }
  })

  // All-time template usage is rolled up here rather than on the send request:
  // incrementing on send would put a row lock on the single most popular
  // template and serialize every concurrent send behind it.
  await rollUpTemplateUsage(pending)

  const settings = await getCzoneMailSettings()

  const items = pending.map(p => ({
    senderUsername: p.sender?.username || 'A player',
    body: p.body,
    emoji: p.emoji
  }))

  const result = await deliverCzoneMailNotification(prisma, {
    recipientId,
    items,
    channelId: settings.discordChannelId
  })

  // Re-arm if more arrived while this batch was in flight, or if the batch cap
  // truncated the backlog. This is also what makes a lost schedule self-heal.
  const remaining = await prisma.cZoneMail.count({
    where: { recipientId, notifiedAt: null, deletedAt: null }
  })
  if (remaining > 0) {
    await scheduleCzoneMailNotify(recipientId).catch(() => {})
  }

  return result
}

async function rollUpTemplateUsage(rows) {
  const counts = new Map()
  for (const row of rows) {
    if (!row.templateId) continue
    counts.set(row.templateId, (counts.get(row.templateId) || 0) + 1)
  }
  const now = new Date()
  for (const [templateId, count] of counts) {
    try {
      await prisma.cZoneMailTemplate.update({
        where: { id: templateId },
        data: { usageCount: { increment: count }, lastUsedAt: now }
      })
    } catch {
      // Template was hard-deleted — the message itself is unaffected.
    }
  }
}

const worker = new Worker(QUEUE_KEY, async job => {
  const { recipientId } = job.data || {}
  if (!recipientId) return
  return await processRecipient(String(recipientId))
}, {
  connection,
  // One recipient at a time. Thread creation for every recipient shares a single
  // Discord rate-limit bucket (the parent channel), so parallelism here buys
  // nothing and risks a 429 storm — and repeated 401/403/429 responses count
  // toward an IP-level ban that would take down guild sync and auction DMs too.
  concurrency: 1,
  limiter: { max: 20, duration: 1000 }
})

worker.on('failed', async (job, err) => {
  // Only report once the job has exhausted its retries, so a transient Discord
  // blip doesn't fill the admin Error Logs page.
  if (job && job.attemptsMade >= (job.opts?.attempts ?? 1)) {
    await logCronError('czoneMailNotify', err)
  }
})

process.on('unhandledRejection', (err) => {
  console.error('[czone-mail-notify] unhandled rejection:', err)
})

export default worker
