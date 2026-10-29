<template>
  <div
    class="rf"
    :class="[`rf-${variant}`, { 'rf-ko': knockedOut, 'rf-me': isMe, 'rf-no-team': !team, 'rf-captain': isCaptain }]"
    :style="teamVars"
  >
    <span v-if="isCaptain" class="rf-captain-glow" aria-hidden="true"></span>
    <span class="rf-sash" aria-hidden="true"></span>
    <span class="rf-crest">
      <CMoonAvatar v-if="team" :avatar-path="team.avatarPath || ''" :color="team.color || ''" :name="team.name || ''" />
      <span v-else class="rf-crest-empty" aria-hidden="true">?</span>
    </span>
    <span class="rf-body">
      <span class="rf-name-row">
        <span class="rf-name">{{ participant.username || 'Player' }}</span>
        <span v-if="isCaptain" class="rf-captain-badge" title="cMoon Captain — their presence inspires the whole party">🎖️<span class="rf-captain-text"> Captain</span></span>
        <span v-if="participant.isInitiator" class="rf-leader" title="Started this raid">👑<span class="rf-leader-text"> Raid leader</span></span>
        <span v-if="isMe" class="rf-you">you</span>
      </span>
      <span v-if="team?.name" class="rf-team">{{ team.name }}</span>
      <span v-if="rank" class="rf-rank" :title="rankTitle">
        <span class="rf-chevrons" aria-hidden="true">
          <span v-for="i in chevronCount" :key="i" class="rf-chevron" :class="{ 'rf-chevron-on': i <= filledChevrons }"></span>
        </span>
        <span class="rf-rank-name">{{ rank.name }}</span>
        <span class="sr-only">{{ rankTitle }}</span>
      </span>
    </span>
    <slot />
  </div>
</template>

<script setup>
// One raid fighter shown off with their team colors and rank — used on the raid screen
// (pages/newsite/cmoon-raid/[id].vue) and in the Raid Boss Lobby. Raids are cross-cMoon, so this
// is how players see who they're fighting alongside: a sash in the fighter's cMoon color, their
// cMoon's crest, and their rank as chevron insignia filled up to their tier on the global ladder.
//
// Colors only ever come from isSafeCMoonColor-validated hex (utils/cmoonColor.js) and are bound
// as CSS custom properties through a style OBJECT, never a raw style string, so an admin-entered
// value can't inject CSS.
import { computed } from 'vue'
import { isSafeCMoonColor, lightenHex, contrastTextColor } from '~/utils/cmoonColor'

const props = defineProps({
  // { username, isInitiator, isCaptain, cMoon: { name, color, avatarPath } | null, rank: { name, tierName, tierLevel, tierCount } | null }
  participant: { type: Object, required: true },
  variant: { type: String, default: 'card' }, // 'card' (roster/lobby) | 'compact' (combat rows)
  isMe: { type: Boolean, default: false },
  knockedOut: { type: Boolean, default: false },
})

const FALLBACK = '#5b6b85'
const MAX_CHEVRONS = 8

const team = computed(() => props.participant?.cMoon || null)
const rank = computed(() => props.participant?.rank || null)
// Whether THIS fighter is a cMoon captain (see CMoonCaptain's own schema comment) — purely
// cosmetic (the glow ring + medal badge below), never a gameplay effect. rank.name is already
// server-overridden to "Captain" for them too (displayRankName in server/utils/cmoon.js), same
// label swap every other surface a captain is shown on already applies; this component layers
// the extra "epic" visual treatment the raid feature specifically asked for on top of that.
const isCaptain = computed(() => !!props.participant?.isCaptain)

const teamVars = computed(() => {
  const color = isSafeCMoonColor(team.value?.color) ? team.value.color : FALLBACK
  return {
    '--rf-team': color,
    '--rf-team-light': lightenHex(color, 0.55),
    '--rf-team-ink': contrastTextColor(color),
  }
})

// Chevrons show position on the global tier ladder. Ladders longer than MAX_CHEVRONS are scaled
// down so a top-tier player still reads as "full" rather than overflowing the card.
const chevronCount = computed(() => {
  const total = Number(rank.value?.tierCount) || 0
  return Math.max(1, Math.min(MAX_CHEVRONS, total || 1))
})
const filledChevrons = computed(() => {
  const level = Number(rank.value?.tierLevel) || 0
  const total = Number(rank.value?.tierCount) || 0
  if (!level) return 0
  if (total <= MAX_CHEVRONS) return Math.min(level, chevronCount.value)
  return Math.max(1, Math.round((level / total) * MAX_CHEVRONS))
})
const rankTitle = computed(() => {
  if (!rank.value) return ''
  const tier = rank.value.tierName ? `${rank.value.tierName} tier` : 'Rank'
  const pos = rank.value.tierLevel && rank.value.tierCount ? ` (${rank.value.tierLevel} of ${rank.value.tierCount})` : ''
  return `${rank.value.name}: ${tier}${pos}`
})
</script>

<style scoped>
.rf {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
  border: 2px solid var(--rf-team);
  box-shadow: 0 2px 0 var(--rf-team);
  isolation: isolate;
}
.rf-card { padding: 8px 10px 8px 8px; }
.rf-compact { padding: 3px 8px 3px 3px; gap: 7px; border-width: 1.5px; box-shadow: none; border-radius: 999px; }

