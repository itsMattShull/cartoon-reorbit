// server/utils/saleOverlap.js
// A cToon cannot belong to two Sales with overlapping date windows.
// Call inside the create/update transaction, right before writing SaleCtoon
// rows, to keep the check-then-write race window as small as possible.

import { createError } from 'h3'

export async function assertNoSaleOverlap(client, { ctoonIds, startAt, endAt, excludeSaleId }) {
  if (!ctoonIds.length) return

  const conflicts = await client.saleCtoon.findMany({
    where: {
      ctoonId: { in: ctoonIds },
      ...(excludeSaleId ? { saleId: { not: excludeSaleId } } : {}),
      sale: {
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      }
    },
    select: {
      ctoon: { select: { name: true } },
      sale: { select: { name: true } }
    }
  })

  if (conflicts.length) {
    const desc = conflicts
      .map(c => `${c.ctoon.name} (already in "${c.sale.name}")`)
      .join(', ')
    throw createError({ statusCode: 409, statusMessage: `These cToons overlap with another sale's dates: ${desc}` })
  }
}
