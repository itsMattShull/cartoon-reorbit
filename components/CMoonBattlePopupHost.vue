<template>
  <Teleport to="body">
    <div v-if="visible" class="cbp-overlay">
      <div v-if="resultFlash" class="cbp-result-flash" :class="'cbp-result-flash-' + resultFlash" aria-hidden="true"></div>
      <div v-if="bossIntro" class="cbp-boss-intro-flash" aria-hidden="true"></div>
      <div
        class="cbp-modal"
        :class="{ 'cbp-shake': shaking, 'cbp-shake-crit': shaking && shakeCrit, 'cbp-boss-modal-pop': bossIntro }"
        role="dialog" aria-modal="true" aria-labelledby="cbp-title"
      >
        <!-- A standing "the enemy is about to unleash a special" glow around the whole card — see
             enemySpecialWarning's own comment; this just extends that same telegraph (already a
             ring on the portrait itself) to the full card so it reads during a glance, not just
             on close inspection. -->
        <div v-if="phase === 'FIGHT' && enemySpecialWarning" class="cbp-enrage-vignette" aria-hidden="true"></div>
        <div
          class="cbp-banner"
          :style="bannerStyle"
        >
          <button
            v-if="phase !== 'FIGHT'" type="button" class="cbp-close" aria-label="Close"
            @click="onClose"
          >✕</button>
        </div>

        <!-- ── Offer: an enemy to size up, not yet fought ─────────────── -->
        <div v-if="phase === 'OFFER'" class="cbp-body">
          <div class="cbp-portrait-wrap">
            <img v-if="enemy?.imagePath" :src="enemy.imagePath" alt="" class="cbp-portrait" />
          </div>
          <h2 id="cbp-title" class="cbp-title">
            {{ enemy?.name || 'An enemy appears!' }}
            <span v-if="enemy?.rank" class="cbp-rank-badge" :class="'cbp-rank-' + enemy.rank">{{ RANK_LABELS[enemy.rank] }}</span>
          </h2>
          <p class="cbp-sub">
            {{ enemy?.faction?.name ? `${enemy.faction.name} · ` : '' }}
            {{ enemy?.battleMode === 'SHARED_POOL' ? 'Shared HP' : 'Solo fight' }} · {{ enemy?.hp }} HP
          </p>
          <p v-if="bossEnrageText" class="cbp-boss-enrage">⚡ {{ bossEnrageText }}</p>
          <p class="cbp-flavor">
            Pick the right move each round to land hits.
            <template v-if="inCMoon">A win earns cMoon points for your team and a chance at prizes.</template>
            <template v-else>A win earns a chance at prizes — join a cMoon to also earn points for a team.</template>
          </p>
          <p v-if="pityProgressText" class="cbp-pity-progress">{{ pityProgressText }}</p>
          <p v-if="currentTaunt" class="cbp-taunt">&ldquo;{{ currentTaunt }}&rdquo;</p>
          <p v-if="error" class="cbp-error">{{ error }}</p>
          <p v-if="enemy?.isRaidBoss" class="cbp-flavor">
            This is a raid boss — other players from any cMoon can join from the Raid Boss Lobby before it
            auto-starts, and a party win grants everyone who joined the same prize.
            <template v-if="raidSoloQueueEnabled">You can also fight it solo for a bonus, or </template>
            <template v-else>You can </template>keep the lobby open past the usual window once it's started.
          </p>
          <label v-if="enemy?.isRaidBoss && raidPrivateLobbiesEnabled" class="cbp-private-raid-check">
            <input type="checkbox" v-model="isPrivateRaid" />
            Make this a private, invite-only raid (not listed in the Raid Boss Lobby — share its link instead)
          </label>
          <div class="cbp-actions">
            <GreenButton type="button" class="cbp-btn-wide" :disabled="busy" @click="onFight">
              {{ busy ? 'Starting…' : (enemy?.isRaidBoss ? 'Start Raid!' : 'Fight!') }}
            </GreenButton>
            <button type="button" class="cbp-btn-secondary" :disabled="busy" @click="onClose">Not now</button>
          </div>
        </div>

        <!-- ── Fight/Result: shared with the admin "Preview Encounter" modal, see that
             component's own header comment on why this card is extracted. ─────────────────── -->
        <div v-else class="cbp-body">
          <CMoonBattleCard
            :phase="phase"
            title-id="cbp-title"
            :enemy-name="battle?.enemy?.name"
            :enemy-rank="battle?.enemy?.rank"
            :enemy-image-path="battle?.enemy?.imagePath"
            :enemy-max-hp="battle?.enemy?.maxHp"
            :enemy-hp-remaining="battle?.enemyHpRemaining"
            :player-hp-remaining="battle?.playerHpRemaining ?? 0"
            :player-max-hp="battle?.playerMaxHp || 1"
            :player-stamina="battle?.playerStamina ?? 0"
            :player-max-stamina="battle?.playerMaxStamina ?? 0"
            :busy="busy"
            :error="error"
            :last-round-label="lastRoundLabel"
            :last-round-class="lastRoundClass"
            :crit-badge="!!(lastRound?.playerCrit || lastRound?.enemyCrit)"
            :portrait-warning="enemySpecialWarning"
            :outcome="battle?.outcome"
            :result-title="resultTitle"
            :result-title-class="resultTitleClass"
            :points-awarded="battle?.pointsAwarded || 0"
            :rewards-list="rewardsList"
            @action="act"
            @close="onClose"
          >
            <template #portrait-badge>
              <span v-if="enemySpecialWarning" class="cbp-warning-badge" title="This enemy is about to unleash a special attack!">⚠</span>
            </template>
            <template #enemy-dmg-float>
              <span
                v-for="d in enemyFloatingDamage" :key="d.id" class="cbp-dmg-float" :class="{ 'cbp-dmg-float-crit': d.crit }"
              >-{{ d.amount }}</span>
            </template>
            <template #player-dmg-float>
              <span
                v-for="d in playerFloatingDamage" :key="d.id" class="cbp-dmg-float" :class="{ 'cbp-dmg-float-crit': d.crit }"
              >-{{ d.amount }}</span>
            </template>
            <template #above-summary>
              <p v-if="battle?.playerParalyzedTurns > 0" class="cbp-paralyzed-badge">
                ⚡ Paralyzed — can't act for {{ battle.playerParalyzedTurns }} more round{{ battle.playerParalyzedTurns === 1 ? '' : 's' }}
              </p>
              <p v-for="(s, i) in (lastRound?.specials || [])" :key="i" class="cbp-special-flash" :class="s.side === 'PLAYER' ? 'cbp-special-flash-player' : 'cbp-special-flash-enemy'">
                {{ s.side === 'PLAYER' ? 'You' : battle?.enemy?.name || 'The enemy' }} unleashed <strong>{{ s.name }}</strong>!
              </p>
              <p v-if="comboCallout" class="cbp-combo-callout">{{ comboCallout }}</p>
              <p v-if="currentTaunt" class="cbp-taunt">&ldquo;{{ currentTaunt }}&rdquo;</p>
            </template>
            <template #special-attack>
              <!-- ── Special attack: dormant until the player's own cMoon has one assigned, then
                   fills up with each consecutive hit landed — see useCMoonBattlePopup.js/
                   action.post.js for the charge/fire mechanics. ────────────────────────────── -->
              <div v-if="battle?.playerSpecialAttack" class="cbp-special-wrap">
                <button
                  type="button" class="cbp-special-btn" :class="{ 'cbp-special-charged': battle.playerSpecialCharged && !battle.playerParalyzedTurns }"
                  :disabled="busy || !battle.playerSpecialCharged || battle.playerParalyzedTurns > 0" :style="specialFillStyle"
                  @click="act('SPECIAL_ATTACK')"
                >
                  <span class="cbp-special-glow" aria-hidden="true"></span>
                  <span class="cbp-special-label">
                    <span class="cbp-special-icon">★</span>
                    {{ battle.playerSpecialAttack.name }}
                  </span>
                  <span class="cbp-special-meter">{{ Math.min(battle.playerHitStreak, 3) }}/3</span>
                </button>
                <button
                  type="button" class="cbp-special-help" aria-label="What does this special attack do?"
                  @click="showSpecialInfo = !showSpecialInfo" @mouseenter="showSpecialInfo = true" @mouseleave="showSpecialInfo = false"
                >?</button>
                <div v-if="showSpecialInfo" class="cbp-special-tooltip" role="tooltip">
                  <p class="cbp-special-tooltip-title">{{ battle.playerSpecialAttack.name }}</p>
                  <p v-if="battle.playerSpecialAttack.description">{{ battle.playerSpecialAttack.description }}</p>
                  <p>{{ specialEffectDescription(battle.playerSpecialAttack) }}</p>
                  <p class="cbp-special-tooltip-charge">Land 3 hits in a row to charge it up — it stays ready until you use it.</p>
                </div>
              </div>
            </template>
            <template #result-top>
              <div v-if="confettiPieces.length" class="cbp-confetti" aria-hidden="true">
                <span
                  v-for="p in confettiPieces" :key="p.id" class="cbp-confetti-piece"
                  :style="{ left: p.left + '%', animationDelay: p.delay + 'ms', background: p.color }"
                ></span>
              </div>
            </template>
            <template #result-extra>
              <p v-if="isFirstWinAgainstThisEnemy" class="cbp-first-win">🏆 First victory over {{ battle?.enemy?.name || 'this enemy' }}!</p>
              <p v-if="nearMissFlavor" class="cbp-near-miss">{{ nearMissFlavor }}</p>
              <p v-if="overkillFlavor && battle?.outcome === 'WIN'" class="cbp-overkill">{{ overkillFlavor }}</p>
            </template>
          </CMoonBattleCard>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
