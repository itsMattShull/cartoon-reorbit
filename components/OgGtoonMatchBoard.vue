<!-- components/OgGtoonMatchBoard.vue -->
<template>
  <div class="og-board text-white h-full">
    <div v-if="!matchState" class="flex h-full items-center justify-center">
      <p class="text-gray-300 animate-pulse">Loading match...</p>
    </div>

    <template v-else>
      <!-- First 10 seconds: both players see the goal cards, how the game is decided and a countdown. -->
      <OgGtoonMatchIntro
        v-if="introActive"
        :you="{ name: matchState.you.username || 'You', color: matchState.you.goalColor, card: matchState.you.goalCard }"
        :opponent="{ name: matchState.opponent.username || 'Opponent', color: matchState.opponent.goalColor, card: matchState.opponent.goalCard }"
        :seconds="introSeconds"
      />
      <div v-else class="og-layout">
        <!-- Board: opponent on top, you on the bottom, call-to-action strip between -->
        <section class="og-arena" data-tut="arena">
          <div v-if="sidebarState" class="og-pbar" data-tut="pbar-opp">
            <span class="og-pbar-name">{{ sidebarState.opponent.name }}</span>
            <span class="og-pbar-score">{{ sidebarState.opponent.score }}</span>
            <span v-for="col in sidebarState.colors" :key="col.name" class="og-pbar-color"><i :style="{ background: col.hex }"></i>{{ sidebarState.opponent.counts[col.name] ?? 0 }}</span>
          </div>
          <div class="og-plate og-plate-opp">
            <div class="og-row og-row-outer">
              <div v-for="n in outerSlots" :key="'opp-'+n" class="og-slot" :data-tut="'slot-opp-'+n" @click="onBoardCardClick(oppSlotCard(n))">
                <span v-if="deltaFor(oppSide, n)" class="og-delta" :class="deltaFor(oppSide, n) > 0 ? 'text-green-400' : 'text-red-500'">{{ deltaFor(oppSide, n) > 0 ? '+' : '' }}{{ deltaFor(oppSide, n) }}</span>
                <OgGtoonCardTile :card="oppSlotCard(n)" :face-down="oppSlotFaceDown(n)" :label="n" size="board" :inspectable="false" :marker="markerFor(oppSide, n, oppSlotCard(n), oppSlotFaceDown(n))" />
              </div>
            </div>
            <div class="og-row og-row-inner">
              <div v-for="n in innerSlots" :key="'opp-'+n" class="og-slot" :data-tut="'slot-opp-'+n" @click="onBoardCardClick(oppSlotCard(n))">
                <span v-if="deltaFor(oppSide, n)" class="og-delta" :class="deltaFor(oppSide, n) > 0 ? 'text-green-400' : 'text-red-500'">{{ deltaFor(oppSide, n) > 0 ? '+' : '' }}{{ deltaFor(oppSide, n) }}</span>
                <OgGtoonCardTile :card="oppSlotCard(n)" :face-down="oppSlotFaceDown(n)" :label="n" size="board" :inspectable="false" :marker="markerFor(oppSide, n, oppSlotCard(n), oppSlotFaceDown(n))" />
              </div>
            </div>
          </div>

          <!-- Middle strip: round, timer and every call to action -->
          <div class="og-strip" data-tut="strip">
            <div class="og-strip-line">
              <span class="og-round">{{ roundLabel }}</span>
              <span v-if="secondsLeft !== null && !matchEnded" class="og-timer" :class="{ 'og-timer-low': secondsLeft <= 10 }">{{ secondsLeft }}s</span>
              <span class="og-mobile-score">{{ youScore }} – {{ oppScore }}</span>
              <span v-if="isTutorial" class="og-practice" title="Nothing here earns or costs points">Tutorial</span>
              <span v-else-if="isPractice" class="og-practice" title="Nothing here earns or costs points">Practice · Bot: {{ difficultyLabel }}</span>
              <span v-else-if="isTournament" class="og-practice" :title="`${matchState.tournament.name} — best of ${matchState.tournament.bestOf}`">🏆 {{ matchState.tournament.label }} · Game {{ matchState.tournament.gameNumber }}</span>
              <button v-if="isPractice && !isTutorial && !matchEnded" class="og-mini" @click="$emit('exit')">Exit</button>
              <button class="og-help-btn" data-tut="help-btn" :class="{ 'og-help-on': helpOpen }" :aria-expanded="helpOpen" aria-label="How to play this phase" @click="helpOpen = !helpOpen">?</button>
            </div>

            <div class="og-strip-line og-target" data-tut="target" :title="targetInfo.detail">
              <span class="og-target-title">{{ targetInfo.title }}</span>
              <span v-for="col in targetInfo.colors" :key="col" class="og-pbar-color"><i :style="{ background: colorHex(col) }"></i>{{ col.charAt(0) + col.slice(1).toLowerCase() }}</span>
              <span class="og-note">{{ targetInfo.detail }}</span>
            </div>

            <div class="og-strip-line og-actions">
              <template v-if="inDiscardPhase">
                <button v-if="!matchState.you.discardReady" data-tut="discard-btn" @click="confirmDiscard" class="bg-red-500 hover:bg-red-600 og-btn">{{ discardPick.size ? `Discard ${discardPick.size} & draw` : 'Keep my hand' }}</button>
                <span v-else class="og-note">Waiting for opponent to finish discarding...</span>
              </template>
              <template v-else-if="inColorPhase">
                <template v-if="matchState.you.mayChooseColor">
                  <span class="og-note w-full text-center">Your Silver cards count as:</span>
                  <button
                    v-for="c in REAL_COLORS"
                    :key="c"
                    :data-tut="'color-' + c"
                    @click="chooseColor(c)"
                    class="og-color-btn"
                    :class="c === matchState.you.goalColor ? 'og-color-goal' : ''"
                    :title="c.charAt(0) + c.slice(1).toLowerCase()"
                    :aria-label="c.charAt(0) + c.slice(1).toLowerCase()"
                  ><span :style="{ background: colorHex(c) }"></span></button>
                </template>
                <span v-else class="og-note">
                  {{ matchState.you.pendingColor ? `Silver set to ${matchState.you.pendingColor.toLowerCase()} — waiting for opponent...` : 'Waiting for opponent...' }}
                </span>
              </template>
              <template v-else-if="inSwapPhase">
                <template v-if="matchState.you.maySwap">
                  <button data-tut="swap-btn" @click="openSwapSheet" class="bg-indigo-500 hover:bg-indigo-600 og-btn">Swap slot 7 (-10 points)</button>
                  <button @click="swapSkip" class="bg-gray-600 hover:bg-gray-500 og-btn">Keep slot 7</button>
                </template>
                <span v-else class="og-note">Waiting for opponent...</span>
              </template>
              <template v-else>
                <button v-if="canCommit" data-tut="commit" @click="commit(matchState.round)" :disabled="!slotsFilled" class="bg-green-500 hover:bg-green-600 disabled:opacity-50 og-btn">{{ commitLabel }}</button>
                <span v-else-if="matchState.you.ready" class="og-note">Waiting for opponent...</span>
              </template>
            </div>
            <p v-if="lastError" class="og-error">{{ lastError.message }}</p>
            <div v-if="helpOpen" class="og-help">{{ helpText }}</div>
          </div>

          <div class="og-plate og-plate-you">
            <div class="og-row og-row-inner">
              <div v-for="n in innerSlots" :key="'you-'+n" class="og-slot" :data-tut="'slot-you-'+n" @click="onSlotClick(n)">
                <span v-if="deltaFor(youSide, n)" class="og-delta" :class="deltaFor(youSide, n) > 0 ? 'text-green-400' : 'text-red-500'">{{ deltaFor(youSide, n) > 0 ? '+' : '' }}{{ deltaFor(youSide, n) }}</span>
                <OgGtoonCardTile :card="yourSlotCard(n)" :face-down="yourSlotFaceDown(n)" :label="n" size="board" :inspectable="false" :tone="yourSlotTone(n)" :marker="markerFor(youSide, n, yourSlotCard(n), yourSlotFaceDown(n))" />
              </div>
            </div>
            <div class="og-row og-row-outer">
              <div v-for="n in outerSlots" :key="'you-'+n" class="og-slot" :data-tut="'slot-you-'+n" @click="onSlotClick(n)">
                <span v-if="deltaFor(youSide, n)" class="og-delta" :class="deltaFor(youSide, n) > 0 ? 'text-green-400' : 'text-red-500'">{{ deltaFor(youSide, n) > 0 ? '+' : '' }}{{ deltaFor(youSide, n) }}</span>
                <OgGtoonCardTile :card="yourSlotCard(n)" :face-down="yourSlotFaceDown(n)" :label="n" size="board" :inspectable="false" :tone="yourSlotTone(n)" :marker="markerFor(youSide, n, yourSlotCard(n), yourSlotFaceDown(n))" />
              </div>
            </div>
          </div>
          <div v-if="sidebarState" class="og-pbar" data-tut="pbar-you">
            <span class="og-pbar-name">{{ sidebarState.you.name }}</span>
            <span class="og-pbar-score">{{ sidebarState.you.score }}</span>
            <span v-for="col in sidebarState.colors" :key="col.name" class="og-pbar-color"><i :style="{ background: col.hex }"></i>{{ sidebarState.you.counts[col.name] ?? 0 }}</span>
          </div>
        </section>

        <!-- Right column: Game Log / Info on top, your deck (hand) below -->
        <aside class="og-side">
          <div class="og-box og-info-box">
            <div class="og-tabs" role="tablist">
              <button role="tab" data-tut="log-tab" :aria-selected="tab === 'log'" class="og-tab" :class="{ 'og-tab-on': tab === 'log' }" @click="setTab('log')">
                Game Log
                <span v-if="tab !== 'log' && unreadLog > 0" class="og-badge">{{ unreadLog }}</span>
              </button>
              <button role="tab" data-tut="info-tab" :aria-selected="tab === 'info'" class="og-tab" :class="{ 'og-tab-on': tab === 'info' }" @click="setTab('info')">Info</button>
            </div>

            <div v-show="tab === 'log'" ref="logScroller" data-tut="log-panel" class="og-scroll og-log">
              <OgGtoonGameLog :entries="gameLog" />
            </div>

            <div v-show="tab === 'info'" data-tut="info-panel" class="og-scroll og-info">
              <p v-if="!infoCard" class="text-gray-300 text-xs">Click one of your gToons, or any revealed gToon on the board, to see its info here.</p>
              <template v-else>
                <div class="flex items-start gap-3">
                  <div class="w-20 flex-shrink-0">
                    <GtoonCard
                      v-if="shownInfo.assetPath"
                      :key="shownInfo.ctoonId || shownInfo.name"
                      :image-url="shownInfo.assetPath"
                      :value="shownInfo.value"
                      :color="shownInfo.color"
                      :card-style="shownInfo.cardStyle"
                      :seed="String(shownInfo.ctoonId || shownInfo.name)"
                      :alt="shownInfo.name"
                      effects="static"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3 class="text-sm font-semibold leading-tight break-words">{{ shownInfo.name }}</h3>
                    <p class="text-[10px] text-gray-300">Original gToon</p>
                    <span v-if="infoDetail?.power?.isSlam" class="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-black px-1.5 py-0.5 rounded">Slam gToon</span>
                  </div>
                </div>
                <dl class="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
                  <dt class="text-gray-400">Value</dt>
                  <dd class="font-semibold">{{ shownInfo.value }}</dd>
                  <dt class="text-gray-400">Color</dt>
                  <dd class="flex items-center gap-1.5">
                    <span class="inline-block w-3 h-3 rounded-full border border-white/40" :style="{ background: infoColorHex }"></span>
                    {{ ogTitleCase(shownInfo.color) }}
                    <span v-if="infoNeutral" class="text-[10px] text-gray-400">(neutral)</span>
                  </dd>
                  <template v-if="infoDetail">
                    <dt class="text-gray-400">Type</dt>
                    <dd>{{ infoDetail.types.length ? infoDetail.types.map(ogTitleCase).join(', ') : '—' }}</dd>
                    <dt class="text-gray-400">Group</dt>
                    <dd>{{ infoDetail.group ? (OG_GROUP_LABELS[infoDetail.group] || infoDetail.group) : '—' }}</dd>
                    <dt class="text-gray-400">Power</dt>
                    <dd>
                      <template v-if="infoDetail.power.description">{{ infoDetail.power.description }}</template>
                      <template v-else>No power</template>
                    </dd>
                    <template v-if="infoDetail.characters.length">
                      <dt class="text-gray-400">Characters</dt>
                      <dd>{{ infoDetail.characters.join(', ') }}</dd>
                    </template>
                  </template>
                </dl>
                <p v-if="infoLoading && !infoDetail" class="mt-2 text-[11px] text-gray-400 animate-pulse">Loading properties…</p>
                <p v-else-if="infoError" class="mt-2 text-[11px] text-red-300">{{ infoError }}</p>
                <p class="mt-2 text-[10px] text-gray-400">Printed properties. During a match a card's value and color can change from powers.</p>
              </template>
            </div>

            <!-- Always visible, whichever tab is open -->
            <div class="og-status" :class="oppStatusReady ? 'og-status-ready' : ''">{{ matchState.opponent.username }}: {{ oppStatusLabel }}</div>
          </div>

          <div class="og-box og-deck-box" data-tut="deck-box">
            <div class="og-deck-head">
              <span>Deck ({{ handTray.length }})</span>
              <span>Undealt {{ matchState.you.undealtCount }} · Discarded {{ matchState.you.discardedCount }}</span>
            </div>
            <div class="og-scroll og-deck">
              <div v-for="c in handTray" :key="c.idx" class="og-deck-card" :data-tut="'hand-' + c.idx" @click="onHandClick(c.idx); showInfo(c)">
                <OgGtoonCardTile :card="c" size="board" :inspectable="false" :tone="handTone(c.idx)" />
              </div>
              <p v-if="!handTray.length" class="og-deck-empty">No cards left in hand.</p>
            </div>
          </div>
        </aside>
      </div>

      <!-- Swap bottom sheet: choose which hand card takes slot 7 (chosen for you when only one is left) -->
      <transition name="fade">
        <div v-if="swapSheetOpen" class="fixed inset-0 bg-black/50 z-40" @click="closeSwapSheet"></div>
      </transition>
      <transition name="slide-up">
        <div v-if="swapSheetOpen" class="fixed inset-x-0 bottom-0 bg-gray-900 border-t border-white/20 rounded-t-xl z-50 p-4 max-h-[80vh] overflow-y-auto">
          <h3 class="font-bold mb-3">Swap your slot 7 card</h3>
          <div v-if="slotSevenCard" class="flex items-center gap-3 mb-3">
            <div class="w-20 flex-shrink-0"><OgGtoonCardTile :card="slotSevenCard" size="board" tone="selected" :animate="false" :inspectable="false" /></div>
            <p class="text-xs text-gray-300">
              <strong>{{ slotSevenCard.name }}</strong> goes back into your hand, and the gToon you choose below takes slot 7.
            </p>
          </div>
          <template v-if="swapHand.length === 1">
            <p class="text-xs text-cyan-200 mb-2">Only one gToon is left in your hand, so it is chosen for you:</p>
          </template>
          <p v-else class="text-xs text-cyan-200 mb-2">Choose the gToon from your hand to put in slot 7:</p>
          <div class="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
            <button
              v-for="c in swapHand"
              :key="c.idx"
              type="button"
              class="og-swap-card"
              :class="{ 'og-swap-card-on': swapChoice === c.idx }"
              :data-tut="'swap-card-' + c.idx"
              :aria-pressed="swapChoice === c.idx"
              :aria-label="`${c.name}, value ${c.value}`"
              @click="pickSwapCard(c)"
            >
              <OgGtoonCardTile :card="c" size="board" :tone="swapChoice === c.idx ? 'selected' : 'idle'" :animate="false" :inspectable="false" />
            </button>
          </div>
          <p v-if="swapChoiceCard" class="text-xs text-white bg-black/30 rounded px-2 py-1.5 mb-3">
            <strong>{{ swapChoiceCard.name }}</strong> · {{ swapChoiceCard.value }} · {{ ogTitleCase(swapChoiceCard.color) }}
            <span v-if="infoDetail && infoDetail.id === swapChoiceCard.ctoonId" class="text-gray-300"> — {{ infoDetail.power.description || 'No power' }}</span>
          </p>
          <p class="text-xs text-gray-400 mb-3">Costs 10 points off your match score. You can only do this once per match. Both players choose before the new cards are revealed.</p>
          <div class="flex justify-end gap-2">
            <button @click="closeSwapSheet" class="px-4 py-2 bg-gray-700 rounded text-sm">Cancel</button>
            <button data-tut="swap-confirm" :disabled="swapChoice === null" @click="confirmSwap" class="px-4 py-2 bg-indigo-500 disabled:opacity-50 rounded text-sm">Swap (-10 points)</button>
          </div>
        </div>
      </transition>

      <!-- End-of-match result screen -->
      <transition name="fade">
        <div v-if="matchEnded && !flipping && resultOpen && !isTutorial && !isTournament" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <!-- max-h + scroll: a pack banner on a short (landscape phone) screen must not push the buttons off it -->
          <div class="bg-gray-900 border border-white/20 rounded-xl p-6 w-[26rem] max-w-[95vw] max-h-[calc(100dvh-1rem)] overflow-y-auto text-center">
            <h2 class="text-2xl font-bold mb-2" :class="matchEnded.won ? 'text-green-400' : (matchEnded.outcome === 'TIE' ? 'text-amber-300' : 'text-red-400')">
              {{ matchEnded.outcome === 'TIE' ? "It's a Tie!" : (matchEnded.won ? 'You Win!' : 'You Lose') }}
            </h2>
            <p class="text-sm text-gray-300 mb-1">Final Score: {{ matchEnded.player1Score }} - {{ matchEnded.player2Score }}</p>
            <p class="text-xs text-gray-400 mb-2">{{ endReasonLabel }}</p>
            <p v-if="isPractice" class="text-xs text-amber-300 mb-2">Practice match — no points were awarded or spent.</p>
            <!-- PvP pack reward: its own event, so it can land just after the result card is up -->
            <div v-if="rewardBanner" role="status" aria-live="polite" class="mb-3 rounded-lg border px-3 py-2 text-sm" :class="rewardBanner.won ? 'border-green-400/60 bg-green-900/30 text-green-100' : 'border-white/15 bg-black/30 text-gray-200'">
              <template v-if="rewardBanner.won">
                <div class="flex items-center justify-center gap-3">
                  <img v-if="rewardBanner.image" :src="rewardBanner.image" :alt="rewardBanner.text" width="48" height="48" class="h-12 w-12 object-contain" />
                  <span class="font-semibold">{{ rewardBanner.text }}</span>
                </div>
                <NuxtLink to="/newsite/MyCollection?tab=packs" class="mt-1 inline-block min-h-[44px] leading-[44px] text-green-300 underline">Open it in Collection → Packs</NuxtLink>
              </template>
              <template v-else>{{ rewardBanner.text }}</template>
            </div>
            <div class="text-left max-h-24 sm:max-h-56 overflow-y-auto bg-black/30 rounded p-2 mb-3 text-xs">
              <p class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1">Game Log</p>
              <OgGtoonGameLog :entries="gameLog" />
            </div>
            <div class="flex gap-2 justify-center">
              <button @click="resultOpen = false" class="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm">View board</button>
              <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">{{ isPractice ? 'Back to Matchmaking' : 'Back to Lobby' }}</button>
            </div>
          </div>
        </div>
      </transition>
      <!-- With the result closed, the finished board stays visible; these bring the result back or leave. -->
      <!-- A tournament game: the series card says where the best-of-3 stands and lines up the next game. -->
      <OgGtoonTournamentResult
        v-if="matchEnded && !flipping && resultOpen && isTournament"
        :ended="matchEnded" :tournament="matchState.tournament"
        @exit="$emit('exit')" @view-board="resultOpen = false"
      />
      <div v-if="matchEnded && !flipping && !resultOpen && isTournament" class="fixed bottom-3 inset-x-0 z-40 flex justify-center gap-2">
        <button @click="resultOpen = true" class="bg-gray-800/90 border border-white/20 hover:bg-gray-700 px-4 py-2 rounded text-sm">Show series</button>
        <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">Back to tournament</button>
      </div>
      <div v-if="matchEnded && !flipping && !resultOpen && !isTutorial && !isTournament" class="fixed bottom-3 inset-x-0 z-40 flex justify-center gap-2">
        <button @click="resultOpen = true" class="bg-gray-800/90 border border-white/20 hover:bg-gray-700 px-4 py-2 rounded text-sm">Show result</button>
        <button @click="$emit('exit')" class="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded text-sm">{{ isPractice ? 'Back to Matchmaking' : 'Back to Lobby' }}</button>
      </div>

      <!-- The guided tutorial: dims the board and points at the one move the script needs next -->
      <OgGtoonTutorial v-if="isTutorial" :board="tutorialBoard" @exit="$emit('exit')" @finish="$emit('exit')" />
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch, watchEffect, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { useOgGtoonsSocket } from '@/composables/useOgGtoonsSocket'
import OgGtoonCardTile from '@/components/OgGtoonCardTile.vue'
import GtoonCard from '@/components/GtoonCard.vue'
import { useOgGtoonInfoPanel } from '@/composables/useOgGtoonInfoPanel'
import { OG_GROUP_LABELS, ogTitleCase } from '@/utils/ogGtoonLabels'
import { GTOON_PALETTE } from '@/utils/gtoonCardStyle'
import { normalizeRevealTiming } from '@/utils/ogGtoonReveal'
import OgGtoonGameLog from '@/components/OgGtoonGameLog.vue'
import OgGtoonMatchIntro from '@/components/oggtoons/OgGtoonMatchIntro.vue'
import OgGtoonTutorial from '@/components/oggtoons/OgGtoonTutorial.vue'
import OgGtoonTournamentResult from '@/components/oggtoons/OgGtoonTournamentResult.vue'
import { difficultyLabel as ogDifficultyLabel } from '@/utils/ogGtoonDifficulty'

