// utils/cmoonEnemyMapDescription.js
//
// Turns a resolved cMoon Enemy Map (see server/utils/cmoonEnemyMap.js) into a list of plain-
// language sentences describing whichever of its effects are actually on — shared by both
// pages/newsite/cmoon-raid/[id].vue and pages/newsite/cmoon-pvp/[id].vue so the "I Understand"
// map-info modal reads identically in either context, rather than two independently drifting
// copies of the same copy.

function whoLabel(affectsPlayers, affectsEnemies) {
  const players = affectsPlayers !== false
  const enemies = affectsEnemies !== false
  if (players && enemies) return 'Everyone'
  if (players) return 'Your side'
  if (enemies) return 'The enemy'
  return null // both explicitly off — shouldn't normally happen, caller skips the line
}

// PvP's own version: there's no "enemies" side to split against (both teams are players), so
// `affectsEnemies` has no meaning there and is never sent — see cmoonPvpSocket.js's own comment
// on why only `affectsPlayers` still gates the tick in that engine. `affectsPlayers === false`
// means the tick applies to nobody in PvP, not "the enemy" (there is no enemy to fall back to).
function whoLabelPvp(affectsPlayers) {
  return affectsPlayers !== false ? 'Everyone' : null
}

// Fog of war does two UNRELATED things depending on context (see CMoonEnemyMap.fogOfWarEnabled's
// own schema comment): in a raid it suppresses the boss's wind-up/telegraph message entirely
// (publicRaidView in cmoonRaidSocket.js never sends it) — the boss's own HP bar is NOT hidden.
// In PvP it hides the opposing team's hpRemaining/knockedOut (publicPvpMatchView). Same toggle,
// different real effect, so the copy can't be shared between the two `context`s like every other
// line above — `context` is required precisely so this file can't silently describe the wrong one.
function fogOfWarLine(context) {
  if (context === 'pvp') return 'Fog of war: you can\'t see the opposing team\'s remaining HP.'
  return 'Fog of war: the boss\'s wind-up warning before a big attack is hidden.'
}

export function describeEnemyMapEffects(map, context) {
  if (!map) return []
  const lines = []
  if (map.specialThresholdReduction > 0) {
    lines.push(`Everyone charges their special attack ${map.specialThresholdReduction} consecutive hit${map.specialThresholdReduction === 1 ? '' : 's'} faster.`)
  }
  if (map.poisonAmount > 0 && map.poisonIntervalRounds > 0) {
    const who = context === 'pvp' ? whoLabelPvp(map.poisonAffectsPlayers) : whoLabel(map.poisonAffectsPlayers, map.poisonAffectsEnemies)
    if (who) lines.push(`${who} take${who === 'Everyone' ? '' : 's'} ${map.poisonAmount} damage every ${map.poisonIntervalRounds} round${map.poisonIntervalRounds === 1 ? '' : 's'}.`)
  }
  if (map.healAmount > 0 && map.healIntervalRounds > 0) {
    const who = context === 'pvp' ? whoLabelPvp(map.healAffectsPlayers) : whoLabel(map.healAffectsPlayers, map.healAffectsEnemies)
    if (who) lines.push(`${who} heal${who === 'Everyone' ? '' : 's'} ${map.healAmount} HP every ${map.healIntervalRounds} round${map.healIntervalRounds === 1 ? '' : 's'}.`)
  }
  if (map.fogOfWarEnabled) {
    lines.push(fogOfWarLine(context))
  }
  return lines
}
