// utils/ogGtoonDifficulty.js
// How the practice bot's difficulty is shown to players. The stored / socket value for the middle level is
// still 'normal'; players see it as "Medium" everywhere (the practice picker, the match header, the
// Practice Matches leaderboard) so one setting never has two names.
export const DIFFICULTY_LABELS = { easy: 'Easy', normal: 'Medium', hard: 'Hard' }

export function difficultyLabel(value) {
  return DIFFICULTY_LABELS[value] || DIFFICULTY_LABELS.normal
}