defineEmits(['exit'])

const { matchState, lastReveal, matchEnded, packReward, lastError, commit, place, unplace, swap, swapSkip, chooseColor, discard } = useOgGtoonsSocket()

const COLOR_HEX = {
  BLACK: '#cccccc', SILVER: '#c0c0c0', BLUE: '#60a5fa', RED: '#f87171',
  YELLOW: '#facc15', GREEN: '#4ade80', PURPLE: '#c084fc', ORANGE: '#fb923c', PINK: '#f472b6'
}
function colorHex(c) { return COLOR_HEX[c] || '#ffffff' }

const isPractice = computed(() => !!matchState.value?.practice)
// One game of a tournament best-of-3 (the server tags the view; the series card replaces the usual result screen).
const isTournament = computed(() => !!matchState.value?.tournament)
// The guided tutorial match (also flagged practice by the server): no timers, no intro modal, no result
// modal of its own — the guide walks through the result and its last button leaves.
const isTutorial = computed(() => !!matchState.value?.tutorial)
const difficultyLabel = computed(() => ogDifficultyLabel(matchState.value?.difficulty))

const inDiscardPhase = computed(() => matchState.value?.phase === 'discard')
const inSwapPhase = computed(() => matchState.value?.phase === 'swap')
// The end-of-match result can be closed to look over the finished board; it reopens for each new result.
const resultOpen = ref(true)
watch(matchEnded, () => { resultOpen.value = true })
const inColorPhase = computed(() => matchState.value?.phase === 'color')
const REAL_COLORS = ['BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK']
const roundLabel = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.suddenDeath) return 'Sudden Death'
  if (m.phase === 'discard') return 'Discard Phase'
  if (m.phase === 'color') return 'Silver Colour'
  if (m.phase === 'swap') return `Round ${m.round} / ${m.totalRounds} · Swap`
  return `Round ${m.round} / ${m.totalRounds}`
})

