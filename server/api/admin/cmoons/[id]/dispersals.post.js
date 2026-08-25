// POST /api/admin/cmoons/[id]/dispersals — disperse one cToon to every current member of a
// cMoon, in randomized mint order (Fisher–Yates shuffle before enqueueing, so join date never
// determines who gets the earlier mint numbers). Mirrors grantCMoonPrizes' "queue after commit"
// rule (server/utils/cmoon.js): the DB-only bookkeeping (CMoonDispersal + snapshot recipient
// rows) is written in one transaction, then mint jobs are queued afterward — mint jobs are not
// transactional and must never run inside a $transaction that might roll back.
import { defineEventHandler, readBody, createError } from 'h3'
import { prisma as db } from '@/server/prisma'
import { requireAdmin, assertSameOrigin } from '@/server/utils/requireAdmin'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { mintQueue } from '@/server/utils/queues'

// Hard, server-side ceilings independent of whatever the client sends — a compromised or
// careless admin session shouldn't be able to turn this into an unbounded inventory-inflation
// vector for a scarce cToon (isSpecial:true mints bypass per-user limits by design).
const MAX_QUANTITY_PER_MEMBER = 10
const MAX_TOTAL_JOBS = 2000

// Lower number = higher priority in BullMQ. The mint worker runs at concurrency:1 for the whole
// app (cMart, code redemption, prizes, dispersals all share it) — leaving ordinary mints
// unprioritized keeps them ahead of a bulk admin dispersal in the queue.
const DISPERSAL_JOB_PRIORITY = 100

export default defineEventHandler(async (event) => {
  const me = await requireAdmin(event)
  assertSameOrigin(event)

  const cMoonId = event.context.params?.id
  if (!cMoonId) throw createError({ statusCode: 400, statusMessage: 'Missing cMoon id' })

  const body = await readBody(event)
  const ctoonId = typeof body?.ctoonId === 'string' ? body.ctoonId : ''
  const quantityPerMember = Math.floor(Number(body?.quantityPerMember))

  if (!ctoonId) throw createError({ statusCode: 400, statusMessage: 'ctoonId is required' })
  if (!Number.isFinite(quantityPerMember) || quantityPerMember < 1 || quantityPerMember > MAX_QUANTITY_PER_MEMBER) {
    throw createError({ statusCode: 400, statusMessage: `Quantity per member must be between 1 and ${MAX_QUANTITY_PER_MEMBER}` })
  }

  const [cMoon, ctoon] = await Promise.all([
    db.cMoon.findUnique({ where: { id: cMoonId }, select: { id: true, name: true } }),
    db.ctoon.findUnique({ where: { id: ctoonId }, select: { id: true, name: true, quantity: true, totalMinted: true } }),
  ])
  if (!cMoon) throw createError({ statusCode: 404, statusMessage: 'cMoon not found' })
  if (!ctoon) throw createError({ statusCode: 404, statusMessage: 'cToon not found' })

  const members = await db.user.findMany({
    where: { cMoonId, active: true, banned: false },
    select: { id: true, username: true },
  })
  if (!members.length) throw createError({ statusCode: 400, statusMessage: 'This cMoon has no eligible members' })

  const totalJobs = members.length * quantityPerMember
  if (totalJobs > MAX_TOTAL_JOBS) {
    throw createError({
      statusCode: 400,
      statusMessage: `This would create ${totalJobs} mints, over the ${MAX_TOTAL_JOBS} limit — lower the quantity per member`,
    })
  }
  // Upfront sanity check against remaining supply. This can't be a hard guarantee (purchases
  // can still race it after this point — the atomic totalMinted counter in mint.worker.js is
  // still the real enforcement), but it stops an obviously oversized dispersal before spending
  // hundreds of doomed mint jobs.
  if (ctoon.quantity !== null) {
    const remaining = ctoon.quantity - ctoon.totalMinted
    if (remaining < totalJobs) {
      throw createError({
        statusCode: 400,
        statusMessage: `Not enough remaining supply — ${Math.max(0, remaining)} left, this dispersal needs ${totalJobs}`,
      })
    }
  }

  // Randomize who gets the earlier mint numbers — Fisher–Yates, matching the app's existing
  // shuffle convention (server/api/redeem.post.js) — so join order never determines mint order.
  const shuffled = [...members]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const lockKey = `${cMoonId}:${ctoonId}`
  const dispersal = await db.$transaction(async (tx) => {
    // Advisory lock scoped to this transaction, keyed on (cMoon, cToon) — serializes concurrent
    // submissions (double-click, two admins racing) for the same pair so the "already running"
    // check below and the create that follows can't both pass for two overlapping requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`

    const inFlight = await tx.cMoonDispersal.findFirst({
      where: { cMoonId, ctoonId, status: 'PROCESSING' },
      select: { id: true },
    })
    if (inFlight) {
      throw createError({ statusCode: 409, statusMessage: 'A dispersal of this cToon to this cMoon is already in progress' })
    }

    const created = await tx.cMoonDispersal.create({
      data: {
        cMoonId,
        ctoonId,
        quantityPerMember,
        totalMembers: shuffled.length,
        totalJobs,
        initiatedById: me.id,
      },
      select: { id: true },
    })

    const recipients = await tx.cMoonDispersalRecipient.createManyAndReturn({
      data: shuffled.map(m => ({
        dispersalId: created.id,
        userId: m.id,
        username: m.username,
        quantityRequested: quantityPerMember,
      })),
      select: { id: true, userId: true },
    })

    return { id: created.id, recipients }
  })

  const jobs = []
  for (const r of dispersal.recipients) {
    for (let copy = 0; copy < quantityPerMember; copy++) {
      jobs.push({
        name: 'mintCtoon',
        data: {
          userId: r.userId,
          ctoonId,
          isSpecial: true,
          method: 'CMOON_DISPERSAL',
          dispersalId: dispersal.id,
          dispersalRecipientId: r.id,
        },
        opts: {
          // Deterministic per (recipient, copy) — guards against double-enqueueing the same
          // mint if this request were ever retried after the transaction already committed.
          jobId: `dispersal:${dispersal.id}:${r.id}:${copy}`,
          priority: DISPERSAL_JOB_PRIORITY,
        },
      })
    }
  }
  await mintQueue.addBulk(jobs)

  await logAdminChange(db, {
    userId: me.id,
    area: 'cMoonDispersal',
    key: `disperse:${dispersal.id}`,
    prevValue: null,
    newValue: {
      cMoonId, cMoonName: cMoon.name, ctoonId, ctoonName: ctoon.name,
      quantityPerMember, memberCount: shuffled.length, totalJobs,
    },
  })

  return { dispersalId: dispersal.id, totalMembers: shuffled.length, totalJobs }
})
