// Shared definition of "duplicate" for the newsite UI: a cToon the user holds
// two or more copies of. Every copy stays in the result — nothing is treated as
// the "original" and hidden.
//
// NOTE: this deliberately differs from the legacy server-side
// `/api/collections?duplicatesOnly=1` path, which drops the lowest mint number
// of each group. See server/api/collections.get.js.
export function duplicateCtoonIds(items, key = 'ctoonId') {
  const counts = new Map()
  for (const item of items) {
    const id = item?.[key]
    if (id === null || id === undefined) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  const dupes = new Set()
  for (const [id, count] of counts) {
    if (count > 1) dupes.add(id)
  }
  return dupes
}

// Clusters copies of the same cToon together without disturbing the caller's
// chosen sort: groups appear in the order their first member appears in `list`,
// and members keep their relative order inside each group.
export function groupByCtoonId(list, key = 'ctoonId') {
  const groups = new Map()
  for (const item of list) {
    const id = item?.[key]
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(item)
  }
  return [...groups.values()].flat()
}