/* ── Reveal playback ─────────────────────────────────────────────────────────────────────────
 * The server resolves the board after EACH card lands — player 1's slot 1, player 2's slot 1, player 1's
 * slot 2, ... — and sends those snapshots as `reveal.steps`. We replay them one at a time: the card flips
 * face-up showing its printed value, then its powers land and every visible card's value / color / knock-out,
 * the markers and both totals update before the next card flips. The last step equals the real board. */
const playback = ref(null) // { hidden:Set, shown:Map, markers:Map } while a reveal is replaying
const flipping = computed(() => !!playback.value)
let playToken = 0
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
const cardKey = (side, slot) => `${side}:${slot}`
const toShown = (board) => new Map((board?.cards || []).map(c => [cardKey(c.side, c.slot), { finalValue: c.finalValue, color: c.color, cancelled: c.cancelled }]))
const toMarkers = (board) => new Map((board?.markers || []).map(m => [cardKey(m.side, m.slot), m]))

/* Point changes (+N green / -N red) shown above the affected card for 1.5s after another card's reveal. */
const DELTA_MS = 1500
const deltas = ref(new Map())
const deltaFor = (side, slot) => deltas.value.get(cardKey(side, slot)) || 0
/** Cards whose points differ between two snapshots, in board order: [[key, diff], ...]. */
function pointChanges(prevShown, nextShown) {
  const out = []
  for (const [key, cur] of nextShown) {
    const prev = prevShown.get(key)
    if (!prev) continue
    const diff = (cur.finalValue || 0) - (prev.finalValue || 0)
    if (diff) out.push([key, diff])
  }
  return out
}

