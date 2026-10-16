<template>
  <template v-if="phase === 'FIGHT'">
    <div class="cbc-portrait-wrap" :class="{ 'cbc-portrait-warning': portraitWarning }">
      <img v-if="enemyImagePath" :src="enemyImagePath" alt="" class="cbc-portrait" />
      <slot name="portrait-badge" />
    </div>
    <h2 :id="titleId" class="cbc-title">
      {{ enemyName }}
      <span v-if="enemyRank" class="cbc-rank-badge" :class="'cbc-rank-' + enemyRank">{{ RANK_LABELS[enemyRank] }}</span>
    </h2>

    <div class="cbc-hp-tile">
      <div class="cbc-hp-row">
        <span class="cbc-hp-label">Enemy</span>
        <div class="cbc-hp-bar"><div class="cbc-hp-fill cbc-hp-fill-enemy" :class="enemyHpFillClass" :style="{ width: enemyHpPercent + '%' }"></div></div>
        <span class="cbc-hp-count">{{ enemyHpRemaining }}/{{ enemyMaxHp }}</span>
        <slot name="enemy-dmg-float" />
      </div>
      <div class="cbc-hp-row">
        <span class="cbc-hp-label">You</span>
        <div class="cbc-hp-bar"><div class="cbc-hp-fill cbc-hp-fill-player" :class="playerHpFillClass" :style="{ width: playerHpPercent + '%' }"></div></div>
        <span class="cbc-hp-count">{{ playerHpRemaining }}/{{ playerMaxHp }}</span>
        <slot name="player-dmg-float" />
      </div>
      <!-- Stamina row — only present when the mechanic is on (playerMaxStamina > 0), same bar
           styling as the two HP rows above rather than a pips-per-point glyph row, which breaks
           down the same way the old heart-per-HP-point row did at a high admin-configured pool. -->
      <div v-if="playerMaxStamina > 0" class="cbc-hp-row">
        <span class="cbc-hp-label">Stamina</span>
        <div class="cbc-hp-bar"><div class="cbc-hp-fill cbc-hp-fill-stamina" :style="{ width: staminaPercent + '%' }"></div></div>
        <span class="cbc-hp-count">{{ playerStamina }}/{{ playerMaxStamina }}</span>
      </div>
    </div>

    <slot name="above-summary" />
    <p v-if="lastRoundLabel" class="cbc-round-summary" :class="lastRoundClass">
      {{ lastRoundLabel }}
      <span v-if="critBadge" class="cbc-crit-badge">CRITICAL!</span>
    </p>
    <p v-if="error" class="cbc-error">{{ error }}</p>

    <div class="cbc-move-grid">
      <button type="button" class="cbc-move cbc-move-attack" :disabled="busy || isOutOfStamina" @click="$emit('action', 'ATTACK_HIGH')">Attack High</button>
      <button type="button" class="cbc-move cbc-move-attack" :disabled="busy || isOutOfStamina" @click="$emit('action', 'ATTACK_LOW')">Attack Low</button>
      <BlueButton type="button" class="cbc-move" :disabled="busy" @click="$emit('action', 'BLOCK_HIGH')">Block High</BlueButton>
      <BlueButton type="button" class="cbc-move" :disabled="busy" @click="$emit('action', 'BLOCK_LOW')">Block Low</BlueButton>
    </div>
    <p v-if="isOutOfStamina" class="cbc-hint cbc-hint-warning">Out of stamina — block to recover before you can attack again.</p>
    <p v-else class="cbc-hint">Blocking the same side as their attack cancels it (and heals 1 HP) — anything else lands a hit.</p>

    <slot name="special-attack" />
  </template>

  <template v-else-if="phase === 'RESULT'">
    <slot name="result-top" />
    <h2 :id="titleId" class="cbc-title" :class="resultTitleClass">
      {{ resultTitle }}
      <span v-if="critBadge" class="cbc-crit-badge">CRITICAL!</span>
    </h2>
    <p class="cbc-sub">{{ enemyName }}</p>
    <slot name="result-extra" />

    <template v-if="outcome === 'WIN'">
      <p v-if="pointsAwarded" class="cbc-points">+{{ pointsAwarded }} cMoon points</p>
      <div v-if="rewardsList.length" class="cbc-rewards">
        <p class="cbc-rewards-title">Prizes:</p>
        <ul>
          <li v-for="(r, i) in rewardsList" :key="i" class="cbc-reward-item" :style="{ animationDelay: (i * 150) + 'ms' }">{{ r }}</li>
        </ul>
      </div>
    </template>
    <p v-else-if="outcome === 'ABANDONED'" class="cbc-flavor">The fight timed out — no penalty, try again anytime.</p>
    <p v-else-if="outcome === 'UNCREDITED'" class="cbc-flavor">Someone else landed the final blow on this one — no prize this time, but good luck on the next bounty!</p>
    <p v-else class="cbc-flavor">No penalty beyond the loss itself — take another shot anytime.</p>

    <slot name="result-actions">
      <div class="cbc-actions">
        <button type="button" class="cbc-btn-secondary cbc-btn-secondary-solid" @click="$emit('close')">Close</button>
      </div>
    </slot>
  </template>