// Mirrors server/utils/cmoonEnemy.js's RANK_LABELS — same client-duplication reasoning the old
// hardcoded PLAYER_MAX_HP here used to follow, before a player's max HP became admin/rank-
// dependent (see battle.playerMaxHp, sent fresh by the server on every battle response) rather
// than a single constant safe to mirror client-side.
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/newsite/admin'))

const {
  visible, phase, enemy, battle, inCMoon, busy, error, lastRound, currentTaunt, isFirstWinAgainstThisEnemy,
  raidPrivateLobbiesEnabled, raidSoloQueueEnabled,
  checkOnNavigate, startBattle, submitAction, decline, close,
} = useCMoonBattlePopup()

// Raid-boss "Make private" checkbox (see CMoonEnemyRaid.isPrivate's own schema comment) — reset
// every time a fresh OFFER shows, so a leftover choice from a previous raid boss never carries
// over to this one.
const isPrivateRaid = ref(false)
watch(() => enemy.value?.id, () => { isPrivateRaid.value = false })

const bannerStyle = computed(() => {
  const path = phase.value === 'OFFER' ? enemy.value?.faction?.bannerImagePath : battle.value?.enemy?.faction?.bannerImagePath
  return path ? { backgroundImage: `url(${path})` } : {}
})

// Reward-pity progress on the OFFER screen only — see server/utils/cmoonEnemyBattle.js's
// serializeEnemyForClient for why this is the one screen the server bothers sending it on (the
// streak can't change mid-fight, so there's nothing new to show once Fight! is pressed). null
// enemy.pityProgress means either pity is disabled for this member or this isn't the OFFER
// screen — both correctly show nothing.
const pityProgressText = computed(() => {
  const p = enemy.value?.pityProgress
  if (!p) return ''
  const remaining = Math.max(0, p.threshold - p.emptyWinStreak)
  if (remaining === 0) return 'Your next win against this enemy is guaranteed to drop something!'
  return `${remaining} more empty win${remaining === 1 ? '' : 's'} against this enemy until a guaranteed drop (${p.emptyWinStreak}/${p.threshold}).`
})