watch(lastReveal, async (rev) => {
  const token = ++playToken
  playback.value = null
  deltas.value = new Map()
  const steps = rev?.steps || []
  if (!steps.length) return
  const timing = normalizeRevealTiming(rev.timing) // admin-tunable (Manage Games > gToons (Original))
  playback.value = {
    hidden: new Set(steps.map(st => cardKey(st.side, st.slot))),
    shown: toShown(rev.before),
    markers: toMarkers(rev.before)
  }
  await sleep(timing.firstMs)
  for (const step of steps) {
    if (token !== playToken) return
    // 1) the card flips face-up showing its printed value; nothing else has changed yet.
    const hidden = new Set(playback.value.hidden)
    hidden.delete(cardKey(step.side, step.slot))
    const shown = new Map(playback.value.shown)
    shown.set(cardKey(step.side, step.slot), { finalValue: step.baseValue, color: step.baseColor, cancelled: false })
    playback.value = { ...playback.value, hidden, shown }
    await sleep(timing.cardMs)
    if (token !== playToken) return
    // 2) its powers land: values, colors, knock-outs, markers and totals all update together.
    const nextShown = toShown(step)
    const markers = toMarkers(step)
    const changes = pointChanges(shown, nextShown)
    if (changes.length) {
      // Apply the point changes one card at a time; each shows its +N / -N for DELTA_MS before the next starts.
      let cur = new Map(shown)
      for (const [key, diff] of changes) {
        cur = new Map(cur)
        cur.set(key, nextShown.get(key))
        playback.value = { hidden, shown: cur, markers }
        deltas.value = new Map([[key, diff]])
        await sleep(DELTA_MS)
        deltas.value = new Map()
        await nextTick()
        if (token !== playToken) return
      }
    }
    playback.value = { hidden, shown: nextShown, markers }
    await sleep(step.changed ? timing.effectsMs : timing.quietMs)
  }
  if (token === playToken) playback.value = null
})
onBeforeUnmount(() => { playToken += 1 })

