// GET /api/admin/queues/:name — one queue's overview plus analytics over its retained finished jobs
// and, for the cron queues, the registered job schedulers with their next run time.
import { defineEventHandler } from 'h3'
import { requireQueueAdmin, requireQueue, queueOverview } from '@/server/utils/queueAdmin'
import { summarizeFinished } from '@/server/utils/queueHealth'

const SAMPLE = 500

export default defineEventHandler(async (event) => {
  await requireQueueAdmin(event)
  const entry = requireQueue(event)
  const { queue } = entry

  const [overview, completed, failed, schedulers] = await Promise.all([
    queueOverview(entry),
    queue.getJobs(['completed'], 0, SAMPLE - 1, false),
    queue.getJobs(['failed'], 0, SAMPLE - 1, false),
    entry.isCron ? queue.getJobSchedulers(0, -1).catch(() => []) : Promise.resolve([]),
  ])

  const mapFinished = (j) => ({ timestamp: j.timestamp, processedOn: j.processedOn, finishedOn: j.finishedOn })
  return {
    ...overview,
    analytics: {
      // BullMQ only retains the newest N finished jobs (removeOnComplete/removeOnFail), so these
      // describe that retained window, not all time.
      completed: summarizeFinished(completed.map(mapFinished)),
      failed: summarizeFinished(failed.map(mapFinished)),
      sampleLimit: SAMPLE,
    },
    schedulers: schedulers.map(s => ({
      id: s.key || s.id,
      name: s.name,
      pattern: s.pattern || null,
      tz: s.tz || null,
      next: s.next || null,
      iterationCount: s.iterationCount ?? null,
    })),
  }
})