// ── Boss-enrage banner (OFFER screen only) — purely derived from fields the OFFER payload
// already sends (enemy.hp/maxHp/battleMode — see serializeEnemyForClient), nothing new fetched.
// Only meaningful for a SHARED_POOL community boss, since a PER_PLAYER enemy's HP always starts
// fresh for every player and never carries any "someone else already hurt it" signal worth
// surfacing here. ───────────────────────────────────────────────────────────────────────────
const bossEnrageText = computed(() => {
  if (enemy.value?.battleMode !== 'SHARED_POOL') return ''
  const max = enemy.value?.maxHp || 1
  const cur = enemy.value?.hp
  if (cur == null || cur <= 0) return ''
  const pct = cur / max
  if (pct <= 0.1) return 'This community boss is nearly down — one more good push could finish it!'
  if (pct <= 0.25) return 'This community boss is already faltering — team up to finish it off!'
  return ''
})

// SPECIAL_ATTACK/PARALYZED mirror the server's own sentinel actions (see SPECIAL_ACTION/
// PARALYZED_ACTION in server/utils/cmoonEnemyBattle.js) — a round's playerAction/enemyAction can
// be either of these instead of one of the 4 lane moves, and must read as plain English here
// rather than leaking the raw constant into the round summary.
const ACTION_LABELS = {
  ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low',
  SPECIAL_ATTACK: 'used a special attack', PARALYZED: 'were paralyzed',
}
function actionLabel(a) { return ACTION_LABELS[a] || a }

// ── Special attack button (see CMoonSpecialAttack's own schema comment, server-side) ──────────
// Mirrors that model's effectType enum purely for the player-facing "?" tooltip copy — this file
// has no server import, so it's duplicated client-side the same way RANK_LABELS above already is.
function specialEffectDescription(attack) {
  const n = attack?.amount
  switch (attack?.effectType) {
    case 'DAMAGE_OPPONENT': return `Deals ${n} guaranteed damage to the enemy, bypassing block.`
    case 'HEAL_SELF': return `Heals you for ${n} HP.`
    case 'PARALYZE_OPPONENT': return `Stuns the enemy for ${n} round${n === 1 ? '' : 's'} — they can't attack or block.`
    case 'LOWER_OPPONENT_ATTACK': return `Lowers the enemy's attack damage by ${n} for the rest of the fight.`
    case 'RAISE_ALLY_ATTACK': return `Raises your own attack damage by ${n} for the rest of the fight.`
    case 'REFLECT_DAMAGE': return `Reflects ${attack?.reflectPercent}% of whatever the enemy hits you for this round back at them — nothing reflects if they block.`
    case 'SIPHON_HEALTH': return `Deals ${n} damage and heals you for ${attack?.siphonPercent}% of it — unless the enemy blocks, in which case it does nothing.`
    default: return ''
  }
}
const showSpecialInfo = ref(false)
// 0/1/2/3 hits -> 0/33/66/100% fill, read by .cbp-special-fill below via this CSS variable —
// stays at 100% once charged even if playerHitStreak itself later resets (see that column's own
// schema comment on why the charge latches rather than mirroring the streak 1:1).
const specialFillStyle = computed(() => {
  const pct = battle.value?.playerSpecialCharged ? 100 : Math.min(100, Math.round(((battle.value?.playerHitStreak || 0) / 3) * 100))
  return { '--cbp-special-fill': pct + '%' }
})

// Covers every shape a round can take: a landed hit (either or both sides), a genuinely
// successful block (which now heals 1 HP — see action.post.js's playerBlocked/enemyBlocked), or
// neither (mutual block, nothing thrown to stop). playerBlocked and enemyBlocked can never both
// be true in the same round (each requires the OTHER side to have thrown an actual attack, and a
// single action can't be both an attack and a block), so these branches are mutually exclusive
// by construction, not just in practice.
const lastRoundLabel = computed(() => {
  if (!lastRound.value) return ''
  const { playerAction, enemyAction, playerHit, enemyHit, playerBlocked, enemyBlocked, counterHit } = lastRound.value
  const actions = `You ${actionLabel(playerAction)}, they ${actionLabel(enemyAction)} — `
  if (playerHit && enemyHit) return `${actions}you both landed a hit!`
  if (playerHit) return `${actions}you took a hit!`
  if (enemyHit) return `${actions}you landed a hit!`
  // counterHit (see resolveRound's own comment, server-side) means the block ALSO chipped the
  // enemy for guaranteed damage, on top of the ordinary heal — a materially better outcome than
  // a plain block, worth its own line rather than folding into the "healed 1 HP" copy below.
  if (playerBlocked && counterHit) return `${actions}you blocked it, healed 1 HP, and countered for damage!`
  if (playerBlocked) return `${actions}you blocked it and healed 1 HP!`
  if (enemyBlocked) return `${actions}they blocked it and healed 1 HP!`
  return `${actions}no hits landed.`
})
const lastRoundClass = computed(() => {
  if (!lastRound.value) return ''
  const { playerHit, enemyHit, playerBlocked } = lastRound.value
  // cbc- (not cbp-) — these classes are applied inside CMoonBattleCard.vue, which owns them.
  if (enemyHit && !playerHit) return 'cbc-round-good'
  if (playerHit && !enemyHit) return 'cbc-round-bad'
  if (playerBlocked) return 'cbc-round-good'
  return 'cbc-round-neutral'
})

