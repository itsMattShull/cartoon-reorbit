// server/api/admin/dissolve-queue/start-bids.post.js
// Saves the dissolve-queue starting bids for the rarities with no rarity floor (Auction Only,
// Prize Only, Code Only, Crazy Rare). A rarity with a bid auctions at it through the normal dissolve
// schedule; blank = held (see server/utils/dissolveListing.js). Setting a bid doesn't schedule
// anything by itself — newly listable entries are picked up by the next Apply Schedule.
import { defineEventHandler, getRequestHeader, readBody, createError } from 'h3'
import { prisma } from '@/server/prisma'
import { logAdminChange } from '@/server/utils/adminChangeLog'
import { getDissolveScheduleConfig, saveDissolveStartBids } from '@/server/utils/dissolveSchedule'
import { parseStartBidsInput } from '@/server/utils/dissolveListing'

export default defineEventHandler(async (event) => {
  const cookie = getRequestHeader(event, 'cookie') || ''
  let me
  try {
    me = await $fetch('/api/auth/me', { headers: { cookie } })
  } catch {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  if (!me?.isAdmin) throw createError({ statusCode: 403, statusMessage: 'Forbidden — Admins only' })

  const body = await readBody(event) || {}
  const { data, error } = parseStartBidsInput(body.startBids || {})
  if (error) throw createError({ statusCode: 400, statusMessage: error })
  if (!Object.keys(data).length) throw createError({ statusCode: 400, statusMessage: 'No starting bids provided' })

  const before = await getDissolveScheduleConfig()
  await saveDissolveStartBids(data)
  const after = await getDissolveScheduleConfig()

  await logAdminChange(prisma, {
    userId: me.id,
    area: 'Admin:DissolveQueue',
    key: 'startBids',
    prevValue: before.startBids,
    newValue: after.startBids,
  })

  return { startBids: after.startBids }
})