</template>

<script setup>
// The shared visual "battle card" for a cMoon Enemy Battle FIGHT/RESULT screen — used by both the
// live site-wide popup (CMoonBattlePopupHost.vue) and the admin "Preview Encounter" modal
// (components/newsite/CMoonEnemyPreviewModal.vue), so the two can never visually drift apart again
// (see that modal's own history — it was still showing a bare heart-per-HP-point/plain-Tailwind
// look well after the live popup moved on to HP bars and a branded navy card). Purely presentational:
// every number it shows is a prop, every player choice it offers is an emitted event — no battle
// state, no API calls, no composable of its own. The two callers differ in which juice they layer
// on top via the named slots below (confetti/shake/taunts/combo-callout/special-attack button for
// the real popup; nothing for the consequence-free admin preview), but the core card — portrait,
// title, HP/stamina bars, round summary, move grid, result screen — is now one single source of
// truth for both.
// Mirrors server/utils/cmoonEnemy.js's RANK_LABELS — same client-duplication reasoning
// CMoonBattlePopupHost.vue's own copy of this already follows.
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }

const props = defineProps({
  // 'FIGHT' | 'RESULT' — there is no OFFER phase here; each caller handles its own pre-fight screen
  // (or, for the admin preview, skips straight to FIGHT since there's no decision to make there).
  phase: { type: String, required: true },
  // Optional — lets a caller wire this card's own title up to its dialog's aria-labelledby
  // (see CMoonBattlePopupHost.vue's own cbp-title id, reused here across the FIGHT/RESULT phase
  // switch now that both render through this single shared element rather than two separate ones).
  titleId: { type: String, default: null },
  enemyName: { type: String, default: '' },
  enemyRank: { type: String, default: '' },
  enemyImagePath: { type: String, default: '' },
  enemyMaxHp: { type: Number, default: 1 },
  enemyHpRemaining: { type: Number, default: 0 },
  playerHpRemaining: { type: Number, default: 0 },
  playerMaxHp: { type: Number, default: 1 },
  playerStamina: { type: Number, default: 0 },
  playerMaxStamina: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  lastRoundLabel: { type: String, default: '' },
  lastRoundClass: { type: String, default: '' },
  critBadge: { type: Boolean, default: false },
  portraitWarning: { type: Boolean, default: false },
  outcome: { type: String, default: null },
  resultTitle: { type: String, default: '' },
  resultTitleClass: { type: String, default: '' },
  pointsAwarded: { type: Number, default: 0 },
  rewardsList: { type: Array, default: () => [] },
})
defineEmits(['action', 'close'])

const enemyHpPercent = computed(() => {
  const max = props.enemyMaxHp || 1
  return Math.max(0, Math.min(100, Math.round((props.enemyHpRemaining / max) * 100)))
})
// Standard health-bar color escalation (green -> yellow -> red) — shared by both HP bars below,
// since "low and getting lower" reads the same way regardless of whose HP it is.
function hpFillClass(percent) {
  if (percent <= 25) return 'cbc-hp-fill-critical'
  if (percent <= 50) return 'cbc-hp-fill-mid'
  return ''
}
const enemyHpFillClass = computed(() => hpFillClass(enemyHpPercent.value))
const playerHpPercent = computed(() => {
  const max = props.playerMaxHp || 1
  return Math.max(0, Math.min(100, Math.round((props.playerHpRemaining / max) * 100)))
})
const playerHpFillClass = computed(() => hpFillClass(playerHpPercent.value))
const staminaPercent = computed(() => {
  const max = props.playerMaxStamina || 1
  return Math.max(0, Math.min(100, Math.round((props.playerStamina / max) * 100)))
})
// Mirrors action.post.js's own server-side stamina gate — this is never the real enforcement,
// just saves a doomed round-trip. Always false (never disabled) when playerMaxStamina <= 0, which
// covers both an admin-disabled mechanic and every caller that doesn't model stamina at all.
const isOutOfStamina = computed(() => props.playerMaxStamina > 0 && props.playerStamina <= 0)
</script>