const resultTitle = computed(() => {
  if (battle.value?.outcome === 'WIN') return 'Victory!'
  if (battle.value?.outcome === 'ABANDONED') return 'Battle ended'
  // See CMoonEnemyBattleOutcome.UNCREDITED's own schema comment: the enemy is genuinely dead,
  // just not by this player's own hand — "Defeated" (implying THEY lost) would be a flat lie.
  if (battle.value?.outcome === 'UNCREDITED') return 'Bounty claimed — by someone else'
  return 'Defeated'
})
const resultTitleClass = computed(() => {
  // cbc- (not cbp-) — applied inside CMoonBattleCard.vue, which owns the result title element.
  if (battle.value?.outcome === 'WIN') return 'cbc-title-win'
  if (battle.value?.outcome === 'LOSS') return 'cbc-title-loss'
  return ''
})
const rewardsList = computed(() => {
  const rewards = Array.isArray(battle.value?.rewardsGranted) ? battle.value.rewardsGranted : []
  return rewards.map(r => {
    if (r.type === 'CTOON') return `${r.name || 'cToon'}${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'AVATAR') return `Avatar${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'POINTS') return `${r.quantity} points`
    return `Background${r.quantity > 1 ? ` x${r.quantity}` : ''}`
  })
})

// A won-by-a-hair or lost-while-nearly-finishing-them-off flavor line — purely narrative, reads
// straight off numbers the result screen already has. "Nearly" for a loss is read off the
// enemy's OWN maxHp (not a fixed HP amount) since enemies span a huge HP range (see
// CMoonEnemyMember.maxHp's own schema comment, 1-500) — a flat "enemy had <=1 HP left" would
// almost never fire for a high-HP boss.
const nearMissFlavor = computed(() => {
  if (!battle.value) return ''
  if (battle.value.outcome === 'WIN' && (battle.value.playerHpRemaining ?? 99) <= 1) {
    return 'Clutch win — you barely made it out!'
  }
  if (battle.value.outcome === 'LOSS') {
    const max = battle.value.enemy?.maxHp || 1
    const remaining = battle.value.enemyHpRemaining ?? max
    if (remaining > 0 && remaining / max <= 0.15) return 'So close! The enemy was nearly down.'
  }
  return ''
})

// ── Overkill flavor — a one-shot "that hit did way more than was needed" line, set the instant a
// round brings enemyHpRemaining from a nonzero value down to exactly 0 for MORE than was actually
// left. Derived entirely from this battle's own enemyHpRemaining transition (watch's own before/
// after snapshot) and the round that just landed — nothing new sent by the server. In the narrow
// SHARED_POOL race where a DIFFERENT player's own hit is what really finished the pool off in the
// same instant this round's local snapshot still read it above 0, this can occasionally credit a
// bigger "overkill" number than this player's own hit actually contributed — a purely cosmetic
// mislabel (it never changes any reward/credit decision, those are decided server-side off the
// real atomic UPDATE, not this) — same class of edge case as a stale 409 reload pairing this
// transition with an unrelated earlier round's own lastRound data (see the resultFlash comment
// below, which already accepts exactly that risk for its own win/loss read). Reset to 0 at the
// start of every fresh battle, see the FIGHT branch of the phase watcher further down. ─────────
const overkillAmount = ref(0)
watch(() => battle.value?.enemyHpRemaining, (newHp, oldHp) => {
  if (newHp === 0 && oldHp > 0 && lastRound.value?.enemyHit && lastRound.value.enemyDamage > oldHp) {
    overkillAmount.value = lastRound.value.enemyDamage - oldHp
  }
})
const overkillFlavor = computed(() => {
  return overkillAmount.value > 0 ? `OVERKILL! That hit dealt ${overkillAmount.value} more damage than needed.` : ''
})

// ── Result-screen flash: a brief full-bleed tint the instant the battle resolves — green for a
// win, red for a loss, nothing for an abandoned fight (no real outcome to react to). One-shot per
// resolution, driven off the phase transition itself rather than a lastRound watch, since the
// RESULT screen can also be reached straight from a 409 state-reload (see submitAction's own
// catch block) where lastRound may already be stale. ──────────────────────────────────────────
const resultFlash = ref('')
let resultFlashTimer = null
watch(phase, (p) => {
  // UNCREDITED (see that outcome's own schema comment) is neither a win nor a loss from this
  // player's perspective — excluded here the same way ABANDONED already is, so it never flashes
  // red as if they'd been defeated.
  if (p === 'RESULT' && battle.value?.outcome && battle.value.outcome !== 'ABANDONED' && battle.value.outcome !== 'UNCREDITED') {
    resultFlash.value = battle.value.outcome === 'WIN' ? 'win' : 'loss'
    if (resultFlashTimer) clearTimeout(resultFlashTimer)
    resultFlashTimer = setTimeout(() => { resultFlash.value = '' }, 500)
  }
})

// ── Impact feedback: a brief shake on any round with a landed hit, a bigger one on a critical —
// see rollHitDamage's own comment server-side for what counts as a crit. Respects
// prefers-reduced-motion via the .cbp-shake/.cbp-shake-crit rules' own media query, same
// discipline pages/newsite/asteroid.vue's canvas shake already follows for its impact feedback.
const shaking = ref(false)
const shakeCrit = ref(false)
let shakeTimer = null
function triggerShake(isCrit) {
  if (shakeTimer) clearTimeout(shakeTimer)
  shaking.value = false
  shakeCrit.value = false
  // Re-triggering the CSS animation needs a fresh frame between removing and re-adding the class
  // (setting `shaking` true again on an already-true value is a no-op to Vue/the DOM either way).
  requestAnimationFrame(() => {
    shakeCrit.value = !!isCrit
    shaking.value = true
    shakeTimer = setTimeout(() => { shaking.value = false }, 450)
  })
}
watch(lastRound, (round) => {
  if (!round) return
  if (round.playerHit || round.enemyHit) triggerShake(round.playerCrit || round.enemyCrit)
})

