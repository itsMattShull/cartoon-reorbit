// server/utils/cmoonHuntAssignment.js
// Pure, dependency-free clue-distribution logic for the cMoon Split-Clue Scavenger Hunt (see
// prisma/schema.prisma's CMoonHunt model comment) — split out the same way cmoonRiddleAnswer.js
// is split from cmoonRiddle.js/cmoonHunt.js, so this can be unit-tested with a plain
// `node --test` run with no DB/Discord/Redis involved.

// Shuffles a copy of `arr` (Fisher-Yates) — `randomFn` is injectable so a test can assert exact
// output with a stubbed sequence instead of asserting only statistical properties.
export function shuffleArray(arr, randomFn = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Assigns each member in `memberIds` exactly one clue id from `clueIds`, round-robin (wrapping
// around if there are more members than clues, in which case some clues go to more than one
// member — "split-clue" degrades gracefully rather than erroring for an odd-sized team). Member
// order is shuffled first so who ends up holding which specific clue isn't predictable from
// their id/join order — it should feel like a random draw. Returns one `{ userId, clueId }` pair
// per member, same length as `memberIds`; an empty input on either side returns `[]`.
export function assignCluesRoundRobin(memberIds, clueIds, randomFn = Math.random) {
  if (!memberIds.length || !clueIds.length) return []
  const shuffledMembers = shuffleArray(memberIds, randomFn)
  return shuffledMembers.map((userId, i) => ({ userId, clueId: clueIds[i % clueIds.length] }))
}