/* ── Phase countdown ─────────────────────────────────────────────────────────────────────────
 * The server owns the deadline (`phaseEndsAt`) and acts for anyone who has not when it passes;
 * this is only the display. Hidden once the player has finished their part of the phase. */
const nowMs = ref(Date.now())
let tickTimer = null
onMounted(() => { tickTimer = setInterval(() => { nowMs.value = Date.now() }, 250) })
onBeforeUnmount(() => clearInterval(tickTimer))
const secondsLeft = computed(() => {
  const m = matchState.value
  if (!m?.phaseEndsAt) return null
  return Math.max(0, Math.ceil((m.phaseEndsAt - nowMs.value) / 1000))
})

/** Whether a revealed entry is still face down, waiting for its turn in the reveal playback. */
function stillHidden(entry, side) {
  return !!entry && !!playback.value && playback.value.hidden.has(cardKey(side, entry.slot))
}

/** Latest resolved values from the server between reveals (and after a reconnect). */
const boardValues = computed(() => toShown(matchState.value?.board))
/** An entry with the value / color / cancelled state the board should be showing right now. */
function displayed(entry, side) {
  if (!entry) return null
  const o = (playback.value ? playback.value.shown : boardValues.value).get(cardKey(side, entry.slot))
  const card = o ? { ...entry, ...o } : entry
  // A Silver card shows (and sweeps to) the colour its owner picked once the colour phase has resolved.
  const picked = side === youSide.value ? matchState.value?.you?.silverColor : matchState.value?.opponent?.silverColor
  return picked && card.color === 'SILVER' ? { ...card, color: picked } : card
}

/* ── Slots ───────────────────────────────────────────────────────────────────────────────── */
const youRevealed = computed(() => matchState.value?.you?.revealed || [])
const oppRevealed = computed(() => matchState.value?.opponent?.revealed || [])
const slotNumbers = computed(() => {
  const m = matchState.value
  const max = Math.max(7, ...(m?.roundSlots || []), ...youRevealed.value.map(r => r.slot), ...oppRevealed.value.map(r => r.slot))
  return Array.from({ length: max }, (_, i) => i + 1)
})
/* ── Slot layout ─────────────────────────────────────────────────────────────────────────────
 * Slots 1-4 sit on the row nearest the middle strip, 5-7 on the outer row (mirrored for the opponent). */
const innerSlots = computed(() => slotNumbers.value.filter(n => n <= 4))
const outerSlots = computed(() => slotNumbers.value.filter(n => n > 4))
const revealedAt = (list, slot) => list.find(r => r.slot === slot) || null

const handById = computed(() => new Map((matchState.value?.you?.hand || []).map(c => [c.idx, c])))
const placementsBySlot = computed(() => new Map((matchState.value?.you?.placements || []).map(p => [p.slot, p.cardIdx])))
const placedIds = computed(() => new Set((matchState.value?.you?.placements || []).map(p => p.cardIdx)))
const placedCount = computed(() => placedIds.value.size)
const unplacedHand = computed(() => (matchState.value?.you?.hand || []).filter(c => !placedIds.value.has(c.idx)))
// In the discard phase every hand card is shown; while placing, placed cards leave the tray.
const handTray = computed(() => (inDiscardPhase.value ? (matchState.value?.you?.hand || []) : unplacedHand.value))

const canEdit = computed(() => !!matchState.value && !matchEnded.value && matchState.value.phase === 'play' && !matchState.value.you.ready)
const canCommit = computed(() => canEdit.value)
// The server rejects a short commit; this just keeps the button honest.
const slotsFilled = computed(() => {
  const m = matchState.value
  if (!m) return false
  return placedCount.value >= Math.min((m.roundSlots || []).length, (m.you.hand || []).length)
})
// Your slot-7 card stays face down on the board (visible only to you) until both players have decided on the swap.
const slotSevenCard = computed(() => matchState.value?.you?.heldCard || youRevealed.value.find(r => r.slot === 7) || null)
const roundSlots = computed(() => matchState.value?.roundSlots || [])
const isOpenSlot = (slot) => canEdit.value && roundSlots.value.includes(slot)

function yourSlotCard(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return displayed(rev, youSide.value)
  const held = matchState.value?.you?.heldCard
  if (held && held.slot === slot) return held
  const idx = placementsBySlot.value.get(slot)
  return idx === undefined ? null : handById.value.get(idx) || null
}
function yourSlotFaceDown(slot) {
  const rev = revealedAt(youRevealed.value, slot)
  if (rev) return stillHidden(rev, youSide.value)
  // Your held slot-7 card is shown to you (not face down) so you can decide whether to swap it.
  if (matchState.value?.you?.heldCard?.slot === slot) return false
  // Committed (not yet revealed) cards show their back, even to their owner.
  return matchState.value?.you?.ready && placementsBySlot.value.has(slot)
}
function yourSlotTone(slot) {
  if (isOpenSlot(slot) && !placementsBySlot.value.has(slot)) return 'open'
  if (isOpenSlot(slot)) return 'filled'
  return 'idle'
}
function oppSlotCard(slot) {
  const rev = revealedAt(oppRevealed.value, slot)
  return rev && !stillHidden(rev, oppSide.value) ? displayed(rev, oppSide.value) : null
}
function oppSlotFaceDown(slot) {
  const rev = revealedAt(oppRevealed.value, slot)
  if (rev) return stillHidden(rev, oppSide.value)
  if (matchState.value?.opponent?.heldSlot === slot) return true
  return (matchState.value?.opponent?.committedSlots || []).includes(slot)
}

const scoreOf = (list, side) => list.filter(r => !stillHidden(r, side)).reduce((a, r) => a + (displayed(r, side)?.finalValue || 0), 0)
const youScore = computed(() => scoreOf(youRevealed.value, youSide.value))
const oppScore = computed(() => scoreOf(oppRevealed.value, oppSide.value))


/* ── Hand: selecting, placing, discarding ────────────────────────────────────────────────── */
const selectedCard = ref(null)   // deck index of the hand card chosen for placing/swapping
const discardPick = ref(new Set())


function handTone(idx) {
  if (inDiscardPhase.value) return discardPick.value.has(idx) ? 'discard' : 'idle'
  return selectedCard.value === idx ? 'selected' : 'idle'
}

function onHandClick(idx) {
  if (inDiscardPhase.value) {
    if (matchState.value?.you?.discardReady) return
    const next = new Set(discardPick.value)
    next.has(idx) ? next.delete(idx) : next.add(idx)
    discardPick.value = next
    return
  }
  if (!canEdit.value) return
  selectedCard.value = selectedCard.value === idx ? null : idx
}