// ── Floating damage numbers — a transient "-N" popping off whichever HP indicator just took a
// hit, bigger/gold on a crit (see server/utils/cmoonEnemyBattle.js's resolveRound, which now
// sends playerDamage/enemyDamage alongside the existing hit/crit booleans specifically for this).
// A plain array of short-lived entries rather than a single "last damage" ref, since a round can
// hit both sides at once and each needs its own independent pop/fade. ────────────────────────
const floatingDamage = ref([])
let floatingDamageSeq = 0
const FLOATING_DAMAGE_LIFETIME_MS = 900
watch(lastRound, (round) => {
  if (!round) return
  // enemyDamage > 0 alone is enough — it's only ever nonzero when EITHER enemyHit is true OR a
  // block landed a counter-hit (see resolveRound's own comment, server-side: those two cases are
  // mutually exclusive by construction), so this also correctly pops the number for a counter,
  // not just an ordinary landed attack.
  if (round.enemyDamage > 0) {
    const id = ++floatingDamageSeq
    floatingDamage.value.push({ id, side: 'enemy', amount: round.enemyDamage, crit: round.enemyCrit })
    setTimeout(() => { floatingDamage.value = floatingDamage.value.filter(d => d.id !== id) }, FLOATING_DAMAGE_LIFETIME_MS)
  }
  if (round.playerHit && round.playerDamage > 0) {
    const id = ++floatingDamageSeq
    floatingDamage.value.push({ id, side: 'player', amount: round.playerDamage, crit: round.playerCrit })
    setTimeout(() => { floatingDamage.value = floatingDamage.value.filter(d => d.id !== id) }, FLOATING_DAMAGE_LIFETIME_MS)
  }
})
const enemyFloatingDamage = computed(() => floatingDamage.value.filter(d => d.side === 'enemy'))
const playerFloatingDamage = computed(() => floatingDamage.value.filter(d => d.side === 'player'))

// ── Combo callout — a transient "Nx HIT STREAK!" every time playerHitStreak actually climbs
// (never on a reset to 0, and never re-fired by an unrelated re-render of the same value, hence
// watching the number itself rather than deriving off lastRound). Mirrors the existing special-
// attack meter's own 0/1/2/3 reading (see specialFillStyle above) — same data, a more visceral
// presentation of it. ───────────────────────────────────────────────────────────────────────
const comboCallout = ref('')
let comboTimer = null
watch(() => battle.value?.playerHitStreak || 0, (streak, prevStreak) => {
  if (streak > 0 && streak > (prevStreak || 0)) {
    comboCallout.value = `${streak}x HIT STREAK!`
    if (comboTimer) clearTimeout(comboTimer)
    comboTimer = setTimeout(() => { comboCallout.value = '' }, 1200)
  }
})

// ── Enemy-special warning — a pulse on the enemy portrait once enemyHitStreak reaches 2/3 (one
// hit away from HIT_STREAK_THRESHOLD firing their faction's special automatically, see
// action.post.js's own enemyHitStreak bookkeeping), telegraphing it a round ahead rather than it
// just happening. Only meaningful when this enemy actually HAS a special assigned at all — see
// enemyHasSpecialAttack's own comment server-side for why that's a bare boolean, nothing more. ──
const HIT_STREAK_THRESHOLD = 3
const enemySpecialWarning = computed(() => {
  return !!battle.value?.enemyHasSpecialAttack && (battle.value?.enemyHitStreak || 0) >= HIT_STREAK_THRESHOLD - 1
})

// ── FINAL_BOSS entrance punch — a one-shot full-bleed flash + a bigger modal "pop" exactly when a
// Final-Boss-rank enemy is first revealed on the OFFER screen (never on a resumed battle, since
// that skips OFFER entirely — see useCMoonBattlePopup.js's checkOnNavigate). Keyed off the
// combined (phase === 'OFFER' && visible) id rather than a bare enemy watch, so this can never
// re-fire while the SAME offer is still on screen (e.g. an unrelated reactive re-render). ──────
const bossIntro = ref(false)
let bossIntroTimer = null
function triggerBossIntro() {
  if (bossIntroTimer) clearTimeout(bossIntroTimer)
  bossIntro.value = true
  bossIntroTimer = setTimeout(() => { bossIntro.value = false }, 900)
}
watch(() => (phase.value === 'OFFER' && visible.value) ? enemy.value?.id : null, (id) => {
  if (id && enemy.value?.rank === 'FINAL_BOSS') triggerBossIntro()
})

// ── Victory confetti — a fixed, tiny burst of CSS-animated pieces the instant a WIN reaches the
// RESULT screen (never for UNCREDITED/ABANDONED/LOSS). A plain transient array, same convention
// floatingDamage above already follows: populated once, then cleared by its own timeout rather
// than left in the DOM past its animation. ───────────────────────────────────────────────────
const confettiPieces = ref([])
let confettiTimer = null
let confettiSeq = 0
const CONFETTI_COLORS = ['#facc15', '#4ade80', '#60a5fa', '#f87171', '#c084fc']
const CONFETTI_LIFETIME_MS = 1400
function spawnConfetti() {
  const pieces = []
  for (let i = 0; i < 14; i++) {
    pieces.push({
      id: ++confettiSeq,
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 250),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })
  }
  confettiPieces.value = pieces
  if (confettiTimer) clearTimeout(confettiTimer)
  confettiTimer = setTimeout(() => { confettiPieces.value = [] }, CONFETTI_LIFETIME_MS + 300)
}
watch(phase, (p) => {
  if (p === 'RESULT' && battle.value?.outcome === 'WIN') spawnConfetti()
})

// ── Battle music: one faction-wide looping track, playing for as long as the FIGHT phase is
// showing (never during OFFER/RESULT) — see CMoonEnemyFaction.battleMusicPath's own schema
// comment. A plain HTMLAudioElement rather than the Web Audio API buffers useClickSoundEffects.js
// uses: this is one long-running loop, not many short overlapping one-shots, so there's nothing
// to gain from pre-decoding into a reusable AudioBuffer.
let battleMusicEl = null
function stopBattleMusic() {
  if (!battleMusicEl) return
  try { battleMusicEl.pause() } catch {}
  battleMusicEl = null
}
function startBattleMusic(path) {
  stopBattleMusic()
  if (!path || typeof window === 'undefined') return
  try {
    battleMusicEl = new Audio(path)
    battleMusicEl.loop = true
    battleMusicEl.volume = 0.5
    battleMusicEl.play().catch(() => {})
  } catch {}
}
watch(phase, (p) => {
  if (p === 'FIGHT') { startBattleMusic(battle.value?.enemy?.faction?.battleMusicPath); overkillAmount.value = 0 }
  else { stopBattleMusic(); showSpecialInfo.value = false }
})
onBeforeUnmount(() => {
  stopBattleMusic()
  if (shakeTimer) clearTimeout(shakeTimer)
  if (comboTimer) clearTimeout(comboTimer)
  if (resultFlashTimer) clearTimeout(resultFlashTimer)
  if (bossIntroTimer) clearTimeout(bossIntroTimer)
  if (confettiTimer) clearTimeout(confettiTimer)
})