<style scoped>
.cbc-portrait-wrap {
  position: relative;
  z-index: 1;
  width: 96px;
  height: 96px;
  margin: 6px auto 6px;
  border-radius: 18px;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cbc-portrait { max-width: 92%; max-height: 92%; object-fit: contain; animation: cbc-portrait-breathe 3.2s ease-in-out infinite; }
@keyframes cbc-portrait-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}
@media (prefers-reduced-motion: reduce) {
  .cbc-portrait { animation: none; }
}
/* Warning ring when the enemy is about to unleash a special — see portraitWarning prop. */
.cbc-portrait-warning {
  box-shadow: 0 0 0 3px #fbbf24, 0 0 16px rgba(251, 191, 36, 0.7);
  animation: cbc-portrait-warning-pulse 1s ease-in-out infinite;
}
@keyframes cbc-portrait-warning-pulse {
  0%, 100% { box-shadow: 0 0 0 3px #fbbf24, 0 0 10px rgba(251, 191, 36, 0.5); }
  50% { box-shadow: 0 0 0 3px #fde68a, 0 0 20px rgba(251, 191, 36, 0.9); }
}
@media (prefers-reduced-motion: reduce) {
  .cbc-portrait-warning { animation: none; }
}

.cbc-title { font-size: 1.1rem; font-weight: 600; margin: 4px 0 2px; color: #fff; }
.cbc-title-win { color: #4ade80; }
.cbc-title-loss { color: #f87171; }
.cbc-sub { font-size: 0.78rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; }
.cbc-flavor { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin-bottom: 12px; line-height: 1.4; }
.cbc-error { font-size: 12px; color: #f87171; margin-bottom: 8px; }

.cbc-rank-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  vertical-align: middle;
}
.cbc-rank-GOON { background: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.85); }
.cbc-rank-ENFORCER { background: #1d4ed8; color: #dbeafe; }
.cbc-rank-UNDERBOSS { background: #7e22ce; color: #f3e8ff; }
.cbc-rank-FINAL_BOSS { background: #b91c1c; color: #fee2e2; }

.cbc-hp-tile {
  background: rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 8px 0;
}
.cbc-hp-row { display: flex; align-items: center; gap: 8px; position: relative; }
.cbc-hp-row + .cbc-hp-row { margin-top: 6px; }
.cbc-hp-label { font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.6); width: 42px; text-align: left; flex-shrink: 0; }
.cbc-hp-bar { flex: 1; height: 10px; border-radius: 999px; background: rgba(0, 0, 0, 0.35); overflow: hidden; }
.cbc-hp-fill { height: 100%; transition: width 0.25s ease, background-color 0.25s ease; }
.cbc-hp-fill-enemy, .cbc-hp-fill-player { background: #22c55e; }
.cbc-hp-fill-mid { background: #f59e0b; }
.cbc-hp-fill-critical { background: #dc2626; animation: cbc-hp-critical-pulse 1s ease-in-out infinite; }
@keyframes cbc-hp-critical-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
}
@media (prefers-reduced-motion: reduce) {
  .cbc-hp-fill-critical { animation: none; }
}
/* Stamina bar — a flat gold fill, no danger-escalation colors: running low isn't "danger" the way
   HP is (the out-of-stamina hint text below already covers that), it's just a resource to manage. */
.cbc-hp-fill-stamina { background: #facc15; }
.cbc-hp-count { font-size: 11px; color: rgba(255, 255, 255, 0.6); width: 44px; text-align: right; flex-shrink: 0; }

.cbc-round-summary { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin: 8px 0; }
.cbc-round-good { color: #4ade80; font-weight: 600; }
.cbc-round-bad { color: #f87171; font-weight: 600; }
.cbc-round-neutral { color: rgba(255, 255, 255, 0.6); font-weight: 600; }
.cbc-crit-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #f59e0b;
  color: #1a1200;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  animation: cbc-crit-pop 0.35s ease-out;
}
@keyframes cbc-crit-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.cbc-move-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.cbc-move {
  padding: 12px 6px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  width: 100%;
}
.cbc-move:disabled { opacity: 0.45; cursor: not-allowed; }
.cbc-move-attack {
  border: 2px solid #7a1515;
  background: #dc2626;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.35),
    inset -1px 0 0 rgba(255, 255, 255, 0.25),
    -1px 1px 1px rgba(0, 0, 0, 0.3);
}
.cbc-move-attack:active { box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.3); }
.cbc-hint { font-size: 10.5px; color: rgba(255, 255, 255, 0.5); margin-top: 8px; }
.cbc-hint-warning { color: #fbbf24; font-weight: 600; }

.cbc-points { font-size: 15px; font-weight: 700; color: #4ade80; margin-bottom: 8px; }
.cbc-rewards { text-align: left; background: rgba(255, 255, 255, 0.07); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
.cbc-rewards-title { font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.6); margin-bottom: 4px; }
.cbc-rewards ul { margin: 0; padding-left: 16px; font-size: 12px; }
.cbc-reward-item { opacity: 0; animation: cbc-reward-pop 0.35s ease-out forwards; }
@keyframes cbc-reward-pop {
  0% { transform: translateX(-6px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbc-reward-item { animation: none; opacity: 1; }
}

.cbc-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.cbc-btn-secondary {
  padding: 9px 14px;
  border-radius: 6px;
  border: 2px solid #7a1515;
  background: #b91c1c;
  color: #fff;
  font-weight: bold;
  font-size: 0.85rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  cursor: pointer;
}
.cbc-btn-secondary:hover { background: #991b1b; }
.cbc-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }
.cbc-btn-secondary-solid { width: 100%; }
</style>