function onSlotClick(slot) {
  const open = isOpenSlot(slot)
  // With a hand card selected, a tap on an open slot places it.
  if (open && selectedCard.value !== null) {
    place(selectedCard.value, slot)
    selectedCard.value = null
    return
  }
  // Otherwise your own gToon always shows its details, whether it is still face down, held or already flipped.
  showInfo(yourSlotCard(slot))
  if (open && placementsBySlot.value.has(slot)) unplace(slot)
}

function confirmDiscard() {
  discard([...discardPick.value])
  discardPick.value = new Set()
}

// A new round/phase (or a card leaving the hand) invalidates whatever was selected.
watch(() => [matchState.value?.round, matchState.value?.phase], () => {
  selectedCard.value = null
  discardPick.value = new Set()
})
// An error belongs to the action that caused it; any fresh state supersedes it.
watch(matchState, () => { lastError.value = null })
watch(handById, (hand) => {
  if (selectedCard.value !== null && !hand.has(selectedCard.value)) selectedCard.value = null
})

const commitLabel = computed(() => {
  const m = matchState.value
  const need = Math.min((m?.roundSlots || []).length, (m?.you?.hand || []).length)
  if (m?.suddenDeath) return 'Play card'
  if (placedCount.value < need) return `Fill all slots (${placedCount.value}/${need})`
  return `Commit ${need} card${need === 1 ? '' : 's'}`
})

const helpText = computed(() => {
  const m = matchState.value
  if (!m) return ''
  if (m.phase === 'discard') {
    return 'Discard phase: tap any cards you want to throw away, then confirm. Your hand is refilled to 6 from your undealt cards. If time runs out you keep your hand.'
  }
  if (m.phase === 'color') {
    return m.you.mayChooseColor
      ? 'Silver cards are colourless. Choose the colour your Silver cards count as for the goal-colour totals. Your opponent chooses at the same time and picks are revealed together. If time runs out, the best colour is picked for you.'
      : (m.you.hasSilver ? 'Waiting for your opponent to choose...' : 'You have no Silver cards, so nothing to choose. Waiting for your opponent...')
  }
  if (m.phase === 'swap') {
    return m.you.maySwap
      ? `Swap your slot-7 card for any gToon in your hand (you choose which), or keep it. Swapping takes 10 points off your match score. Keeping it costs nothing. Slot 7 stays face down for your opponent until you have both decided. If time runs out you keep it.`
      : (m.you.swapReady ? 'Waiting for your opponent to choose...' : 'You have no cards left in your deck to swap with.')
  }
  if (m.you.ready) return 'Your cards are face down. They flip, in slot order, when your opponent commits.'
  const slots = m.roundSlots
  const range = slots.length === 1 ? `slot ${slots[0]}` : `slots ${slots[0]}-${slots[slots.length - 1]}`
  if (m.suddenDeath) return `Sudden death: place one card in slot ${slots[0]} and play it.`
  return `Tap a card in your hand, then tap an open ${range} to place it. Fill all ${slots.length} slot${slots.length === 1 ? '' : 's'} to commit. If time runs out, random cards fill the empty slots. Tap a placed card to take it back.`
})

const oppStatusReady = computed(() => {
  const o = matchState.value?.opponent
  return inDiscardPhase.value ? o?.discardReady : o?.ready
})
const oppStatusLabel = computed(() => {
  if (inDiscardPhase.value) return oppStatusReady.value ? 'Done discarding' : 'Choosing discards...'
  if (inColorPhase.value) return matchState.value?.opponent?.colorReady ? 'Colour chosen' : 'Choosing a Silver colour...'
  if (inSwapPhase.value) return matchState.value?.opponent?.swapReady ? 'Swap decided' : 'Deciding on a swap...'
  return oppStatusReady.value ? 'Committed' : 'Thinking...'
})

/* ── Logs ────────────────────────────────────────────────────────────────────────────────── */
/* ── Game Log / Info tabs ───────────────────────────────────────────────────────────────────
 * The server keeps one ordered log of the whole match (reveals, commits, timeouts, discards, swaps,
 * and what every power is doing / not doing). The Log tab follows it live; the end screen shows it
 * in full. Card markers come from the newest preview/scoring entry. */
const tab = ref('log')
const gameLog = computed(() => matchState.value?.gameLog || [])
const seenLogCount = ref(0)
const unreadLog = computed(() => Math.max(0, gameLog.value.length - seenLogCount.value))
const logScroller = ref(null)
const helpOpen = ref(false)
function scrollLogToEnd() {
  nextTick(() => { if (logScroller.value) logScroller.value.scrollTop = logScroller.value.scrollHeight })
}
function setTab(t) {
  tab.value = t
  if (t === 'log') { seenLogCount.value = gameLog.value.length; scrollLogToEnd() }
}
watch(() => gameLog.value.length, (n) => {
  if (tab.value === 'log') { seenLogCount.value = n; scrollLogToEnd() }
})

/* Clicking a face-up gToon (board or deck) shows its printed properties on the Info tab. */
const { card: infoCard, detail: infoDetail, loading: infoLoading, error: infoError, show: showInfoCard, clear: clearInfo } = useOgGtoonInfoPanel()
function showInfo(card) {
  if (!card) return
  showInfoCard(card)
  setTab('info')
}
/** The opponent's gToons show details only once they are face up (oppSlotCard is null for hidden ones). */
function onBoardCardClick(card) { showInfo(card) }
const shownInfo = computed(() => ({
  ctoonId: infoDetail.value?.id ?? infoCard.value?.ctoonId ?? null,
  name: infoDetail.value?.name ?? infoCard.value?.name ?? 'gToon',
  assetPath: infoDetail.value?.assetPath ?? infoCard.value?.assetPath ?? '',
  color: infoDetail.value?.gtoonColor ?? infoCard.value?.color ?? 'SILVER',
  value: infoDetail.value?.gtoonValue ?? infoCard.value?.value ?? 0,
  cardStyle: infoDetail.value?.gtoonCardStyle ?? infoCard.value?.cardStyle ?? null
}))
const infoColorHex = computed(() => GTOON_PALETTE[shownInfo.value.color]?.wvring || '#c0c0c0')
const infoNeutral = computed(() => shownInfo.value.color === 'BLACK' || shownInfo.value.color === 'SILVER')
onBeforeUnmount(clearInfo)

const youSide = computed(() => matchState.value?.you?.sideIndex ?? 0)
const oppSide = computed(() => (youSide.value === 0 ? 1 : 0))
const markerMap = computed(() => {
  // While a reveal replays the markers follow the step being shown; otherwise the server's live board,
  // falling back to the newest preview/scoring entry in the log for older payloads.
  if (playback.value) return playback.value.markers
  const board = matchState.value?.board
  if (board?.markers) return toMarkers(board)
  const latest = [...gameLog.value].reverse().find(e => e.data?.markers)
  const map = new Map()
  for (const m of latest?.data?.markers || []) map.set(`${m.side}:${m.slot}`, m)
  return map
})
/** The marker for a card at `slot` on `side`, only once that card is actually face up. */
function markerFor(side, slot, card, faceDown) {
  if (!card || faceDown) return null
  return markerMap.value.get(`${side}:${slot}`) || null
}