async function onFight() {
  if (enemy.value?.isRaidBoss) {
    const raidSocket = useCMoonRaidSocket()
    raidSocket.lastError.value = ''
    raidSocket.raidState.value = null // clear any stale raid from a previous visit before watching
    raidSocket.startRaid(enemy.value.id, { isPrivate: isPrivateRaid.value })
    decline() // the raid page takes over from here
    const router = useRouter()
    const stopWatching = watch([raidSocket.raidState, raidSocket.lastError], ([state, err]) => {
      if (state?.id) {
        stopWatching()
        router.push(`/newsite/cmoon-raid/${state.id}`)
      } else if (err) {
        stopWatching()
        // The popup is already closed at this point — a raid-start failure (feature disabled,
        // not eligible, enemy no longer available) surfaces as a plain alert rather than
        // resurrecting a dismissed modal just to show one error line.
        window.alert(err)
      }
    })
    return
  }
  await startBattle()
}

async function act(action) {
  await submitAction(action)
}

function onClose() {
  if (phase.value === 'OFFER') decline()
  else close()
}

// Client-only, deliberately not `{ immediate: true }` on a bare top-level watch: this component
// is unconditionally in the layout, so a top-level immediate watch would also run during SSR
// (every component's setup() executes server-side too) — an extra server-side roll against
// /api/cmoon/battle/consider on every full page load, on top of the one this onMounted below
// fires once hydration completes, effectively giving a cold load double the configured chance.
// onMounted never runs during SSR, so this fires exactly once per real page view: on mount for
// the first load, then again on each subsequent client-side route change below.
function maybeCheck() {
  if (isAdminRoute.value) return
  checkOnNavigate()
}
onMounted(maybeCheck)
watch(() => route.path, maybeCheck)
</script>

<style scoped>
.cbp-overlay {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 20, 50, 0.75);
}

/* Result-screen flash — a brief full-bleed tint the instant the battle resolves (see resultFlash
   above), layered under the modal (z-index below it is unnecessary since the modal paints after
   it in DOM order) and never intercepting clicks. */
.cbp-result-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: cbp-result-flash-fade 0.5s ease-out forwards;
}
.cbp-result-flash-win { background: radial-gradient(circle, rgba(74, 222, 128, 0.35), transparent 70%); }
.cbp-result-flash-loss { background: radial-gradient(circle, rgba(248, 113, 113, 0.35), transparent 70%); }
@keyframes cbp-result-flash-fade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-result-flash { animation: none; display: none; }
}
/* Dark-navy-card-with-OrbitDarkBlue-border is this site's own "on-brand" dialog language (see
   components/newsite/CtoonInfoCard.vue, the cToon info dialog) — reused here instead of this
   popup's old plain-white/indigo palette so it reads as the same product rather than a bolted-on
   mini-game. */
.cbp-modal {
  position: relative;
  width: 100%;
  max-width: 380px;
  max-height: 92vh;
  overflow-y: auto;
  background: #0d2a4d;
  color: #fff;
  border: 2px solid var(--OrbitDarkBlue);
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

/* FINAL_BOSS entrance punch — a bigger, redder full-bleed flash than the ordinary win/loss one
   above (same layering: painted before the modal in DOM order, so it sits behind it), plus a
   quick zoom-in "pop" on the modal itself (see bossIntro/cbp-boss-modal-pop above). */
.cbp-boss-intro-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle, rgba(220, 38, 38, 0.5), rgba(0, 0, 0, 0.6) 75%);
  animation: cbp-boss-intro-fade 0.9s ease-out forwards;
}
@keyframes cbp-boss-intro-fade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-boss-intro-flash { animation: none; display: none; }
}
.cbp-boss-modal-pop { animation: cbp-boss-modal-pop-kf 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28) both; }
@keyframes cbp-boss-modal-pop-kf {
  0% { transform: scale(0.85); }
  60% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-boss-modal-pop { animation: none; }
}

/* Standing "enemy special is about to fire" vignette — extends the existing portrait-only warning
   ring (.cbc-portrait-warning in CMoonBattleCard.vue, driven by the portraitWarning prop) to the
   whole card, confined to the modal's own box (position: relative set above) rather than the full
   viewport. */
.cbp-enrage-vignette {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  box-shadow: inset 0 0 50px 14px rgba(220, 38, 38, 0.4);
  animation: cbp-enrage-pulse 1s ease-in-out infinite;
}
@keyframes cbp-enrage-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-enrage-vignette { animation: none; opacity: 0.7; }
}

/* Victory confetti — a fixed burst of small falling rectangles, confined to the modal's own box
   (see confettiPieces above). Auto-removed from the DOM by its own JS timer once the fall/fade
   animation below has had time to finish. */
