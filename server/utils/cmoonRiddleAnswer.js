// server/utils/cmoonRiddleAnswer.js
// Pure, dependency-free answer normalization/comparison for the cMoon Riddle system (see
// prisma/schema.prisma's CMoonRiddle model comment). Deliberately split out of
// server/utils/cmoonRiddle.js — that file pulls in recomputeCMoonTeamScores/
// recomputeCMoonPointsForUsers, which eagerly construct BullMQ Queue/Redis connections on
// import (same reasoning as cmoonEnemyRaid.js being split from cmoonRaidSocket.js) — so this can
// be unit-tested directly with a plain `node --test` run, no DB/Redis needed.

// Case/whitespace-insensitive — collapses internal runs of whitespace to one space and trims
// both ends, so "  Blue   Moon " and "blue moon" compare equal. Never strips punctuation; an
// admin-authored answer with punctuation in it must still be typed back exactly.
export function normalizeRiddleAnswer(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isCorrectRiddleAnswer(riddle, submitted) {
  return normalizeRiddleAnswer(riddle?.answer) === normalizeRiddleAnswer(submitted)
}