// What the PvP pack reward says on the result card (only for the winner, only for the match that just ended).
const rewardBanner = computed(() => {
  const r = packReward.value
  if (!r || !matchEnded.value || !matchEnded.value.won) return null
  if (matchEnded.value.matchId && r.matchId !== matchEnded.value.matchId) return null
  switch (r.status) {
    case 'AWARDED':       return { won: true, text: `You won a ${r.packName || 'pack'}!`, image: r.packImagePath || null }
    case 'CAPPED':        return { won: false, text: 'No pack this time — you’ve reached today’s limit. It resets at 8pm CST.' }
    case 'SAME_PAIR':     return { won: false, text: 'No pack this time — you already earned one today for beating this player.' }
    case 'IDLE_OPPONENT': return { won: false, text: 'No pack this time — your opponent didn’t really play this match.' }
    case 'FORFEIT':       return { won: false, text: 'No pack — your opponent left the match.' }
    default:              return null
  }
})

const endReasonLabel = computed(() => {
  const r = matchEnded.value?.endReason
  if (r === 'forfeit') return 'Your opponent left the match.'
  if (r === 'sweep') return 'The match timed out.'
  return ''
})

/* ── Round-3 swap: confirm in the sheet ─────────────────────────────────────────────────── */
const swapSheetOpen = ref(false)
const swapPick = ref(null) // deck index of the hand card chosen in the sheet
// Every card still in hand can come into slot 7.
const swapHand = computed(() => matchState.value?.you?.hand || [])
// With a single card left the choice is made for the player; otherwise it is whatever they tapped.
const swapChoice = computed(() => {
  if (swapHand.value.length === 1) return swapHand.value[0].idx
  return swapHand.value.some(c => c.idx === swapPick.value) ? swapPick.value : null
})
const swapChoiceCard = computed(() => swapHand.value.find(c => c.idx === swapChoice.value) || null)
function pickSwapCard(card) {
  swapPick.value = card.idx
  showInfoCard(card) // loads its power for the sheet (the Info tab is left alone)
}
function openSwapSheet() {
  swapPick.value = null
  swapSheetOpen.value = true
  if (swapHand.value.length === 1) showInfoCard(swapHand.value[0])
}
function closeSwapSheet() { swapSheetOpen.value = false; swapPick.value = null }
function confirmSwap() {
  if (swapChoice.value === null) return
  swap(swapChoice.value)
  closeSwapSheet()
}
// The sheet belongs to the swap phase; close it if the phase moves on (e.g. the clock ran out).
watch(inSwapPhase, (on) => { if (!on) swapSheetOpen.value = false })

/* ── Sidebar panels ──────────────────────────────────────────────────────────────────────────
 * The sidebar (components/newsite/OgGtoonSidebar.vue) shows each player's name, points and a count of their
 * face-up cards in the two goal colors (yours and the opponent's; one circle if they are the same color). */
const sidebarState = useState('ogGtoonSidebar', () => null)
const goalColors = computed(() => {
  const m = matchState.value
  const list = [m?.you?.goalColor, m?.opponent?.goalColor].filter(c => REAL_COLORS.includes(c))
  return [...new Set(list)]
})
/* Target colours revealed at the start (Black/Silver never count): two different = whoever has the most of
 * has more of EACH wins outright (otherwise points decide), one = +15 bonus to whoever has more of it, none = decided by points only. */
const targetInfo = computed(() => {
  const colors = goalColors.value
  if (colors.length >= 2) return { colors, title: 'Two colors revealed', detail: 'Having more cards of each color than your opponent wins the game, regardless of points. Otherwise the game is decided by points.' }
  if (colors.length === 1) return { colors, title: 'One color revealed', detail: 'This game will be determined by points. The player with more cards of this color earns 15 bonus points.' }
  return { colors, title: 'No target color', detail: 'This game will be determined by points only.' }
})
function colorCounts(list, side) {
  const out = {}
  for (const c of goalColors.value) out[c] = 0
  for (const r of list) {
    if (stillHidden(r, side)) continue
    const card = displayed(r, side)
    // Cancelled (knocked-out) cards count for nothing, including their printed colour.
    if (card?.cancelled) continue
    if (card?.color in out) out[card.color] += 1
  }
  return out
}
watchEffect(() => {
  const m = matchState.value
  if (!m) { sidebarState.value = null; return }
  sidebarState.value = {
    colors: goalColors.value.map(name => ({ name, hex: colorHex(name) })),
    you: { name: m.you.username || 'You', score: youScore.value, counts: colorCounts(youRevealed.value, youSide.value) },
    opponent: { name: m.opponent.username || 'Opponent', score: oppScore.value, counts: colorCounts(oppRevealed.value, oppSide.value) }
  }
})
onBeforeUnmount(() => { sidebarState.value = null })

/* ── Pre-match intro ─────────────────────────────────────────────────────────────────────────
 * For the first 10 seconds of a match both players see the goal cards, how the game will be decided and a
 * countdown (components/oggtoons/OgGtoonMatchIntro.vue). The server sends the time left as a duration and also
 * refuses placing/committing until it is over; the first round's clock starts after it. A reconnect during the
 * intro lands back on it with the remaining time. */
const introEndsLocal = ref(0)
watch(() => matchState.value?.introRemainingMs, (ms) => {
  introEndsLocal.value = ms > 0 ? Date.now() + ms : 0
}, { immediate: true })
const introActive = computed(() => !!matchState.value && !matchEnded.value && !isTutorial.value
  && introEndsLocal.value > 0 && nowMs.value < introEndsLocal.value)
const introSeconds = computed(() => Math.max(0, Math.ceil((introEndsLocal.value - nowMs.value) / 1000)))

/* ── Tutorial guide ──────────────────────────────────────────────────────────────────────── */
// Everything the guide's steps look at (see utils/ogGtoonTutorialSteps.js), as one object.
const tutorialBoard = computed(() => ({
  m: matchState.value,
  sel: selectedCard.value,
  tab: tab.value,
  swapSheetOpen: swapSheetOpen.value,
  swapPick: swapChoice.value,
  discardPick: [...discardPick.value],
  flipping: flipping.value,
  ended: !!matchEnded.value
}))
</script>