.cbp-confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 2;
}
.cbp-confetti-piece {
  position: absolute;
  top: -10px;
  width: 6px;
  height: 12px;
  opacity: 0.9;
  animation: cbp-confetti-fall 1.4s ease-in forwards;
}
@keyframes cbp-confetti-fall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(240px) rotate(540deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-confetti { display: none; }
}
.cbp-banner {
  position: relative;
  height: 64px;
  background: linear-gradient(135deg, #1a4a7a, #0a1f3a);
  background-size: cover;
  background-position: center;
  border-radius: 6px 6px 0 0;
}
.cbp-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.cbp-body {
  padding: 14px 16px 18px;
  text-align: center;
}
.cbp-portrait-wrap {
  /* .cbp-banner is `position: relative` (so its own .cbp-close button can anchor to it), which —
     regardless of DOM order — makes it paint ABOVE any plain in-flow (position: static) sibling
     content per the CSS stacking rules: positioned elements always paint after static ones within
     the same stacking context. This wrap's negative top margin is deliberately designed to overlap
     the banner (a profile-picture-over-a-cover-photo layout), so without its own position + z-index
     the banner was painting on top of exactly that overlapping region — silently hiding the top of
     whatever portrait art was tall enough to reach up that far (e.g. a character's head), even
     though the box/mask/sizing themselves were never clipping it at all. z-index 1 is enough since
     .cbp-banner never sets one of its own (auto, which paints like z-index 0 here).
  */
  position: relative;
  z-index: 1;
  width: 96px;
  height: 96px;
  margin: -50px auto 6px;
  /* NOT a circle (border-radius: 50%, as this used to be): the upload endpoint
     (server/api/admin/cmoon-enemy-members/[id]/image.post.js) deliberately letterboxes every
     portrait into a full 600x600 *square* with `fit: 'contain'` specifically so a character is
     never cropped — "must never lose a head or a tail to cropping". A square that large can't be
     inscribed in a circle this size (a square's corner-to-corner diagonal is ~1.41x its side, well
     past a circle's diameter at any square wide enough to look properly framed), so the circular
     mask was cropping exactly the corners the upload step went out of its way to preserve — e.g.
     clipping a character's shoulders or outstretched arms. A rounded square has no such geometry
     problem: the full contained image is always visible regardless of the art's own aspect ratio.
  */
  border-radius: 18px;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* Idle "breathing" loop — a near-imperceptible scale pulse so a static portrait never reads as a
   flat, dead image even between rounds. Pure CSS, applies on both the OFFER and FIGHT screens. */
.cbp-portrait { max-width: 92%; max-height: 92%; object-fit: contain; animation: cbp-portrait-breathe 3.2s ease-in-out infinite; }
@keyframes cbp-portrait-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.035); }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-portrait { animation: none; }
}
.cbp-title { font-size: 1.1rem; font-weight: 600; margin: 4px 0 2px; color: #fff; }
.cbp-sub { font-size: 0.78rem; color: rgba(255, 255, 255, 0.6); margin-bottom: 8px; }
.cbp-flavor { font-size: 12px; color: rgba(255, 255, 255, 0.75); margin-bottom: 12px; line-height: 1.4; }
.cbp-private-raid-check {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.75);
  margin-bottom: 12px;
  line-height: 1.4;
  cursor: pointer;
}
.cbp-private-raid-check input { margin-top: 2px; flex-shrink: 0; }
/* Reward-pity progress — a quiet gold-tinted aside on the OFFER screen only, same family as the
   result screen's own cbp-first-win/cbp-near-miss asides but intentionally less loud (this is a
   helpful hint, not a celebration). */
.cbp-pity-progress {
  font-size: 11.5px;
  font-style: italic;
  color: #fde68a;
  margin: 0 0 10px;
}
/* Shared-pool "boss enrage" banner — OFFER screen only, see bossEnrageText above. More urgent
   than the pity-progress aside above it (red, not gold), since it's time-sensitive community
   info, not a personal hint. */
.cbp-boss-enrage {
  font-size: 11.5px;
  font-weight: 700;
  color: #fca5a5;
  margin: 0 0 10px;
}
/* Admin-authored enemy taunt line (see CMoonEnemyTaunt's own schema comment) — styled as a quoted
   speech-bubble aside, distinct from both the plain .cbp-flavor copy and the red/green round
   summary, since it's the enemy's own "voice" rather than a system message. */
