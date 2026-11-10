<template>
  <NuxtLayout name="newsite-template">
    <div class="max-w-2xl mx-auto p-4 space-y-4">
      <div v-if="!match" class="bg-white rounded border p-4 text-sm text-gray-500">
        {{ pvpSocket.lastError.value || 'Loading match…' }}
      </div>

      <template v-else>
        <div
          class="cr-card bg-white rounded border p-4 space-y-3"
          :class="{ 'cr-result-flash-win': resultFlash === 'win', 'cr-result-flash-loss': resultFlash === 'loss' }"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <h1 class="font-bold text-lg">cMoon PvP</h1>
              <p class="text-xs text-gray-500">
                {{ teamAParticipants.length }}v{{ teamBParticipants.length }}
                <span v-if="match.isPrivate"> · 🔒 Private</span>
              </p>
            </div>
          </div>

          <Transition name="cr-reveal">
            <p v-if="captainEntranceBanner" class="cr-captain-banner">{{ captainEntranceBanner }}</p>
          </Transition>

          <div v-if="match.isPrivate" class="cr-private-row">
            <span>🔒 Private match — only reachable via this page's own link.</span>
            <button type="button" class="cr-link-btn" @click="copyInviteLink">{{ inviteLinkCopied ? 'Copied!' : 'Copy invite link' }}</button>
          </div>

          <!-- ── FORMING: two team rosters + join countdown + lobby controls ──────────────── -->
          <div v-if="match.status === 'FORMING'" class="space-y-3">
            <p class="text-sm text-gray-600">
              <template v-if="match.leaderKeepOpen">The match leader is keeping the lobby open.</template>
              <template v-else>Joining closes in <span class="font-semibold tabular-nums">{{ joinCountdown }}s</span></template>
              — up to {{ match.maxTeamSize }} players a side.
            </p>

            <div class="cr-teamcols">
              <div class="cr-teamcol">
                <p class="cr-teamcol-title">Team A — {{ teamAParticipants.length }}/{{ match.maxTeamSize }}</p>
                <ul class="cr-roster">
                  <li v-for="p in teamAParticipants" :key="p.userId"><CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" /></li>
                  <li v-for="n in Math.max(0, match.maxTeamSize - teamAParticipants.length)" :key="`a-open-${n}`" class="cr-roster-open">Open slot</li>
                </ul>
                <button
                  v-if="!hasJoined" type="button"
                  class="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  :disabled="teamAParticipants.length >= match.maxTeamSize" @click="pvpSocket.joinMatch(matchId, 'A')"
                >Join Team A</button>
              </div>
              <div class="cr-teamcol">
                <p class="cr-teamcol-title">Team B — {{ teamBParticipants.length }}/{{ match.maxTeamSize }}</p>
                <ul class="cr-roster">
                  <li v-for="p in teamBParticipants" :key="p.userId"><CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" /></li>
                  <li v-for="n in Math.max(0, match.maxTeamSize - teamBParticipants.length)" :key="`b-open-${n}`" class="cr-roster-open">Open slot</li>
                </ul>
                <button
                  v-if="!hasJoined" type="button"
                  class="px-4 py-2 text-sm font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  :disabled="teamBParticipants.length >= match.maxTeamSize" @click="pvpSocket.joinMatch(matchId, 'B')"
                >Join Team B</button>
              </div>
            </div>

            <template v-if="hasJoined">
              <p class="text-sm text-green-700 font-medium">You're in on Team {{ myTeam }} — waiting for the fight to start…</p>
              <button type="button" class="cr-link-btn text-red-600" @click="leaveMatchAndGoHome">Leave match</button>
            </template>

            <div v-if="isInitiator" class="cr-lobby-controls">
              <label class="cr-keepopen-toggle">
                <input type="checkbox" :checked="match.leaderKeepOpen" @change="pvpSocket.toggleKeepOpen(matchId, $event.target.checked)" />
                Keep lobby open past the usual window
              </label>
              <button
                type="button" class="cr-link-btn" :disabled="!bothTeamsReady"
                @click="pvpSocket.forceStartMatch(matchId)"
              >Start now</button>
              <p v-if="!bothTeamsReady" class="cr-solo-disabled-note">Both teams need at least one player before you can start.</p>
              <button
                type="button" class="cr-link-btn text-red-600" :disabled="!cancelMatchEnabled"
                :title="cancelMatchEnabled ? '' : 'Available once the lobby has been open 90s with fewer than 3 total players'"
                @click="cancelMatchAndGoHome"
              >Cancel match</button>
            </div>

            <button
              v-if="!isInitiator && hasJoined && match.speedVoteRequired != null"
              type="button" class="cr-link-btn" @click="pvpSocket.voteSpeedUp(matchId)"
            >Vote to start in 5s ({{ match.speedVoteCount }}/{{ match.speedVoteRequired }})</button>
            <p v-else-if="!isInitiator && hasJoined" class="cr-solo-disabled-note">At least 3 total players are needed before the lobby can vote to start early.</p>
          </div>

          <!-- ── IN_PROGRESS: live combat, two columns ─────────────────────────────────────── -->
          <div v-else-if="match.status === 'IN_PROGRESS'" class="space-y-3">
            <div class="cr-shake-zone" :class="{ 'cr-shake': shaking }">
              <p class="text-xs text-gray-500">
                Round {{ match.roundNumber }} · acting in <span class="font-semibold tabular-nums">{{ roundCountdown }}s</span>
              </p>

              <div class="cr-teamcols">
                <div class="cr-teamcol">
                  <p class="cr-teamcol-title">Team A</p>
                  <ul class="space-y-2">
                    <li v-for="p in teamAParticipants" :key="p.userId" class="cr-fighter-row text-xs relative">
                      <div class="cr-fighter-line">
                        <CMoonRaidFighter :participant="p" variant="compact" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" class="cr-fighter-badge" />
                        <span v-if="p.specialAttack && !p.knockedOut" class="text-[10px] flex-shrink-0" :title="p.specialAttack.name" :class="p.specialCharged ? 'cr-charge-ready' : 'text-gray-400'">★{{ p.specialCharged ? '' : Math.min(p.hitStreak, p.hitStreakThreshold || 3) + '/' + (p.hitStreakThreshold || 3) }}</span>
                        <span v-if="p.knockedOut" class="cr-fighter-status text-red-500">KO</span>
                        <span v-else-if="p.hasActed" class="cr-fighter-status text-green-600">Ready</span>
                        <span v-else class="cr-fighter-status text-gray-400">Deciding…</span>
                        <span v-if="p.poisonTurnsRemaining > 0" class="cr-fighter-status cr-status-bad" :title="`${p.poisonAmount} damage/round for ${p.poisonTurnsRemaining} more round(s)`">☠️ {{ p.poisonTurnsRemaining }}</span>
                      </div>
                      <div class="cr-hp-line">
                        <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                          <div class="h-full transition-all" :class="participantHpFillClass(p)" :style="{ width: (p.hpRemaining / (p.maxHp || 1) * 100) + '%' }"></div>
                        </div>
                        <span class="w-10 flex-shrink-0 text-right tabular-nums">{{ p.hpRemaining }}/{{ p.maxHp }}</span>
                        <span v-for="d in floatingFor(p.userId)" :key="d.id" class="cr-dmg-float">-{{ d.amount }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
                <div class="cr-teamcol">
                  <p class="cr-teamcol-title">Team B</p>
                  <ul class="space-y-2">
                    <li v-for="p in teamBParticipants" :key="p.userId" class="cr-fighter-row text-xs relative">
                      <div class="cr-fighter-line">
                        <CMoonRaidFighter :participant="p" variant="compact" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" class="cr-fighter-badge" />
                        <span v-if="p.specialAttack && !p.knockedOut" class="text-[10px] flex-shrink-0" :title="p.specialAttack.name" :class="p.specialCharged ? 'cr-charge-ready' : 'text-gray-400'">★{{ p.specialCharged ? '' : Math.min(p.hitStreak, p.hitStreakThreshold || 3) + '/' + (p.hitStreakThreshold || 3) }}</span>
                        <span v-if="p.knockedOut" class="cr-fighter-status text-red-500">KO</span>
                        <span v-else-if="p.hasActed" class="cr-fighter-status text-green-600">Ready</span>
                        <span v-else class="cr-fighter-status text-gray-400">Deciding…</span>
                        <span v-if="p.poisonTurnsRemaining > 0" class="cr-fighter-status cr-status-bad" :title="`${p.poisonAmount} damage/round for ${p.poisonTurnsRemaining} more round(s)`">☠️ {{ p.poisonTurnsRemaining }}</span>
                      </div>
                      <div class="cr-hp-line">
                        <div class="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                          <div class="h-full transition-all" :class="participantHpFillClass(p)" :style="{ width: (p.hpRemaining / (p.maxHp || 1) * 100) + '%' }"></div>
                        </div>
                        <span class="w-10 flex-shrink-0 text-right tabular-nums">{{ p.hpRemaining }}/{{ p.maxHp }}</span>
                        <span v-for="d in floatingFor(p.userId)" :key="d.id" class="cr-dmg-float">-{{ d.amount }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div class="cr-statusbadges-zone">
                <p v-if="match.teamAParalyzedTurns > 0" class="cr-status-badge cr-status-bad">⚡ Team A is paralyzed — {{ match.teamAParalyzedTurns }} more round{{ match.teamAParalyzedTurns === 1 ? '' : 's' }}</p>
                <p v-if="match.teamBParalyzedTurns > 0" class="cr-status-badge cr-status-bad">⚡ Team B is paralyzed — {{ match.teamBParalyzedTurns }} more round{{ match.teamBParalyzedTurns === 1 ? '' : 's' }}</p>
                <p v-if="match.teamAAtkRaiseTurnsRemaining > 0" class="cr-status-badge cr-status-good">💪 Team A's attack is raised — {{ match.teamAAtkRaiseTurnsRemaining }} more round{{ match.teamAAtkRaiseTurnsRemaining === 1 ? '' : 's' }}</p>
                <p v-if="match.teamBAtkRaiseTurnsRemaining > 0" class="cr-status-badge cr-status-good">💪 Team B's attack is raised — {{ match.teamBAtkRaiseTurnsRemaining }} more round{{ match.teamBAtkRaiseTurnsRemaining === 1 ? '' : 's' }}</p>
              </div>

              <div class="cr-announce-overlay" aria-live="polite">
                <Transition name="cr-reveal">
                  <div v-if="lastRoundSummary" :key="lastRoundSummary.roundNumber" class="cr-reveal-panel">
                    <p class="cr-reveal-headline">Round {{ lastRoundSummary.roundNumber }}</p>
                    <ul class="cr-reveal-list">
                      <li v-for="r in lastRoundSummary.participants" :key="r.userId" class="cr-reveal-row">
                        <span class="cr-reveal-name">{{ r.username || 'Someone' }}</span>
                        <span class="cr-reveal-outcome">{{ describeRow(r) }}</span>
                      </li>
                    </ul>
                    <p v-for="(s, i) in (lastRoundSummary.specials || [])" :key="i" class="cr-special-flash cr-special-flash-player">
                      <template v-if="s.missed">{{ s.username || 'Someone' }} tried to unleash <strong>{{ s.name }}</strong><span class="cr-miss-badge">MISS!</span></template>
                      <template v-else-if="s.fizzled">✨ {{ s.username || 'Someone' }} tried to unleash <strong>{{ s.name }}</strong>, but it had no effect!</template>
                      <template v-else>✨ {{ s.username || 'Someone' }} unleashed <strong>{{ s.name }}</strong>!</template>
                    </p>
                  </div>
                </Transition>
                <p v-if="comboCallout" class="cr-combo-callout">{{ comboCallout }}</p>
                <p v-if="specialUseCallout" class="cr-combo-callout cr-special-use-callout">{{ specialUseCallout }}</p>
              </div>
            </div>

            <div class="cr-action-notice-zone">
              <p v-if="pvpSocket.lastError.value" class="text-sm text-red-600">{{ pvpSocket.lastError.value }}</p>
            </div>

            <template v-if="myself && !myself.knockedOut">
              <p v-if="myself.hasActed" class="text-sm text-gray-500">Locked in — waiting on everyone else…</p>
              <div v-else class="grid grid-cols-2 gap-2">
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_HIGH')">Attack High</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-red-600 text-white hover:bg-red-700" @click="act('ATTACK_LOW')">Attack Low</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_HIGH')">Block High</button>
                <button type="button" class="px-2 py-2 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700" @click="act('BLOCK_LOW')">Block Low</button>
              </div>

              <div v-if="myself.specialAttack && !myself.hasActed" class="cr-special-wrap">
                <button
                  type="button" class="cr-special-btn" :class="{ 'cr-special-charged': myself.specialCharged && myTeamParalyzedTurns === 0 }"
                  :disabled="!myself.specialCharged || myTeamParalyzedTurns > 0" :style="specialFillStyle"
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
            <p v-else-if="myself" class="text-sm text-gray-500">You've been knocked out — watching the rest of the fight.</p>
          </div>

          <!-- ── RESOLVED: outcome + rewards ───────────────────────────────────────────────── -->
          <div v-else class="border rounded p-3 space-y-2" :class="iWon ? 'bg-green-50 border-green-200' : 'bg-gray-50'">
            <p class="font-semibold">{{ outcomeLabel }}</p>
            <div class="cr-teamcols">
              <div class="cr-teamcol">
                <p class="cr-teamcol-title">Team A</p>
                <ul class="cr-roster"><li v-for="p in teamAParticipants" :key="p.userId"><CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" /></li></ul>
              </div>
              <div class="cr-teamcol">
                <p class="cr-teamcol-title">Team B</p>
                <ul class="cr-roster"><li v-for="p in teamBParticipants" :key="p.userId"><CMoonRaidFighter :participant="p" :is-me="p.userId === user?.id" :knocked-out="p.knockedOut" /></li></ul>
              </div>
            </div>
            <template v-if="iWon">
              <div v-if="myRewardsList.length" class="cr-rewards">
                <p class="cr-rewards-title">Your prizes:</p>
                <ul><li v-for="(r, i) in myRewardsList" :key="i" class="cr-reward-item" :style="{ animationDelay: (i * 150) + 'ms' }">{{ r }}</li></ul>
              </div>
              <p class="text-xs text-gray-600">Everyone on the winning side received the same prize, and cMoon points went to each player's own cMoon.</p>
            </template>
            <template v-else-if="myRewardsList.length">
              <div class="cr-rewards">
                <p class="cr-rewards-title">A consolation prize for playing:</p>
                <ul><li v-for="(r, i) in myRewardsList" :key="i" class="cr-reward-item" :style="{ animationDelay: (i * 150) + 'ms' }">{{ r }}</li></ul>
              </div>
            </template>
            <div class="flex items-center gap-2 flex-wrap">
              <NuxtLink to="/newsite/home" class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50">Back home</NuxtLink>
              <button
                v-if="match.battleReport" type="button"
                class="inline-block px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50"
                @click="showBattleReport = true"
              >📊 Click to view battle report</button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <CMoonPvpVsBanner :show="showVsBanner" :team-a="vsBannerTeamA" :team-b="vsBannerTeamB" @done="showVsBanner = false" />

    <CMoonPvpBattleReportModal
      v-if="showBattleReport && match?.battleReport"
      :report="match.battleReport"
      :my-user-id="user?.id"
      @close="showBattleReport = false"
    />

    <CMoonEnemyMapBackground
      v-if="match?.map"
      :animation="match.map.backgroundAnimation" :color="match.map.backgroundColor"
    />
    <CMoonEnemyMapInfoModal
      v-if="showMapInfoModal && match?.map"
      :map="match.map" context="pvp" @understood="showMapInfoModal = false"
    />
  </NuxtLayout>
</template>

<script setup>
// cMoon PvP battle page — direct structural port of pages/newsite/cmoon-raid/[id].vue, doubled for
// two team rosters instead of one party-vs-boss layout. See that page's own extensive comments for
// the "why" behind most of the UI mechanics ported here unchanged (reserved-height notice zones to
// stop a misclick bug, screenshake scoped away from the action buttons, etc). V1 drops: wind-up
// telegraphs, faction taunts, and per-round sound/music (none of these have a PvP analog — see
// cmoonPvpSocket.js's own header comment on scope).
definePageMeta({ mainContentScrollY: true })

const route = useRoute()
const matchId = computed(() => route.params.id)
const { user } = useAuth()
const pvpSocket = useCMoonPvpSocket()
const match = computed(() => pvpSocket.matchState.value?.id === matchId.value ? pvpSocket.matchState.value : null)

function leaveMatchAndGoHome() {
  pvpSocket.leaveMatch(matchId.value)
  navigateTo('/newsite/home')
}

const hasJoined = computed(() => !!match.value?.participants.some(p => p.userId === user.value?.id))
const myself = computed(() => match.value?.participants.find(p => p.userId === user.value?.id) || null)
const myTeam = computed(() => myself.value?.team || null)
const myTeamParalyzedTurns = computed(() => myTeam.value ? (match.value?.[`team${myTeam.value}ParalyzedTurns`] || 0) : 0)
const teamAParticipants = computed(() => (match.value?.participants || []).filter(p => p.team === 'A'))
const teamBParticipants = computed(() => (match.value?.participants || []).filter(p => p.team === 'B'))
const bothTeamsReady = computed(() => teamAParticipants.value.length > 0 && teamBParticipants.value.length > 0)
const isInitiator = computed(() => !!match.value?.participants.find(p => p.userId === user.value?.id)?.isInitiator)

const lastRoundSummary = computed(() => pvpSocket.lastRound.value ? { ...pvpSocket.lastRound.value } : null)

const outcomeLabel = computed(() => {
  if (match.value?.outcome === 'TEAM_A_WIN') return 'Team A wins!'
  if (match.value?.outcome === 'TEAM_B_WIN') return 'Team B wins!'
  return 'The match ran out of rounds and was abandoned.'
})
const iWon = computed(() => !!myTeam.value && (
  (myTeam.value === 'A' && match.value?.outcome === 'TEAM_A_WIN') ||
  (myTeam.value === 'B' && match.value?.outcome === 'TEAM_B_WIN')
))

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

// One line per round participant row — mirrors cmoon-raid/[id].vue's revealRowClass/describe
// logic, generalized for "my own attack result" + "what happened to me" both living on the same
// row (see resolvePvpRound's own perParticipant shape in cmoonPvp.js), since PvP has no single
// shared "the enemy" to split those two halves across.
function describeRow(r) {
  const parts = []
  if (r.action === 'ATTACK_HIGH' || r.action === 'ATTACK_LOW') {
    const targetName = targetUsernameFor(r.targetUserId)
    parts.push(r.hit ? `attacked ${targetName} and hit for ${r.damageDealt}` : `attacked ${targetName} but it was blocked`)
  } else if (r.action === 'BLOCK_HIGH' || r.action === 'BLOCK_LOW') {
    parts.push(r.blocked ? 'blocked and healed 1 HP' : 'blocked')
  }
  if (r.damageTaken > 0) parts.push(`took ${r.damageTaken} damage`)
  if (r.knockedOut) parts.push('knocked out!')
  return parts.length ? parts.join(' · ') : 'held steady'
}
function targetUsernameFor(userId) {
  return lastRoundSummary.value?.participants?.find(r => r.userId === userId)?.username
    || match.value?.participants.find(p => p.userId === userId)?.username
    || 'their target'
}

function act(action) {
  if (!match.value) return
  pvpSocket.submitAction(matchId.value, action, match.value.roundNumber)
}

function specialEffectDescription(attack) {
  const n = attack?.amount
  switch (attack?.effectType) {
    case 'DAMAGE_OPPONENT': return `Deals ${n} guaranteed damage to a random opponent, bypassing block.`
    case 'HEAL_SELF': return attack?.healsAllies ? `Heals you and your whole team for ${n} HP.` : `Heals you for ${n} HP.`
    case 'PARALYZE_OPPONENT': return `Stuns the opposing team for ${n} round${n === 1 ? '' : 's'} — they can't act.`
    case 'LOWER_OPPONENT_ATTACK': return `Lowers the opposing team's attack damage by ${n} for the rest of the match.`
    case 'RAISE_ALLY_ATTACK': return `Raises your whole team's attack damage by ${n} for the rest of the match.`
    case 'REFLECT_DAMAGE': return `Reflects ${attack?.reflectPercent}% of whatever damage you personally take this round back at a random attacker who hit you. Can't stack with another reflect cast by your team the same round.`
    case 'SIPHON_HEALTH': return attack?.healsAllies
      ? `Deals ${n} damage to a random opponent and heals you and your team for ${attack?.siphonPercent}% of it — unless they block, in which case it does nothing.`
      : `Deals ${n} damage to a random opponent and heals you for ${attack?.siphonPercent}% of it — unless they block, in which case it does nothing.`
    case 'POISON_OPPONENT': return `Poisons a random opponent for ${n} damage at the end of each round, for ${attack?.poisonDurationRounds} round${attack?.poisonDurationRounds === 1 ? '' : 's'}. Re-casting refreshes it rather than stacking.`
    case 'CLEANSE_SELF': return attack?.healsAllies
      ? `Cures you and your whole team of paralysis and poison${attack?.cleanseAlsoHeals ? `, healing ${n} HP too` : ''}.`
      : `Cures you of poison, and your whole team of paralysis${attack?.cleanseAlsoHeals ? `, healing ${n} HP too` : ''}.`
    case 'SHIELD_PARTY': return `Negates ALL damage your team would take this round, from ordinary attacks and any special cast against you.`
    default: return ''
  }
}
const showSpecialInfo = ref(false)
const showBattleReport = ref(false)
const hitStreakThreshold = computed(() => myself.value?.hitStreakThreshold ?? 3)
const specialFillStyle = computed(() => {
  const pct = myself.value?.specialCharged ? 100 : Math.min(100, Math.round(((myself.value?.hitStreak || 0) / hitStreakThreshold.value) * 100))
  return { '--cr-special-fill': pct + '%' }
})

const joinCountdown = ref(0)
let countdownTimer = null
function tickCountdown() {
  if (!match.value?.joinDeadlineAt) { joinCountdown.value = 0; return }
  joinCountdown.value = Math.max(0, Math.ceil((match.value.joinDeadlineAt - Date.now()) / 1000))
}
const secondsSinceStart = ref(0)
function tickSecondsSinceStart() {
  if (!match.value?.startedAt) { secondsSinceStart.value = 0; return }
  secondsSinceStart.value = Math.max(0, Math.floor((Date.now() - match.value.startedAt) / 1000))
}
const cancelMatchEnabled = computed(() =>
  isInitiator.value && secondsSinceStart.value >= 90 && (match.value?.participants.length || 0) < 3)
function cancelMatchAndGoHome() {
  pvpSocket.cancelMatch(matchId.value)
  navigateTo('/newsite/home')
}

const roundCountdown = ref(0)
let roundCountdownTimer = null
function tickRoundCountdown() {
  if (!match.value?.roundDeadlineAt) { roundCountdown.value = 0; return }
  roundCountdown.value = Math.max(0, Math.ceil((match.value.roundDeadlineAt - Date.now()) / 1000))
}

const inviteLinkCopied = ref(false)
async function copyInviteLink() {
  if (typeof window === 'undefined') return
  try {
    await navigator.clipboard.writeText(window.location.href)
    inviteLinkCopied.value = true
    setTimeout(() => { inviteLinkCopied.value = false }, 2000)
  } catch {}
}

// ── Per-row floating damage — unlike the raid page's own single "my HP" + "shared boss bar" pair,
// PvP has no shared bar, so every row that took damage this round gets its own pop, keyed by
// userId so FighterRow (below) can look its own up without a prop drilled per-round.
const floatingDamageByUser = ref(new Map())
let floatingDamageSeq = 0
const FLOATING_DAMAGE_LIFETIME_MS = 900
function floatingFor(userId) {
  return floatingDamageByUser.value.get(userId) || []
}

const comboCallout = ref('')
let comboTimer = null
const specialUseCallout = ref('')
let specialUseTimer = null
const resultFlash = ref('')
let resultFlashTimer = null
watch(() => match.value?.status, (status) => {
  if (status === 'RESOLVED' && match.value?.outcome && match.value.outcome !== 'ABANDONED') {
    resultFlash.value = iWon.value ? 'win' : 'loss'
    if (resultFlashTimer) clearTimeout(resultFlashTimer)
    resultFlashTimer = setTimeout(() => { resultFlash.value = '' }, 500)
  }
})

const shaking = ref(false)
let shakeTimer = null
function triggerShake() {
  if (shakeTimer) clearTimeout(shakeTimer)
  shaking.value = false
  requestAnimationFrame(() => {
    shaking.value = true
    shakeTimer = setTimeout(() => { shaking.value = false }, 450)
  })
}

watch(() => pvpSocket.lastRound.value, (round) => {
  if (!round?.participants?.length) return

  const anyHit = round.participants.some(r => r.hit || r.damageTaken > 0)
  if (anyHit) triggerShake()

  const specials = round.specials || []
  if (specials.length) {
    specialUseCallout.value = specials.map(s => `${s.username || 'Someone'} used ${s.name}!`).join('  ')
    if (specialUseTimer) clearTimeout(specialUseTimer)
    specialUseTimer = setTimeout(() => { specialUseCallout.value = '' }, 1600)
  }

  for (const r of round.participants) {
    if (!r.damageTaken) continue
    const id = ++floatingDamageSeq
    const next = new Map(floatingDamageByUser.value)
    next.set(r.userId, [...(next.get(r.userId) || []), { id, amount: r.damageTaken }])
    floatingDamageByUser.value = next
    setTimeout(() => {
      const map = new Map(floatingDamageByUser.value)
      map.set(r.userId, (map.get(r.userId) || []).filter(d => d.id !== id))
      floatingDamageByUser.value = map
    }, FLOATING_DAMAGE_LIFETIME_MS)
  }
})

const myHitStreak = computed(() => myself.value?.hitStreak || 0)
watch(myHitStreak, (streak, prevStreak) => {
  if (streak > 0 && streak > (prevStreak || 0)) {
    comboCallout.value = `${streak}x HIT STREAK!`
    if (comboTimer) clearTimeout(comboTimer)
    comboTimer = setTimeout(() => { comboCallout.value = '' }, 1200)
  }
})

// ── Captain entrance banner — same one-time "epic" moment as cmoon-raid/[id].vue's own, naming
// every cMoon captain across BOTH teams.
const captainEntranceBanner = ref('')
let captainEntranceTimer = null
function joinWithAnd(names) {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}
let announcedMatchId = null
watch(match, (m) => {
  if (!m || announcedMatchId === m.id) return
  announcedMatchId = m.id
  const captains = (m.participants || []).filter(p => p.isCaptain)
  if (captains.length) {
    const names = captains.map(p => p.username || 'Someone')
    const plural = names.length > 1
    captainEntranceBanner.value = `🎖️ ${joinWithAnd(names)} ${plural ? 'have' : 'has'} entered the battle as ${plural ? 'cMoon Captains' : 'a cMoon Captain'} — fight with honor!`
    if (captainEntranceTimer) clearTimeout(captainEntranceTimer)
    captainEntranceTimer = setTimeout(() => { captainEntranceBanner.value = '' }, 4000)
  }
})

// ── VS banner — fires the first time this match is seen as IN_PROGRESS (covers both "I was here
// when it started" and "I opened a link to one already fighting").
const showVsBanner = ref(false)
function teamBannerInfo(list) {
  const named = list.find(p => p.cMoon?.name) || null
  const captains = list.filter(p => p.isCaptain).map(p => p.username || 'Someone')
  return { name: named?.cMoon?.name || 'Mixed squad', color: named?.cMoon?.color || null, captains }
}
const vsBannerTeamA = computed(() => teamBannerInfo(teamAParticipants.value))
const vsBannerTeamB = computed(() => teamBannerInfo(teamBParticipants.value))
let vsBannerShownForMatchId = null
watch(() => match.value?.status, (status) => {
  if (status === 'IN_PROGRESS' && vsBannerShownForMatchId !== match.value?.id) {
    vsBannerShownForMatchId = match.value?.id
    showVsBanner.value = true
  }
}, { immediate: true })

// Map info modal — same "I Understand" explainer as cmoon-raid/[id].vue's own, shown once this
// match reaches IN_PROGRESS and only for a non-base active map.
const showMapInfoModal = ref(false)
let mapInfoShownForMatchId = null
watch(() => match.value?.status, (status) => {
  if (status !== 'IN_PROGRESS') return
  if (!match.value?.map || match.value.map.isBaseMap) return
  if (mapInfoShownForMatchId === match.value.id) return
  mapInfoShownForMatchId = match.value.id
  showMapInfoModal.value = true
})

onMounted(() => {
  pvpSocket.getState(matchId.value)
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
  if (resultFlashTimer) clearTimeout(resultFlashTimer)
})

function participantHpFillClass(p) {
  const pct = Math.max(0, Math.min(100, Math.round((p.hpRemaining / (p.maxHp || 1)) * 100)))
  if (pct <= 25) return 'bg-red-500'
  if (pct <= 50) return 'bg-amber-500'
  return 'bg-green-500'
}
</script>

<style scoped>
.cr-teamcols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
@media (max-width: 480px) { .cr-teamcols { grid-template-columns: 1fr; } }
.cr-teamcol-title { font-size: 11px; font-weight: 800; color: #1e3a8a; margin: 0 0 4px; }
.cr-roster { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cr-roster-open {
  display: flex; align-items: center; justify-content: center; min-height: 48px;
  border: 2px dashed #cbd5e1; border-radius: 10px; color: #94a3b8; font-size: 12px; font-weight: 700;
}
.cr-fighter-row { display: flex; flex-direction: column; gap: 4px; }
.cr-fighter-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cr-fighter-badge { flex: 0 1 auto; min-width: 0; }
.cr-fighter-status { margin-left: auto; font-size: 10px; flex-shrink: 0; }
.cr-hp-line { position: relative; display: flex; align-items: center; gap: 8px; padding-left: 4px; }

.cr-shake-zone { position: relative; display: flex; flex-direction: column; gap: 12px; }
.cr-announce-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; padding: 0 4px; pointer-events: none; z-index: 5;
}
@keyframes cr-shake-kf {
  10%, 90% { transform: translateX(-1px); }
  20%, 80% { transform: translateX(2px); }
  30%, 50%, 70% { transform: translateX(-4px); }
  40%, 60% { transform: translateX(4px); }
}
.cr-shake { animation: cr-shake-kf 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
@media (prefers-reduced-motion: reduce) { .cr-shake { animation: none; } }

.cr-result-flash-win, .cr-result-flash-loss { position: relative; }
.cr-result-flash-win::after, .cr-result-flash-loss::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  animation: cr-result-flash-fade 0.5s ease-out forwards;
}
.cr-result-flash-win::after { background: radial-gradient(circle, rgba(74, 222, 128, 0.35), transparent 70%); }
.cr-result-flash-loss::after { background: radial-gradient(circle, rgba(248, 113, 113, 0.35), transparent 70%); }
@keyframes cr-result-flash-fade { 0% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .cr-result-flash-win::after, .cr-result-flash-loss::after { animation: none; display: none; }
}

.cr-dmg-float {
  position: absolute; right: 44px; top: -2px; font-size: 12px; font-weight: 800; color: #dc2626;
  pointer-events: none; animation: cr-dmg-float-up 0.9s ease-out forwards;
}
@keyframes cr-dmg-float-up {
  0% { transform: translateY(4px); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(-24px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .cr-dmg-float { animation: none; opacity: 0; } }

.cr-combo-callout { font-size: 14px; font-weight: 800; color: #ca8a04; text-align: center; margin: 2px 0; animation: cr-combo-pop 0.4s ease-out; }
@keyframes cr-combo-pop {
  0% { transform: scale(0.7); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .cr-combo-callout { animation: none; } }
.cr-special-use-callout { color: #7e22ce; background: rgba(168, 85, 247, 0.12); border-radius: 6px; padding: 4px 10px; }

.cr-statusbadges-zone { height: 72px; overflow-y: auto; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 4px; }
.cr-action-notice-zone { height: 44px; overflow-y: auto; -webkit-overflow-scrolling: touch; }

.cr-captain-banner {
  font-size: 13.5px; font-weight: 800; text-align: center; color: #78350f;
  background: linear-gradient(90deg, rgba(250, 204, 21, 0.25), rgba(250, 204, 21, 0.5), rgba(250, 204, 21, 0.25));
  border: 1px solid #d97706; border-radius: 8px; padding: 7px 12px; margin: 0;
  box-shadow: 0 0 16px rgba(250, 204, 21, 0.5); animation: cr-captain-banner-pop 0.5s ease-out;
}
@keyframes cr-captain-banner-pop {
  0% { transform: scale(0.9); opacity: 0; }
  60% { transform: scale(1.03); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .cr-captain-banner { animation: none; } }

.cr-rewards { text-align: left; background: rgba(0, 0, 0, 0.04); border-radius: 6px; padding: 7px 9px; }
.cr-rewards-title { font-size: 10.5px; font-weight: 700; color: #6b7280; margin-bottom: 3px; }
.cr-rewards ul { margin: 0; padding-left: 16px; font-size: 11.5px; }
.cr-reward-item { opacity: 0; animation: cr-reward-pop 0.35s ease-out forwards; }
@keyframes cr-reward-pop {
  0% { transform: translateX(-6px); opacity: 0; }
  100% { transform: translateX(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .cr-reward-item { opacity: 1; animation: none; } }

.cr-reveal-panel { border-radius: 8px; padding: 10px 12px; background: #0d2a4d; color: #fff; font-size: 12px; }
.cr-reveal-headline { font-weight: 600; margin-bottom: 6px; }
.cr-reveal-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cr-reveal-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cr-reveal-name { font-weight: 600; flex-shrink: 0; }
.cr-reveal-outcome { color: rgba(255, 255, 255, 0.85); }

.cr-miss-badge {
  display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 10px;
  background: #38bdf8; color: #082f49; font-size: 10px; font-weight: 800; letter-spacing: 0.03em;
  animation: cr-crit-pop 0.35s ease-out;
}
@keyframes cr-crit-pop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
.cr-reveal-enter-active, .cr-reveal-leave-active { transition: opacity 0.2s ease; }
.cr-reveal-enter-from, .cr-reveal-leave-to { opacity: 0; }

.cr-status-badge { font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; margin: 0; }
.cr-status-good { background: #dcfce7; color: #166534; }
.cr-status-bad { background: #fee2e2; color: #991b1b; }

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

.cr-charge-ready { color: #ca8a04; font-weight: 800; text-shadow: 0 0 4px rgba(250, 204, 21, 0.6); }

.cr-special-wrap { position: relative; display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.cr-special-btn {
  position: relative; flex: 1; overflow: hidden; padding: 10px 12px; border-radius: 8px;
  border: 2px solid #d4cfa0;
  background:
    linear-gradient(to top, rgba(250, 204, 21, 0.45) 0%, rgba(250, 204, 21, 0.45) var(--cr-special-fill, 0%), transparent var(--cr-special-fill, 0%)),
    #f5f1e0;
  color: rgba(60, 50, 10, 0.55); font-weight: bold; font-size: 12.5px; text-align: left; cursor: not-allowed;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.cr-special-btn:disabled { opacity: 0.85; }
.cr-special-label { position: relative; z-index: 1; display: flex; align-items: center; gap: 5px; }
.cr-special-icon { font-size: 13px; filter: grayscale(1); transition: filter 0.2s ease; }
.cr-special-meter { position: relative; z-index: 1; display: block; font-size: 10px; font-weight: 700; color: rgba(60, 50, 10, 0.5); margin-top: 2px; }
.cr-special-glow { position: absolute; inset: 0; z-index: 0; opacity: 0; transition: opacity 0.3s ease; }

.cr-special-charged {
  border-color: #ca8a04; color: #78350f; cursor: pointer;
  box-shadow: 0 0 14px rgba(202, 138, 4, 0.4), inset 0 0 10px rgba(250, 204, 21, 0.3);
  animation: cr-special-pulse 1.4s ease-in-out infinite;
}
.cr-special-charged .cr-special-icon { filter: none; text-shadow: 0 0 6px #facc15; }
.cr-special-charged .cr-special-meter { color: #78350f; }
.cr-special-charged .cr-special-glow { opacity: 1; background: radial-gradient(circle at 30% 50%, rgba(255, 237, 160, 0.5), transparent 70%); }
.cr-special-charged:active { transform: translateY(1px); }
@keyframes cr-special-pulse {
  0%, 100% { box-shadow: 0 0 10px rgba(202, 138, 4, 0.3), inset 0 0 8px rgba(250, 204, 21, 0.25); }
  50% { box-shadow: 0 0 20px rgba(202, 138, 4, 0.6), inset 0 0 14px rgba(250, 204, 21, 0.45); }
}
@media (prefers-reduced-motion: reduce) { .cr-special-charged { animation: none; } }

.cr-special-help {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 999px; border: 1px solid rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.04); color: rgba(0, 0, 0, 0.6); font-weight: 800; font-size: 12px; cursor: pointer;
}
.cr-special-help:hover { background: rgba(0, 0, 0, 0.1); }
.cr-special-tooltip {
  position: absolute; bottom: calc(100% + 6px); right: 0; width: 220px; z-index: 10; text-align: left;
  background: #0a1f3a; border: 1px solid #1e3a5f; border-radius: 6px; padding: 8px 10px; font-size: 11px;
  line-height: 1.4; color: rgba(255, 255, 255, 0.85); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.cr-special-tooltip-title { font-weight: 800; color: #facc15; margin-bottom: 3px; }
.cr-special-tooltip-charge { color: rgba(255, 255, 255, 0.55); margin-top: 4px; }

.cr-special-flash { font-size: 12px; font-weight: 700; margin: 4px 0 0; animation: cr-special-flash-pop 0.4s ease-out; }
.cr-special-flash-player { color: #ca8a04; }
@keyframes cr-special-flash-pop {
  0% { transform: scale(0.85); opacity: 0; }
  60% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) { .cr-special-flash { animation: none; } }
</style>
