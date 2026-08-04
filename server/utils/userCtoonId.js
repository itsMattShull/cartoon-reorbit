import { prisma } from '@/server/prisma'
import {
  encodeUserCtoonId,
  isSyntheticUserCtoonId,
  parseUserCtoonToken,
  userCtoonRowKey,
  groupTokensByUser
} from '@/server/utils/userCtoonToken'

export { encodeUserCtoonId, isSyntheticUserCtoonId }

/**
 * Resolves a list of cToon references to real UserCtoon ids in one query.
 *
 * Returns an array the SAME LENGTH as the input, positionally aligned, with
 * null in place of anything that could not be resolved. Callers depend on both
 * properties: server/utils/tradeOffer.js maps the result straight onto the
 * offered/requested arrays and rejects the request when any entry is null.
 *
 * Three things make this safe to run as one query instead of N:
 *
 *  - Malformed tokens are dropped by parseUserCtoonToken BEFORE they can become
 *    a predicate. A branch built from undefined segments would match the whole
 *    table (Prisma strips undefined keys from a where), so one junk token in a
 *    batch could otherwise resolve every other token to a stranger's cToon.
 *  - Rows are matched back by their full (userId, ctoonId, mintNumber) key, never
 *    by position in the result set. findMany returns rows in index order, and the
 *    result is shorter than the input whenever a token is unresolvable and longer
 *    whenever a null-mint token matches several copies — so a positional zip
 *    would hand one input another input's cToon.
 *  - The orderBy makes the null-mint case deterministic. An unlimited-edition
 *    cToon has mintNumber null on every copy, and Postgres treats NULLs as
 *    distinct under @@unique([ctoonId, mintNumber]), so one token can match many
 *    rows. The old findFirst had no orderBy and picked one arbitrarily, meaning
 *    two resolutions of the same token could disagree about which physical cToon
 *    was being traded; first-wins over a sorted read fixes that.
 */
export async function resolveUserCtoonIds (inputs) {
  if (!Array.isArray(inputs) || !inputs.length) return []

  const out = new Array(inputs.length).fill(null)
  const parsed = []

  inputs.forEach((input, index) => {
    // A non-synthetic reference is already a real id and passes straight
    // through, exactly as the single-item version did.
    if (!isSyntheticUserCtoonId(input)) {
      out[index] = input
      return
    }
    const token = parseUserCtoonToken(input)
    if (token) parsed.push({ index, token })
    // Malformed tokens keep their null slot: unresolvable, not queried.
  })

  if (!parsed.length) return out

  const groups = groupTokensByUser(parsed.map(p => p.token))
  const rows = await prisma.userCtoon.findMany({
    where: {
      // Hoisted out of the branches: one filter for the whole query rather than
      // the same clause repeated once per owner.
      burnedAt: null,
      OR: groups.map(g => ({ userId: g.userId, ctoonId: { in: g.ctoonIds } }))
    },
    select: { id: true, userId: true, ctoonId: true, mintNumber: true },
    orderBy: [{ mintNumber: 'asc' }, { id: 'asc' }]
  })

  const idByKey = new Map()
  for (const row of rows) {
    const key = userCtoonRowKey(row.userId, row.ctoonId, row.mintNumber)
    // First wins. The orderBy above is what makes "first" mean the same thing
    // on every call for a null-mint token with several matching copies.
    if (!idByKey.has(key)) idByKey.set(key, row.id)
  }

  for (const { index, token } of parsed) {
    out[index] = idByKey.get(userCtoonRowKey(token.userId, token.ctoonId, token.mintNumber)) ?? null
  }
  return out
}

/**
 * Single-reference form, defined in terms of the batch so there is one
 * resolution semantic rather than two implementations to drift apart.
 */
export async function resolveUserCtoonId (input) {
  const [id] = await resolveUserCtoonIds([input])
  return id ?? null
}