.cbp-taunt {
  font-size: 12.5px;
  font-style: italic;
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.3);
  border-radius: 6px;
  padding: 6px 10px;
  margin: 0 0 10px;
  animation: cbp-taunt-pop 0.3s ease-out;
}
@keyframes cbp-taunt-pop {
  0% { transform: translateY(-4px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-taunt { animation: none; }
}
.cbp-error { font-size: 12px; color: #f87171; margin-bottom: 8px; }

.cbp-actions { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.cbp-btn-wide { width: 100%; padding-top: 9px; padding-bottom: 9px; font-size: 0.95rem; }
/* Red "dismiss/close" action, matching CtoonInfoCard.vue's own .ctic-close-action — this site's
   existing convention for a secondary/destructive dialog action, since there's no shared
   RedButton component to import (only BlueButton/GreenButton exist). */
.cbp-btn-secondary {
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
.cbp-btn-secondary:hover { background: #991b1b; }
.cbp-btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }

/* Floating damage numbers — anchored to their own .cbc-hp-row (position: relative, defined in
   CMoonBattleCard.vue, which owns that element; these spans are slotted into it — see the
   enemy-dmg-float/player-dmg-float templates above), so one pops over the enemy bar and the
   other over the player's bar independently. Pure CSS pop-up-and-fade, auto-removed from the DOM
   by the JS timer in the script block once the animation has had time to finish. */
.cbp-dmg-float {
  position: absolute;
  right: 44px;
  top: -2px;
  font-size: 13px;
  font-weight: 800;
  color: #f87171;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  animation: cbp-dmg-float-up 0.9s ease-out forwards;
}
.cbp-dmg-float-crit { font-size: 17px; color: #fbbf24; }
@keyframes cbp-dmg-float-up {
  0% { transform: translateY(4px); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-26px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-dmg-float { animation: none; opacity: 0; }
}

.cbp-paralyzed-badge {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 6px;
  padding: 5px 8px;
  margin: 8px 0 0;
}
/* The warning RING itself (pulsing box-shadow on the portrait) lives in CMoonBattleCard.vue now
   (.cbc-portrait-warning, driven by the portraitWarning prop below) — this badge icon is the only
   piece of that warning still authored here, since it's passed through the portrait-badge slot. */
.cbp-warning-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #fbbf24;
  color: #1a1200;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

/* Combo callout — pops once per playerHitStreak increase (see the watcher above), separate from
   the plain round-summary line so a streak reads as its own escalating moment. */
.cbp-combo-callout {
  font-size: 15px;
  font-weight: 800;
  color: #facc15;
  text-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
  text-align: center;
  margin: 4px 0;
  animation: cbp-combo-pop 0.4s ease-out;
}
@keyframes cbp-combo-pop {
  0% { transform: scale(0.7); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-combo-callout, .cbp-overkill { animation: none; }
}

/* Cosmetic difficulty tier badge — see CMoonEnemyRank's own schema comment. Colors escalate
   low-to-high, matching the admin page's own RANK_BADGE_CLASS palette. */
.cbp-rank-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  vertical-align: middle;
}
.cbp-rank-GOON { background: rgba(255, 255, 255, 0.15); color: rgba(255, 255, 255, 0.85); }
.cbp-rank-ENFORCER { background: #1d4ed8; color: #dbeafe; }
.cbp-rank-UNDERBOSS { background: #7e22ce; color: #f3e8ff; }
.cbp-rank-FINAL_BOSS { background: #b91c1c; color: #fee2e2; }

/* ── Special attack button ────────────────────────────────────────────────────────────────
   Dormant (flat, muted) until charged, then lights up gold/epic. --cbp-special-fill (set inline
   via specialFillStyle) drives a bottom-up gradient fill so the meter visibly climbs with each
   consecutive hit, independent of the charged-glow treatment below. */
.cbp-special-wrap { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.cbp-special-btn {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid #4b4620;
  background:
    linear-gradient(to top, rgba(250, 204, 21, 0.55) 0%, rgba(250, 204, 21, 0.55) var(--cbp-special-fill, 0%), transparent var(--cbp-special-fill, 0%)),
    #241f0f;
  color: rgba(255, 255, 255, 0.55);
  font-weight: bold;
  font-size: 12.5px;
  text-align: left;
  cursor: not-allowed;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.cbp-special-btn:disabled { opacity: 0.85; }
.cbp-special-label { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; }
.cbp-special-icon { font-size: 13px; filter: grayscale(1); transition: filter 0.2s ease; }
.cbp-special-meter {
  position: relative; z-index: 1;
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}
.cbp-special-glow { position: absolute; inset: 0; z-index: 0; opacity: 0; transition: opacity 0.3s ease; }

/* Charged: gold border, bright icon, pulsing glow sweep — unmistakably "ready to use". */
.cbp-special-charged {
  border-color: #facc15;
  color: #fef3c7;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(250, 204, 21, 0.55), inset 0 0 10px rgba(250, 204, 21, 0.25);
  animation: cbp-special-pulse 1.4s ease-in-out infinite;
}
.cbp-special-charged .cbp-special-icon { filter: none; text-shadow: 0 0 6px #facc15; }
.cbp-special-charged .cbp-special-meter { color: #fef3c7; }
.cbp-special-charged .cbp-special-glow {
  opacity: 1;
  background: radial-gradient(circle at 30% 50%, rgba(255, 237, 160, 0.35), transparent 70%);
}
.cbp-special-charged:active { transform: translateY(1px); }
@keyframes cbp-special-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(250, 204, 21, 0.45), inset 0 0 8px rgba(250, 204, 21, 0.2); }
  50% { box-shadow: 0 0 20px rgba(250, 204, 21, 0.85), inset 0 0 14px rgba(250, 204, 21, 0.4); }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-special-charged { animation: none; }
}

.cbp-special-help {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}
.cbp-special-help:hover { background: rgba(255, 255, 255, 0.18); }
.cbp-special-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 220px;
  z-index: 10;
  text-align: left;
  background: #0a1f3a;
  border: 1px solid var(--OrbitDarkBlue);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cbp-special-tooltip-title { font-weight: 800; color: #facc15; margin-bottom: 3px; }
.cbp-special-tooltip-charge { color: rgba(255, 255, 255, 0.55); margin-top: 4px; }

.cbp-special-flash {
  font-size: 12px;
  font-weight: 700;
  margin: 4px 0;
  animation: cbp-special-flash-pop 0.4s ease-out;
}
.cbp-special-flash-player { color: #facc15; }
.cbp-special-flash-enemy { color: #fb7185; }
@keyframes cbp-special-flash-pop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cbp-special-flash { animation: none; }
}

.cbp-first-win {
  font-size: 13px;
  font-weight: 800;
  color: #fef3c7;
  background: rgba(250, 204, 21, 0.18);
  border: 1px solid rgba(250, 204, 21, 0.45);
  border-radius: 6px;
  padding: 5px 10px;
  margin: 0 0 8px;
  animation: cbp-combo-pop 0.4s ease-out;
}
.cbp-near-miss { font-size: 12px; font-style: italic; color: rgba(255, 255, 255, 0.65); margin: 0 0 10px; }
/* Overkill flavor — reuses the combo-callout's own pop-in keyframe (see overkillAmount above),
   just in the result-screen's gold-on-dark palette instead of that one's plain text color. */
.cbp-overkill {
  font-size: 12.5px;
  font-weight: 800;
  color: #fbbf24;
  text-shadow: 0 0 6px rgba(251, 191, 36, 0.5);
  margin: 0 0 10px;
  animation: cbp-combo-pop 0.4s ease-out;
}

/* Impact feedback on a landed hit — a quick horizontal shake, bigger for a critical. Disabled
   under prefers-reduced-motion, same accessibility stance pages/newsite/asteroid.vue's own
   (JS-driven) screen shake takes. */
@keyframes cbp-shake-kf {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
@keyframes cbp-shake-crit-kf {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}
.cbp-shake { animation: cbp-shake-kf 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
.cbp-shake-crit { animation: cbp-shake-crit-kf 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@media (prefers-reduced-motion: reduce) {
  .cbp-shake, .cbp-shake-crit { animation: none; }
}
</style>