/* The one bold element: a diagonal sash in the team color behind the crest. */
.rf-sash {
  position: absolute;
  inset: -40% auto -40% -20px;
  width: 72px;
  transform: skewX(-18deg);
  background: linear-gradient(160deg, var(--rf-team-light) 0%, var(--rf-team) 55%);
  z-index: -1;
}
.rf-compact .rf-sash { width: 26px; inset: -40% auto -40% -8px; }

.rf-crest {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px var(--rf-team), 0 0 14px var(--rf-team-light);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rf-crest :deep(.cma-root), .rf-crest :deep(.cma-img), .rf-crest :deep(.cma-fallback) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  object-fit: cover;
  font-weight: 800;
}
.rf-crest :deep(.cma-fallback) { font-size: 20px; }
.rf-compact .rf-crest { width: 24px; height: 24px; border-width: 2px; box-shadow: 0 0 0 1.5px var(--rf-team); }
.rf-compact .rf-crest :deep(.cma-fallback) { font-size: 12px; }
.rf-crest-empty { color: #94a3b8; font-weight: 800; }

.rf-body { display: flex; flex-direction: column; min-width: 0; gap: 2px; padding-left: 6px; }
.rf-compact .rf-body { flex-direction: row; align-items: center; gap: 6px; padding-left: 0; }

.rf-name-row { display: flex; align-items: center; gap: 5px; min-width: 0; }
.rf-name { font-weight: 800; font-size: 14px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-compact .rf-name { font-size: 12px; max-width: 110px; }
/* In combat rows the "you" ring on the badge already marks the viewer; the pill would only
   push the HP bar onto its own line on a phone. */
.rf-compact .rf-you { display: none; }
.rf-leader { font-size: 11px; color: #92400e; white-space: nowrap; }
.rf-compact .rf-leader-text { display: none; }

/* ── cMoon captain: purely cosmetic "epic" treatment — a gold badge plus a pulsing halo around
   the whole card, meant to be felt by everyone else in the raid, not just the captain. No
   gameplay effect lives here or anywhere this flows from (see isCaptain's own comment above). */
.rf-captain-badge {
  font-size: 11px;
  font-weight: 800;
  color: #92400e;
  text-shadow: 0 0 6px rgba(250, 204, 21, 0.8);
  white-space: nowrap;
  animation: rf-captain-shimmer 1.8s ease-in-out infinite;
}
.rf-compact .rf-captain-text { display: none; }
.rf-captain-glow {
  position: absolute;
  inset: -8px;
  z-index: -3;
  border-radius: inherit;
  background: radial-gradient(circle, rgba(250, 204, 21, 0.45), transparent 70%);
  animation: rf-captain-pulse 2.2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes rf-captain-pulse {
  0%, 100% { opacity: 0.55; transform: scale(0.97); }
  50% { opacity: 1; transform: scale(1.04); }
}
@keyframes rf-captain-shimmer {
  0%, 100% { text-shadow: 0 0 4px rgba(250, 204, 21, 0.5); }
  50% { text-shadow: 0 0 10px rgba(250, 204, 21, 1); }
}
@media (prefers-reduced-motion: reduce) {
  .rf-captain-glow, .rf-captain-badge { animation: none; }
}
.rf-you {
  font-size: 10px;
  font-weight: 700;
  color: var(--rf-team-ink);
  background: var(--rf-team);
  border-radius: 999px;
  padding: 0 6px;
}

.rf-team {
  align-self: flex-start;
  max-width: 100%;
  font-size: 11px;
  font-weight: 800;
  color: var(--rf-team-ink);
  background: var(--rf-team);
  border-radius: 4px;
  padding: 1px 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rf-compact .rf-team { display: none; }

.rf-rank { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #374151; min-width: 0; }
.rf-rank-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rf-compact .rf-rank-name { display: none; }

/* Rank insignia: stacked chevrons, filled up to the fighter's tier. */
.rf-chevrons { display: inline-flex; gap: 1px; }
.rf-chevron {
  width: 9px;
  height: 9px;
  clip-path: polygon(0 0, 50% 45%, 100% 0, 100% 45%, 50% 100%, 0 45%);
  background: #d1d5db;
}
.rf-compact .rf-chevron { width: 7px; height: 7px; }
.rf-chevron-on { background: linear-gradient(180deg, #fde68a, #d97706); }

.rf-me { box-shadow: 0 2px 0 var(--rf-team), 0 0 0 3px var(--rf-team-light); }
.rf-compact.rf-me { box-shadow: 0 0 0 2px var(--rf-team-light); }
.rf-ko { filter: grayscale(0.85); opacity: 0.65; }
.rf-ko .rf-name { text-decoration: line-through; }
.rf-no-team { border-color: #cbd5e1; box-shadow: none; }

/* After rf-me/rf-ko/rf-no-team in source order so the captain glow always wins when stacked
   with any of them (e.g. viewing your own card as the captain) — the most "epic" treatment on
   the card should never lose to a plainer one. */
.rf-captain {
  border-color: #d97706;
  box-shadow: 0 2px 0 #d97706, 0 0 0 2px #facc15, 0 0 16px rgba(250, 204, 21, 0.55);
}
.rf-compact.rf-captain { box-shadow: 0 0 0 2px #facc15, 0 0 10px rgba(250, 204, 21, 0.6); }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
</style>