<style scoped>
.og-board { --og-rim: #7f98b3; --og-plate: #9bb3cb; --og-accent: #99ffff; }

/* ── Layout: board (left) + Log/Info & Deck (right). Stacks on mobile. ── */
.og-layout { display: grid; grid-template-columns: minmax(0, 1fr) 236px; gap: 8px; height: 100%; padding: 8px; box-sizing: border-box; }
.og-arena { container-type: size; display: flex; flex-direction: column; gap: 4px; min-height: 0; min-width: 0;
  /* slot diameter: limited by width (4 across) and by height (4 rows + the strip) */
  --s: min(21cqw, calc((100cqh - 84px) / 4 - 8px)); }
.og-side { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; }

/* ── Glass plates (trapezoids, wider toward the middle strip) ── */
.og-plate { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: space-around; gap: 6px; padding: 10px 8px;
  background: linear-gradient(180deg, rgba(190, 220, 240, .55), rgba(110, 140, 170, .55)); box-shadow: inset 0 0 0 2px rgba(153, 255, 255, .35); }
.og-plate-opp { clip-path: polygon(5% 0, 95% 0, 100% 100%, 0 100%); border-radius: 10px 10px 0 0; }
.og-plate-you { clip-path: polygon(0 0, 100% 0, 95% 100%, 5% 100%); border-radius: 0 0 10px 10px; }

/* 8-column grid, every slot spans two: a 3-slot row starts one column in so it sits in the gaps of the 4-slot row */
.og-row { display: grid; grid-template-columns: repeat(8, 1fr); width: 100%; }
.og-row > .og-slot { grid-column: span 2; justify-self: center; position: relative; width: var(--s); height: var(--s); cursor: pointer; }
.og-row-outer > .og-slot:first-child { grid-column: 2 / span 2; }

/* ── Per-player bar (mobile only): name, score and goal-color counts on one line ── */
.og-pbar { display: none; align-items: center; gap: 8px; flex: 0 0 auto; padding: 3px 8px; border-radius: 6px; font-size: .75rem; font-weight: 700; background: rgba(127, 152, 179, .9); }
.og-pbar-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.og-pbar-score { font-family: ui-monospace, monospace; }
.og-pbar-color { display: inline-flex; align-items: center; gap: 3px; }
.og-pbar-color i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .7); }

/* ── Middle strip ── */
.og-strip { position: relative; flex: 0 0 auto; min-height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px 6px;
  background: rgba(127, 152, 179, .9); border-radius: 6px; z-index: 5; }
.og-strip-line { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; }
.og-round { font-weight: 800; font-size: .85rem; letter-spacing: .04em; text-transform: uppercase; color: #fff; }
.og-timer { font-family: ui-monospace, monospace; font-size: .7rem; padding: 1px 6px; border-radius: 4px; background: rgba(0, 0, 0, .25); }
.og-timer-low { background: #dc2626; }
.og-practice { font-size: .65rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: rgba(245, 158, 11, .95); color: #000; }
.og-mini { font-size: .65rem; padding: 1px 6px; border-radius: 4px; background: rgba(0, 0, 0, .3); }
.og-mobile-score { display: none; font-size: .8rem; font-weight: 700; }
.og-help-btn { width: 20px; height: 20px; border-radius: 50%; font-size: .7rem; font-weight: 800; background: rgba(0, 0, 0, .25); border: 1px solid rgba(255, 255, 255, .6); line-height: 1; }
.og-help-on { background: var(--og-accent); color: #0a3a4a; }
.og-btn { color: #fff; padding: 5px 14px; border-radius: 6px; font-size: .8rem; font-weight: 700; }
.og-color-btn { width: 24px; height: 24px; border-radius: 50%; padding: 2px; border: 2px solid transparent; background: rgba(0,0,0,.25); }
.og-color-btn span { display: block; width: 100%; height: 100%; border-radius: 50%; border: 1px solid rgba(255,255,255,.6); }
.og-color-goal { border-color: #fbbf24; }
.og-note { font-size: .75rem; color: #fff3b0; }
.og-target { flex-wrap: wrap; gap: 6px; align-items: center; }
.og-target-title { font-size: .75rem; font-weight: 700; text-transform: uppercase; color: #99ffff; }
.og-error { font-size: .7rem; color: #ffd0d0; text-align: center; margin: 0; }
.og-help { position: absolute; left: 6px; right: 6px; top: calc(100% + 4px); padding: 8px 10px; border-radius: 6px; font-size: .75rem; line-height: 1.35; background: rgba(10, 30, 50, .95); border: 1px solid var(--og-accent); box-shadow: 0 6px 16px rgba(0, 0, 0, .4); }

/* ── Right column boxes ── */
.og-box { display: flex; flex-direction: column; min-height: 0; border-radius: 6px; background: rgba(127, 152, 179, .35); border: 1px solid rgba(153, 255, 255, .35); overflow: hidden; }
.og-info-box { flex: 1 1 0; }
.og-deck-box { flex: 1 1 0; }
.og-tabs { display: flex; flex: 0 0 auto; }
.og-tab { flex: 1; padding: 6px 4px; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #cfe; background: rgba(0, 0, 0, .25); }
.og-tab-on { background: rgba(127, 152, 179, .9); color: #fff; }
.og-badge { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 9px; background: #f59e0b; color: #000; font-size: .6rem; }
.og-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 8px; scrollbar-width: thin; scrollbar-color: #99ffff rgba(0, 0, 0, .25); }
.og-log { font-size: .7rem; }
.og-status { flex: 0 0 auto; padding: 4px 8px; font-size: .7rem; font-weight: 700; text-align: center; background: rgba(0, 0, 0, .35); color: #fcd34d; }
.og-status-ready { color: #4ade80; }
.og-deck-head { display: flex; justify-content: space-between; gap: 6px; padding: 6px 8px 0; font-size: .7rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #99ffff; }
.og-deck-head span:last-child { font-weight: 600; letter-spacing: 0; text-transform: none; color: #cfe; }
.og-deck { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; align-content: start; }
.og-deck-card { cursor: pointer; aspect-ratio: 1; }
.og-deck-empty { grid-column: 1 / -1; font-size: .7rem; color: #cfe; }
.og-swap-card { aspect-ratio: 1; border-radius: 8px; padding: 0; background: transparent; cursor: pointer; border: 2px solid transparent; }
.og-swap-card-on { border-color: var(--og-accent, #99ffff); box-shadow: 0 0 0 2px rgba(153, 255, 255, .35); }

@media (max-width: 767px) {
  .og-layout { grid-template-columns: 1fr; height: auto; }
  .og-arena { container-type: inline-size; --s: 21cqw; }
  .og-plate { flex: 0 0 auto; }
  .og-side { min-height: 0; }
  .og-info-box { height: 18rem; flex: 0 0 auto; }
  .og-deck-box { height: 16rem; flex: 0 0 auto; }
  .og-mobile-score { display: none; }
  .og-deck-box { order: -1; }
  .og-pbar { display: flex; }
}

.og-delta { position: absolute; left: 0; right: 0; top: -0.9rem; z-index: 10; text-align: center; font-weight: 800; font-size: 1rem; line-height: 1; text-shadow: 0 1px 3px rgba(0,0,0,.9); pointer-events: none; animation: og-delta-rise 1.5s ease-out forwards; }
@keyframes og-delta-rise { 0% { opacity: 0; transform: translateY(6px) } 15% { opacity: 1; transform: translateY(0) } 80% { opacity: 1 } 100% { opacity: 0; transform: translateY(-6px) } }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0 }
.slide-up-enter-active, .slide-up-leave-active { transition: transform .25s ease }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(100%) }
</style>
