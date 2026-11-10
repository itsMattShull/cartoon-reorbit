<template>
  <NuxtLayout name="newsite-template">
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <div v-if="!raid" class="bg-white rounded border p-4 text-sm text-gray-500">
        {{ raidSocket.lastError.value || 'Loading raid…' }}
      </div>

      <template v-else>
        <div
          class="cr-card bg-white rounded border p-4 space-y-3"
          :class="{ 'cr-result-flash-win': resultFlash === 'win', 'cr-result-flash-loss': resultFlash === 'loss' }"
        >
          <div class="flex items-center gap-3">
            <div class="w-16 h-16 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
              <img v-if="raid.enemyImagePath" :src="raid.enemyImagePath" alt="" class="max-w-full max-h-full object-contain" />
              <span v-else class="text-gray-400 text-[10px]">No art</span>
            </div>
            <div class="min-w-0">
              <h1 class="font-bold text-lg break-words">{{ raid.enemyName }}</h1>
              <p class="text-xs text-gray-500">
                Raid boss · {{ raid.participants.length }}/{{ raid.maxParticipants }} joined
                <span v-if="raid.isPrivate"> · 🔒 Private</span>
              </p>
            </div>
          </div>

          <!-- One-time, purely cosmetic "epic" moment when a cMoon captain is in the party — see
               the watch(raid, ...) below for the trigger and CMoonRaidFighter.vue for the
               persistent glow/badge treatment this banner announces. No gameplay effect. -->
          <Transition name="cr-reveal">
            <p v-if="captainEntranceBanner" class="cr-captain-banner">{{ captainEntranceBanner }}</p>
          </Transition>

          <!-- Captain boost overlay — distinct from the one-time entrance banner above: this stays
               up for the WHOLE lobby (not just a few seconds) and only fades once the raid actually
               starts (see showCaptainBoostOverlay's own comment), rather than on a fixed timer. The
               lowered hit-streak threshold itself keeps applying for the rest of the raid — only
               this overlay is lobby-scoped. -->
          <Transition name="cr-boost-fade">
            <p v-if="showCaptainBoostOverlay" class="cr-boost-overlay">Captain present! Players boosted!</p>
          </Transition>

          <!-- AFK kick banner — for whoever's LEFT in the raid (the kicked player themselves never
               sees this: their own socket gets cmoonraid:kicked instead, which clears `raid`
               straight to the "Loading raid…"/lastError screen above). A few seconds, then gone,
               same timed-banner shape as the captain entrance banner above. -->
          <Transition name="cr-reveal">
            <p v-if="afkKickBanner" class="cr-kick-banner">{{ afkKickBanner }}</p>
          </Transition>

          <div v-if="raid.isPrivate" class="cr-private-row">
            <span>🔒 Private raid — only reachable via this page's own link.</span>
            <button type="button" class="cr-link-btn" @click="copyInviteLink">{{ inviteLinkCopied ? 'Copied!' : 'Copy invite link' }}</button>
          </div>

          <!-- Every cMoon in this party, in its own colors — raids are cross-cMoon, so this is
               the "who's representing" banner. Only shown once more than one team is in. -->
          <div v-if="teams.length > 1" class="cr-teams" aria-label="cMoons in this raid">
            <span class="cr-teams-lead">{{ teams.length }} cMoons united</span>
            <span v-for="t in teams" :key="t.id" class="cr-team-chip" :style="cMoonPillStyle(t.color)">
              {{ t.name }}<span v-if="t.count > 1" class="cr-team-count"> ×{{ t.count }}</span>
            </span>
          </div>

          <div class="space-y-1">
            <div class="flex items-center gap-2 text-xs relative">
              <span class="w-14 flex-shrink-0 text-gray-500">Boss HP</span>
              <div class="flex-1 h-2.5 bg-gray-200 rounded overflow-hidden">
                <div class="h-full transition-all" :class="enemyHpFillClass" :style="{ width: enemyHpPercent + '%' }"></div>
              </div>
              <span class="w-16 flex-shrink-0 text-right tabular-nums">{{ raid.enemyHpRemaining }}/{{ raid.enemyMaxHp }}</span>
              <span v-for="d in enemyFloatingDamage" :key="d.id" class="cr-dmg-float" :class="{ 'cr-dmg-float-crit': d.crit }">-{{ d.amount }}</span>
            </div>
          </div>

          <!-- Fixed-height reserved slot, not a flow-height one — a taunt can pop up mid-fight
               (the CRIT taunt below) or clear again, and an action error can appear/disappear
               between rounds; either one appearing/disappearing in ordinary flow would grow or
               shrink this spot and shove everything below it — including the IN_PROGRESS action
               buttons further down this same card — up or down by that amount, which is exactly
               the "text showing up moves the buttons" misclick bug reported in prod. A reserved
               box this neither one can ever resize (scrolling internally on the rare round where
               both are showing at once and together overflow it) is what actually fixes that,
               same reasoning as the two more .cr-*-zone slots further down for this same raid's
               wind-up banner and status badges, and the one right above the buttons themselves
               for this exact same lastError value shown a second time. Plain `overflow-y: auto`
               with an explicit height, not `:has()`/container queries/anything newer — this needs
               to hold on every browser this site is asked to run in, phones included. -->
          <div class="cr-notice-zone">
            <p v-if="currentTaunt" class="cr-taunt">&ldquo;{{ currentTaunt }}&rdquo;</p>
            <p v-if="raidSocket.lastError.value" class="text-sm text-red-600">{{ raidSocket.lastError.value }}</p>
          </div>

          <!-- ── FORMING: roster + join countdown + lobby controls ───────────── -->
          <div v-if="raid.status === 'FORMING'" class="space-y-3">
            <p class="text-sm text-gray-600">
              <template v-if="raid.leaderKeepOpen">The raid leader is keeping the lobby open.</template>
              <template v-else>Joining closes in <span class="font-semibold tabular-nums">{{ joinCountdown }}s</span></template>
              — up to {{ raid.maxParticipants }} players from any cMoon can fight this boss together, each earning
              points for their own cMoon.
            </p>
            <ul class="cr-roster">
              <li v-for="p in raid.participants" :key="p.userId">
                <CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" />
              </li>
              <li v-for="n in Math.max(0, raid.maxParticipants - raid.participants.length)" :key="`open-${n}`" class="cr-roster-open">Open slot</li>
            </ul>
            <button
              v-if="!hasJoined" type="button"
              class="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              :disabled="raid.participants.length >= raid.maxParticipants" @click="raidSocket.joinRaid(raidId)"
            >Join raid</button>
            <template v-else>
              <p class="text-sm text-green-700 font-medium">You're in — waiting for the fight to start…</p>
              <!-- Leave before combat starts — works for anyone, including the initiator, without
                   touching their raid cooldown (see cmoonraid:leave's own cooldown-restore comment
                   in cmoonRaidSocket.js for the initiator's own case specifically). Lets someone
                   bail on a lobby that's taking too long rather than sitting in it. -->
              <button type="button" class="cr-link-btn text-red-600" @click="leaveRaidAndGoHome">Leave raid</button>
            </template>

            <!-- Leader-only lobby controls. -->
            <div v-if="isInitiator" class="cr-lobby-controls">
              <label class="cr-keepopen-toggle">
                <input type="checkbox" :checked="raid.leaderKeepOpen" @change="raidSocket.toggleKeepOpen(raidId, $event.target.checked)" />
                Keep lobby open past the usual window
              </label>
              <!-- Disabled rather than hidden while solo (see raid.soloQueueEnabled's own
                   comment) — same reasoning as a disabled button elsewhere on this page, so the
                   leader sees WHY it's unavailable instead of wondering where it went. -->
              <button
                type="button" class="cr-link-btn" :disabled="!raid.soloQueueEnabled && raid.participants.length < 2"
                @click="raidSocket.forceStartRaid(raidId)"
              >Start now</button>
              <p v-if="!raid.soloQueueEnabled && raid.participants.length < 2" class="cr-solo-disabled-note">
                Solo queueing is disabled — at least one more player must join before you can start.
              </p>
              <!-- Grayed out until the lobby's sat open 90s with still fewer than 3 raiders — see
                   cancelRaidEnabled's own comment. A stalled lobby the leader can walk away from
                   without waiting out the full join window. -->
              <button
                type="button" class="cr-link-btn text-red-600" :disabled="!cancelRaidEnabled"
                :title="cancelRaidEnabled ? '' : 'Available once the lobby has been open 90s with fewer than 3 raiders'"
                @click="cancelRaidAndGoHome"
              >Cancel raid</button>
            </div>

            <!-- Any non-leader participant can vote to cut the countdown to 5s, once a 2/3
                 majority of non-leader participants agrees — see requiredSpeedVotes in
                 cmoonRaidSocket.js, whose denominator deliberately excludes the leader (they
                 already have "Start now" for an instant start, and never get a vote button here).
                 Requires at least 3 total raiders in the first place (speedVoteRequired is null
                 below that), so a single joiner can never immediately vote to speed-run a
                 2-person lobby the instant they arrive — the threshold itself, not just the
                 button's visibility, is server-enforced in maybeApplySpeedVote. -->
            <button
              v-if="!isInitiator && hasJoined && raid.speedVoteRequired != null && raid.participants.length < raid.maxParticipants"
              type="button" class="cr-link-btn" @click="raidSocket.voteSpeedUp(raidId)"
            >Vote to start in 5s ({{ raid.speedVoteCount }}/{{ raid.speedVoteRequired }})</button>
            <p
              v-else-if="!isInitiator && hasJoined && raid.participants.length < raid.maxParticipants"
              class="cr-solo-disabled-note"
            >At least 3 raiders are needed before the party can vote to start early.</p>
          </div>

          <!-- ── IN_PROGRESS: live combat ─────────────────────────────────── -->
          <div v-else-if="raid.status === 'IN_PROGRESS'" class="space-y-3">
            <!-- ── Shake zone: everything that's allowed to jolt on a landed hit. The action
                 buttons below are rendered OUTSIDE this element (a sibling, not a descendant),
                 so the shake transform never moves them even by a few px. The round-reveal panel,
                 hit-streak combo callout, and special-use callout are all rendered inside the
                 .cr-announce-overlay absolutely-positioned layer below, so their popping in and
                 out never changes this zone's rendered height either — between the two, nothing
                 that happens in here can ever shift where the buttons sit on screen. -->
            <div class="cr-shake-zone" :class="{ 'cr-shake': shaking, 'cr-shake-crit': shaking && shakeCrit }">
              <p class="text-xs text-gray-500">
                Round {{ raid.roundNumber }} · acting in <span class="font-semibold tabular-nums">{{ roundCountdown }}s</span>
              </p>

              <!-- Wind-up telegraph — a deliberate, narrow exception to the usual "enemy action
                   stays hidden until it resolves" rule (see raid.currentWindUp's own comment in
                   cmoonRaidSocket.js): the whole party sees this coming and can react. Reserved
                   fixed height (see .cr-notice-zone's own comment above for why) since this comes
                   and goes round to round and sits above the roster, which sits above the action
                   buttons further down. -->
              <div class="cr-windup-zone">
                <p v-if="raid.currentWindUp" class="cr-windup-banner">
                  ⚠️ {{ raid.currentWindUp.message }}
                  <span class="cr-windup-hint">Block {{ raid.currentWindUp.direction === 'HIGH' ? 'high' : 'low' }} to counter it!</span>
                </p>
              </div>

              <ul class="space-y-2">
                <li v-for="p in raid.participants" :key="p.userId" class="cr-fighter-row text-xs relative">
                  <!-- Line 1: who (team colors + rank), their special charge, and their round status. -->
                  <div class="cr-fighter-line">
                    <CMoonRaidFighter :participant="p" variant="compact" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" class="cr-fighter-badge" />
                    <!-- Teammate charge meter — shown for everyone, not just myself. Each fighter
                         charges THEIR OWN cMoon's special, so the meter only shows for players
                         whose team has one. -->
                    <span
                      v-if="p.specialAttack && !p.knockedOut" class="text-[10px] flex-shrink-0" :title="p.specialAttack.name"
                      :class="p.specialCharged ? 'cr-charge-ready' : 'text-gray-400'"
                    >★{{ p.specialCharged ? '' : Math.min(p.hitStreak, p.hitStreakThreshold || 3) + '/' + (p.hitStreakThreshold || 3) }}</span>
                    <span v-if="p.knockedOut" class="cr-fighter-status text-red-500">KO</span>
                    <span v-else-if="p.hasActed" class="cr-fighter-status text-green-600">Ready</span>
                    <span v-else class="cr-fighter-status text-gray-400">Deciding…</span>
                    <span v-if="p.poisonTurnsRemaining > 0" class="cr-fighter-status cr-status-bad" :title="`${p.poisonAmount} damage/round for ${p.poisonTurnsRemaining} more round(s)`">☠️ {{ p.poisonTurnsRemaining }}</span>
                  </div>
                  <!-- Line 2: HP, full width so it never wraps unpredictably on a phone. -->
                  <div class="cr-hp-line">
                    <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                      <div class="h-full transition-all" :class="participantHpFillClass(p)" :style="{ width: (p.hpRemaining / (p.maxHp || 1) * 100) + '%' }"></div>
                    </div>
                    <span class="w-10 flex-shrink-0 text-right tabular-nums">{{ p.hpRemaining }}/{{ p.maxHp }}</span>
                    <span
                      v-for="d in (p.userId === user?.id ? myFloatingDamage : [])" :key="d.id"
                      class="cr-dmg-float" :class="{ 'cr-dmg-float-crit': d.crit }"
                    >-{{ d.amount }}</span>
                  </div>
                </li>
              </ul>

              <!-- ── Shared status: paralysis either direction, poison, boss charge tension ────
                   Reserved fixed height (see .cr-notice-zone's own comment above) — any 0-4 of
                   these can be showing on a given round, and each one coming or going between
                   rounds would otherwise grow/shrink this spot and push the action buttons
                   further down this same card. The wrapper scrolls internally on the rare round
                   where all 4 are up at once and together overflow it, rather than ever resizing
                   itself. -->
              <div class="cr-statusbadges-zone">
                <p v-if="raid.enemyParalyzedTurns > 0" class="cr-status-badge cr-status-good">
                  ⚡ {{ raid.enemyName }} is paralyzed — {{ raid.enemyParalyzedTurns }} more round{{ raid.enemyParalyzedTurns === 1 ? '' : 's' }}
                </p>
                <p v-if="raid.partyParalyzedTurns > 0" class="cr-status-badge cr-status-bad">
                  ⚡ The party is paralyzed — can't act for {{ raid.partyParalyzedTurns }} more round{{ raid.partyParalyzedTurns === 1 ? '' : 's' }}
                </p>
                <p v-if="raid.enemyPoisonTurnsRemaining > 0" class="cr-status-badge cr-status-good">
                  ☠️ {{ raid.enemyName }} is poisoned — {{ raid.enemyPoisonAmount }} damage/round for {{ raid.enemyPoisonTurnsRemaining }} more round{{ raid.enemyPoisonTurnsRemaining === 1 ? '' : 's' }}
                </p>
                <!-- Only one attack-raise can be active for the party at a time (see
                     applyRaidSpecialAttack's own non-stacking comment) — shown so a second
                     RAISE_ALLY_ATTACK cast having no extra effect isn't a silent mystery. -->
                <p v-if="raid.partyAtkRaiseTurnsRemaining > 0" class="cr-status-badge cr-status-good">
                  💪 The party's attack is raised — {{ raid.partyAtkRaiseTurnsRemaining }} more round{{ raid.partyAtkRaiseTurnsRemaining === 1 ? '' : 's' }}
                </p>
              </div>

              <!-- ── Announcements overlay — round reveal, hit-streak combo, and special-use
                   callouts. Absolutely positioned and pointer-events:none, so appearing/
                   disappearing here never resizes .cr-shake-zone and never blocks a tap on
                   anything underneath (there's nothing clickable under it anyway). -->
              <div class="cr-announce-overlay" aria-live="polite">
                <Transition name="cr-reveal">
                  <div v-if="lastRoundSummary" :key="lastRoundSummary.roundNumber" class="cr-reveal-panel" :class="{ 'cr-reveal-crit': lastRoundSummaryHadCrit }">
                    <p class="cr-reveal-headline">
                      Round {{ lastRoundSummary.roundNumber }} — the boss used <strong>{{ ACTION_LABELS[lastRoundSummary.enemyAction] }}</strong>
                      <span v-if="lastRoundSummaryHadCrit" class="cr-crit-badge">CRITICAL!</span>
                    </p>
                    <ul class="cr-reveal-list">
                      <li v-for="r in lastRoundSummary.participants" :key="r.userId" class="cr-reveal-row" :class="revealRowClass(r)">
                        <span class="cr-reveal-name">{{ usernameFor(r.userId, r.username) }}</span>
                        <span class="cr-reveal-action">{{ ACTION_LABELS[r.action] }}</span>
                        <span class="cr-reveal-outcome">
                          <!-- `r.playerHit` alone isn't "the player actually took damage" — a
                               SHIELD_PARTY cast (or an enemyAtkBonus debuff) can zero
                               r.playerDamage while still rolling the hit true (see
                               resolveRaidRound's own partyShielded comment), so these checks
                               also require playerDamage > 0 before saying "took a hit". -->
                          <template v-if="r.playerHit && r.playerDamage > 0 && r.enemyHit">traded hits!<span v-if="r.playerCrit || r.enemyCrit" class="cr-crit-badge">CRIT!</span></template>
                          <template v-else-if="r.enemyHit">landed a hit!<span v-if="r.enemyCrit" class="cr-crit-badge">CRIT!</span></template>
                          <template v-else-if="r.playerHit && r.playerDamage > 0">took a hit<span v-if="r.playerCrit" class="cr-crit-badge">CRIT!</span></template>
                          <template v-else-if="r.playerHit">hit absorbed — no damage taken!</template>
                          <template v-else-if="r.playerBlocked">blocked it — healed 1 HP</template>
                          <template v-else-if="r.enemyBlocked">boss blocked it</template>
                          <!-- enemyMissed (see CMoonEnemyMember.attackAccuracyPercent's own schema
                               comment) — the boss's attack would have landed on THIS participant
                               but whiffed outright, rolled independently per participant, so one
                               party member can see this while another sees "landed a hit!" the
                               same round. -->
                          <template v-else-if="r.enemyMissed">dodged it!<span class="cr-miss-badge">MISS!</span></template>
                          <template v-else>no hit landed</template>
                        </span>
                      </li>
                    </ul>
                    <p v-if="lastRoundSummary.enemyDamageDealt > 0" class="cr-reveal-dealt">The party dealt {{ lastRoundSummary.enemyDamageDealt }} damage this round.</p>
                    <p v-for="(s, i) in (lastRoundSummary.specials || [])" :key="i" class="cr-special-flash" :class="s.side === 'PLAYER' ? 'cr-special-flash-player' : 'cr-special-flash-enemy'">
                      <template v-if="s.missed">{{ s.side === 'PLAYER' ? usernameFor(s.userId, s.username) : raid.enemyName }} tried to unleash <strong>{{ s.name }}</strong><span class="cr-miss-badge">MISS!</span></template>
                      <template v-else-if="s.fizzled">✨ {{ s.side === 'PLAYER' ? usernameFor(s.userId, s.username) : raid.enemyName }} tried to unleash <strong>{{ s.name }}</strong>, but it was blocked and had no effect!</template>
                      <template v-else>✨ {{ s.side === 'PLAYER' ? usernameFor(s.userId, s.username) : raid.enemyName }} unleashed <strong>{{ s.name }}</strong>!</template>
                    </p>
                    <p v-if="lastRoundSummary.windUpBonus" class="cr-windup-bonus">
                      🛡️ Perfect block! {{ lastRoundSummary.windUpBonus.bonusType === 'HEAL_PARTY'
                        ? `The party heals ${lastRoundSummary.windUpBonus.bonusAmount} HP.`
                        : `+${lastRoundSummary.windUpBonus.bonusAmount} bonus damage to the boss.` }}
                    </p>
                  </div>
                </Transition>

                <p v-if="comboCallout" class="cr-combo-callout">{{ comboCallout }}</p>
                <!-- Special-attack use — announced to the WHOLE party, not just whoever fired it,
                     with the same prominent treatment as the hit-streak combo callout above. -->
                <p v-if="specialUseCallout" class="cr-combo-callout cr-special-use-callout">{{ specialUseCallout }}</p>
              </div>
            </div>

            <!-- Reserved fixed height (see .cr-notice-zone's own comment further up) — this sits
                 directly above the action buttons, so an error appearing/clearing between rounds
                 (e.g. a rejected action) is the single most direct way this page could shove the
                 buttons a player is about to tap. -->
            <div class="cr-action-notice-zone">
              <p v-if="raidSocket.lastError.value" class="text-sm text-red-600">{{ raidSocket.lastError.value }}</p>
            </div>

            <template v-if="myself && !myself.knockedOut">
              <p v-if="myself.hasActed" class="text-sm text-gray-500">Locked in — waiting on the rest of the party…</p>
              <div v-else class="grid grid-cols-2 gap-2">
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_HIGH')">Attack High</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_LOW')">Attack Low</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_HIGH')">Block High</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_LOW')">Block Low</button>
              </div>

              <!-- ── My own special attack: dormant until charged, same button-stays-in-the-
                   grid-but-separate-row shape as components/CMoonBattlePopupHost.vue's solo
                   version — see that component for the fuller comment on the charge/fire/
                   tooltip mechanics this mirrors. ─────────────────────────────────────────── -->
              <div v-if="myself.specialAttack && !myself.hasActed" class="cr-special-wrap">
                <button
                  type="button" class="cr-special-btn" :class="{ 'cr-special-charged': myself.specialCharged && raid.partyParalyzedTurns === 0 }"
                  :disabled="!myself.specialCharged || raid.partyParalyzedTurns > 0" :style="specialFillStyle"
                  @click="act('SPECIAL_ATTACK')"
                >
                  <span class="cr-special-glow" aria-hidden="true"></span>
                  <span class="cr-special-label"><span class="cr-special-icon">★</span> {{ myself.specialAttack.name }}</span>
                  <span class="cr-special-meter">{{ Math.min(myself.hitStreak, hitStreakThreshold) }}/{{ hitStreakThreshold }}</span>
                </button>
                <button
                  type="button" class="cr-special-help" aria-label="What does this special attack do?"
                  @click="showSpecialInfo = !showSpecialInfo" @mouseenter="showSpecialInfo = true" @mouseleave="showSpecialInfo = false"
                >?</button>
                <div v-if="showSpecialInfo" class="cr-special-tooltip" role="tooltip">
                  <p class="cr-special-tooltip-title">{{ myself.specialAttack.name }}</p>
                  <p v-if="myself.specialAttack.description">{{ myself.specialAttack.description }}</p>
                  <p>{{ specialEffectDescription(myself.specialAttack) }}</p>
                  <p v-if="myself.specialAttack.accuracyPercent < 100" class="cr-special-tooltip-charge">{{ myself.specialAttack.accuracyPercent }}% chance to actually land once fired.</p>
                  <p class="cr-special-tooltip-charge">Land {{ hitStreakThreshold }} hit{{ hitStreakThreshold === 1 ? '' : 's' }} in a row to charge it up — it stays ready until you use it.</p>
                </div>
              </div>
            </template>
            <p v-else-if="myself" class="text-sm text-gray-500">You've been knocked out — watching the rest of the party finish the fight.</p>
          </div>

          <!-- ── RESOLVED: outcome + shared rewards ───────────────────────── -->
          <div v-else class="border rounded p-3 space-y-2" :class="raid.outcome === 'WIN' ? 'bg-green-50 border-green-200' : 'bg-gray-50'">
            <p class="font-semibold">{{ outcomeLabel }}</p>
            <ul class="cr-roster">
              <li v-for="p in raid.participants" :key="p.userId">
                <CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" />
              </li>
            </ul>
            <p v-if="myself?.isFirstWinAgainstThisEnemy" class="cr-first-win">🏆 First victory over {{ raid.enemyName }}!</p>
            <p v-if="nearMissFlavor" class="cr-near-miss">{{ nearMissFlavor }}</p>
            <template v-if="raid.outcome === 'WIN'">
              <div v-if="myRewardsList.length" class="cr-rewards">
                <p class="cr-rewards-title">Your prizes:</p>
                <ul>
                  <li v-for="(r, i) in myRewardsList" :key="i" class="cr-reward-item" :style="{ animationDelay: (i * 150) + 'ms' }">{{ r }}</li>
                </ul>
              </div>
              <p class="text-xs text-gray-600">Everyone who joined received the same prize, and cMoon points went to each player's own cMoon.</p>
            </template>
            <div class="flex items-center gap-2 flex-wrap">
              <NuxtLink to="/newsite/home" class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">Back home</NuxtLink>
              <button
                v-if="raid.battleReport" type="button"
                class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50"
                @click="showBattleReport = true"
              >
                📊 Click to view battle report
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <CMoonRaidBattleReportModal
      v-if="showBattleReport && raid?.battleReport"
      :report="raid.battleReport"
      :enemy-image-path="raid.enemyImagePath"
      :my-user-id="user?.id"
      @close="showBattleReport = false"
    />

    <CMoonEnemyMapBackground
      v-if="raid?.map"
      :animation="raid.map.backgroundAnimation" :color="raid.map.backgroundColor"
    />
    <CMoonEnemyMapInfoModal
      v-if="showMapInfoModal && raid?.map"
      :map="raid.map" context="raid" @understood="showMapInfoModal = false"
    />
  </NuxtLayout>
</template>

<script setup>
import { cMoonPillStyle } from '~/utils/cmoonColor'
import { useHapticSoundsPref } from '@/composables/useHapticSoundsPref'

// The fixed-chrome `.main-content` box is `overflow: hidden` by default
// (layouts/newsite-template.vue) — a raid party can now be up to 8 players (was a hardcoded 4),
// and the roster/fighter-row list that renders one entry per participant pushes this page past
// that fixed height on some browsers/viewport scales, silently clipping the bottom of the page
// (reported: the result screen and lower action buttons invisible with a full 8-player party).
// Same fix as pages/newsite/cmoon-nav.vue/cmoon-enemies.vue for the same "variable-length list can
// exceed the fixed box" reason — opt into an internal scrollbar instead of being clipped.
definePageMeta({ mainContentScrollY: true })

const ACTION_LABELS = { ATTACK_HIGH: 'attacked high', ATTACK_LOW: 'attacked low', BLOCK_HIGH: 'blocked high', BLOCK_LOW: 'blocked low' }

const route = useRoute()
const raidId = computed(() => route.params.id)
const { user } = useAuth()
const raidSocket = useCMoonRaidSocket()
const raid = computed(() => raidSocket.raidState.value?.id === raidId.value ? raidSocket.raidState.value : null)

// Leaving clears raidState (see composable's own cmoonraid:leftRaid handler) and navigates away —
// there's nothing left on this page worth showing once I've asked to leave my own still-FORMING
// raid, whether it got destroyed (I was the only one in it) or just continues without me.
function leaveRaidAndGoHome() {
  raidSocket.leaveRaid(raidId.value)
  navigateTo('/newsite/home')
}

const hasJoined = computed(() => !!raid.value?.participants.some(p => p.userId === user.value?.id))
const myself = computed(() => raid.value?.participants.find(p => p.userId === user.value?.id) || null)
// Each distinct cMoon in the party with how many members it brought, in join order.
const teams = computed(() => {
  const byId = new Map()
  for (const p of raid.value?.participants || []) {
    if (!p.cMoon?.id) continue
    const t = byId.get(p.cMoon.id) || { id: p.cMoon.id, name: p.cMoon.name || 'cMoon', color: p.cMoon.color, count: 0 }
    t.count += 1
    byId.set(p.cMoon.id, t)
  }
  return [...byId.values()]
})
const lastRoundSummary = computed(() => raidSocket.lastRound.value ? { ...raidSocket.lastRound.value } : null)
const lastRoundSummaryHadCrit = computed(() =>
  !!lastRoundSummary.value?.participants?.some(r => r.playerCrit || r.enemyCrit))

const enemyHpPercent = computed(() => {
  if (!raid.value) return 0
  return Math.max(0, Math.min(100, Math.round((raid.value.enemyHpRemaining / (raid.value.enemyMaxHp || 1)) * 100)))
})
// Same green/yellow/red escalation as components/CMoonBattlePopupHost.vue's solo enemyHpFillClass
// — a shared boss bar gets the same tension cue a solo fight already has.
const enemyHpFillClass = computed(() => {
  if (enemyHpPercent.value <= 25) return 'cr-hp-fill-critical'
  if (enemyHpPercent.value <= 50) return 'cr-hp-fill-mid'
  return 'cr-hp-fill-ok'
})
function participantHpFillClass(p) {
  const pct = Math.max(0, Math.min(100, Math.round((p.hpRemaining / (p.maxHp || 1)) * 100)))
  if (pct <= 25) return 'bg-red-500'
  if (pct <= 50) return 'bg-amber-500'
  return 'bg-green-500'
}

const outcomeLabel = computed(() => {
  if (raid.value?.outcome === 'WIN') return 'Victory! The party brought the boss down.'
  if (raid.value?.outcome === 'LOSS') return 'Defeat — the whole party was knocked out.'
  return 'The raid ended without a clear finish.'
})

// Mirrors components/CMoonBattlePopupHost.vue's rewardsList, read off MY OWN participant row
// (myself.rewardsGranted) rather than a single shared battle object — every participant has their
// own independently-granted roll (see resolveCMoonRaidOutcome's own comment on why), so this is
// genuinely per-viewer, not shared with the rest of the party.
const myRewardsList = computed(() => {
  const rewards = Array.isArray(myself.value?.rewardsGranted) ? myself.value.rewardsGranted : []
  return rewards.map(r => {
    if (r.type === 'CTOON') return `${r.name || 'cToon'}${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'PACK') return `${r.name || 'Pack'}${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'AVATAR') return `Avatar${r.quantity > 1 ? ` x${r.quantity}` : ''}`
    if (r.type === 'POINTS') return `${r.quantity} points`
    return `Background${r.quantity > 1 ? ` x${r.quantity}` : ''}`
  })
})

// Mirrors components/CMoonBattlePopupHost.vue's nearMissFlavor, read off MY OWN HP for a clutch
// win and the shared boss HP for a party-wide "so close" loss.
const nearMissFlavor = computed(() => {
  if (!raid.value || !myself.value) return ''
  if (raid.value.outcome === 'WIN' && (myself.value.hpRemaining ?? 99) <= 1) {
    return 'Clutch win — you barely made it out!'
  }
  if (raid.value.outcome === 'LOSS') {
    const max = raid.value.enemyMaxHp || 1
    const remaining = raid.value.enemyHpRemaining ?? max
    if (remaining > 0 && remaining / max <= 0.15) return 'So close! The boss was nearly down.'
  }
  return ''
})

// `embedded` is the username the server now sends directly on the round/special-event row itself
// (see closeRound/applyRaidSpecialAttack in cmoonRaidSocket.js/cmoonEnemyRaid.js) — always
// preferred when present, since it's authoritative for that exact event. The live lookup against
// raid.value.participants is kept only as a fallback for any caller that doesn't have one handy.
function usernameFor(userId, embedded) {
  if (embedded) return embedded
  return raid.value?.participants.find(p => p.userId === userId)?.username || 'Someone'
}

function revealRowClass(r) {
  // See the round-reveal template's own comment: r.playerHit alone doesn't mean real damage got
  // through (a shield/debuff can zero r.playerDamage while still rolling the hit true).
  const tookDamage = r.playerHit && r.playerDamage > 0
  if (r.enemyHit && !tookDamage) return 'cr-row-good'
  if (tookDamage && !r.enemyHit) return 'cr-row-bad'
  if (r.playerBlocked || r.enemyMissed || (r.playerHit && !tookDamage)) return 'cr-row-good'
  return 'cr-row-neutral'
}

function act(action) {
  if (!raid.value) return
  raidSocket.submitAction(raidId.value, action, raid.value.roundNumber)
}

// ── Special attack button — mirrors components/CMoonBattlePopupHost.vue's solo version; see
// that component's own comment for why this is duplicated client-side rather than imported
// (no shared import path between this page and that component). The only raid-specific wording
// is HEAL_SELF/RAISE_ALLY_ATTACK, which call out the whole party since raids share those pools.
function specialEffectDescription(attack) {
  const n = attack?.amount
  switch (attack?.effectType) {
    case 'DAMAGE_OPPONENT': return `Deals ${n} guaranteed damage to the boss, bypassing block.`
    case 'HEAL_SELF': return attack?.healsAllies ? `Heals you and every raid ally, whatever their cMoon, for ${n} HP.` : `Heals you for ${n} HP.`
    case 'PARALYZE_OPPONENT': return `Stuns the boss for ${n} round${n === 1 ? '' : 's'} — it can't act.`
    case 'LOWER_OPPONENT_ATTACK': return `Lowers the boss's attack damage by ${n} for the rest of the fight.`
    case 'RAISE_ALLY_ATTACK': return `Raises every raid ally's attack damage by ${n} for the rest of the fight.`
    case 'REFLECT_DAMAGE': return `Reflects ${attack?.reflectPercent}% of whatever the boss hits the party for this round back at it — nothing reflects if it blocks. Can't stack with another reflect cast the same round.`
    case 'SIPHON_HEALTH': return attack?.healsAllies
      ? `Deals ${n} damage and heals you and every raid ally for ${attack?.siphonPercent}% of it — unless the boss blocks, in which case it does nothing.`
      : `Deals ${n} damage and heals you for ${attack?.siphonPercent}% of it — unless the boss blocks, in which case it does nothing.`
    case 'POISON_OPPONENT': return `Poisons the boss for ${n} damage at the end of each round, for ${attack?.poisonDurationRounds} round${attack?.poisonDurationRounds === 1 ? '' : 's'}. Re-casting refreshes it rather than stacking.`
    case 'CLEANSE_SELF': return attack?.healsAllies
      ? `Cures you and every raid ally of paralysis and poison${attack?.cleanseAlsoHeals ? `, healing ${n} HP too` : ''}.`
      : `Cures you of paralysis and poison${attack?.cleanseAlsoHeals ? `, healing ${n} HP too` : ''}. Everyone else's party-wide paralysis is cured too — only poison is self-only here.`
    case 'SHIELD_PARTY': return `Negates ALL damage the party would take this round, from the boss's normal attack and any special it casts.`
    default: return ''
  }
}
const showSpecialInfo = ref(false)
const showBattleReport = ref(false)
// How many consecutive landed hits MY OWN special needs right now — this attack's own
// requiredHitStreak, minus 1 under captain boost (see myself.hitStreakThreshold's own comment in
// cmoonRaidSocket.js) — now per-participant, since different party members' attacks can cost
// different amounts. Falls back to the raid-level default for a moment before `myself` exists.
const hitStreakThreshold = computed(() => myself.value?.hitStreakThreshold ?? raid.value?.hitStreakThreshold ?? 3)
// 0..hitStreakThreshold hits -> 0-100% fill, read by .cr-special-btn below via this CSS variable —
// stays at 100% once charged even if hitStreak itself later resets (charge latches, same as solo's).
const specialFillStyle = computed(() => {
  const pct = myself.value?.specialCharged ? 100 : Math.min(100, Math.round(((myself.value?.hitStreak || 0) / hitStreakThreshold.value) * 100))
  return { '--cr-special-fill': pct + '%' }
})
// Persistent-during-lobby "Captain boost" overlay — unlike the one-time entrance banner above,
// this stays up for the WHOLE FORMING phase and fades specifically when the raid transitions to
// IN_PROGRESS (the Transition below fires on this going false), not on a fixed timer. The
// underlying gameplay effect (the lowered threshold itself) persists for the whole raid — only
// this overlay is lobby-scoped.
const showCaptainBoostOverlay = computed(() => raid.value?.status === 'FORMING' && !!raid.value?.captainBoostActive)

// FORMING's join-window countdown — a plain client-side ticker against joinDeadlineAt, not a
// second source of truth: the server's sweep (see cmoonRaidSocket.js) is what actually closes
// the window and transitions to IN_PROGRESS, this just gives the player something to watch.
const joinCountdown = ref(0)
let countdownTimer = null
function tickCountdown() {
  if (!raid.value?.joinDeadlineAt) { joinCountdown.value = 0; return }
  joinCountdown.value = Math.max(0, Math.ceil((raid.value.joinDeadlineAt - Date.now()) / 1000))
}

// How long this lobby has been open — ticked alongside joinCountdown above (same 250ms interval,
// no second timer needed) purely to gate when the Cancel Raid button below lights up.
const secondsSinceStart = ref(0)
function tickSecondsSinceStart() {
  if (!raid.value?.startedAt) { secondsSinceStart.value = 0; return }
  secondsSinceStart.value = Math.max(0, Math.floor((Date.now() - raid.value.startedAt) / 1000))
}
// Grayed out until the lobby has sat open for 90s AND still has fewer than 3 raiders — a stalled
// lobby the leader may want to bail on, not a button meant to cut short a healthy one that's
// about to fill. Purely a client-side UX gate: the server's own cancelRaid handler (see
// cmoonRaidSocket.js) gives the leader unconditional power to cancel any FORMING raid, same as
// forceStart's own "no server-side time/headcount check" stance — this just decides when the
// button LOOKS clickable.
const cancelRaidEnabled = computed(() =>
  isInitiator.value && secondsSinceStart.value >= 90 && (raid.value?.participants.length || 0) < 3)
function cancelRaidAndGoHome() {
  raidSocket.cancelRaid(raidId.value)
  navigateTo('/newsite/home')
}

// IN_PROGRESS's per-round move countdown — same plain client-side ticker shape as joinCountdown
// above, against roundDeadlineAt instead: the server's sweep is still the real authority on when
// a round auto-acts, this just gives a stalling player (and everyone watching) something to see
// counting down, per this feature's own "stop people from stalling fights" goal.
const roundCountdown = ref(0)
let roundCountdownTimer = null
function tickRoundCountdown() {
  if (!raid.value?.roundDeadlineAt) { roundCountdown.value = 0; return }
  roundCountdown.value = Math.max(0, Math.ceil((raid.value.roundDeadlineAt - Date.now()) / 1000))
}

// Whether I'M the raid leader — the only one who can toggle keep-open or force-start the lobby.
const isInitiator = computed(() => !!raid.value?.participants.find(p => p.userId === user.value?.id)?.isInitiator)

const inviteLinkCopied = ref(false)
async function copyInviteLink() {
  if (typeof window === 'undefined') return
  try {
    await navigator.clipboard.writeText(window.location.href)
    inviteLinkCopied.value = true
    setTimeout(() => { inviteLinkCopied.value = false }, 2000)
  } catch {}
}

// One random pick from an enemy's admin-authored taunt pool — mirrors
// composables/useCMoonBattlePopup.js's own pickRandomTaunt exactly (no shared import path between
// a composable and this page, so duplicated client-side the same way ACTION_LABELS already is).
function pickRandomTaunt(list) {
  if (!Array.isArray(list) || !list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}
// The currently-showing taunt line — set on first reveal (an APPEAR taunt) and on the boss's own
// landed crit (a CRIT taunt, see the lastRound watch below); '' means nothing to show.
const currentTaunt = ref('')

// ── Floating damage numbers — see components/CMoonBattlePopupHost.vue's own floatingDamage for
// the full rationale; this page just has two independent pools (boss aggregate, my own HP) rather
// than one-entry-per-side, since a raid round can have several participants land hits on the boss
// at once (see the lastRound watch below for how each pool is fed).
const enemyFloatingDamage = ref([])
const myFloatingDamage = ref([])
let floatingDamageSeq = 0
const FLOATING_DAMAGE_LIFETIME_MS = 900

// ── Combo callout — a transient "Nx HIT STREAK!" for MY OWN streak climbing (see the myHitStreak
// watch below), same shape as the solo popup's comboCallout.
const comboCallout = ref('')
let comboTimer = null

// ── Special-use callout — a transient, party-wide announcement whenever ANY participant fires
// their special attack this round (see the lastRound watch below), reusing the hit-streak combo
// callout's own visual treatment per the feature request. Unlike comboCallout (which only reacts
// to MY OWN streak), this reads round.specials — the same shared, every-viewer-sees-the-same-thing
// data the round-reveal panel's own special-flash lines already read — so it's broadcast to the
// whole party, not just the player who used it.
const specialUseCallout = ref('')
let specialUseTimer = null

// ── Result-screen flash — a brief full-bleed tint the instant the raid resolves, driven off the
// status transition itself (mirrors the solo popup's own phase-transition-based resultFlash).
const resultFlash = ref('')
let resultFlashTimer = null
watch(() => raid.value?.status, (status) => {
  if (status === 'RESOLVED' && raid.value?.outcome && raid.value.outcome !== 'ABANDONED') {
    resultFlash.value = raid.value.outcome === 'WIN' ? 'win' : 'loss'
    if (resultFlashTimer) clearTimeout(resultFlashTimer)
    resultFlashTimer = setTimeout(() => { resultFlash.value = '' }, 500)
  }
})

// ── Impact feedback + sound/music — same "juice" components/CMoonBattlePopupHost.vue gives a
// solo battle (see that component's own comments for the full rationale), adapted to a raid's
// shared screen. Screenshake IS replicated here (mirrors that component's shaking/shakeCrit/
// triggerShake below almost exactly), but scoped to .cr-shake-zone in the template rather than the
// whole card — up to 8 players sharing one screen made misclicks from the shake common when it
// also reached the action buttons, so the shake class only ever applies to the round/roster zone,
// never to the buttons themselves (a sibling element outside it). The per-round SOUND effects below
// still play only off MY OWN participant row — several simultaneous players' sounds all firing at
// once would be noise, not epic.
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
// Settings page's "Mute sounds" row (composables/useHapticSoundsPref.js) — shared `useState`, so
// toggling it in another tab/on the settings page takes effect here without a page reload; the
// battleMusic watch below reacts to it live, and this guard covers every one-shot effect (hit/
// block/special/taunt/appear/victory/defeat) in one place rather than at each call site.
const { enabled: soundsEnabled, hydrate: hydrateSoundsPref } = useHapticSoundsPref()
function playSound(path) {
  if (!path || !soundsEnabled.value || typeof window === 'undefined') return
  try {
    const el = new Audio(path)
    el.volume = 0.7
    el.play().catch(() => {})
  } catch {}
}

// Mirrors useCMoonBattlePopup.js's playRoundSounds exactly, just against MY OWN perParticipant
// row rather than a single solo battle's one implicit "player".
function playMyRoundSounds(myRow, sounds) {
  if (!myRow || !sounds) return
  if (myRow.enemyHit) playSound(sounds.damageTakenSoundPath)
  else if (myRow.enemyBlocked) playSound(sounds.damageAvoidedSoundPath)
  if (myRow.playerHit) playSound(sounds.attackingSoundPath)
}

watch(() => raidSocket.lastRound.value, (round) => {
  if (!round?.participants?.length) return
  const myRow = round.participants.find(r => r.userId === user.value?.id)
  playMyRoundSounds(myRow, raid.value?.enemySounds)
  // Special-attack sounds play for the whole room, not just "my own" — a special firing is a
  // shared moment (same as appear/victory/defeat), unlike the routine per-hit sounds above.
  for (const s of (round.specials || [])) playSound(s.soundPath)

  // ── Screen shake — any landed hit either direction, bigger on a crit. Mirrors
  // components/CMoonBattlePopupHost.vue's own trigger condition exactly (round.playerHit ||
  // round.enemyHit there), just checked across every participant's row since a raid round has
  // several instead of one.
  const anyHit = round.participants.some(r => r.playerHit || r.enemyHit)
  if (anyHit) triggerShake(round.participants.some(r => r.playerCrit || r.enemyCrit))

  // ── Special-use callout — broadcast to the WHOLE party the instant any player fires a special
  // this round (round.specials is shared data, not per-viewer). Multiple players firing in the
  // same round (possible with up to 8 in a party) are combined into one line rather than queued.
  const playerSpecials = (round.specials || []).filter(s => s.side === 'PLAYER')
  if (playerSpecials.length) {
    specialUseCallout.value = playerSpecials.map(s => `${usernameFor(s.userId, s.username)} used ${s.name}!`).join('  ')
    if (specialUseTimer) clearTimeout(specialUseTimer)
    specialUseTimer = setTimeout(() => { specialUseCallout.value = '' }, 1600)
  }

  // ── Floating damage — one aggregate "-N" over the shared boss bar (round.enemyDamageDealt is
  // already the party's combined total, matching the single shared HP pool it comes out of), plus
  // one "-N" over MY OWN row if the boss's shared action landed on me this round. Mirrors
  // components/CMoonBattlePopupHost.vue's floatingDamage ref/lifetime exactly, just fed from this
  // page's own round shape instead of a solo battle's single-target one.
  if (round.enemyDamageDealt > 0) {
    const id = ++floatingDamageSeq
    const crit = round.participants.some(r => r.enemyCrit)
    enemyFloatingDamage.value.push({ id, amount: round.enemyDamageDealt, crit })
    setTimeout(() => { enemyFloatingDamage.value = enemyFloatingDamage.value.filter(d => d.id !== id) }, FLOATING_DAMAGE_LIFETIME_MS)
  }
  if (myRow?.playerHit && myRow.playerDamage > 0) {
    const id = ++floatingDamageSeq
    myFloatingDamage.value.push({ id, amount: myRow.playerDamage, crit: myRow.playerCrit })
    setTimeout(() => { myFloatingDamage.value = myFloatingDamage.value.filter(d => d.id !== id) }, FLOATING_DAMAGE_LIFETIME_MS)
  }

  // ── CRIT taunt — fires only on the boss's own landed crit against ANY participant, same
  // "enemy's own crit, never a player's" trigger scope as the solo popup's CRIT taunt (see
  // useCMoonBattlePopup.js's submitAction). Cleared on any other round so a stale line doesn't
  // linger past its own moment.
  const bossCrit = round.participants.some(r => r.playerCrit)
  if (bossCrit) {
    const taunt = pickRandomTaunt(raid.value?.enemyTaunts?.crit)
    currentTaunt.value = taunt ? taunt.text : ''
    if (taunt) playSound(taunt.soundPath)
  } else {
    currentTaunt.value = ''
  }
})

// ── Combo callout — MY OWN hit streak climbing, same shape as the solo popup's comboCallout.
const myHitStreak = computed(() => myself.value?.hitStreak || 0)
watch(myHitStreak, (streak, prevStreak) => {
  if (streak > 0 && streak > (prevStreak || 0)) {
    comboCallout.value = `${streak}x HIT STREAK!`
    if (comboTimer) clearTimeout(comboTimer)
    comboTimer = setTimeout(() => { comboCallout.value = '' }, 1200)
  }
})

// ── Battle music — loops for as long as combat is actually running, same FIGHT-phase-only
// scoping the solo popup uses (never during FORMING/RESOLVED). See useBattleMusic's own header
// comment for why the start/stop/autoplay-retry logic itself lives in a shared composable rather
// than duplicated here and in the solo popup.
//
// `raid` (above) reads off raidSocket.raidState, a MODULE-LEVEL singleton that outlives this
// component — it is never reset just because this page unmounts. onUnmounted below always calls
// battleMusic.stop(), so if a player navigates away mid-fight (another page, browser
// back/forward, re-clicking the raid's own link) and comes back while the raid is STILL
// IN_PROGRESS, a plain non-immediate watch here would never fire again: the watched status didn't
// change, it was already 'IN_PROGRESS' before this fresh mount's watcher even started observing
// it. That left the track silently dead for the rest of that fight even though combat was still
// live — this was reported as "the music sometimes doesn't play." `{ immediate: true }` below
// fixes it: on every (re)mount it reads the CURRENT status (computed `raid` already resolves to
// null for a different/not-yet-loaded raid, so this is never a stale cross-raid false positive)
// instead of only reacting to a future transition.
const battleMusic = useBattleMusic()
watch(() => raid.value?.status, (status) => {
  if (status === 'IN_PROGRESS' && soundsEnabled.value) battleMusic.start(raid.value?.battleMusicPath)
  else battleMusic.stop()
}, { immediate: true })
// Toggling "Mute sounds" mid-fight (e.g. from another tab) should take effect immediately rather
// than waiting for the next status change — the watch above only re-evaluates on a STATUS
// transition, which an already-IN_PROGRESS raid never has again until it resolves.
watch(soundsEnabled, (on) => {
  if (raid.value?.status !== 'IN_PROGRESS') return
  if (on) battleMusic.start(raid.value?.battleMusicPath)
  else battleMusic.stop()
})

// ── Captain entrance banner — a one-time, purely cosmetic "epic" moment naming every cMoon
// captain in the party (see CMoonCaptain's own schema comment), meant to pump up everyone else in
// the raid. Fires on the same "first time this page has raid data" trigger as the appear sound/
// taunt below, never re-announced on later state pushes. No gameplay effect — CMoonRaidFighter.vue
// carries the persistent glow/badge for the rest of the fight.
const captainEntranceBanner = ref('')
let captainEntranceTimer = null
function joinWithAnd(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// Appear sound — once, the first time this page actually has raid data to show (covers both
// "just started/joined a FORMING raid" and "opened a link to one already in progress"); never
// re-fires on every subsequent state push for the same raid.
let announcedRaidId = null
watch(raid, (r) => {
  if (!r || announcedRaidId === r.id) return
  announcedRaidId = r.id
  playSound(r.enemySounds?.appearSoundPath)
  const taunt = pickRandomTaunt(r.enemyTaunts?.appear)
  if (taunt) {
    currentTaunt.value = taunt.text
    playSound(taunt.soundPath)
  }

  const captains = (r.participants || []).filter(p => p.isCaptain)
  if (captains.length) {
    const names = captains.map(p => p.username || 'Someone')
    const plural = names.length > 1
    captainEntranceBanner.value = `🎖️ ${joinWithAnd(names)} ${plural ? 'have' : 'has'} entered the battle as ${plural ? 'cMoon Captains' : 'a cMoon Captain'} — fight with honor!`
    if (captainEntranceTimer) clearTimeout(captainEntranceTimer)
    captainEntranceTimer = setTimeout(() => { captainEntranceBanner.value = '' }, 4000)
  }
})

// Victory/defeat sound — once, the instant the raid actually resolves (never on ABANDONED, same
// as the solo battle only playing one of these two on a real WIN/LOSS).
watch(() => raid.value?.outcome, (outcome) => {
  if (outcome === 'WIN') playSound(raid.value?.enemySounds?.victorySoundPath)
  else if (outcome === 'LOSS') playSound(raid.value?.enemySounds?.defeatSoundPath)
})

// AFK kick banner for the party members who AREN'T the one just kicked — see
// composable's own cmoonraid:participantKicked handler (lastKicked) for why the kicked player
// themselves never reaches this watcher with `raid` still non-null. Watches `.at`, not the object
// itself, so a second kick with the exact same username still re-fires the banner/timer.
const afkKickBanner = ref('')
let afkKickTimer = null
watch(() => raidSocket.lastKicked.value?.at, () => {
  const names = (raidSocket.lastKicked.value?.kicked || []).map(k => k.username || 'Someone')
  if (!names.length) return
  afkKickBanner.value = `⏱️ ${joinWithAnd(names)} ${names.length > 1 ? 'were' : 'was'} kicked from the raid for inactivity.`
  if (afkKickTimer) clearTimeout(afkKickTimer)
  afkKickTimer = setTimeout(() => { afkKickBanner.value = '' }, 5000)
})

// Map info modal — "I Understand" explainer for a non-base active map, shown once the raid
// actually reaches IN_PROGRESS (its effects don't matter during FORMING) and never again for
// the same raid, mirroring announcedRaidId's own one-shot-per-id gating above.
const showMapInfoModal = ref(false)
let mapInfoShownForRaidId = null
watch(() => raid.value?.status, (status) => {
  if (status !== 'IN_PROGRESS') return
  if (!raid.value?.map || raid.value.map.isBaseMap) return
  if (mapInfoShownForRaidId === raid.value.id) return
  mapInfoShownForRaidId = raid.value.id
  showMapInfoModal.value = true
})

onMounted(() => {
  hydrateSoundsPref()
  raidSocket.getState(raidId.value)
  countdownTimer = setInterval(() => { tickCountdown(); tickSecondsSinceStart() }, 250)
  roundCountdownTimer = setInterval(tickRoundCountdown, 250)
})
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (roundCountdownTimer) clearInterval(roundCountdownTimer)
  if (comboTimer) clearTimeout(comboTimer)
  if (specialUseTimer) clearTimeout(specialUseTimer)
  if (shakeTimer) clearTimeout(shakeTimer)
  if (captainEntranceTimer) clearTimeout(captainEntranceTimer)
  if (afkKickTimer) clearTimeout(afkKickTimer)
  if (resultFlashTimer) clearTimeout(resultFlashTimer)
  battleMusic.stop()
})
</script>

<style scoped>
/* ── Cross-cMoon party display (see components/newsite/CMoonRaidFighter.vue) ── */
.cr-teams { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cr-teams-lead { font-size: 12px; font-weight: 800; color: #1e3a8a; margin-right: 2px; }
.cr-team-chip { font-size: 11px; font-weight: 800; border-radius: 999px; padding: 2px 10px; }
.cr-team-count { font-weight: 700; opacity: 0.85; }
.cr-roster { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.cr-roster-open {
  display: flex; align-items: center; justify-content: center; min-height: 66px;
  border: 2px dashed #cbd5e1; border-radius: 10px; color: #94a3b8; font-size: 12px; font-weight: 700;
}
.cr-fighter-row { display: flex; flex-direction: column; gap: 4px; }
.cr-fighter-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cr-fighter-badge { flex: 0 1 auto; min-width: 0; }
.cr-fighter-status { margin-left: auto; font-size: 10px; flex-shrink: 0; }
.cr-hp-line { position: relative; display: flex; align-items: center; gap: 8px; padding-left: 4px; }

/* ── Shake zone (round counter, wind-up banner, roster, status badges) + its announcements
   overlay — see the template's own comment for why the action buttons are deliberately kept
   OUTSIDE this element, and why the overlay below is absolutely positioned rather than flowed. */
.cr-shake-zone { position: relative; display: flex; flex-direction: column; gap: 12px; }
.cr-announce-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 4px;
  pointer-events: none;
  z-index: 5;
}
/* Impact feedback on a landed hit — a quick horizontal shake, bigger for a critical. Scoped to
   .cr-shake-zone only (never the action buttons below it) — mirrors
   components/CMoonBattlePopupHost.vue's own cbp-shake/cbp-shake-crit keyframes exactly. Disabled
   under prefers-reduced-motion, same accessibility stance that component already takes. */
@keyframes cr-shake-kf {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
@keyframes cr-shake-crit-kf {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-8px); }
  40%, 60% { transform: translateX(8px); }
}
.cr-shake { animation: cr-shake-kf 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
.cr-shake-crit { animation: cr-shake-crit-kf 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@media (prefers-reduced-motion: reduce) {
  .cr-shake, .cr-shake-crit { animation: none; }
}

/* Result-screen flash — mirrors components/CMoonBattlePopupHost.vue's cbp-result-flash, applied
   to this page's own light card (.cr-card, the root element resultFlash binds onto) instead of a
   dark modal. */
.cr-result-flash-win, .cr-result-flash-loss { position: relative; }
.cr-result-flash-win::after, .cr-result-flash-loss::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  animation: cr-result-flash-fade 0.5s ease-out forwards;
}
.cr-result-flash-win::after { background: radial-gradient(circle, rgba(74, 222, 128, 0.35), transparent 70%); }
.cr-result-flash-loss::after { background: radial-gradient(circle, rgba(248, 113, 113, 0.35), transparent 70%); }
@keyframes cr-result-flash-fade {
  0% { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-result-flash-win::after, .cr-result-flash-loss::after { animation: none; display: none; }
}

/* Boss HP bar color escalation — same bands as components/CMoonBattlePopupHost.vue's
   cbp-hp-fill-mid/-critical, re-colored for this page's light card UI. */
.cr-hp-fill-ok { background: #22c55e; }
.cr-hp-fill-mid { background: #f59e0b; }
.cr-hp-fill-critical { background: #dc2626; animation: cr-hp-critical-pulse 1s ease-in-out infinite; }
@keyframes cr-hp-critical-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.35); }
}
@media (prefers-reduced-motion: reduce) {
  .cr-hp-fill-critical { animation: none; }
}

/* Floating damage numbers — same pop-up-and-fade as components/CMoonBattlePopupHost.vue's
   cbp-dmg-float, auto-removed from the DOM by the JS timer once the animation has finished. */
.cr-dmg-float {
  position: absolute;
  right: 44px;
  top: -2px;
  font-size: 12px;
  font-weight: 800;
  color: #dc2626;
  pointer-events: none;
  animation: cr-dmg-float-up 0.9s ease-out forwards;
}
.cr-dmg-float-crit { font-size: 15px; color: #d97706; }
@keyframes cr-dmg-float-up {
  0% { transform: translateY(4px); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-24px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-dmg-float { animation: none; opacity: 0; }
}

/* Combo callout — same pop as components/CMoonBattlePopupHost.vue's cbp-combo-callout. */
.cr-combo-callout {
  font-size: 14px;
  font-weight: 800;
  color: #ca8a04;
  text-align: center;
  margin: 2px 0;
  animation: cr-combo-pop 0.4s ease-out;
}
@keyframes cr-combo-pop {
  0% { transform: scale(0.7); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-combo-callout { animation: none; }
}

/* Special-use callout — same pop/shape as .cr-combo-callout above (per the feature request:
   "announce it the same way the 2x or 3x hits are announced"), just violet instead of gold so a
   special-attack moment reads as visually distinct from a hit-streak one when both can appear in
   the same overlay. */
.cr-special-use-callout {
  color: #7e22ce;
  background: rgba(168, 85, 247, 0.12);
  border-radius: 6px;
  padding: 4px 10px;
}

/* ── Reserved-height notice zones (see the template's own comment on the first one for the full
   misclick rationale) — a fixed height plus `overflow-y: auto` so a child appearing/disappearing
   between rounds changes what's visible INSIDE the box, never the box's own contribution to the
   page's layout, so nothing below it (ultimately, the action buttons) ever moves. Plain CSS
   (fixed height + overflow), not `:has()`/container queries/anything newer, and no JS height
   measurement — this has to hold on every browser this site runs in, phones included.
   -webkit-overflow-scrolling: touch is for older iOS Safari's momentum scroll; harmless no-op on
   every other browser. Each one's height only needs to clear its own worst realistic case
   (double-checked against the actual rendered CSS of what it holds) — scrolling covers whatever
   rarer combination exceeds that, which trades a tiny, uncommon scroll affordance for the one
   thing that actually matters here: the buttons never move. */
.cr-notice-zone, .cr-windup-zone, .cr-statusbadges-zone, .cr-action-notice-zone {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.cr-notice-zone { height: 56px; }
.cr-windup-zone { height: 48px; }
.cr-statusbadges-zone { height: 72px; display: flex; flex-direction: column; gap: 4px; }
.cr-action-notice-zone { height: 44px; }

/* Taunt line — re-colored for the light card, same shape as components/CMoonBattlePopupHost.vue's
   cbp-taunt. */
.cr-taunt {
  font-size: 12px;
  font-style: italic;
  color: #b91c1c;
  background: rgba(220, 38, 38, 0.08);
  border: 1px solid rgba(220, 38, 38, 0.25);
  border-radius: 6px;
  padding: 5px 9px;
  margin: 0;
  animation: cr-taunt-pop 0.3s ease-out;
}
@keyframes cr-taunt-pop {
  0% { transform: translateY(-4px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-taunt { animation: none; }
}

/* Captain entrance banner — a one-time, purely cosmetic "epic" moment (see the watch(raid, ...)
   that sets captainEntranceBanner). Bigger and bolder than every other callout on this page on
   purpose: it's meant to read as a big deal the instant the page loads. */
.cr-captain-banner {
  font-size: 13.5px;
  font-weight: 800;
  text-align: center;
  color: #78350f;
  background: linear-gradient(90deg, rgba(250, 204, 21, 0.25), rgba(250, 204, 21, 0.5), rgba(250, 204, 21, 0.25));
  border: 1px solid #d97706;
  border-radius: 8px;
  padding: 7px 12px;
  margin: 0;
  box-shadow: 0 0 16px rgba(250, 204, 21, 0.5);
  animation: cr-captain-banner-pop 0.5s ease-out;
}
@keyframes cr-captain-banner-pop {
  0% { transform: scale(0.9); opacity: 0; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-captain-banner { animation: none; }
}

/* AFK kick banner — same timed-callout shape as .cr-captain-banner above (one-shot entrance,
   auto-clears via afkKickTimer), just in a "something went wrong for someone" red rather than the
   captain banner's celebratory gold. */
.cr-kick-banner {
  font-size: 13.5px;
  font-weight: 800;
  text-align: center;
  color: #7f1d1d;
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.2), rgba(248, 113, 113, 0.4), rgba(248, 113, 113, 0.2));
  border: 1px solid #dc2626;
  border-radius: 8px;
  padding: 7px 12px;
  margin: 0;
  animation: cr-captain-banner-pop 0.5s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .cr-kick-banner { animation: none; }
}

/* Captain boost overlay — GlobalGameConfig.cMoonCaptainBoostEnabled's own epic callout (see
   showCaptainBoostOverlay). Same gold "big deal" family as .cr-captain-banner above, but it's
   meant to feel like it's hovering over the lobby for the whole wait rather than popping once, so
   it gets a slow pulsing glow instead of a one-shot entrance animation, and a longer, graceful
   fade (via .cr-boost-fade below) instead of .cr-reveal's quick opacity snap. */
.cr-boost-overlay {
  font-size: 14px;
  font-weight: 800;
  text-align: center;
  letter-spacing: 0.01em;
  color: #fff;
  background: linear-gradient(90deg, #92400e, #d97706, #92400e);
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 9px 12px;
  margin: 0;
  box-shadow: 0 0 20px rgba(250, 204, 21, 0.6);
  animation: cr-boost-pulse 1.8s ease-in-out infinite;
}
@keyframes cr-boost-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(250, 204, 21, 0.45); }
  50% { box-shadow: 0 0 26px rgba(250, 204, 21, 0.85); }
}
.cr-boost-fade-enter-active { transition: opacity 0.4s ease; }
.cr-boost-fade-leave-active { transition: opacity 0.9s ease; }
.cr-boost-fade-enter-from, .cr-boost-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .cr-boost-overlay { animation: none; }
}

.cr-first-win {
  font-size: 12.5px;
  font-weight: 800;
  color: #92400e;
  background: rgba(250, 204, 21, 0.18);
  border: 1px solid rgba(250, 204, 21, 0.5);
  border-radius: 6px;
  padding: 4px 9px;
  margin: 0;
}
.cr-near-miss { font-size: 11.5px; font-style: italic; color: #4b5563; margin: 0; }

.cr-rewards { text-align: left; background: rgba(0, 0, 0, 0.04); border-radius: 6px; padding: 7px 9px; }
.cr-rewards-title { font-size: 10.5px; font-weight: 700; color: #6b7280; margin-bottom: 3px; }
.cr-rewards ul { margin: 0; padding-left: 16px; font-size: 11.5px; }
.cr-reward-item { opacity: 0; animation: cr-reward-pop 0.35s ease-out forwards; }
@keyframes cr-reward-pop {
  0% { transform: translateX(-6px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-reward-item { opacity: 1; animation: none; }
}

.cr-reveal-panel {
  border-radius: 8px;
  padding: 10px 12px;
  background: #0d2a4d;
  color: #fff;
  font-size: 12px;
}
.cr-reveal-panel.cr-reveal-crit {
  box-shadow: 0 0 0 2px #f59e0b inset;
}
.cr-reveal-headline { font-weight: 600; margin-bottom: 6px; }
.cr-reveal-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cr-reveal-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cr-reveal-name { font-weight: 600; flex-shrink: 0; }
.cr-reveal-action { color: rgba(255, 255, 255, 0.55); flex-shrink: 0; }
.cr-reveal-outcome { color: rgba(255, 255, 255, 0.85); }
.cr-row-good .cr-reveal-outcome { color: #4ade80; font-weight: 600; }
.cr-row-bad .cr-reveal-outcome { color: #f87171; font-weight: 600; }
.cr-reveal-dealt { margin-top: 6px; color: rgba(255, 255, 255, 0.6); }

.cr-crit-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #f59e0b;
  color: #1a1200;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  animation: cr-crit-pop 0.35s ease-out;
}
@keyframes cr-crit-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
/* Same pop-in treatment as the crit badge above, in a cool blue so a miss (either an enemy's
   normal attack whiffing — see CMoonEnemyMember.attackAccuracyPercent — or a special attack
   missing, see CMoonSpecialAttack.accuracyPercent) reads as "nothing happened" rather than
   competing visually with a crit's "big hit" gold. */
.cr-miss-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  background: #38bdf8;
  color: #082f49;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.03em;
  animation: cr-crit-pop 0.35s ease-out;
}

.cr-reveal-enter-active, .cr-reveal-leave-active { transition: opacity 0.2s ease; }
.cr-reveal-enter-from, .cr-reveal-leave-to { opacity: 0; }

/* ── Shared status badges (party-wide paralysis either direction) ───────────────────────── */
.cr-status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  margin: 0;
}
.cr-status-good { background: #dcfce7; color: #166534; }
.cr-status-bad { background: #fee2e2; color: #991b1b; }

/* ── Private-raid row + generic small link-style button (lobby controls, copy-link) ──────── */
.cr-private-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
  font-size: 11.5px; color: #78350f; background: rgba(250, 204, 21, 0.15);
  border: 1px solid rgba(250, 204, 21, 0.4); border-radius: 6px; padding: 5px 9px;
}
.cr-link-btn {
  font-size: 11.5px; font-weight: 700; color: #1e3a8a; background: none; border: 1px solid #c7d2fe;
  border-radius: 6px; padding: 4px 10px; cursor: pointer;
}
.cr-link-btn:hover { background: #eef2ff; }
.cr-link-btn:disabled { color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }
.cr-link-btn:disabled:hover { background: none; }
.cr-solo-disabled-note { font-size: 11px; color: #6b7280; font-style: italic; width: 100%; margin: 0; }

.cr-lobby-controls { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.cr-keepopen-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #374151; cursor: pointer; }

/* ── Wind-up telegraph (see raid.currentWindUp) ──────────────────────────────────────────── */
.cr-windup-banner {
  font-size: 12px; font-weight: 700; color: #92400e; background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 6px; padding: 6px 9px; margin: 0;
  display: flex; flex-direction: column; gap: 2px;
}
.cr-windup-hint { font-size: 11px; font-weight: 600; color: #b45309; }
.cr-windup-bonus { font-size: 12px; font-weight: 700; color: #166534; margin: 4px 0 0; }

/* ── Teammate charge indicator in the participant list ──────────────────────────────────── */
.cr-charge-ready {
  color: #ca8a04;
  font-weight: 800;
  text-shadow: 0 0 4px rgba(250, 204, 21, 0.6);
}

/* ── Special attack button — same dormant/charged "epic" treatment as
   components/CMoonBattlePopupHost.vue's solo cbp-special-* block (see that component's own
   comment for the fill/charge-latch rationale), re-colored for this page's light card UI rather
   than the solo popup's dark modal. --cr-special-fill (set inline via specialFillStyle) drives a
   bottom-up gradient fill so the meter visibly climbs with each consecutive hit. */
.cr-special-wrap { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.cr-special-btn {
  position: relative;
  flex: 1;
  overflow: hidden;
  padding: 10px 12px;
  border-radius: 8px;
  border: 2px solid #d4cfa0;
  background:
    linear-gradient(to top, rgba(250, 204, 21, 0.45) 0%, rgba(250, 204, 21, 0.45) var(--cr-special-fill, 0%), transparent var(--cr-special-fill, 0%)),
    #f5f1e0;
  color: rgba(60, 50, 10, 0.55);
  font-weight: bold;
  font-size: 12.5px;
  text-align: left;
  cursor: not-allowed;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.cr-special-btn:disabled { opacity: 0.85; }
.cr-special-label { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; }
.cr-special-icon { font-size: 13px; filter: grayscale(1); transition: filter 0.2s ease; }
.cr-special-meter {
  position: relative; z-index: 1;
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: rgba(60, 50, 10, 0.5);
  margin-top: 2px;
}
.cr-special-glow { position: absolute; inset: 0; z-index: 0; opacity: 0; transition: opacity 0.3s ease; }

/* Charged: gold border, bright icon, pulsing glow sweep — unmistakably "ready to use". */
.cr-special-charged {
  border-color: #ca8a04;
  color: #78350f;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(202, 138, 4, 0.4), inset 0 0 10px rgba(250, 204, 21, 0.3);
  animation: cr-special-pulse 1.4s ease-in-out infinite;
}
.cr-special-charged .cr-special-icon { filter: none; text-shadow: 0 0 6px #facc15; }
.cr-special-charged .cr-special-meter { color: #78350f; }
.cr-special-charged .cr-special-glow {
  opacity: 1;
  background: radial-gradient(circle at 30% 50%, rgba(255, 237, 160, 0.5), transparent 70%);
}
.cr-special-charged:active { transform: translateY(1px); }
@keyframes cr-special-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(202, 138, 4, 0.3), inset 0 0 8px rgba(250, 204, 21, 0.25); }
  50% { box-shadow: 0 0 20px rgba(202, 138, 4, 0.6), inset 0 0 14px rgba(250, 204, 21, 0.45); }
}
@media (prefers-reduced-motion: reduce) {
  .cr-special-charged { animation: none; }
}

.cr-special-help {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.6);
  font-weight: 800;
  font-size: 12px;
  cursor: pointer;
}
.cr-special-help:hover { background: rgba(0, 0, 0, 0.1); }
.cr-special-tooltip {
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  width: 220px;
  z-index: 10;
  text-align: left;
  background: #0a1f3a;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cr-special-tooltip-title { font-weight: 800; color: #facc15; margin-bottom: 3px; }
.cr-special-tooltip-charge { color: rgba(255, 255, 255, 0.55); margin-top: 4px; }

.cr-special-flash {
  font-size: 12px;
  font-weight: 700;
  margin: 4px 0 0;
  animation: cr-special-flash-pop 0.4s ease-out;
}
.cr-special-flash-player { color: #ca8a04; }
.cr-special-flash-enemy { color: #dc2626; }
@keyframes cr-special-flash-pop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .cr-special-flash { animation: none; }
}
</style>
