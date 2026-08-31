<template>
  <div class="admin-cmoon bg-gray-50 text-xs">
    <div class="px-2 py-2">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">cMoons</h1>
        <div class="flex items-center gap-2 flex-wrap">
          <button
            class="cm-tap px-3 text-xs font-semibold rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="backfillRunning"
            title="Repairs a fixed bug where a large contribution could jump past an affinity level and forfeit that level's background/avatar reward"
            @click="runAffinityBackfill"
          >{{ backfillRunning ? 'Repairing…' : 'Repair missed affinity rewards' }}</button>
          <button
            class="cm-tap px-3 text-xs font-semibold rounded-md border bg-white text-gray-700 hover:bg-gray-50"
            :disabled="!cmoons.length"
            @click="previewModalOpen = true"
          >Preview join modal</button>
          <button
            class="cm-tap px-3 text-xs font-semibold rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!flagEnabled || cmoons.length < 2"
            :title="!flagEnabled ? 'Enable cMoons first' : ''"
            @click="balanceModalOpen = true"
          >Balance teams</button>
          <button
            class="cm-tap px-3 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            @click="openCreateModal"
          >+ Create cMoon</button>
        </div>
      </div>
      <p v-if="backfillResult" class="text-[11px] text-gray-600 mb-3 -mt-2">{{ backfillResult }}</p>
      <p v-if="backfillError" class="text-[11px] text-red-600 mb-3 -mt-2">{{ backfillError }}</p>

      <!-- Feature flag -->
      <div class="bg-white rounded border p-3 mb-4">
        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="flagEnabled" :disabled="flagSaving" @change="toggleFlag" />
          <span class="font-medium">cMoons enabled</span>
        </label>
        <p class="text-[11px] text-gray-600 mt-1">
          Off by default. New players get a "Choose your cMoon" prompt when they join, with the
          option to skip it — a player who skips (or hasn't decided) can always join later from
          the cMoons navigation page. There's no deadline and no auto-assignment.
        </p>
        <p v-if="cMoonEnabledAt" class="text-[11px] text-gray-600 mt-1">
          Launched {{ formatDate(cMoonEnabledAt) }}
        </p>

        <div class="border-t pt-3 mt-3">
          <label class="block text-xs font-medium mb-1">Opt-out rejoin cooldown (days)</label>
          <div class="flex items-center gap-2">
            <input
              v-model.number="optOutCooldownDays" type="number" min="0" max="365" inputmode="numeric"
              class="cm-field w-24 border rounded px-2 py-1" style="font-size:16px"
            />
            <button
              class="cm-tap px-3 text-xs font-semibold rounded-md border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              :disabled="cooldownSaving" @click="saveCooldown"
            >{{ cooldownSaving ? 'Saving…' : 'Save' }}</button>
          </div>
          <p class="text-[11px] text-gray-600 mt-1">
            How long a player who skipped/opted out must wait before "Join a cMoon" on the cMoons
            navigation page works again. 0 = no wait. Applied together with each cMoon's own
            "Allow opt-out join" toggle below — both must allow it.
          </p>
          <p v-if="cooldownError" class="text-[11px] text-red-600 mt-1">{{ cooldownError }}</p>
        </div>
      </div>

      <!-- Scoring rules: the weekly team-leaderboard bonus job's admin-editable knobs
           (see server/utils/cmoon.js runWeeklyCMoonScoring). Kept as one panel with
           sub-sections rather than a separate admin page/tab — it's config for the
           cMoons feature, same as the flag above, not a distinct resource. -->
      <div class="bg-white rounded border p-3 mb-4">
        <h2 class="text-sm font-semibold mb-1">Team Leaderboard Scoring Rules</h2>
        <p class="text-[11px] text-gray-600 mb-3">
          Controls the weekly cMoon team-leaderboard bonus job (runs Monday 00:00 CST). Changes take
          effect starting the next weekly run — past scores are never recalculated.
        </p>

        <div v-if="scoringLoading" class="text-gray-600">Loading…</div>
        <template v-else>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">High Score points</label>
              <input v-model.number="scoring.highScorePoints" type="number" min="0" max="100000" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
              <p class="text-[11px] text-gray-500 mt-1">Per player, for holding rank #1 on an eligible game.</p>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Top 10 points</label>
              <input v-model.number="scoring.top10Points" type="number" min="0" max="100000" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
              <p class="text-[11px] text-gray-500 mt-1">Per player, for a top-{{ scoring.top10RankCutoff || 10 }} finish on an eligible board.</p>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Daily task points</label>
              <input v-model.number="scoring.dailyTaskPoints" type="number" min="0" max="100000" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
              <p class="text-[11px] text-gray-500 mt-1">Per player, per day a daily task was completed that week.</p>
            </div>
          </div>

          <div class="border-t pt-3 mt-3">
            <label class="block text-xs font-medium mb-1">Minimum account age (days)</label>
            <input v-model.number="scoring.minAccountAgeDays" type="number" min="0" max="365" inputmode="numeric" class="cm-field w-full sm:w-40 border rounded px-2 py-1" style="font-size:16px" />
            <p class="text-[11px] text-gray-500 mt-1">
              Accounts younger than this don't qualify for any award — the only defense against a
              throwaway account inflating a team's score.
            </p>
            <p v-if="scoring.minAccountAgeDays === 0" class="text-[11px] text-amber-600 font-medium mt-1">
              0 disables the anti-abuse gate entirely — any account, including one created today, can score.
            </p>
          </div>

          <div class="border-t pt-3 mt-3">
            <div class="text-xs font-medium mb-1.5">Top 10 boards</div>
            <div class="flex flex-col gap-1.5">
              <label class="cm-tap flex items-center gap-2">
                <input type="checkbox" v-model="scoring.top10PointsBoardEnabled" />
                <span class="text-xs">Total Points board</span>
              </label>
              <label class="cm-tap flex items-center gap-2">
                <input type="checkbox" v-model="scoring.top10CtoonsBoardEnabled" />
                <span class="text-xs">Total cToons board</span>
              </label>
            </div>
            <div class="mt-2">
              <label class="block text-xs font-medium mb-1">Rank cutoff</label>
              <input v-model.number="scoring.top10RankCutoff" type="number" min="1" max="250" inputmode="numeric" class="cm-field w-full sm:w-40 border rounded px-2 py-1" style="font-size:16px" />
              <p class="text-[11px] text-gray-500 mt-1">How many ranks count as "top 10" on each enabled board.</p>
            </div>
            <p v-if="!scoring.top10PointsBoardEnabled && !scoring.top10CtoonsBoardEnabled" class="text-[11px] text-amber-600 font-medium mt-1">
              Both boards are off — the Top 10 bonus is effectively disabled.
            </p>
          </div>

          <div class="border-t pt-3 mt-3">
            <div class="text-xs font-medium mb-1">High Score eligible games</div>
            <p class="text-[11px] text-gray-500 mb-2">Only checked games can earn the High Score bonus.</p>

            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-gray-600">Score-based games</span>
              <span class="flex gap-3">
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="setAllGames('score', true)">All</button>
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="setAllGames('score', false)">None</button>
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-3">
              <label
                v-for="g in scoreGameOptions" :key="g.key"
                class="cm-tap flex items-center gap-1.5 px-2 rounded-md border cursor-pointer select-none"
                :class="isGameEnabled('score', g.key) ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'"
              >
                <input type="checkbox" class="sr-only" :checked="isGameEnabled('score', g.key)" @change="toggleGame('score', g.key)" />
                <span class="text-[11px] font-medium break-words">{{ g.label }}</span>
              </label>
            </div>

            <div class="flex items-center justify-between mb-1">
              <span class="text-[11px] text-gray-600">Win-based games</span>
              <span class="flex gap-3">
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="setAllGames('win', true)">All</button>
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="setAllGames('win', false)">None</button>
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1">
              <label
                v-for="g in winGameOptions" :key="g.key"
                class="cm-tap flex items-center gap-1.5 px-2 rounded-md border cursor-pointer select-none"
                :class="isGameEnabled('win', g.key) ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'"
              >
                <input type="checkbox" class="sr-only" :checked="isGameEnabled('win', g.key)" @change="toggleGame('win', g.key)" />
                <span class="text-[11px] font-medium break-words">{{ g.label }}</span>
              </label>
            </div>

            <p class="text-[11px] text-gray-500 mt-2">{{ enabledGameSummary }}</p>
            <p v-if="enabledGameCount === 0" class="text-[11px] text-amber-600 font-medium mt-1">
              No games selected — the High Score bonus is effectively disabled.
            </p>
          </div>

          <p v-if="scoringError" class="text-[11px] text-red-600 mt-3">{{ scoringError }}</p>

          <div class="mt-3">
            <button
              class="cm-tap px-3 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              :disabled="scoringSaving"
              @click="saveScoring"
            >{{ scoringSaving ? 'Saving…' : 'Save Scoring Rules' }}</button>
          </div>
        </template>
      </div>

      <!-- Rank Ladder: ONE shared list of ranks — same name, order, and point threshold in
           every cMoon (see prisma/schema.prisma's CMoonRankTier). Saving a tier here provisions/
           resyncs a matching rank + claimable achievement for every existing cMoon (see
           server/utils/cmoonRankTiers.js); a cMoon's own Ranks sub-section below still shows
           each tier's mirror (marked "Universal") alongside any legacy per-cMoon custom ranks. -->
      <div class="bg-white rounded border p-3 mb-4">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-sm font-semibold">Rank Ladder</h2>
          <button type="button" class="cm-tap px-3 text-[11px] font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700" @click="startAddTier">+ Add rank</button>
        </div>
        <p class="text-[11px] text-gray-600 mb-2">
          One shared ladder for every cMoon. Reaching a rank's point threshold (measured against a
          member's own cMoon points) lets them pick one of that rank's reward cToons (1-6 choices,
          default 5).
        </p>
        <div v-if="rankTiersLoading" class="text-[11px] text-gray-500">Loading…</div>
        <div v-else-if="rankTiers.length" class="space-y-1">
          <div v-for="t in rankTiers" :key="t.id" class="flex items-center gap-2 text-[11px]">
            <span class="text-gray-500 w-6 flex-shrink-0">#{{ t.sortOrder }}</span>
            <span class="flex-1 min-w-0 break-words">{{ t.name }}</span>
            <span class="text-gray-500 flex-shrink-0">{{ t.pointThreshold.toLocaleString() }} pts</span>
            <span class="text-gray-500 flex-shrink-0">{{ t.rewardCtoons.length }}/{{ t.maxRewardChoices }} rewards</span>
            <button type="button" class="cm-tap text-indigo-600" @click="startEditTier(t)">Edit</button>
            <button type="button" class="cm-tap text-red-600" @click="removeTier(t)">Delete</button>
          </div>
        </div>
        <div v-else class="text-[11px] text-gray-500">No ranks yet.</div>
        <p v-if="rankTiersError" class="text-[11px] text-red-600 mt-1">{{ rankTiersError }}</p>
      </div>

      <div v-if="loading" class="text-gray-600">Loading…</div>
      <template v-else>
        <!-- Existing cMoons -->
        <div class="space-y-3">
          <div v-for="c in cmoons" :key="c.id" class="bg-white rounded border p-3">
            <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
              <img
                v-if="c.imagePath" :src="c.imagePath" alt=""
                class="w-6 h-9 object-cover rounded border flex-shrink-0"
              />
              <span v-else class="inline-block w-4 h-4 rounded-full border flex-shrink-0" :style="{ background: safeColor(c.color) }"></span>
              <img v-if="c.avatarPath" :src="c.avatarPath" alt="" class="w-5 h-5 rounded-full object-cover border flex-shrink-0" title="cZone avatar" />
              <span class="font-semibold break-words min-w-0">{{ c.name }}</span>
              <span v-if="c.joinLocked" class="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Locked</span>
              <span v-if="!c.showOnNav" class="text-[10px] font-semibold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">Off nav</span>
              <span v-if="c.allowOptOutJoin === false" class="text-[10px] font-semibold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">No rejoin</span>
              <span class="text-[11px] text-gray-600">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
              <!-- Kept together so they travel as a unit when the row wraps on narrow screens. -->
              <div class="ml-auto flex items-center gap-3 flex-shrink-0">
                <button class="cm-tap text-[11px] text-indigo-600 hover:underline" @click="startEdit(c)">Edit</button>
                <button
                  v-if="c.effectType"
                  class="cm-tap text-[11px] text-indigo-600 hover:underline"
                  @click="previewEffect(c)"
                >Preview effect</button>
                <button
                  class="cm-tap text-[11px] text-indigo-600 hover:underline"
                  @click="openDisperse(c)"
                >cToon Offers</button>
                <button
                  v-if="c.imagePath"
                  class="cm-tap text-[11px] text-gray-600 hover:underline disabled:opacity-40"
                  :disabled="imageBusyId === c.id"
                  @click="removeImage(c)"
                >{{ imageBusyId === c.id ? 'Removing…' : 'Remove graphic' }}</button>
                <button
                  class="cm-tap text-[11px] text-red-600 hover:underline disabled:opacity-40"
                  :disabled="c.memberCount > 0"
                  @click="remove(c)"
                >Delete</button>
              </div>
            </div>
            <div class="text-[11px] text-gray-600 break-words">
              Captains: {{ c.captains.map(cap => cap.username).join(', ') || 'none' }}
            </div>
            <div class="text-[11px] text-gray-600 break-words">
              Prize cToons: {{ c.prizeCtoons.map(p => `${p.name} ×${p.quantity}`).join(', ') || 'none' }}
            </div>
            <div class="text-[11px] text-gray-600 break-words">Discord role ID: {{ c.discordRoleId || 'none' }}</div>
            <div class="text-[11px] text-gray-600 break-words">Effect: {{ c.effectType ? effectLabel(c.effectType) : 'none' }}</div>
            <div class="text-[11px] text-gray-600 break-words">
              cToons displayed: {{ c.displayedCtoonCount }}
              <NuxtLink :to="`/newsite/cmoon/${c.id}`" class="text-indigo-600 hover:underline ml-1">View cMoon page</NuxtLink>
            </div>
            <p v-if="c.memberCount > 0" class="text-[11px] text-gray-600 mt-1">
              Reassign members before this cMoon can be deleted.
            </p>

            <!-- Members: add/remove any player's cMoon membership directly from here, so a
                 captain/member mismatch (or a player stuck in the wrong cMoon) never needs the
                 separate Manage Users screen. Discord roles sync in real time on every change. -->
            <div class="mt-2 pt-2 border-t">
              <button type="button" class="cm-tap text-[11px] font-medium text-indigo-600" @click="toggleMembers(c)">
                {{ membersOpenId === c.id ? '▾' : '▸' }} Members ({{ c.memberCount }})
              </button>
              <div v-if="membersOpenId === c.id" class="mt-2 space-y-2">
                <div v-if="membersLoading" class="text-[11px] text-gray-500">Loading…</div>
                <template v-else>
                  <div class="max-h-56 overflow-y-auto border rounded divide-y">
                    <div v-for="m in members" :key="m.id" class="flex items-center gap-2 px-2 py-1.5 text-[11px]">
                      <span class="flex-1 min-w-0 break-words">
                        {{ m.username }}<span v-if="m.banned" class="text-red-600 ml-1">(banned)</span>
                      </span>
                      <button
                        type="button" class="cm-tap text-red-600 disabled:opacity-40 flex-shrink-0"
                        :disabled="memberActionBusy" @click="removeMember(c, m)"
                      >Remove</button>
                    </div>
                    <div v-if="!members.length" class="px-2 py-2 text-[11px] text-gray-500">No members yet.</div>
                  </div>

                  <div>
                    <label class="block text-[11px] font-medium mb-1">Add member</label>
                    <input
                      v-model="memberSearch"
                      class="cm-field w-full border rounded px-2 py-1"
                      style="font-size:16px"
                      placeholder="Type 3+ characters of a username"
                      autocapitalize="none" autocorrect="off" spellcheck="false"
                      role="combobox" :aria-expanded="memberSearchResults.length > 0"
                    />
                    <div v-if="memberSearchResults.length" class="mt-1 border rounded divide-y bg-white max-h-40 overflow-y-auto">
                      <button
                        v-for="u in memberSearchResults" :key="u.id"
                        type="button"
                        class="cm-tap w-full text-left px-2 text-[11px] hover:bg-gray-100 disabled:opacity-40"
                        :disabled="memberActionBusy || u.banned || u.cMoonId === c.id"
                        @click="addMember(c, u)"
                      >
                        {{ u.username }}
                        <span v-if="u.banned" class="text-red-600 ml-1">(banned — can't be assigned)</span>
                        <span v-else-if="u.cMoonId === c.id" class="text-gray-400 ml-1">(already a member)</span>
                        <span v-else-if="u.cMoonName" class="text-amber-700 ml-1">(moves from {{ u.cMoonName }})</span>
                      </button>
                    </div>
                  </div>
                  <p v-if="memberActionError" class="text-[11px] text-red-600">{{ memberActionError }}</p>
                </template>
              </div>
            </div>

            <!-- Ranks: an ordered ladder (sortOrder) — a member's displayed rank is always the
                 highest-sortOrder rank they've unlocked via an achievement (see Admin: Achievements). -->
            <div class="mt-2 pt-2 border-t">
              <div class="flex items-center justify-between mb-1">
                <div class="text-[11px] font-medium">Ranks</div>
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="startAddRank(c)">+ Add rank</button>
              </div>
              <div v-if="c.ranks.length" class="space-y-1">
                <div v-for="r in c.ranks" :key="r.id" class="flex items-center gap-2 text-[11px]">
                  <span class="text-gray-500 w-6 flex-shrink-0">#{{ r.sortOrder }}</span>
                  <span class="flex-1 min-w-0 break-words">{{ r.name }}</span>
                  <span
                    v-if="r.tierId" class="text-indigo-600 text-[10px] font-medium flex-shrink-0"
                    title="Name, order, and threshold are managed by the universal Rank Ladder above"
                  >Universal</span>
                  <span class="text-gray-500 truncate max-w-[10rem]">{{ r.discordRoleId || 'no role' }}</span>
                  <button type="button" class="cm-tap text-indigo-600" @click="startEditRank(c, r)">Edit</button>
                  <button v-if="!r.tierId" type="button" class="cm-tap text-red-600" @click="removeRank(c, r)">Delete</button>
                </div>
              </div>
              <div v-else class="text-[11px] text-gray-500">No ranks yet.</div>
            </div>

            <!-- Affinity Levels: "contribute to cMoon" ladder — spend points to reach a level,
                 which can grant a cZone border (in this cMoon's color), an exclusive avatar, and/or
                 an exclusive cZone background. Independent of the Ranks ladder above (Ranks are
                 achievement-granted; affinity is spend-driven and personal, not team score). -->
            <div class="mt-2 pt-2 border-t">
              <div class="flex items-center justify-between mb-1">
                <div class="text-[11px] font-medium">Affinity Levels</div>
                <button type="button" class="cm-tap text-[11px] text-indigo-600" @click="startAddLevel(c)">+ Add level</button>
              </div>
              <div v-if="c.affinityLevels.length" class="space-y-1">
                <div v-for="lvl in c.affinityLevels" :key="lvl.id" class="flex items-center gap-2 text-[11px]">
                  <span class="text-gray-500 w-6 flex-shrink-0">#{{ lvl.sortOrder }}</span>
                  <span class="flex-1 min-w-0 break-words">{{ lvl.name }}</span>
                  <span class="text-gray-500 flex-shrink-0">{{ lvl.threshold.toLocaleString() }} pts</span>
                  <span v-if="lvl.grantsBorder" class="flex-shrink-0" title="Grants cZone border">🔲</span>
                  <span v-if="lvl.grantsGlow" class="flex-shrink-0" title="Grants cZone glow">✨</span>
                  <span v-if="lvl.rewardBackground" class="flex-shrink-0" title="Grants background">🖼️</span>
                  <span v-if="lvl.rewardAvatar" class="flex-shrink-0" title="Grants avatar">🧑</span>
                  <button type="button" class="cm-tap text-indigo-600" @click="startEditLevel(c, lvl)">Edit</button>
                  <button type="button" class="cm-tap text-red-600" @click="removeLevel(c, lvl)">Delete</button>
                </div>
              </div>
              <div v-else class="text-[11px] text-gray-500">No affinity levels yet.</div>
            </div>
          </div>
          <div v-if="!cmoons.length" class="text-gray-600">No cMoons yet — create one above.</div>
        </div>
      </template>
    </div>

    <!-- ── Create / Edit cMoon modal ─────────────────────────────────────── -->
    <div v-if="formOpen" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!saving && closeModal()"></div>
      <div class="relative bg-white w-full max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[92vh] text-gray-900">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">{{ editId ? 'Edit cMoon' : 'Create cMoon' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeModal" :disabled="saving">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium mb-1">Name</label>
              <input v-model="form.name" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Color (badge background)</label>
              <div class="flex items-center gap-2">
                <input v-model="form.color" class="cm-field w-full min-w-0 border rounded px-2 py-1" style="font-size:16px" placeholder="#3366ff" autocapitalize="none" autocorrect="off" spellcheck="false" />
                <!-- Native picker is the one control that is easier on a phone than typing hex. -->
                <input v-model="colorPicker" type="color" class="cm-color-swatch flex-shrink-0" aria-label="Pick color" />
              </div>
              <p v-if="form.color && !isValidColor(form.color)" class="text-[11px] text-red-600 mt-1">Must be a hex color like #3366ff</p>
              <p v-else-if="isValidColor(form.color)" class="text-[11px] mt-1 flex items-center gap-2 flex-wrap">
                <span class="cm-preview-pill" :style="cMoonPillStyle(form.color)">{{ form.name || 'Preview' }}</span>
                <span :class="colorContrast >= 4.5 ? 'text-gray-600' : 'text-red-600'">
                  Badge contrast {{ colorContrast.toFixed(1) }}:1{{ colorContrast >= 4.5 ? '' : ' — below the 4.5:1 minimum, pick a darker or lighter color' }}
                </span>
              </p>
              <!-- This color now also drives an entire cToon-modal/cMoon-page theme (not just the
                   small badge above), so preview it in that actual context rather than a swatch alone. -->
              <div v-if="palettePreview" class="cm-theme-preview" :style="{ background: palettePreview.bg, color: palettePreview.text }">
                <div class="cm-theme-preview-banner" :style="{ background: palettePreview.banner, color: palettePreview.bannerText }">
                  {{ form.name || 'cMoon name' }}
                </div>
                <div class="cm-theme-preview-tile" :style="{ background: palettePreview.tileBg }">
                  <div style="font-size:0.65rem;opacity:0.8;">cWorld</div>
                  <div :style="{ color: palettePreview.linkText }">{{ form.name || 'cMoon name' }} ›</div>
                </div>
                <p style="font-size:0.72rem;" :style="{ color: palettePreview.textMuted }">This is how the themed cToon modal &amp; cMoon page will look.</p>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Discord Role ID (optional)</label>
              <input v-model="form.discordRoleId" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" inputmode="numeric" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="123456789012345678" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Effect (plays on cMoon select &amp; achievement claim)</label>
              <select v-model="form.effectType" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px">
                <option value="">None</option>
                <option value="GLITCH">Glitch Effect</option>
                <option value="SLIME">Slime Effect</option>
                <option value="SLIME_FLOOD">Slime Flood Effect</option>
                <option value="SNAKE">Snake Effect</option>
                <option value="TEXT_CALLOUT">"You With Us?" Text Effect</option>
                <option value="POKEBALL">Pokeball Effect</option>
                <option value="FIREWORKS">Fireworks Effect</option>
              </select>
            </div>
            <div>
              <label class="flex items-center gap-2 cm-tap">
                <input type="checkbox" v-model="form.joinLocked" />
                <span class="text-xs font-medium">Locked</span>
              </label>
              <p class="text-[11px] text-gray-600 mt-1">
                Hides this cMoon from the "choose your cMoon" list — players can't join it themselves.
                Admins can still place a player into it via Admin: Manage Users, cToons can still be
                assigned to it, and its cMoon page keeps working normally.
              </p>
            </div>
            <div>
              <label class="flex items-center gap-2 cm-tap">
                <input type="checkbox" v-model="form.showOnNav" />
                <span class="text-xs font-medium">Display on cMoons navigation page</span>
              </label>
              <p class="text-[11px] text-gray-600 mt-1">
                Shows this cMoon as a clickable circle on the public cMoons navigation page
                (uses the cZone avatar below as its logo). Independent of Locked above — a
                locked cMoon can still be shown here, it just still can't be joined.
              </p>
            </div>
          </div>

          <div>
            <label class="flex items-center gap-2 cm-tap">
              <input type="checkbox" v-model="form.allowOptOutJoin" />
              <span class="text-xs font-medium">Allow opt-out join (rejoin after skipping)</span>
            </label>
            <p class="text-[11px] text-gray-600 mt-1">
              Whether a player who previously skipped/opted out of choosing a cMoon can pick THIS
              one when they come back to join later (after the site-wide cooldown above).
              Independent of Locked — a locked cMoon can't be joined by anyone regardless. On by
              default. Use this to keep a cMoon open to first-time choosers but closed to
              late/returning joiners for team-balance reasons, or vice versa.
            </p>
            <div v-if="cmoons.length" class="mt-2 text-[11px] text-gray-600">
              <p class="font-medium mb-1">Current team balance (for an informed decision):</p>
              <ul class="space-y-0.5">
                <li v-for="tc in cmoons" :key="tc.id" :class="{ 'font-semibold text-gray-900': tc.id === editId }">
                  {{ tc.name }}: {{ tc.memberCount }} member{{ tc.memberCount === 1 ? '' : 's' }}
                </li>
              </ul>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cMoon page description (optional)</label>
            <textarea
              v-model="form.pageDescription"
              rows="3"
              maxlength="2000"
              class="cm-field w-full border rounded px-2 py-1"
              style="font-size:16px"
              placeholder="Shown on this cMoon's public page"
            ></textarea>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cMoon page banner (top of page, ~1200×100 after processing)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              A wide masthead shown across the top of this cMoon's page. Keep any name/logo art
              centered — the edges get cropped first on a narrow phone screen. Falls back to a
              plain colored title bar when not uploaded.
            </p>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to upload a banner.</p>
            </template>
            <template v-else>
              <img v-if="pageBannerImagePreview" :src="pageBannerImagePreview" class="cm-page-banner-image-preview" alt="Selected banner preview" />
              <img v-else-if="currentPageBannerImagePath" :src="currentPageBannerImagePath" class="cm-page-banner-image-preview" alt="Current cMoon page banner" />
              <p v-else class="text-[11px] text-gray-600 mb-1">No banner uploaded yet.</p>
              <input type="file" accept="image/png,image/jpeg,image/webp" class="cm-field" @change="handlePageBannerImageFile" />
              <button
                type="button"
                class="cm-tap mt-2 px-3 border rounded bg-white"
                :disabled="!pageBannerImageFile || pageBannerImageUploading"
                @click="uploadPageBannerImage"
              >{{ pageBannerImageUploading ? 'Uploading…' : 'Upload banner' }}</button>
              <p v-if="pageBannerImageError" class="text-[11px] text-red-600 mt-1">{{ pageBannerImageError }}</p>
              <NuxtLink :to="`/newsite/cmoon/${editId}`" class="block text-[11px] text-indigo-600 hover:underline mt-2">View cMoon page</NuxtLink>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Featured cToons ({{ featuredCtoons.length }}/12)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              Shown in the page's centerpiece grid, in this order. Only cToons already assigned to
              display under this cMoon (in the cToon editor) can be featured. Leave empty to
              auto-show the first 12 assigned cToons instead.
            </p>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to pick featured cToons.</p>
            </template>
            <template v-else>
              <div v-if="featuredCtoonsLoading" class="text-[11px] text-gray-500">Loading…</div>
              <template v-else>
                <div v-if="featuredCtoons.length" class="space-y-1 mb-2">
                  <div v-for="(f, i) in featuredCtoons" :key="f.ctoonId" class="flex items-center gap-2 text-[11px]">
                    <span class="text-gray-500 w-5 flex-shrink-0">{{ i + 1 }}.</span>
                    <span class="flex-1 min-w-0 break-words">{{ f.name }}</span>
                    <button type="button" class="cm-tap text-gray-600 disabled:opacity-40" :disabled="i === 0" @click="moveFeaturedCtoon(i, -1)">↑</button>
                    <button type="button" class="cm-tap text-gray-600 disabled:opacity-40" :disabled="i === featuredCtoons.length - 1" @click="moveFeaturedCtoon(i, 1)">↓</button>
                    <button type="button" class="cm-tap text-red-600" @click="removeFeaturedCtoon(i)">Remove</button>
                  </div>
                </div>
                <input
                  v-model="featuredCtoonSearch"
                  class="cm-field w-full border rounded px-2 py-1"
                  style="font-size:16px"
                  :placeholder="featuredCtoons.length >= 12 ? '12 featured — remove one to add another' : 'Type 3+ characters of an assigned cToon'"
                  :disabled="featuredCtoons.length >= 12"
                  autocapitalize="none" autocorrect="off" spellcheck="false"
                  role="combobox" :aria-expanded="featuredCtoonSuggestions.length > 0"
                />
                <div v-if="featuredCtoonSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-40 overflow-y-auto">
                  <button
                    v-for="c in featuredCtoonSuggestions" :key="c.id"
                    type="button"
                    class="cm-tap w-full text-left px-2 text-[11px] hover:bg-gray-100"
                    @click="addFeaturedCtoon(c)"
                  >{{ c.name }}</button>
                </div>
                <button
                  type="button"
                  class="cm-tap mt-2 px-3 border rounded bg-white disabled:opacity-50"
                  :disabled="featuredCtoonsSaving"
                  @click="saveFeaturedCtoons"
                >{{ featuredCtoonsSaving ? 'Saving…' : 'Save Featured cToons' }}</button>
                <p v-if="featuredCtoonsError" class="text-[11px] text-red-600 mt-1">{{ featuredCtoonsError }}</p>
              </template>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cToon ID card button (small pill graphic, replaces the "cWorld" text link)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              Shown on every cToon assigned to this cMoon's ID card, linking to this cMoon's page.
            </p>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to upload a button.</p>
            </template>
            <template v-else>
              <img v-if="buttonImagePreview" :src="buttonImagePreview" class="cm-button-image-preview" alt="Selected button preview" />
              <img v-else-if="currentButtonImagePath" :src="currentButtonImagePath" class="cm-button-image-preview" alt="Current cMoon button" />
              <p v-else class="text-[11px] text-gray-600 mb-1">No button uploaded yet — the modal shows a plain text link instead.</p>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="cm-field" @change="handleButtonImageFile" />
              <p class="text-[11px] text-gray-500 mt-1">Any image works — it's auto-cropped/resized to a small ~232×62 pill button on upload.</p>
              <button
                type="button"
                class="cm-tap mt-2 px-3 border rounded bg-white"
                :disabled="!buttonImageFile || buttonImageUploading"
                @click="uploadButtonImage"
              >{{ buttonImageUploading ? 'Uploading…' : 'Upload button' }}</button>
              <p v-if="buttonImageError" class="text-[11px] text-red-600 mt-1">{{ buttonImageError }}</p>
              <label class="flex items-center gap-2 cm-tap mt-2">
                <input type="checkbox" v-model="form.showButtonOnPages" />
                <span class="text-xs font-medium">Show this button on OTHER cMoons' pages</span>
              </label>
              <p class="text-[11px] text-gray-600 mt-1">
                Cross-promotes this cMoon in the button-pill list on every other cMoon's page.
                Works even while Locked above — an admin can still cross-promote a locked cMoon.
              </p>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Poll (shown at the bottom of this cMoon's page)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              At most one active poll per cMoon. Replacing it deletes any existing votes — there's
              no in-place edit, only replace or remove.
            </p>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to set up a poll.</p>
            </template>
            <template v-else>
              <p v-if="currentPollQuestion" class="text-[11px] text-gray-600 mb-2">
                Currently live: "{{ currentPollQuestion }}"
              </p>
              <label class="block text-xs font-medium mb-1">Question</label>
              <input v-model="pollForm.question" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" maxlength="300" />
              <label class="block text-xs font-medium mb-1 mt-2">Options (2–8)</label>
              <div v-for="(opt, i) in pollForm.options" :key="i" class="flex items-center gap-2 mb-1">
                <input v-model="pollForm.options[i]" class="cm-field flex-1 min-w-0 border rounded px-2 py-1" style="font-size:16px" maxlength="120" :placeholder="`Option ${i + 1}`" />
                <button type="button" class="cm-tap text-red-600 disabled:opacity-40" :disabled="pollForm.options.length <= 2" @click="removePollOption(i)">✕</button>
              </div>
              <button type="button" class="cm-tap text-[11px] text-indigo-600" :disabled="pollForm.options.length >= 8" @click="addPollOption">+ Add option</button>
              <div class="flex items-center gap-3 mt-2">
                <button type="button" class="cm-tap px-3 border rounded bg-white disabled:opacity-50" :disabled="pollSaving" @click="savePoll">
                  {{ pollSaving ? 'Saving…' : 'Replace Poll' }}
                </button>
                <button v-if="currentPollQuestion" type="button" class="cm-tap text-[11px] text-red-600 disabled:opacity-40" :disabled="pollSaving" @click="deletePoll">
                  Remove poll
                </button>
              </div>
              <p v-if="pollError" class="text-[11px] text-red-600 mt-1">{{ pollError }}</p>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cZone avatar (small, like a player avatar)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              Shown next to this cMoon's colored name badge on members' cZones, and as this
              cMoon's logo on the cMoons navigation page (if "Display on cMoons navigation page"
              is checked above). Square works best — it's auto-cropped/resized to 128×128. Leave
              empty to fall back to a plain color circle in both places.
            </p>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to upload an avatar.</p>
            </template>
            <template v-else>
              <div class="flex items-center gap-3 flex-wrap">
                <img
                  v-if="avatarImagePreview || currentAvatarPath"
                  :src="avatarImagePreview || currentAvatarPath"
                  class="w-14 h-14 rounded-full object-cover border flex-shrink-0"
                  alt="cZone avatar preview"
                />
                <p v-else class="text-[11px] text-gray-600">No avatar uploaded yet.</p>
                <input type="file" accept="image/png,image/jpeg,image/webp" class="cm-field text-[11px]" @change="handleAvatarImageFile" />
              </div>
              <div class="flex items-center gap-3 mt-2 flex-wrap">
                <button
                  type="button"
                  class="cm-tap px-3 border rounded bg-white"
                  :disabled="!avatarImageFile || avatarImageUploading"
                  @click="uploadAvatarImage"
                >{{ avatarImageUploading ? 'Uploading…' : 'Upload avatar' }}</button>
                <button
                  v-if="currentAvatarPath"
                  type="button"
                  class="cm-tap text-[11px] text-gray-600 hover:underline disabled:opacity-40"
                  :disabled="avatarImageUploading"
                  @click="removeAvatarImage"
                >Remove avatar</button>
              </div>
              <p v-if="avatarImageError" class="text-[11px] text-red-600 mt-1">{{ avatarImageError }}</p>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Captains (from admins)</label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="a in admins" :key="a.id"
                type="button"
                class="cm-chip px-3 rounded-full border text-[11px]"
                :class="form.captainIds.includes(a.id) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'"
                :aria-pressed="form.captainIds.includes(a.id)"
                @click="toggleCaptain(a.id)"
              >
                <span aria-hidden="true">{{ form.captainIds.includes(a.id) ? '✓' : '+' }}</span>
                {{ a.username || a.id }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Prize cToons (granted when a user joins)</label>
            <!-- Stacks on phones so the search field gets full width and Add stays a big target. -->
            <div class="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                v-model="prizeCtoonSearch"
                class="cm-field w-full sm:flex-1 min-w-0 border rounded px-2 py-1"
                style="font-size:16px"
                placeholder="Type 3+ characters"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                role="combobox"
                :aria-expanded="ctoonSuggestions.length > 0"
                aria-controls="cmoon-ctoon-suggestions"
              />
              <div class="flex gap-2">
                <input v-model.number="prizeCtoonQty" type="number" min="1" inputmode="numeric" class="cm-field w-20 flex-shrink-0 border rounded px-2 py-1" style="font-size:16px" aria-label="Quantity" />
                <button type="button" class="cm-tap flex-1 sm:flex-none px-4 border rounded bg-white" @click="addPrizeCtoon">Add</button>
              </div>
            </div>
            <!-- Rendered list rather than <datalist>: datalist is unreliable on iOS and forced an
                 exact string match, which made this picker unusable on a phone. -->
            <div v-if="ctoonSuggestions.length" id="cmoon-ctoon-suggestions" class="mt-2 border rounded divide-y bg-white max-h-56 overflow-y-auto">
              <button
                v-for="c in ctoonSuggestions" :key="c.id"
                type="button"
                class="cm-tap w-full text-left px-3 text-[11px] hover:bg-gray-100"
                @click="selectCtoon(c)"
              >{{ c.name }}</button>
            </div>
            <div v-if="form.prizeCtoons.length" class="mt-2 space-y-1">
              <div v-for="(p, i) in form.prizeCtoons" :key="p.ctoonId" class="flex items-center gap-2 text-[11px]">
                <span class="break-words min-w-0">{{ nameForCtoon(p.ctoonId) }} × {{ p.quantity }}</span>
                <button type="button" class="cm-tap ml-auto flex-shrink-0 text-red-600" @click="form.prizeCtoons.splice(i, 1)">Remove</button>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Starter choice graphic (selection-screen poster)</label>
            <p class="text-[11px] text-gray-600 mb-2">
              Shown as the choice for this cMoon on the "Choose your cMoon" screen new and existing
              players see. Portrait images work best (about a 2:3 ratio, e.g. 600×900) — it's
              automatically resized and cropped to fit. PNG, JPEG, or WebP, up to 5MB. Leave empty
              to keep showing the color swatch instead.
            </p>
            <div class="flex items-center gap-3 flex-wrap">
              <img
                v-if="imagePreviewUrl || currentImagePath"
                :src="imagePreviewUrl || currentImagePath" alt=""
                class="w-16 h-24 object-cover rounded border flex-shrink-0"
              />
              <input type="file" accept="image/png,image/jpeg,image/webp" class="cm-field text-[11px]" @change="onImageFileChange" />
            </div>
            <p v-if="imageError" class="text-[11px] text-red-600 mt-1">{{ imageError }}</p>
          </div>

          <p v-if="formError" class="text-[11px] text-red-600">{{ formError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button type="button" class="cm-tap px-3 border rounded" @click="closeModal" :disabled="saving">Cancel</button>
          <button class="cm-tap px-3 bg-indigo-600 text-white rounded" @click="save" :disabled="saving">
            {{ saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create cMoon') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Add / Edit rank modal ─────────────────────────────────────── -->
    <div v-if="rankModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!rankSaving && closeRankModal()"></div>
      <div class="relative bg-white w-full max-w-sm rounded-lg shadow-lg flex flex-col max-h-[92vh] text-gray-900">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">{{ rankForm.id ? 'Edit Rank' : 'Add Rank' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeRankModal" :disabled="rankSaving">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          <p v-if="rankForm.tierId" class="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1.5">
            This rank is managed by the universal Rank Ladder — edit its name, order, or point
            threshold there. Only the Discord Role ID below is specific to this cMoon.
          </p>
          <div>
            <label class="block text-xs font-medium mb-1">Rank name</label>
            <input v-model="rankForm.name" :disabled="!!rankForm.tierId" class="cm-field w-full border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500" style="font-size:16px" placeholder="e.g. Sergeant" />
          </div>
          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="rankForm.sortOrder" type="number" inputmode="numeric" :disabled="!!rankForm.tierId" class="cm-field w-full border rounded px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500" style="font-size:16px" aria-label="Ladder order" />
            </div>
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Discord Role ID (optional)</label>
              <input v-model="rankForm.discordRoleId" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="123456789012345678" inputmode="numeric" autocapitalize="none" autocorrect="off" spellcheck="false" />
            </div>
          </div>
          <p v-if="rankFormError" class="text-[11px] text-red-600">{{ rankFormError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button type="button" class="cm-tap px-3 border rounded" @click="closeRankModal" :disabled="rankSaving">Cancel</button>
          <button type="button" class="cm-tap px-3 bg-indigo-600 text-white rounded" @click="saveRank(rankCMoon)" :disabled="rankSaving">
            {{ rankSaving ? 'Saving…' : (rankForm.id ? 'Save Rank' : 'Add Rank') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Add / Edit rank tier modal (the universal Rank Ladder) ────────── -->
    <div v-if="tierModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!tierSaving && closeTierModal()"></div>
      <div class="relative bg-white w-full max-w-sm rounded-lg shadow-lg flex flex-col max-h-[92vh] text-gray-900">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">{{ tierForm.id ? 'Edit Rank' : 'Add Rank' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeTierModal" :disabled="tierSaving">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          <div>
            <label class="block text-xs font-medium mb-1">Rank name</label>
            <input v-model="tierForm.name" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="e.g. Sergeant" />
          </div>
          <div class="flex gap-2">
            <div class="w-20 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="tierForm.sortOrder" type="number" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" aria-label="Ladder order" />
            </div>
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Point threshold</label>
              <input v-model.number="tierForm.pointThreshold" type="number" min="0" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="e.g. 5000" />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Reward choices (1-6)</label>
            <input
              v-model.number="tierForm.maxRewardChoices" type="number" min="1" max="6" inputmode="numeric"
              class="cm-field w-24 border rounded px-2 py-1" style="font-size:16px"
            />
          </div>

          <div class="pt-2 border-t">
            <label class="block text-xs font-medium mb-1">Reward cToons ({{ tierForm.rewardCtoons.length }}/{{ tierForm.maxRewardChoices }} — member picks 1)</label>
            <div v-if="tierForm.rewardCtoons.length" class="space-y-1 mb-2">
              <div v-for="(r, i) in tierForm.rewardCtoons" :key="r.ctoonId" class="flex items-center gap-2 text-[11px]">
                <span class="flex-1 min-w-0 break-words">{{ r.name }}</span>
                <button type="button" class="cm-tap text-red-600" @click="removeTierRewardCtoon(i)">Remove</button>
              </div>
            </div>
            <input
              v-model="tierRewardSearch"
              class="cm-field w-full border rounded px-2 py-1"
              style="font-size:16px"
              :placeholder="tierForm.rewardCtoons.length >= tierForm.maxRewardChoices ? `${tierForm.maxRewardChoices} rewards — remove one to add another` : 'Type 3+ characters of a cToon'"
              :disabled="tierForm.rewardCtoons.length >= tierForm.maxRewardChoices"
              autocapitalize="none" autocorrect="off" spellcheck="false"
              role="combobox" :aria-expanded="tierRewardSuggestions.length > 0"
            />
            <div v-if="tierRewardSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-40 overflow-y-auto">
              <button
                v-for="c in tierRewardSuggestions" :key="c.id"
                type="button"
                class="cm-tap w-full text-left px-2 text-[11px] hover:bg-gray-100"
                @click="addTierRewardCtoon(c)"
              >{{ c.name }}</button>
            </div>
          </div>

          <p v-if="tierFormError" class="text-[11px] text-red-600">{{ tierFormError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button type="button" class="cm-tap px-3 border rounded" @click="closeTierModal" :disabled="tierSaving">Cancel</button>
          <button type="button" class="cm-tap px-3 bg-indigo-600 text-white rounded" @click="saveTier" :disabled="tierSaving">
            {{ tierSaving ? 'Saving…' : (tierForm.id ? 'Save Rank' : 'Add Rank') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ── Add / Edit affinity level modal ─────────────────────────────── -->
    <div v-if="levelModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-2">
      <div class="absolute inset-0 bg-black/50" @click="!levelSaving && closeLevelModal()"></div>
      <div class="relative bg-white w-full max-w-sm rounded-lg shadow-lg flex flex-col max-h-[92vh] text-gray-900">
        <div class="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
          <h3 class="text-sm font-semibold">{{ levelForm.id ? 'Edit Affinity Level' : 'Add Affinity Level' }}</h3>
          <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closeLevelModal" :disabled="levelSaving">✕</button>
        </div>

        <div class="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          <div>
            <label class="block text-xs font-medium mb-1">Level name</label>
            <input v-model="levelForm.name" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="e.g. Devoted" />
          </div>
          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Points required</label>
              <input v-model.number="levelForm.threshold" type="number" inputmode="numeric" min="1" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
            </div>
            <div class="w-20 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="levelForm.sortOrder" type="number" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" aria-label="Ladder order" />
            </div>
          </div>

          <label class="flex items-center gap-2 pt-1">
            <input type="checkbox" v-model="levelForm.grantsBorder" />
            <span class="text-xs">Grants cZone border (in this cMoon's color)</span>
          </label>

          <label class="flex items-center gap-2">
            <input type="checkbox" v-model="levelForm.grantsGlow" />
            <span class="text-xs">Grants cZone glow (in this cMoon's color)</span>
          </label>
          <p class="text-[11px] text-gray-500 -mt-1">Border and glow are separate, permanent unlocks — a member can earn both, but can only display one on their cZone at a time.</p>

          <div>
            <label class="block text-xs font-medium mb-1">Reward background (optional)</label>
            <select v-model="levelForm.rewardBackgroundId" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px">
              <option value="">None</option>
              <option v-for="bg in backgrounds" :key="bg.id" :value="bg.id">{{ bg.label || bg.filename }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Reward avatar (optional)</label>
            <select v-model="levelForm.rewardAvatarId" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px">
              <option value="">None</option>
              <option v-for="av in avatarsCatalog" :key="av.id" :value="av.id">{{ av.label || av.filename }}</option>
            </select>
            <button type="button" class="text-[11px] text-indigo-600 mt-1" @click="avatarUploadOpen = !avatarUploadOpen">
              {{ avatarUploadOpen ? 'Cancel upload' : '+ Upload new avatar' }}
            </button>
            <div v-if="avatarUploadOpen" class="mt-1 space-y-1">
              <input type="file" accept="image/png,image/jpeg,image/webp" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" @change="onAvatarFileChange" />
              <input v-model="avatarUploadLabel" placeholder="Label (optional)" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" />
              <button type="button" class="cm-tap px-3 border rounded text-xs" :disabled="!avatarUploadFile || avatarUploading" @click="uploadAvatar">
                {{ avatarUploading ? 'Uploading…' : 'Upload' }}
              </button>
              <p v-if="avatarUploadError" class="text-[11px] text-red-600">{{ avatarUploadError }}</p>
            </div>
          </div>

          <p v-if="levelFormError" class="text-[11px] text-red-600">{{ levelFormError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t flex-shrink-0">
          <button type="button" class="cm-tap px-3 border rounded" @click="closeLevelModal" :disabled="levelSaving">Cancel</button>
          <button type="button" class="cm-tap px-3 bg-indigo-600 text-white rounded" @click="saveLevel(levelCMoon)" :disabled="levelSaving">
            {{ levelSaving ? 'Saving…' : (levelForm.id ? 'Save Level' : 'Add Level') }}
          </button>
        </div>
      </div>
    </div>

    <!-- A separate instance from the one mounted globally in the newsite layout (which drives
         the real must-choose flow) — preview mode is entirely self-contained per instance, so
         opening this one here can never interfere with a real deadline modal elsewhere. -->
    <CMoonSelectModal preview v-model="previewModalOpen" />

    <!-- ── Disperse cToons modal ─────────────────────────────────────── -->
    <CMoonDisperseModal
      v-if="disperseCMoon"
      :cmoon="disperseCMoon"
      :allCMoons="cmoons"
      @close="closeDisperse"
    />

    <!-- ── Balance Teams modal ───────────────────────────────────────── -->
    <CMoonBalanceModal
      v-if="balanceModalOpen"
      @close="balanceModalOpen = false"
      @done="load"
    />
  </div>
</template>

<script setup>
import { cMoonPillStyle, isSafeCMoonColor, cMoonContrastRatio } from '~/utils/cmoonColor'
import { cMoonPalette } from '~/utils/cmoonPalette'

const rs = useAdminResources()
const { play: playPreviewEffect } = useFullscreenEffect()

const loading = ref(false)
const saving = ref(false)
const formError = ref('')
const cmoons = ref([])
const admins = ref([])
const ctoons = ref([])
const flagEnabled = ref(false)
const flagSaving = ref(false)
const cMoonEnabledAt = ref(null)
const optOutCooldownDays = ref(14)
const cooldownSaving = ref(false)
const cooldownError = ref('')
const previewModalOpen = ref(false)
const balanceModalOpen = ref(false)

function previewEffect(c) {
  if (c.effectType) playPreviewEffect(c.effectType)
}

// ── Members panel (per-cMoon, one open at a time) ───────────────────────
const membersOpenId = ref('')
const membersLoading = ref(false)
const members = ref([])
const memberSearch = ref('')
const memberSearchResults = ref([])
const memberActionBusy = ref(false)
const memberActionError = ref('')
let memberSearchTimer = null

async function loadMembers(cMoonId) {
  membersLoading.value = true
  try {
    const res = await $fetch(`/api/admin/cmoons/${cMoonId}/members`)
    members.value = res.members || []
  } catch (e) {
    memberActionError.value = e?.data?.statusMessage || 'Failed to load members'
    members.value = []
  } finally {
    membersLoading.value = false
  }
}

function toggleMembers(c) {
  if (membersOpenId.value === c.id) {
    membersOpenId.value = ''
    return
  }
  membersOpenId.value = c.id
  memberSearch.value = ''
  memberSearchResults.value = []
  memberActionError.value = ''
  loadMembers(c.id)
}

watch(memberSearch, (v) => {
  clearTimeout(memberSearchTimer)
  const q = String(v || '').trim()
  if (q.length < 3) { memberSearchResults.value = []; return }
  // Debounced search-as-you-type against a lightweight dedicated endpoint (not the full
  // Manage-Users user list) — see server/api/admin/users/search.get.js.
  memberSearchTimer = setTimeout(async () => {
    try {
      const res = await $fetch('/api/admin/users/search', { params: { q } })
      memberSearchResults.value = res.users || []
    } catch {
      memberSearchResults.value = []
    }
  }, 250)
})

async function addMember(c, u) {
  if (u.banned || u.cMoonId === c.id || memberActionBusy.value) return
  const confirmMsg = u.cMoonName
    ? `Move ${u.username} from ${u.cMoonName} into ${c.name}? This updates their Discord roles too.`
    : `Add ${u.username} to ${c.name}?`
  if (!confirm(confirmMsg)) return
  memberActionBusy.value = true
  memberActionError.value = ''
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/update-cmoon`, { method: 'POST', body: { cMoonId: c.id } })
    if (res.discordRoleSynced === false) memberActionError.value = "Added, but Discord role sync didn't confirm — it may still land shortly, or check the bot's permissions."
    memberSearch.value = ''
    memberSearchResults.value = []
    await Promise.all([loadMembers(c.id), load()])
  } catch (e) {
    memberActionError.value = e?.data?.statusMessage || 'Failed to add member'
  } finally {
    memberActionBusy.value = false
  }
}

async function removeMember(c, m) {
  if (memberActionBusy.value) return
  if (!confirm(`Remove ${m.username} from ${c.name}?`)) return
  memberActionBusy.value = true
  memberActionError.value = ''
  try {
    const res = await $fetch(`/api/admin/users/${m.id}/update-cmoon`, { method: 'POST', body: { cMoonId: null } })
    if (res.discordRoleSynced === false) memberActionError.value = "Removed, but Discord role sync didn't confirm — it may still land shortly, or check the bot's permissions."
    await Promise.all([loadMembers(c.id), load()])
  } catch (e) {
    memberActionError.value = e?.data?.statusMessage || 'Failed to remove member'
  } finally {
    memberActionBusy.value = false
  }
}

const EFFECT_LABELS = {
  GLITCH: 'Glitch Effect',
  SLIME: 'Slime Effect',
  SLIME_FLOOD: 'Slime Flood Effect',
  SNAKE: 'Snake Effect',
  TEXT_CALLOUT: '"You With Us?" Text Effect',
  POKEBALL: 'Pokeball Effect',
  FIREWORKS: 'Fireworks Effect',
}
function effectLabel(type) {
  return EFFECT_LABELS[type] || type
}

const editId = ref('')
const formOpen = ref(false)
const emptyForm = () => ({ name: '', color: '', discordRoleId: '', pageDescription: '', effectType: '', joinLocked: false, showOnNav: true, showButtonOnPages: false, allowOptOutJoin: true, captainIds: [], prizeCtoons: [] })
const form = reactive(emptyForm())
const prizeCtoonSearch = ref('')
const prizeCtoonQty = ref(1)

// ── Featured cToons (separate step — needs an existing cMoon row) ──────
const featuredCtoons = ref([]) // [{ ctoonId, name, assetPath }], in display order
const assignableCtoons = ref([]) // pool: cToons already display-assigned to this cMoon
const featuredCtoonsLoading = ref(false)
const featuredCtoonsSaving = ref(false)
const featuredCtoonsError = ref('')
const featuredCtoonSearch = ref('')

const featuredCtoonSuggestions = computed(() => {
  const v = String(featuredCtoonSearch.value || '').trim().toLowerCase()
  if (v.length < 3) return []
  const already = new Set(featuredCtoons.value.map(f => f.ctoonId))
  return assignableCtoons.value
    .filter(c => !already.has(c.id) && c.name?.toLowerCase().includes(v))
    .slice(0, 20)
})

async function loadFeaturedCtoons(cMoonId) {
  featuredCtoonsLoading.value = true
  featuredCtoonsError.value = ''
  try {
    const res = await $fetch(`/api/admin/cmoons/${cMoonId}/featured-ctoons`)
    featuredCtoons.value = res.featuredCtoons || []
    assignableCtoons.value = res.assignableCtoons || []
  } catch (e) {
    featuredCtoonsError.value = e?.data?.statusMessage || 'Failed to load featured cToons'
    featuredCtoons.value = []
    assignableCtoons.value = []
  } finally {
    featuredCtoonsLoading.value = false
  }
}

function addFeaturedCtoon(c) {
  if (featuredCtoons.value.length >= 12 || featuredCtoons.value.some(f => f.ctoonId === c.id)) return
  featuredCtoons.value.push({ ctoonId: c.id, name: c.name, assetPath: c.assetPath })
  featuredCtoonSearch.value = ''
}

function removeFeaturedCtoon(i) {
  featuredCtoons.value.splice(i, 1)
}

function moveFeaturedCtoon(i, delta) {
  const j = i + delta
  if (j < 0 || j >= featuredCtoons.value.length) return
  const list = featuredCtoons.value
  ;[list[i], list[j]] = [list[j], list[i]]
}

// ── Poll (separate step — needs an existing cMoon row) ──────────────────
const currentPollQuestion = ref('')
const pollForm = reactive({ question: '', options: ['', ''] })
const pollSaving = ref(false)
const pollError = ref('')

function addPollOption() {
  if (pollForm.options.length < 8) pollForm.options.push('')
}
function removePollOption(i) {
  if (pollForm.options.length > 2) pollForm.options.splice(i, 1)
}

async function savePoll() {
  if (!editId.value || pollSaving.value) return
  pollSaving.value = true
  pollError.value = ''
  try {
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/poll`, {
      method: 'PUT',
      body: { question: pollForm.question, options: pollForm.options },
    })
    currentPollQuestion.value = res.poll?.question || ''
  } catch (e) {
    pollError.value = e?.data?.statusMessage || 'Failed to save poll'
  } finally {
    pollSaving.value = false
  }
}

async function deletePoll() {
  if (!editId.value || pollSaving.value) return
  if (!confirm('Remove the active poll and all its votes?')) return
  pollSaving.value = true
  pollError.value = ''
  try {
    await $fetch(`/api/admin/cmoons/${editId.value}/poll`, { method: 'DELETE' })
    currentPollQuestion.value = ''
    Object.assign(pollForm, { question: '', options: ['', ''] })
  } catch (e) {
    pollError.value = e?.data?.statusMessage || 'Failed to remove poll'
  } finally {
    pollSaving.value = false
  }
}

async function saveFeaturedCtoons() {
  if (!editId.value || featuredCtoonsSaving.value) return
  featuredCtoonsSaving.value = true
  featuredCtoonsError.value = ''
  try {
    await $fetch(`/api/admin/cmoons/${editId.value}/featured-ctoons`, {
      method: 'PUT',
      body: { ctoonIds: featuredCtoons.value.map(f => f.ctoonId) },
    })
  } catch (e) {
    featuredCtoonsError.value = e?.data?.statusMessage || 'Failed to save featured cToons'
  } finally {
    featuredCtoonsSaving.value = false
  }
}

// Starter-graphic upload state. Kept separate from `form` — the image is a separate multipart
// request (POST/DELETE .../[id]/image), sent only after the name/color/etc save succeeds.
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const selectedImageFile = ref(null)
const imagePreviewUrl = ref('')
const currentImagePath = ref('')
const imageError = ref('')
const imageBusyId = ref('')

function onImageFileChange(e) {
  const file = e.target.files?.[0] || null
  e.target.value = ''
  imageError.value = ''
  if (!file) return
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    imageError.value = 'Only PNG, JPEG, or WebP images are allowed'
    return
  }
  if (file.size > IMAGE_MAX_BYTES) {
    imageError.value = 'Image must be 5MB or smaller'
    return
  }
  if (imagePreviewUrl.value) rs.revokeObjectUrl(imagePreviewUrl.value)
  selectedImageFile.value = file
  imagePreviewUrl.value = rs.objectUrl(file)
}

async function uploadImageIfNeeded(id) {
  if (!selectedImageFile.value) return
  const fd = new FormData()
  fd.append('image', selectedImageFile.value)
  await $fetch(`/api/admin/cmoons/${id}/image`, { method: 'POST', body: fd })
}

async function removeImage(c) {
  imageBusyId.value = c.id
  try {
    await $fetch(`/api/admin/cmoons/${c.id}/image`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Failed to remove graphic')
  } finally {
    imageBusyId.value = ''
  }
}

// ── cMoon page image (separate step — needs an existing cMoon row) ─────
const pageBannerImageFile = ref(null)
const pageBannerImagePreview = ref('')
const pageBannerImageUploading = ref(false)
const pageBannerImageError = ref('')
const currentPageBannerImagePath = ref('')

// ── cToon modal banner (separate step — needs an existing cMoon row) ───
const buttonImageFile = ref(null)
const buttonImagePreview = ref('')
const buttonImageUploading = ref(false)
const buttonImageError = ref('')
const currentButtonImagePath = ref('')

// ── cZone avatar (separate step — needs an existing cMoon row) ─────────
const avatarImageFile = ref(null)
const avatarImagePreview = ref('')
const avatarImageUploading = ref(false)
const avatarImageError = ref('')
const currentAvatarPath = ref('')

const palettePreview = computed(() => isValidColor(form.color) ? cMoonPalette(form.color) : null)

function handlePageBannerImageFile(e) {
  const file = e.target.files?.[0] || null
  pageBannerImageFile.value = file
  pageBannerImageError.value = ''
  if (pageBannerImagePreview.value) URL.revokeObjectURL(pageBannerImagePreview.value)
  pageBannerImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadPageBannerImage() {
  if (!editId.value || !pageBannerImageFile.value || pageBannerImageUploading.value) return
  pageBannerImageUploading.value = true
  pageBannerImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', pageBannerImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/page-banner-image`, { method: 'POST', body })
    currentPageBannerImagePath.value = res.pageBannerImagePath
    pageBannerImageFile.value = null
    if (pageBannerImagePreview.value) URL.revokeObjectURL(pageBannerImagePreview.value)
    pageBannerImagePreview.value = ''
    await load()
  } catch (e) {
    pageBannerImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    pageBannerImageUploading.value = false
  }
}

function handleButtonImageFile(e) {
  const file = e.target.files?.[0] || null
  buttonImageFile.value = file
  buttonImageError.value = ''
  if (buttonImagePreview.value) URL.revokeObjectURL(buttonImagePreview.value)
  buttonImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadButtonImage() {
  if (!editId.value || !buttonImageFile.value || buttonImageUploading.value) return
  buttonImageUploading.value = true
  buttonImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', buttonImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/button-image`, { method: 'POST', body })
    currentButtonImagePath.value = res.buttonImagePath
    buttonImageFile.value = null
    if (buttonImagePreview.value) URL.revokeObjectURL(buttonImagePreview.value)
    buttonImagePreview.value = ''
    await load()
  } catch (e) {
    buttonImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    buttonImageUploading.value = false
  }
}

function handleAvatarImageFile(e) {
  const file = e.target.files?.[0] || null
  avatarImageFile.value = file
  avatarImageError.value = ''
  if (avatarImagePreview.value) URL.revokeObjectURL(avatarImagePreview.value)
  avatarImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadAvatarImage() {
  if (!editId.value || !avatarImageFile.value || avatarImageUploading.value) return
  avatarImageUploading.value = true
  avatarImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', avatarImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/avatar-image`, { method: 'POST', body })
    currentAvatarPath.value = res.avatarPath
    avatarImageFile.value = null
    if (avatarImagePreview.value) URL.revokeObjectURL(avatarImagePreview.value)
    avatarImagePreview.value = ''
    await load()
  } catch (e) {
    avatarImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    avatarImageUploading.value = false
  }
}

async function removeAvatarImage() {
  if (!editId.value || avatarImageUploading.value) return
  avatarImageUploading.value = true
  avatarImageError.value = ''
  try {
    await $fetch(`/api/admin/cmoons/${editId.value}/avatar-image`, { method: 'DELETE' })
    currentAvatarPath.value = ''
    await load()
  } catch (e) {
    avatarImageError.value = e?.data?.statusMessage || 'Failed to remove avatar'
  } finally {
    avatarImageUploading.value = false
  }
}

// Share the validation/contrast helpers with the player-facing badges so the admin
// preview here matches exactly what renders on leaderboards and cZones.
function isValidColor(c) { return isSafeCMoonColor(c) }
function safeColor(c) { return isValidColor(c) ? c : '#cccccc' }

const colorContrast = computed(() => cMoonContrastRatio(form.color))

// Two-way bridge to <input type="color">, which only ever holds a valid lowercase hex.
const colorPicker = computed({
  get: () => (isValidColor(form.color) ? form.color : '#3366ff'),
  set: (v) => { form.color = v },
})

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(dt)
}

function filteredCtoons(input) {
  const v = String(input || '').trim().toLowerCase()
  if (v.length < 3) return []
  return ctoons.value.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
}

function nameForCtoon(id) {
  return ctoons.value.find(c => c.id === id)?.name || id
}

function toggleCaptain(id) {
  const i = form.captainIds.indexOf(id)
  if (i >= 0) form.captainIds.splice(i, 1)
  else form.captainIds.push(id)
}

const ctoonSuggestions = computed(() => filteredCtoons(prizeCtoonSearch.value))

function selectCtoon(c) {
  prizeCtoonSearch.value = c.name
  addPrizeCtoon(c)
}

function addPrizeCtoon(preselected) {
  // Tolerate case and stray whitespace, and accept a lone suggestion — mobile
  // keyboards autocapitalize, which used to make the exact match impossible to hit.
  const typed = String(prizeCtoonSearch.value || '').trim().toLowerCase()
  const match = preselected
    || ctoons.value.find(c => c.name?.trim().toLowerCase() === typed)
    || (ctoonSuggestions.value.length === 1 ? ctoonSuggestions.value[0] : null)
  if (!match) {
    formError.value = 'Select a valid cToon from the suggestions below.'
    return
  }
  if (form.prizeCtoons.find(p => p.ctoonId === match.id)) {
    formError.value = `${match.name} is already a prize for this cMoon.`
    prizeCtoonSearch.value = ''
    return
  }
  formError.value = ''
  const qty = Math.floor(Number(prizeCtoonQty.value))
  form.prizeCtoons.push({ ctoonId: match.id, quantity: Math.min(100, Math.max(1, Number.isFinite(qty) ? qty : 1)) })
  prizeCtoonSearch.value = ''
  prizeCtoonQty.value = 1
}

function openCreateModal() {
  resetForm()
  formOpen.value = true
}

function startEdit(c) {
  editId.value = c.id
  Object.assign(form, {
    name: c.name,
    color: c.color,
    discordRoleId: c.discordRoleId || '',
    pageDescription: c.pageDescription || '',
    effectType: c.effectType || '',
    joinLocked: !!c.joinLocked,
    showOnNav: c.showOnNav !== false,
    showButtonOnPages: !!c.showButtonOnPages,
    allowOptOutJoin: c.allowOptOutJoin !== false,
    captainIds: c.captains.map(cap => cap.userId),
    prizeCtoons: c.prizeCtoons.map(p => ({ ctoonId: p.ctoonId, quantity: p.quantity })),
  })
  currentPageBannerImagePath.value = c.pageBannerImagePath || ''
  pageBannerImageFile.value = null
  if (pageBannerImagePreview.value) URL.revokeObjectURL(pageBannerImagePreview.value)
  pageBannerImagePreview.value = ''
  pageBannerImageError.value = ''
  currentButtonImagePath.value = c.buttonImagePath || ''
  buttonImageFile.value = null
  if (buttonImagePreview.value) URL.revokeObjectURL(buttonImagePreview.value)
  buttonImagePreview.value = ''
  buttonImageError.value = ''
  currentAvatarPath.value = c.avatarPath || ''
  avatarImageFile.value = null
  if (avatarImagePreview.value) URL.revokeObjectURL(avatarImagePreview.value)
  avatarImagePreview.value = ''
  avatarImageError.value = ''
  formError.value = ''
  clearImageSelection()
  currentImagePath.value = c.imagePath || ''
  featuredCtoonSearch.value = ''
  loadFeaturedCtoons(c.id)
  currentPollQuestion.value = c.poll?.question || ''
  Object.assign(pollForm, c.poll ? { question: c.poll.question, options: [...c.poll.options] } : { question: '', options: ['', ''] })
  pollError.value = ''
  formOpen.value = true
}

function clearImageSelection() {
  if (imagePreviewUrl.value) rs.revokeObjectUrl(imagePreviewUrl.value)
  selectedImageFile.value = null
  imagePreviewUrl.value = ''
  imageError.value = ''
}

function resetForm() {
  Object.assign(form, emptyForm())
  editId.value = ''
  formError.value = ''
  clearImageSelection()
  currentImagePath.value = ''
  currentPageBannerImagePath.value = ''
  pageBannerImageFile.value = null
  if (pageBannerImagePreview.value) URL.revokeObjectURL(pageBannerImagePreview.value)
  pageBannerImagePreview.value = ''
  pageBannerImageError.value = ''
  currentButtonImagePath.value = ''
  buttonImageFile.value = null
  if (buttonImagePreview.value) URL.revokeObjectURL(buttonImagePreview.value)
  buttonImagePreview.value = ''
  buttonImageError.value = ''
  currentAvatarPath.value = ''
  avatarImageFile.value = null
  if (avatarImagePreview.value) URL.revokeObjectURL(avatarImagePreview.value)
  avatarImagePreview.value = ''
  avatarImageError.value = ''
  featuredCtoons.value = []
  assignableCtoons.value = []
  featuredCtoonSearch.value = ''
  featuredCtoonsError.value = ''
  currentPollQuestion.value = ''
  Object.assign(pollForm, { question: '', options: ['', ''] })
  pollError.value = ''
}

function closeModal() {
  resetForm()
  formOpen.value = false
}

// Ranks: one shared edit-form object, scoped to whichever cMoon it's open for
// (rankCMoon), mirroring the single-form-at-a-time pattern used for cMoons above.
const emptyRankForm = () => ({ id: '', name: '', sortOrder: 0, discordRoleId: '', tierId: null })
const rankForm = reactive(emptyRankForm())
const rankCMoon = ref(null)
const rankModalOpen = ref(false)
const rankFormError = ref('')
const rankSaving = ref(false)

function resetRankForm() {
  Object.assign(rankForm, emptyRankForm())
  rankCMoon.value = null
  rankFormError.value = ''
}

function closeRankModal() {
  resetRankForm()
  rankModalOpen.value = false
}

function startAddRank(c) {
  resetRankForm()
  rankCMoon.value = c
  rankForm.sortOrder = (c.ranks.reduce((max, r) => Math.max(max, r.sortOrder), -1)) + 1
  rankModalOpen.value = true
}

function startEditRank(c, r) {
  resetRankForm()
  rankCMoon.value = c
  Object.assign(rankForm, { id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId || '', tierId: r.tierId || null })
  rankFormError.value = ''
  rankModalOpen.value = true
}

async function saveRank(c) {
  if (!c) return
  if (!rankForm.name.trim()) { rankFormError.value = 'Name is required'; return }
  rankFormError.value = ''
  rankSaving.value = true
  try {
    const body = { name: rankForm.name.trim(), sortOrder: rankForm.sortOrder, discordRoleId: rankForm.discordRoleId.trim() }
    if (!rankForm.id) {
      await $fetch(`/api/admin/cmoons/${c.id}/ranks`, { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/cmoons/${c.id}/ranks/${rankForm.id}`, { method: 'PUT', body })
    }
    closeRankModal()
    await load()
  } catch (e) {
    rankFormError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    rankSaving.value = false
  }
}

async function removeRank(c, r) {
  if (!confirm(`Delete rank "${r.name}"?`)) return
  try {
    await $fetch(`/api/admin/cmoons/${c.id}/ranks/${r.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
}

// Rank Ladder: the universal, shared-across-every-cMoon rank tiers (see
// prisma/schema.prisma's CMoonRankTier and server/utils/cmoonRankTiers.js). Reuses the same
// pre-loaded `ctoons` catalog + filteredCtoons() pattern the prize-cToon picker above uses,
// rather than a per-keystroke server search.
const rankTiers = ref([])
const rankTiersLoading = ref(false)
const rankTiersError = ref('')

async function loadRankTiers() {
  rankTiersLoading.value = true
  rankTiersError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-rank-tiers')
    rankTiers.value = res.tiers || []
  } catch (e) {
    rankTiersError.value = e?.data?.statusMessage || 'Failed to load rank ladder'
  } finally {
    rankTiersLoading.value = false
  }
}

// Reward-choice count defaults to 5, admin-adjustable 1-6 per rank tier (see
// MIN_TIER_REWARD_CHOICES/MAX_TIER_REWARD_CTOONS/DEFAULT_TIER_REWARD_CHOICES in
// server/utils/cmoonRankTiers.js — kept in sync with those literal bounds here).
const emptyTierForm = () => ({ id: '', name: '', sortOrder: 0, pointThreshold: 0, maxRewardChoices: 5, rewardCtoons: [] })
const tierForm = reactive(emptyTierForm())
const tierModalOpen = ref(false)
const tierFormError = ref('')
const tierSaving = ref(false)
const tierRewardSearch = ref('')

const tierRewardSuggestions = computed(() => {
  if (tierForm.rewardCtoons.length >= tierForm.maxRewardChoices) return []
  const already = new Set(tierForm.rewardCtoons.map(r => r.ctoonId))
  return filteredCtoons(tierRewardSearch.value).filter(c => !already.has(c.id))
})

// Lowering the cap below the number of already-picked rewards trims the extras — keeps the
// form's own state consistent with the new limit before it's ever saved.
watch(() => tierForm.maxRewardChoices, (n) => {
  const max = Number.isInteger(n) ? n : 0
  if (tierForm.rewardCtoons.length > max) tierForm.rewardCtoons.length = Math.max(0, max)
})

function resetTierForm() {
  Object.assign(tierForm, emptyTierForm())
  tierFormError.value = ''
  tierRewardSearch.value = ''
}

function closeTierModal() {
  resetTierForm()
  tierModalOpen.value = false
}

function startAddTier() {
  resetTierForm()
  tierForm.sortOrder = (rankTiers.value.reduce((max, t) => Math.max(max, t.sortOrder), -1)) + 1
  tierModalOpen.value = true
}

function startEditTier(t) {
  resetTierForm()
  Object.assign(tierForm, {
    id: t.id, name: t.name, sortOrder: t.sortOrder, pointThreshold: t.pointThreshold,
    maxRewardChoices: t.maxRewardChoices,
    rewardCtoons: t.rewardCtoons.map(r => ({ ctoonId: r.ctoonId, name: r.name })),
  })
  tierModalOpen.value = true
}

function addTierRewardCtoon(c) {
  if (tierForm.rewardCtoons.length >= tierForm.maxRewardChoices || tierForm.rewardCtoons.some(r => r.ctoonId === c.id)) return
  tierForm.rewardCtoons.push({ ctoonId: c.id, name: c.name })
  tierRewardSearch.value = ''
}

function removeTierRewardCtoon(i) {
  tierForm.rewardCtoons.splice(i, 1)
}

async function saveTier() {
  if (!tierForm.name.trim()) { tierFormError.value = 'Name is required'; return }
  const threshold = Math.trunc(Number(tierForm.pointThreshold))
  if (!Number.isInteger(threshold) || threshold < 0) {
    tierFormError.value = 'Point threshold must be a non-negative whole number'
    return
  }
  const maxRewardChoices = Math.trunc(Number(tierForm.maxRewardChoices))
  if (!Number.isInteger(maxRewardChoices) || maxRewardChoices < 1 || maxRewardChoices > 6) {
    tierFormError.value = 'Reward choices must be between 1 and 6'
    return
  }
  tierFormError.value = ''
  tierSaving.value = true
  try {
    const body = {
      name: tierForm.name.trim(),
      sortOrder: tierForm.sortOrder,
      pointThreshold: threshold,
      maxRewardChoices,
      rewardCtoonIds: tierForm.rewardCtoons.map(r => r.ctoonId),
    }
    if (!tierForm.id) {
      await $fetch('/api/admin/cmoon-rank-tiers', { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/cmoon-rank-tiers/${tierForm.id}`, { method: 'PUT', body })
    }
    closeTierModal()
    // Resyncing a tier changes every cMoon's own mirrored rank, so refresh both lists.
    await Promise.all([loadRankTiers(), load()])
  } catch (e) {
    tierFormError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    tierSaving.value = false
  }
}

async function removeTier(t) {
  if (!confirm(`Delete rank "${t.name}"? This removes it from every cMoon.`)) return
  try {
    await $fetch(`/api/admin/cmoon-rank-tiers/${t.id}`, { method: 'DELETE' })
    await Promise.all([loadRankTiers(), load()])
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
}

// Affinity Levels: same single-shared-form-at-a-time pattern as Ranks above. `backgrounds` and
// `avatarsCatalog` back the two reward pickers — loaded once in load(), refreshed after an
// inline avatar upload so the new avatar is immediately selectable.
const backgrounds = ref([])
const avatarsCatalog = ref([])

const emptyLevelForm = () => ({ id: '', name: '', threshold: 0, sortOrder: 0, grantsBorder: false, grantsGlow: false, rewardBackgroundId: '', rewardAvatarId: '' })
const levelForm = reactive(emptyLevelForm())
const levelCMoon = ref(null)
const levelModalOpen = ref(false)
const levelFormError = ref('')
const levelSaving = ref(false)

const avatarUploadOpen = ref(false)
const avatarUploadFile = ref(null)
const avatarUploadLabel = ref('')
const avatarUploading = ref(false)
const avatarUploadError = ref('')

function resetLevelForm() {
  Object.assign(levelForm, emptyLevelForm())
  levelCMoon.value = null
  levelFormError.value = ''
  avatarUploadOpen.value = false
  avatarUploadFile.value = null
  avatarUploadLabel.value = ''
  avatarUploadError.value = ''
}

function closeLevelModal() {
  resetLevelForm()
  levelModalOpen.value = false
}

function startAddLevel(c) {
  resetLevelForm()
  levelCMoon.value = c
  levelForm.sortOrder = (c.affinityLevels.reduce((max, l) => Math.max(max, l.sortOrder), -1)) + 1
  levelModalOpen.value = true
}

function startEditLevel(c, lvl) {
  resetLevelForm()
  levelCMoon.value = c
  Object.assign(levelForm, {
    id: lvl.id, name: lvl.name, threshold: lvl.threshold, sortOrder: lvl.sortOrder,
    grantsBorder: lvl.grantsBorder, grantsGlow: lvl.grantsGlow,
    rewardBackgroundId: lvl.rewardBackgroundId || '', rewardAvatarId: lvl.rewardAvatarId || '',
  })
  levelModalOpen.value = true
}

async function saveLevel(c) {
  if (!c) return
  if (!levelForm.name.trim()) { levelFormError.value = 'Name is required'; return }
  if (!Number.isInteger(levelForm.threshold) || levelForm.threshold <= 0) { levelFormError.value = 'Points required must be a positive whole number'; return }
  levelFormError.value = ''
  levelSaving.value = true
  try {
    const body = {
      name: levelForm.name.trim(),
      threshold: levelForm.threshold,
      sortOrder: levelForm.sortOrder,
      grantsBorder: levelForm.grantsBorder,
      grantsGlow: levelForm.grantsGlow,
      rewardBackgroundId: levelForm.rewardBackgroundId || '',
      rewardAvatarId: levelForm.rewardAvatarId || '',
    }
    if (!levelForm.id) {
      await $fetch(`/api/admin/cmoons/${c.id}/affinity-levels`, { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/cmoons/${c.id}/affinity-levels/${levelForm.id}`, { method: 'PUT', body })
    }
    closeLevelModal()
    await load()
  } catch (e) {
    levelFormError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    levelSaving.value = false
  }
}

async function removeLevel(c, lvl) {
  if (!confirm(`Delete affinity level "${lvl.name}"?`)) return
  try {
    await $fetch(`/api/admin/cmoons/${c.id}/affinity-levels/${lvl.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
}

function onAvatarFileChange(e) {
  const file = e.target.files?.[0] || null
  e.target.value = ''
  avatarUploadError.value = ''
  avatarUploadFile.value = file
}

async function uploadAvatar() {
  if (!avatarUploadFile.value) return
  avatarUploading.value = true
  avatarUploadError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', avatarUploadFile.value)
    if (avatarUploadLabel.value.trim()) fd.append('label', avatarUploadLabel.value.trim())
    const created = await $fetch('/api/admin/avatars', { method: 'POST', body: fd })
    avatarsCatalog.value = await $fetch('/api/admin/avatars')
    levelForm.rewardAvatarId = created.id
    avatarUploadOpen.value = false
    avatarUploadFile.value = null
    avatarUploadLabel.value = ''
  } catch (e) {
    avatarUploadError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    avatarUploading.value = false
  }
}

async function load() {
  loading.value = true
  try {
    const [data, adminsData, ctoonsData, backgroundsData, avatarsData] = await Promise.all([
      $fetch('/api/admin/cmoons'),
      $fetch('/api/admin/cmoon-admins'),
      $fetch('/api/admin/list-ctoons'),
      $fetch('/api/admin/backgrounds'),
      $fetch('/api/admin/avatars'),
    ])
    cmoons.value = data.cmoons || []
    flagEnabled.value = !!data.cMoonEnabled
    cMoonEnabledAt.value = data.cMoonEnabledAt
    optOutCooldownDays.value = Number.isInteger(data.cMoonOptOutCooldownDays) ? data.cMoonOptOutCooldownDays : 14
    admins.value = adminsData || []
    ctoons.value = ctoonsData || []
    backgrounds.value = backgroundsData || []
    avatarsCatalog.value = avatarsData || []
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Failed to load cMoons'
  } finally {
    loading.value = false
  }
}

// ── Scoring rules ──────────────────────────────────────────────────────────
const scoring = reactive({
  highScorePoints: 100,
  top10Points: 50,
  dailyTaskPoints: 10,
  minAccountAgeDays: 3,
  top10RankCutoff: 10,
  top10PointsBoardEnabled: true,
  top10CtoonsBoardEnabled: true,
  disabledScoreGames: [],
  disabledWinGames: [],
})
const scoreGameOptions = ref([])
const winGameOptions = ref([])
const scoringLoading = ref(false)
const scoringSaving = ref(false)
const scoringError = ref('')

function disabledListKey(kind) {
  return kind === 'score' ? 'disabledScoreGames' : 'disabledWinGames'
}

function isGameEnabled(kind, key) {
  return !scoring[disabledListKey(kind)].includes(key)
}

function toggleGame(kind, key) {
  const list = scoring[disabledListKey(kind)]
  const i = list.indexOf(key)
  if (i >= 0) list.splice(i, 1)
  else list.push(key)
}

function setAllGames(kind, enabled) {
  const options = kind === 'score' ? scoreGameOptions.value : winGameOptions.value
  scoring[disabledListKey(kind)] = enabled ? [] : options.map(g => g.key)
}

const enabledGameCount = computed(() => {
  const scoreEnabled = scoreGameOptions.value.filter(g => isGameEnabled('score', g.key)).length
  const winEnabled = winGameOptions.value.filter(g => isGameEnabled('win', g.key)).length
  return scoreEnabled + winEnabled
})

const enabledGameSummary = computed(() => {
  const total = scoreGameOptions.value.length + winGameOptions.value.length
  return `${enabledGameCount.value} of ${total} games eligible for the High Score bonus.`
})

async function loadScoring() {
  scoringLoading.value = true
  try {
    const data = await $fetch('/api/admin/cmoon-scoring')
    Object.assign(scoring, {
      highScorePoints: data.highScorePoints,
      top10Points: data.top10Points,
      dailyTaskPoints: data.dailyTaskPoints,
      minAccountAgeDays: data.minAccountAgeDays,
      top10RankCutoff: data.top10RankCutoff,
      top10PointsBoardEnabled: data.top10PointsBoardEnabled,
      top10CtoonsBoardEnabled: data.top10CtoonsBoardEnabled,
      disabledScoreGames: data.disabledScoreGames || [],
      disabledWinGames: data.disabledWinGames || [],
    })
    scoreGameOptions.value = data.scoreGameOptions || []
    winGameOptions.value = data.winGameOptions || []
  } catch (e) {
    scoringError.value = e?.data?.statusMessage || 'Failed to load scoring rules'
  } finally {
    scoringLoading.value = false
  }
}

// Lightweight guardrail: a fat-fingered mobile save that zeroes out a bonus or the
// anti-abuse gate takes effect silently at the next weekly run, so surface exactly
// what would change and make the admin confirm rather than just accept it.
function scoringRiskWarnings() {
  const warnings = []
  if (scoring.minAccountAgeDays === 0) warnings.push('the anti-abuse minimum-account-age gate will be off')
  if (scoring.highScorePoints === 0) warnings.push('the High Score bonus will award 0 points')
  if (scoring.top10Points === 0) warnings.push('the Top 10 bonus will award 0 points')
  if (scoring.dailyTaskPoints === 0) warnings.push('the Daily Task bonus will award 0 points')
  if (!scoring.top10PointsBoardEnabled && !scoring.top10CtoonsBoardEnabled) {
    warnings.push('the Top 10 bonus will be effectively disabled (no boards enabled)')
  }
  if (enabledGameCount.value === 0) warnings.push('the High Score bonus will be effectively disabled (no games selected)')
  return warnings
}

async function saveScoring() {
  scoringError.value = ''
  const warnings = scoringRiskWarnings()
  if (warnings.length && !confirm(`Starting next week:\n- ${warnings.join('\n- ')}\n\nSave anyway?`)) {
    return
  }
  scoringSaving.value = true
  try {
    const body = {
      highScorePoints: scoring.highScorePoints,
      top10Points: scoring.top10Points,
      dailyTaskPoints: scoring.dailyTaskPoints,
      minAccountAgeDays: scoring.minAccountAgeDays,
      top10RankCutoff: scoring.top10RankCutoff,
      top10PointsBoardEnabled: scoring.top10PointsBoardEnabled,
      top10CtoonsBoardEnabled: scoring.top10CtoonsBoardEnabled,
      disabledScoreGames: scoring.disabledScoreGames,
      disabledWinGames: scoring.disabledWinGames,
    }
    const res = await $fetch('/api/admin/cmoon-scoring', { method: 'POST', body })
    Object.assign(scoring, {
      highScorePoints: res.highScorePoints,
      top10Points: res.top10Points,
      dailyTaskPoints: res.dailyTaskPoints,
      minAccountAgeDays: res.minAccountAgeDays,
      top10RankCutoff: res.top10RankCutoff,
      top10PointsBoardEnabled: res.top10PointsBoardEnabled,
      top10CtoonsBoardEnabled: res.top10CtoonsBoardEnabled,
      disabledScoreGames: res.disabledScoreGames || [],
      disabledWinGames: res.disabledWinGames || [],
    })
  } catch (e) {
    scoringError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    scoringSaving.value = false
  }
}

async function toggleFlag() {
  flagSaving.value = true
  try {
    const res = await $fetch('/api/admin/cmoon-settings', { method: 'POST', body: { cMoonEnabled: flagEnabled.value } })
    cMoonEnabledAt.value = res.cMoonEnabledAt
  } catch (e) {
    flagEnabled.value = !flagEnabled.value
    alert(e?.data?.statusMessage || 'Failed to update flag')
  } finally {
    flagSaving.value = false
  }
}

async function saveCooldown() {
  cooldownSaving.value = true
  cooldownError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-settings', {
      method: 'POST',
      body: { cMoonEnabled: flagEnabled.value, cMoonOptOutCooldownDays: optOutCooldownDays.value },
    })
    optOutCooldownDays.value = res.cMoonOptOutCooldownDays
  } catch (e) {
    cooldownError.value = e?.data?.statusMessage || 'Failed to save cooldown'
  } finally {
    cooldownSaving.value = false
  }
}

async function save() {
  if (!form.name.trim()) { formError.value = 'Name is required'; return }
  if (!isValidColor(form.color)) { formError.value = 'Color must be a hex value like #3366ff'; return }
  formError.value = ''
  saving.value = true
  try {
    const body = {
      name: form.name.trim(),
      color: form.color,
      discordRoleId: form.discordRoleId.trim(),
      pageDescription: form.pageDescription,
      effectType: form.effectType || null,
      joinLocked: form.joinLocked,
      showOnNav: form.showOnNav,
      showButtonOnPages: form.showButtonOnPages,
      allowOptOutJoin: form.allowOptOutJoin,
      captainIds: form.captainIds,
      prizeCtoons: form.prizeCtoons,
    }
    let id = editId.value
    if (!id) {
      const res = await $fetch('/api/admin/cmoons', { method: 'POST', body })
      id = res.id
    } else {
      await $fetch(`/api/admin/cmoons/${id}`, { method: 'PUT', body })
    }
    // Runs after the main save succeeds so a rejected image never blocks name/color/etc from
    // saving; a failure here surfaces as formError below without undoing the save that already went through.
    await uploadImageIfNeeded(id)
    closeModal()
    await load()
  } catch (e) {
    formError.value = e?.data?.statusMessage || 'Save failed'
  } finally {
    saving.value = false
  }
}

async function remove(c) {
  if (c.memberCount > 0) return
  if (!confirm(`Delete cMoon "${c.name}"?`)) return
  try {
    await $fetch(`/api/admin/cmoons/${c.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    alert(e?.data?.statusMessage || 'Delete failed')
  }
}

// ── Disperse cToons ─────────────────────────────────────────────────────
const disperseCMoon = ref(null)

function openDisperse(c) {
  disperseCMoon.value = { id: c.id, name: c.name, memberCount: c.memberCount }
}

function closeDisperse() {
  disperseCMoon.value = null
  load() // member counts / captains etc are unaffected, but keep state fresh either way
}

// One-off repair button for a fixed bug: a big enough single contribution used to jump past an
// affinity level and forfeit that level's background/avatar reward forever (see
// server/api/admin/cmoon-affinity/backfill.post.js). Safe to click more than once — grants are
// idempotent, so a repeat run just reports 0 fixed.
const backfillRunning = ref(false)
const backfillResult  = ref('')
const backfillError   = ref('')

async function runAffinityBackfill() {
  if (!confirm('Re-grant any affinity level reward members already qualify for but never received?')) return
  backfillRunning.value = true
  backfillResult.value = ''
  backfillError.value = ''
  try {
    const res = await $fetch('/api/admin/cmoon-affinity/backfill', { method: 'POST' })
    backfillResult.value = `Checked ${res.usersChecked} member(s) — fixed ${res.usersFixed}, granting ${res.backgroundsGranted} background(s) and ${res.avatarsGranted} avatar(s).`
  } catch (e) {
    backfillError.value = e?.data?.statusMessage || 'Repair failed'
  } finally {
    backfillRunning.value = false
  }
}

onMounted(() => {
  load()
  loadScoring()
  loadRankTiers()
})
</script>

<style scoped>
/* The newsite layout sets `color: #ffffff` on <body>, which every admin section has
   to opt out of. Without this the whole panel renders white-on-white. */
.admin-cmoon {
  width: 100%;
  min-height: 100%;
  color: #111;
  /* Keeps the UA from painting checkboxes, number spinners and placeholders in
     dark-mode colors on iOS/macOS, which would reintroduce unreadable controls. */
  color-scheme: light;
}

/* Checkboxes and radios are excluded on purpose: painting a background over a
   native checkbox suppresses its tick on WebKit/Blink. Buttons are excluded so
   the Tailwind text-* utilities already on them keep winning. */
.admin-cmoon input:not([type='checkbox']):not([type='radio']):not([type='color']),
.admin-cmoon select,
.admin-cmoon textarea {
  color: #111;
  background: #fff;
  -webkit-text-fill-color: #111;
}

.admin-cmoon input::placeholder {
  color: #6b7280;
  -webkit-text-fill-color: #6b7280;
  opacity: 1;
}

/* 44px minimum touch target without changing the visual text size. */
.cm-tap {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
}

.cm-chip {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cm-field {
  min-height: 44px;
}

.cm-color-swatch {
  width: 44px;
  height: 44px;
  padding: 2px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.cm-preview-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
}

.cm-theme-preview {
  margin-top: 8px;
  border-radius: 6px;
  overflow: hidden;
  max-width: 320px;
}
.cm-theme-preview-banner {
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.85rem;
}
.cm-theme-preview-tile {
  margin: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}
.cm-theme-preview p { margin: 0 8px 8px; }

.cm-page-image-preview {
  display: block;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}

.cm-button-image-preview {
  display: block;
  width: auto;
  max-width: 232px;
  height: 62px;
  aspect-ratio: 232 / 62;
  object-fit: contain;
  border-radius: 4px;
  margin-bottom: 6px;
}

.cm-page-banner-image-preview {
  display: block;
  width: 100%;
  max-width: 480px;
  aspect-ratio: 12 / 1;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}
</style>
