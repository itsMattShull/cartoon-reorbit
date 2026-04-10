<template>
  <Nav />

  <div class="mt-16 md:mt-20 max-w-7xl mx-auto px-4 py-6">
    <!-- Controls -->
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
      <div class="flex items-center gap-2 w-full md:w-auto">
        <input
          v-model="filter"
          type="text"
          placeholder="Search username or Discord tag"
          class="w-full md:w-80 border rounded-md px-3 py-2"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select v-model="statusFilter" class="px-3 py-1 text-sm border rounded-md">
          <option value="all">All users</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        <button @click="toggle('onlyGuild')" :class="chip(onlyGuild)">In Discord</button>
        <button @click="toggle('onlyWarned')" :class="chip(onlyWarned)">Warned</button>

        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">Sort:</label>
          <select v-model="sortField" class="px-3 py-1 text-sm border rounded-md">
            <option value="lastActivity">Last activity</option>
            <option value="joined">Account created</option>
          </select>
          <select v-model="sortDir" class="px-3 py-1 text-sm border rounded-md">
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
        </div>

        <button @click="resetFilters" class="px-3 py-1 text-sm border rounded-md">Reset</button>
      </div>
    </div>

    <!-- Unified Card Grid (mobile and desktop) -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <article
        v-for="u in pagedUsers"
        :key="u.id"
        class="bg-white border rounded-lg shadow p-4"
      >
        <div class="flex flex-col sm:flex-row-reverse sm:items-start sm:justify-between gap-2">
          <!-- Badges first in DOM: appear above username on mobile, on right on desktop -->
          <div class="flex items-center gap-2 shrink-0">
            <span :class="badgeClass(!!u.inGuild)">{{ u.inGuild ? 'Guild' : 'No guild' }}</span>
            <span :class="badgeClass(!!u.active)">{{ u.active ? 'Active' : 'Disabled' }}</span>
            <div class="relative">
              <button
                class="ml-1 h-7 w-7 grid place-items-center text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100"
                title="More"
                @click.stop="toggleMenu(u)"
              >⋮</button>
              <div
                v-if="menuOpenId === u.id"
                class="absolute right-0 mt-1 w-44 bg-white border rounded-md shadow-lg z-40 py-1"
              >
                <button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" @click="openNotes(u); closeMenu()">Account History</button>
                <button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" @click="openLockedPoints(u); closeMenu()">See Locked Points</button>
                <button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" @click="openPendingTrades(u); closeMenu()">View Pending Trades</button>
                <button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" @click="openAdditionalZones(u); closeMenu()">Additional Zones</button>
                <button class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" @click="openUpdateUsername(u); closeMenu()">Update Username</button>
                <button
                  v-if="!u.isAdmin && !u.banned"
                  class="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  @click="openActionModal(u, 'BAN'); closeMenu()"
                >Ban user</button>
                <button
                  v-if="!u.isAdmin && u.banned"
                  class="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                  @click="openActionModal(u, 'UNBAN'); closeMenu()"
                >Unban user</button>
                <button
                  v-if="!u.isAdmin && !u.active && !u.banned"
                  class="w-full text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                  @click="activateUser(u); closeMenu()"
                >Activate User</button>
                <button
                  v-if="!u.isAdmin && u.active"
                  class="w-full text-left px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                  @click="openDissolveModal(u); closeMenu()"
                >Dissolve User</button>
                <button
                  v-if="isSuperAdmin && !u.isAdmin"
                  class="w-full text-left px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                  @click="makeAdmin(u); closeMenu()"
                >Make Admin</button>
                <button
                  v-if="isSuperAdmin && u.isAdmin && u.discordId !== superAdminId"
                  class="w-full text-left px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                  @click="removeAdmin(u); closeMenu()"
                >Remove Admin</button>
              </div>
            </div>
          </div>
          <!-- Username second in DOM: appears below badges on mobile, on left on desktop -->
          <div class="min-w-0">
            <div class="font-semibold text-base leading-tight">{{ u.username || '—' }}</div>
            <div class="text-xs text-gray-500">{{ u.discordTag || 'No tag' }}</div>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Unique cToons</div>
            <div class="font-medium tabular-nums">{{ u.uniqueCtoons ?? 0 }}</div>
          </div>
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Total cToons</div>
            <div class="font-medium tabular-nums">{{ u.totalCtoons ?? 0 }}</div>
          </div>
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-gray-500 text-xs">Total Points</div>
            <div class="font-medium tabular-nums">{{ u.points ?? 0 }}</div>
          </div>
        </div>

        <div class="mt-3 text-xs text-gray-600 space-y-1">
          <div><span class="text-gray-500">Joined:</span> {{ formatDate(u.joined) }} • {{ rel(u.joined) }}</div>
          <div><span class="text-gray-500">Last login:</span> {{ formatDate(u.lastLogin) }} • {{ rel(u.lastLogin) }}</div>
          <div class="flex items-center gap-2">
            <span class="text-gray-600"><span class="text-gray-500">Last activity:</span> {{ formatDate(u.lastActivity) }} • {{ rel(u.lastActivity) }}</span>
            <button class="ml-auto text-xs underline" @click="toggleSort()">Sort {{ sortDir==='desc' ? '↓' : '↑' }}</button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <span :class="warnClass(!!u.warning180,'amber')">180d</span>
          <span :class="warnClass(!!u.warning210,'amber')">210d</span>
          <span :class="warnClass(!!u.warning240,'red')">240d</span>
        </div>

        <!-- Actions moved into kebab menu above -->
      </article>

      <div v-if="!filteredSorted.length" class="col-span-full text-center text-gray-500 py-8">
        No users match your filters.
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="filteredSorted.length" class="mt-6 flex items-center justify-between">
      <div class="text-sm text-gray-600">
        Page {{ page }} of {{ totalPages }} - Showing {{ showingRange }}
      </div>
      <div class="space-x-2">
        <button class="px-3 py-1 text-sm border rounded-md" :disabled="page <= 1" @click="prevPage">Prev</button>
        <button class="px-3 py-1 text-sm border rounded-md" :disabled="page >= totalPages" @click="nextPage">Next</button>
      </div>
    </div>
  </div>

  <!-- Pending Trades modal -->
  <div v-if="showPendingTradesModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closePendingTradesModal()"></div>
    <div class="relative bg-white w-[92%] max-w-2xl rounded-lg shadow-lg flex flex-col max-h-[90vh]">
      <!-- Fixed header -->
      <div class="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
        <h3 class="text-lg font-semibold">Pending Trades — {{ pendingTradesTarget?.username || pendingTradesTarget?.discordTag || 'user' }}</h3>
        <button class="text-gray-400 hover:text-gray-600 text-xl leading-none" @click="closePendingTradesModal()">✕</button>
      </div>

      <!-- Scrollable body -->
      <div class="overflow-y-auto flex-1 px-5 py-4">
        <div v-if="pendingTradesLoading" class="text-sm text-gray-500 py-3">Loading…</div>
        <div v-else-if="pendingTradesError" class="text-sm text-red-600 py-3">{{ pendingTradesError }}</div>
        <div v-else-if="!pendingTrades.length" class="text-sm text-gray-500 py-3">No pending trades.</div>
        <div v-else class="space-y-4">
          <div v-for="trade in pendingTrades" :key="trade.id" class="border rounded-lg p-4">
            <div class="flex items-center justify-between text-sm mb-3">
              <div>
                <span class="text-gray-500">From:</span>
                <span class="font-medium ml-1">{{ trade.initiator.username }}</span>
                <span class="text-gray-400 mx-2">→</span>
                <span class="text-gray-500">To:</span>
                <span class="font-medium ml-1">{{ trade.recipient.username }}</span>
              </div>
              <div class="text-xs text-gray-400">{{ formatDate(trade.createdAt) }}</div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <!-- Offered cToons -->
              <div>
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Offered</div>
                <div v-if="trade.pointsOffered" class="mb-2 text-sm font-medium text-blue-700">{{ trade.pointsOffered }} pts</div>
                <div v-if="trade.ctoonsOffered.length" class="flex flex-wrap gap-2">
                  <div v-for="ctoon in trade.ctoonsOffered" :key="ctoon.id" class="flex flex-col items-center gap-1">
                    <img :src="ctoon.assetPath" :alt="ctoon.name" class="w-16 h-16 object-contain rounded border" />
                    <span class="text-xs text-center text-gray-700 max-w-[4rem] leading-tight">{{ ctoon.name }}</span>
                  </div>
                </div>
                <div v-if="!trade.ctoonsOffered.length && !trade.pointsOffered" class="text-xs text-gray-400 italic">Nothing</div>
              </div>

              <!-- Requested cToons -->
              <div>
                <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Requested</div>
                <div v-if="trade.ctoonsRequested.length" class="flex flex-wrap gap-2">
                  <div v-for="ctoon in trade.ctoonsRequested" :key="ctoon.id" class="flex flex-col items-center gap-1">
                    <img :src="ctoon.assetPath" :alt="ctoon.name" class="w-16 h-16 object-contain rounded border" />
                    <span class="text-xs text-center text-gray-700 max-w-[4rem] leading-tight">{{ ctoon.name }}</span>
                  </div>
                </div>
                <div v-if="!trade.ctoonsRequested.length" class="text-xs text-gray-400 italic">Nothing</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fixed footer -->
      <div class="flex items-center justify-end px-5 py-4 border-t flex-shrink-0">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closePendingTradesModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Kebab menu outside-click catcher -->
  <div v-if="menuOpenId" class="fixed inset-0 z-30" @click="closeMenu()"></div>

  <!-- Ban/Unban modal -->
  <div v-if="showActionModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeBanModal()"></div>
    <div class="relative bg-white w-[92%] max-w-lg rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">{{ actionType==='BAN' ? 'Ban' : 'Unban' }} {{ actionTarget?.username || actionTarget?.discordTag || 'user' }}</h3>
      <p class="mt-2 text-sm text-gray-600">Please provide a reason (min 10 characters). This will be stored and shown in Ban Notes.</p>

      <textarea
        v-model="actionReason"
        rows="4"
        class="mt-3 w-full border rounded-md px-3 py-2 text-sm"
        placeholder="Reason for ban..."
      ></textarea>

      <div class="mt-3 text-xs text-gray-500">{{ reasonChars }}/10 characters</div>

      <div v-if="actionError" class="mt-2 text-sm text-red-600">{{ actionError }}</div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closeBanModal" :disabled="working">Cancel</button>
        <button
          class="px-3 py-1 text-sm rounded-md text-white"
          :class="canConfirm ? 'bg-red-600 hover:bg-red-700' : 'bg-red-300 cursor-not-allowed'"
          :disabled="!canConfirm || working"
          @click="confirmAction"
        >
          {{ working ? (actionType==='BAN' ? 'Banning…' : 'Unbanning…') : 'Confirm' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Account History modal -->
  <div v-if="showNotesModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeNotesModal()"></div>
    <div class="relative bg-white w-[92%] max-w-xl rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">Account History — {{ notesTarget?.username || notesTarget?.discordTag || 'user' }}</h3>
      <div class="mt-3 max-h-80 overflow-auto divide-y">
        <div v-if="notesLoading" class="text-sm text-gray-500 py-3">Loading…</div>
        <div v-else-if="notesError" class="text-sm text-red-600 py-3">{{ notesError }}</div>
        <div v-else-if="!banNotes.length" class="text-sm text-gray-500 py-3">No history yet.</div>
        <div v-for="n in banNotes" :key="n.id" class="py-2">
          <div class="text-sm">
            <span :class="noteTone(n.action)" class="font-medium">{{ n.action }}</span>
            by <span class="font-medium">{{ n.admin?.name || 'Unknown' }}</span>
            <span class="text-gray-500">• {{ formatDate(n.createdAt) }}</span>
          </div>
          <div class="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{{ n.reason }}</div>
        </div>
      </div>
      <div class="mt-4 flex items-center justify-end">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closeNotesModal">Close</button>
      </div>
    </div>
  </div>

  <!-- Locked Points modal -->
  <div v-if="showLockedModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeLockedModal()"></div>
    <div class="relative bg-white w-[92%] max-w-xl rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">Locked Points — {{ lockedTarget?.username || lockedTarget?.discordTag || 'user' }}</h3>
      <div class="mt-3">
        <div class="text-sm text-gray-600">Total locked</div>
        <div class="text-2xl font-semibold tabular-nums">{{ lockedSummary.totalLocked }}</div>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="px-2 py-1 rounded bg-gray-100 text-gray-700">Auctions: {{ lockedSummary.byType.AUCTION }}</span>
          <span class="px-2 py-1 rounded bg-gray-100 text-gray-700">Trades: {{ lockedSummary.byType.TRADE }}</span>
        </div>
      </div>

      <div class="mt-4 max-h-80 overflow-auto divide-y">
        <div v-if="lockedLoading" class="text-sm text-gray-500 py-3">Loading…</div>
        <div v-else-if="lockedError" class="text-sm text-red-600 py-3">{{ lockedError }}</div>
        <div v-else-if="!lockedSummary.locks.length" class="text-sm text-gray-500 py-3">No active locks.</div>
        <div v-else v-for="lock in lockedSummary.locks" :key="lock.id" class="py-2 text-sm">
          <div class="flex items-center justify-between">
            <div class="font-medium">{{ lock.contextType }}</div>
            <div class="tabular-nums">{{ lock.amount }}</div>
          </div>
          <div class="mt-1 flex items-center justify-between gap-2 text-xs text-gray-600">
            <div class="truncate">
              {{ lock.reason }} • {{ lock.contextId }} • {{ formatDate(lock.createdAt) }}
            </div>
            <button
              class="px-2 py-1 text-xs border rounded-md text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              :disabled="unlockWorking === lock.id"
              @click="unlockLock(lock)"
            >
              {{ unlockWorking === lock.id ? 'Unlocking…' : 'Unlock' }}
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closeLockedModal()">Close</button>
      </div>
    </div>
  </div>

  <!-- Additional cZones modal -->
  <div v-if="showAdditionalZonesModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeAdditionalZonesModal()"></div>
    <div class="relative bg-white w-[92%] max-w-lg rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">Additional cZones — {{ additionalZonesTarget?.username || additionalZonesTarget?.discordTag || 'user' }}</h3>
      <p class="mt-2 text-sm text-gray-600">Set how many extra cZones this user can have.</p>

      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700">Additional cZones</label>
        <input
          v-model.number="additionalZonesValue"
          type="number"
          min="0"
          class="mt-2 w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div v-if="additionalZonesError" class="mt-2 text-sm text-red-600">{{ additionalZonesError }}</div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closeAdditionalZonesModal()" :disabled="additionalZonesWorking">Cancel</button>
        <button
          class="px-3 py-1 text-sm rounded-md text-white"
          :class="additionalZonesCanSave ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'"
          :disabled="!additionalZonesCanSave || additionalZonesWorking"
          @click="saveAdditionalZones"
        >
          {{ additionalZonesWorking ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Update Username modal -->
  <div v-if="showUpdateUsernameModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="closeUpdateUsernameModal()"></div>
    <div class="relative bg-white w-[92%] max-w-lg rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">Update Username — {{ updateUsernameTarget?.username || updateUsernameTarget?.discordTag || 'user' }}</h3>
      <p class="mt-2 text-sm text-gray-600">
        Enter a new username. Must be 3 words each starting with a capital letter with no spaces (e.g. <span class="font-mono">AwesomeAlienAce</span>).
      </p>

      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700">New Username</label>
        <input
          v-model="updateUsernameValue"
          type="text"
          placeholder="e.g. AwesomeAlienAce"
          class="mt-2 w-full border rounded-md px-3 py-2 text-sm"
          @keydown.enter="saveUpdateUsername"
        />
        <p v-if="updateUsernameValue && !isUsernameFormatValid" class="mt-1 text-xs text-red-600">
          Must be 3 words each starting with a capital letter, no spaces (e.g. AwesomeAlienAce).
        </p>
      </div>

      <div v-if="updateUsernameError" class="mt-2 text-sm text-red-600">{{ updateUsernameError }}</div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button class="px-3 py-1 text-sm border rounded-md" @click="closeUpdateUsernameModal()" :disabled="updateUsernameWorking">Cancel</button>
        <button
          class="px-3 py-1 text-sm rounded-md text-white"
          :class="updateUsernameCanSave ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'"
          :disabled="!updateUsernameCanSave || updateUsernameWorking"
          @click="saveUpdateUsername"
        >
          {{ updateUsernameWorking ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Dissolve User modal -->
  <div v-if="showDissolveModal" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="!dissolveWorking && closeDissolveModal()"></div>
    <div class="relative bg-white w-[92%] max-w-lg rounded-lg shadow-lg p-5">
      <h3 class="text-lg font-semibold">Dissolve {{ dissolveTarget?.username || dissolveTarget?.discordTag || 'user' }}</h3>

      <!-- Pre-confirm description -->
      <div v-if="dissolvePhase === 'confirm'" class="mt-2 text-sm text-gray-700 space-y-2">
        <p>
          Confirming will make this user Inactive, transfer all of their points to
          <strong>{{ official?.username || '—' }}</strong>, and reassign their cToons to
          <strong>{{ official?.username || '—' }}</strong>.
          Their cToons will be queued for scheduled auction release based on the settings below.
        </p>
        <p class="text-xs text-gray-500">Large accounts are processed in the background — you'll see progress here.</p>

        <div class="mt-3 border-t pt-3 space-y-3">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Release Schedule</p>

          <div class="flex items-center gap-2">
            <label class="w-36 text-xs text-gray-600 shrink-0">Start date (local)</label>
            <input v-model="dissolveSchedule.startAtLocal" type="datetime-local"
                   class="flex-1 text-xs border rounded px-2 py-1" />
          </div>

          <!-- Pokémon category -->
          <div class="rounded border border-blue-100 bg-blue-50 p-2 space-y-1.5">
            <p class="text-xs font-medium text-blue-700">
              Pokémon
              <span class="ml-1 font-normal text-blue-500">
                ({{ dissolveCategoryCounts ? dissolveCategoryCounts.pokemon : '…' }} sea tunes)
              </span>
            </p>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Cadence (days)</label>
              <input v-model.number="dissolveSchedule.pokemonCadenceDays" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Per cadence</label>
              <input v-model.number="dissolveSchedule.pokemonPerCadence" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
          </div>

          <!-- Crazy Rare category -->
          <div class="rounded border border-purple-100 bg-purple-50 p-2 space-y-1.5">
            <p class="text-xs font-medium text-purple-700">
              Crazy Rare
              <span class="ml-1 font-normal text-purple-500">
                ({{ dissolveCategoryCounts ? dissolveCategoryCounts.crazyRare : '…' }} sea tunes)
              </span>
            </p>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Cadence (days)</label>
              <input v-model.number="dissolveSchedule.crazyRareCadenceDays" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Per cadence</label>
              <input v-model.number="dissolveSchedule.crazyRarePerCadence" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
          </div>

          <!-- Other category -->
          <div class="rounded border border-gray-200 bg-gray-50 p-2 space-y-1.5">
            <p class="text-xs font-medium text-gray-700">
              Other
              <span class="ml-1 font-normal text-gray-500">
                ({{ dissolveCategoryCounts ? dissolveCategoryCounts.other : '…' }} sea tunes)
              </span>
            </p>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Cadence (days)</label>
              <input v-model.number="dissolveSchedule.otherCadenceDays" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
            <div class="flex items-center gap-2">
              <label class="w-36 text-xs text-gray-600 shrink-0">Per cadence</label>
              <input v-model.number="dissolveSchedule.otherPerCadence" type="number" min="1"
                     class="w-24 text-xs border rounded px-2 py-1" />
            </div>
          </div>
        </div>
      </div>

      <!-- Progress bar (queued / active) -->
      <div v-if="dissolvePhase === 'working'" class="mt-3 space-y-2">
        <p class="text-sm text-gray-600">{{ dissolveStep || 'Processing…' }}</p>
        <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            class="h-3 rounded-full bg-rose-500 transition-all duration-500"
            :style="{ width: dissolvePct + '%' }"
          ></div>
        </div>
        <p class="text-xs text-gray-400 text-right">{{ dissolvePct }}%</p>
      </div>

      <!-- Success -->
      <div v-if="dissolvePhase === 'done'" class="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 space-y-1">
        <p class="font-medium">Account dissolved successfully</p>
        <ul v-if="dissolveSummary" class="text-xs space-y-0.5 mt-1">
          <li>Points transferred: {{ dissolveSummary.pointsTransferred }}</li>
          <li>cToons transferred: {{ dissolveSummary.ctoonsTransferred }}</li>
          <li>cToons queued for auction: {{ dissolveSummary.ctoonsQueued }}</li>
          <li>Bids removed: {{ dissolveSummary.bidsDeleted }}</li>
        </ul>
        <p class="text-xs mt-2">
          <a href="/admin/dissolve-queue" class="underline font-medium text-emerald-800">View Dissolve Queue →</a>
        </p>
      </div>

      <!-- Error -->
      <div v-if="dissolveError" class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
        <p class="font-medium">Dissolve failed</p>
        <p>{{ dissolveError }}</p>
        <p class="text-xs text-red-500 select-all">User ID: {{ dissolveTarget?.id }}</p>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <button
          v-if="dissolvePhase !== 'working'"
          class="px-3 py-1 text-sm border rounded-md"
          @click="closeDissolveModal"
        >{{ dissolvePhase === 'done' ? 'Close' : 'Cancel' }}</button>
        <button
          v-if="dissolvePhase === 'confirm'"
          class="px-3 py-1 text-sm rounded-md text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300"
          :disabled="dissolveWorking || !dissolveTarget"
          @click="confirmDissolve"
        >Confirm</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAsyncData, useRequestHeaders } from '#app'
import Nav from '~/components/Nav.vue'

definePageMeta({ title: 'Admin - Users', middleware: ['auth','admin'], layout: 'default' })

const headers = process.server ? useRequestHeaders(['cookie']) : undefined

const { data: raw, error } = await useAsyncData('admin-users', () =>
  $fetch('/api/admin/users', { headers })
)
if (error.value) throw error.value

const users = ref(raw.value || [])
const filter = ref('')

// Official account (for dissolve UI)
const { data: official } = await useAsyncData('admin-official', () => $fetch('/api/admin/official', { headers }))

// current viewer (for super-admin gating)
const { data: meData } = await useAsyncData('admin-me', () => $fetch('/api/auth/me', { headers }))
const superAdminId = '732319322093125695'
const isSuperAdmin = computed(() => meData.value?.discordId === superAdminId)

// filters
const statusFilter = ref('all') // 'all' | 'active' | 'inactive'
const onlyGuild = ref(false)
const onlyWarned = ref(false)

// sorting
const sortField = ref('lastActivity') // 'lastActivity' | 'joined'
const sortDir = ref('desc') // 'desc' newest first, 'asc' oldest first
function toggleSort() { sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc' }

// filtered + sorted
const filteredSorted = computed(() => {
  const q = filter.value.toLowerCase().trim()

  const candidate = users.value.filter(u => {
    const matchQ = !q || (u.username?.toLowerCase().includes(q) || u.discordTag?.toLowerCase().includes(q))
    const matchGuild = !onlyGuild.value || !!u.inGuild
    const warned = !!(u.warning180 || u.warning210 || u.warning240)
    const matchWarned = !onlyWarned.value || warned

    const statusOk =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'active' && !!u.active) ||
      (statusFilter.value === 'inactive' && !u.active)

    return matchQ && matchGuild && matchWarned && statusOk
  })

  const toTs = (d) => d ? new Date(d).getTime() : -Infinity
  const dir = sortDir.value === 'desc' ? -1 : 1

  return candidate.sort((a,b) => {
    const field = sortField.value
    const ta = toTs(a[field])
    const tb = toTs(b[field])
    const na = Number.isFinite(ta), nb = Number.isFinite(tb)
    if (!na && !nb) return 0
    if (!na) return 1
    if (!nb) return -1
    return (ta - tb) * dir
  })
})

const page = ref(1)
const pageSize = 100

const totalPages = computed(() => Math.max(1, Math.ceil(filteredSorted.value.length / pageSize)))
const showingRange = computed(() => {
  if (!filteredSorted.value.length) return '0-0 of 0'
  const start = (page.value - 1) * pageSize + 1
  const end = Math.min(page.value * pageSize, filteredSorted.value.length)
  return `${start}-${end} of ${filteredSorted.value.length}`
})
const pagedUsers = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredSorted.value.slice(start, start + pageSize)
})

const chip = (on) =>
  [
    'px-3 py-1 text-sm rounded-md border',
    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
  ].join(' ')

function toggle(key) {
  if (key === 'onlyGuild') onlyGuild.value = !onlyGuild.value
  if (key === 'onlyWarned') onlyWarned.value = !onlyWarned.value
}
function resetFilters() {
  filter.value = ''
  statusFilter.value = 'all'
  onlyGuild.value = false
  onlyWarned.value = false
  sortField.value = 'lastActivity'
  sortDir.value = 'desc'
}

function nextPage() {
  if (page.value >= totalPages.value) return
  page.value += 1
}

function prevPage() {
  if (page.value <= 1) return
  page.value -= 1
}

watch([filter, statusFilter, onlyGuild, onlyWarned, sortField, sortDir], () => {
  page.value = 1
})

// formatting helpers
const formatDate = dt => {
  if (!dt) return '—'
  return new Date(dt).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
const rel = dt => {
  if (!dt) return 'no data'
  const ms = Date.now() - new Date(dt).getTime()
  const d = Math.floor(ms / 86400000)
  if (d < 1) return 'today'
  if (d === 1) return '1 day ago'
  if (d < 30) return `${d} days ago`
  const m = Math.floor(d / 30)
  return m === 1 ? '1 mo ago' : `${m} mos ago`
}

const badgeClass = (ok) =>
  [
    'px-2 py-0.5 rounded text-xs font-medium',
    ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
  ].join(' ')

const warnClass = (on, tone = 'amber') => {
  const onCls = tone === 'red'
    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-amber-100 text-amber-800 border-amber-200'
  return [
    'px-2 py-0.5 rounded text-xs border',
    on ? onCls : 'bg-gray-100 text-gray-700 border-gray-300'
  ].join(' ')
}

const noteTone = (action) => {
  if (action === 'BAN') return 'text-red-700'
  if (action === 'UNBAN') return 'text-emerald-700'
  if (action === 'DISSOLVE') return 'text-rose-700'
  return 'text-gray-700'
}

// Ban/Unban modal state + actions
const showActionModal = ref(false)
const actionTarget = ref(null)
const actionType   = ref('BAN') // 'BAN' | 'UNBAN'
const actionReason = ref('')
const actionError  = ref('')
const working      = ref(false)

const reasonChars = computed(() => actionReason.value.trim().length)
const canConfirm  = computed(() => reasonChars.value >= 10 && !!actionTarget.value)

function openActionModal(u, type = 'BAN') {
  actionTarget.value = u
  actionType.value   = type
  actionReason.value = ''
  actionError.value  = ''
  showActionModal.value = true
}
function closeBanModal() {
  showActionModal.value = false
  actionTarget.value = null
  actionReason.value = ''
  actionError.value  = ''
  working.value      = false
}
async function confirmAction() {
  if (!canConfirm.value || !actionTarget.value) return
  working.value = true
  actionError.value = ''
  try {
    const path = actionType.value === 'BAN' ? 'ban' : 'unban'
    await $fetch(`/api/admin/users/${actionTarget.value.id}/${path}`, {
      method: 'POST',
      body: { reason: actionReason.value }
    })
    // Update local state
    const idx = users.value.findIndex(x => x.id === actionTarget.value.id)
    if (idx !== -1) {
      const next = actionType.value === 'BAN'
        ? { active: false, banned: true }
        : { active: true, banned: false }
      users.value[idx] = { ...users.value[idx], ...next }
    }
    closeBanModal()
  } catch (e) {
    actionError.value = e?.data?.statusMessage || e?.message || `Failed to ${actionType.value.toLowerCase()} user.`
  } finally {
    working.value = false
  }
}

// Ban Notes state
const showNotesModal = ref(false)
const notesTarget    = ref(null)
const banNotes       = ref([])
const notesError     = ref('')
const notesLoading   = ref(false)

function closeNotesModal () {
  showNotesModal.value = false
  notesTarget.value = null
  banNotes.value = []
  notesError.value = ''
}

async function openNotes(u) {
  notesTarget.value = u
  showNotesModal.value = true
  banNotes.value = []
  notesError.value = ''
  notesLoading.value = true
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/ban-notes`)
    banNotes.value = res || []
  } catch (e) {
    notesError.value = e?.data?.statusMessage || e?.message || 'Failed to load notes.'
  } finally {
    notesLoading.value = false
  }
}

// Locked Points state
const showLockedModal = ref(false)
const lockedTarget = ref(null)
const lockedLoading = ref(false)
const lockedError = ref('')
const lockedSummary = ref({
  totalLocked: 0,
  byType: { AUCTION: 0, TRADE: 0 },
  locks: []
})
const unlockWorking = ref(null)

function closeLockedModal() {
  showLockedModal.value = false
  lockedTarget.value = null
  lockedLoading.value = false
  lockedError.value = ''
  lockedSummary.value = { totalLocked: 0, byType: { AUCTION: 0, TRADE: 0 }, locks: [] }
  unlockWorking.value = null
}

async function openLockedPoints(u) {
  lockedTarget.value = u
  showLockedModal.value = true
  lockedLoading.value = true
  lockedError.value = ''
  lockedSummary.value = { totalLocked: 0, byType: { AUCTION: 0, TRADE: 0 }, locks: [] }
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/locked-points`)
    lockedSummary.value = res || { totalLocked: 0, byType: { AUCTION: 0, TRADE: 0 }, locks: [] }
  } catch (e) {
    lockedError.value = e?.data?.statusMessage || e?.message || 'Failed to load locked points.'
  } finally {
    lockedLoading.value = false
  }
}

function recomputeLockedSummary(locks) {
  const totals = { AUCTION: 0, TRADE: 0 }
  for (const lock of locks) {
    if (lock.contextType === 'AUCTION') totals.AUCTION += lock.amount || 0
    if (lock.contextType === 'TRADE') totals.TRADE += lock.amount || 0
  }
  return {
    totalLocked: totals.AUCTION + totals.TRADE,
    byType: totals,
    locks
  }
}

async function unlockLock(lock) {
  if (!lock?.id) return
  unlockWorking.value = lock.id
  lockedError.value = ''
  try {
    await $fetch(`/api/admin/locked-points/${lock.id}/release`, { method: 'POST' })
    const nextLocks = lockedSummary.value.locks.filter(l => l.id !== lock.id)
    lockedSummary.value = recomputeLockedSummary(nextLocks)
  } catch (e) {
    lockedError.value = e?.data?.statusMessage || e?.message || 'Failed to unlock points.'
  } finally {
    unlockWorking.value = null
  }
}

// Additional cZones state
const showAdditionalZonesModal = ref(false)
const additionalZonesTarget = ref(null)
const additionalZonesValue = ref(0)
const additionalZonesError = ref('')
const additionalZonesWorking = ref(false)
const additionalZonesCanSave = computed(() => Number.isInteger(additionalZonesValue.value) && additionalZonesValue.value >= 0)

function openAdditionalZones(u) {
  additionalZonesTarget.value = u
  additionalZonesValue.value = Number(u.additionalCzones ?? 0)
  additionalZonesError.value = ''
  additionalZonesWorking.value = false
  showAdditionalZonesModal.value = true
}
function closeAdditionalZonesModal() {
  showAdditionalZonesModal.value = false
  additionalZonesTarget.value = null
  additionalZonesValue.value = 0
  additionalZonesError.value = ''
  additionalZonesWorking.value = false
}
async function saveAdditionalZones() {
  if (!additionalZonesTarget.value || !additionalZonesCanSave.value) return
  additionalZonesWorking.value = true
  additionalZonesError.value = ''
  try {
    const res = await $fetch(`/api/admin/users/${additionalZonesTarget.value.id}/additional-czones`, {
      method: 'POST',
      body: { additionalCzones: additionalZonesValue.value }
    })
    const idx = users.value.findIndex(x => x.id === additionalZonesTarget.value.id)
    if (idx !== -1) {
      users.value[idx] = { ...users.value[idx], additionalCzones: res?.additionalCzones ?? additionalZonesValue.value }
    }
    closeAdditionalZonesModal()
  } catch (e) {
    additionalZonesError.value = e?.data?.statusMessage || e?.message || 'Failed to update additional cZones.'
  } finally {
    additionalZonesWorking.value = false
  }
}

// Update Username state
const showUpdateUsernameModal = ref(false)
const updateUsernameTarget = ref(null)
const updateUsernameValue = ref('')
const updateUsernameError = ref('')
const updateUsernameWorking = ref(false)

const isUsernameFormatValid = computed(() => /^([A-Z][a-z]+){3}$/.test(updateUsernameValue.value.trim()))
const updateUsernameCanSave = computed(() => isUsernameFormatValid.value && !!updateUsernameTarget.value)

function openUpdateUsername(u) {
  updateUsernameTarget.value = u
  updateUsernameValue.value = u.username || ''
  updateUsernameError.value = ''
  updateUsernameWorking.value = false
  showUpdateUsernameModal.value = true
}
function closeUpdateUsernameModal() {
  showUpdateUsernameModal.value = false
  updateUsernameTarget.value = null
  updateUsernameValue.value = ''
  updateUsernameError.value = ''
  updateUsernameWorking.value = false
}
async function saveUpdateUsername() {
  if (!updateUsernameCanSave.value) return
  updateUsernameWorking.value = true
  updateUsernameError.value = ''
  try {
    const res = await $fetch(`/api/admin/users/${updateUsernameTarget.value.id}/update-username`, {
      method: 'POST',
      body: { username: updateUsernameValue.value.trim() }
    })
    const idx = users.value.findIndex(x => x.id === updateUsernameTarget.value.id)
    if (idx !== -1) {
      users.value[idx] = { ...users.value[idx], username: res.username }
    }
    closeUpdateUsernameModal()
  } catch (e) {
    updateUsernameError.value = e?.data?.statusMessage || e?.message || 'Failed to update username.'
  } finally {
    updateUsernameWorking.value = false
  }
}

// Pending Trades state
const showPendingTradesModal = ref(false)
const pendingTradesTarget = ref(null)
const pendingTrades = ref([])
const pendingTradesLoading = ref(false)
const pendingTradesError = ref('')

function closePendingTradesModal() {
  showPendingTradesModal.value = false
  pendingTradesTarget.value = null
  pendingTrades.value = []
  pendingTradesError.value = ''
}

async function openPendingTrades(u) {
  pendingTradesTarget.value = u
  showPendingTradesModal.value = true
  pendingTrades.value = []
  pendingTradesError.value = ''
  pendingTradesLoading.value = true
  try {
    const res = await $fetch(`/api/admin/users/${u.id}/pending-trades`)
    pendingTrades.value = res?.items || []
  } catch (e) {
    pendingTradesError.value = e?.data?.statusMessage || e?.message || 'Failed to load pending trades.'
  } finally {
    pendingTradesLoading.value = false
  }
}

// Kebab menu state
const menuOpenId = ref(null)
function toggleMenu(u) {
  menuOpenId.value = (menuOpenId.value === u.id ? null : u.id)
}
function closeMenu() { menuOpenId.value = null }

// Make Admin (super-admin only)
async function makeAdmin(u) {
  try {
    await $fetch(`/api/admin/users/${u.id}/make-admin`, { method: 'POST' })
    const idx = users.value.findIndex(x => x.id === u.id)
    if (idx !== -1) users.value[idx] = { ...users.value[idx], isAdmin: true }
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to make admin')
  }
}

async function removeAdmin(u) {
  try {
    await $fetch(`/api/admin/users/${u.id}/remove-admin`, { method: 'POST' })
    const idx = users.value.findIndex(x => x.id === u.id)
    if (idx !== -1) users.value[idx] = { ...users.value[idx], isAdmin: false }
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to remove admin')
  }
}

// Activate user (for inactive, non-admin, non-banned users)
async function activateUser(u) {
  try {
    await $fetch(`/api/admin/users/${u.id}/activate`, { method: 'POST' })
    const idx = users.value.findIndex(x => x.id === u.id)
    if (idx !== -1) users.value[idx] = { ...users.value[idx], active: true }
  } catch (e) {
    alert(e?.data?.statusMessage || e?.message || 'Failed to activate user')
  }
}

// Dissolve logic
const showDissolveModal = ref(false)
const dissolveTarget = ref(null)
const dissolveWorking = ref(false)
const dissolveError = ref('')
const dissolvePhase = ref('confirm') // 'confirm' | 'working' | 'done'
const dissolvePct = ref(0)
const dissolveStep = ref('')
const dissolveSummary = ref(null)
const dissolveCategoryCounts = ref(null)
let dissolvePoller = null

function defaultStartLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  // datetime-local value format: YYYY-MM-DDTHH:mm
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDissolveSchedule() {
  return {
    startAtLocal:          defaultStartLocal(),
    pokemonCadenceDays:    7,
    pokemonPerCadence:     2,
    crazyRareCadenceDays:  7,
    crazyRarePerCadence:   1,
    otherCadenceDays:      7,
    otherPerCadence:       10,
  }
}

const dissolveSchedule = ref(defaultDissolveSchedule())

async function openDissolveModal(u) {
  dissolveTarget.value = u
  dissolveError.value = ''
  dissolveWorking.value = false
  dissolvePhase.value = 'confirm'
  dissolvePct.value = 0
  dissolveStep.value = ''
  dissolveSummary.value = null
  dissolveCategoryCounts.value = null
  dissolveSchedule.value = defaultDissolveSchedule()
  showDissolveModal.value = true
  try {
    dissolveCategoryCounts.value = await $fetch(`/api/admin/users/${u.id}/ctoon-categories`)
  } catch {
    // non-fatal — counts will show '…'
  }
}
function closeDissolveModal() {
  if (dissolvePoller) { clearInterval(dissolvePoller); dissolvePoller = null }
  showDissolveModal.value = false
  dissolveTarget.value = null
  dissolveWorking.value = false
  dissolveError.value = ''
  dissolvePhase.value = 'confirm'
  dissolvePct.value = 0
  dissolveStep.value = ''
  dissolveSummary.value = null
  dissolveCategoryCounts.value = null
  dissolveSchedule.value = defaultDissolveSchedule()
}
function parseDissolveError(e) {
  const statusMessage = e?.data?.statusMessage || ''
  const low = String(statusMessage || e?.message || '').toLowerCase()
  if (statusMessage) return statusMessage
  if (low.includes('p2002') || low.includes('unique constraint')) {
    return 'Dissolve failed: duplicate user record conflict. Please contact engineering with the user ID.'
  }
  if (low.includes('p2003') || low.includes('foreign key')) {
    return 'Dissolve failed: user still has linked records (such as pending trades or active listings).'
  }
  return 'Failed to dissolve user due to a server error.'
}
function startDissolvePolling(userId) {
  dissolvePoller = setInterval(async () => {
    try {
      const status = await $fetch(`/api/admin/users/${userId}/dissolve-status`)
      dissolvePct.value = status.pct ?? 0
      dissolveStep.value = status.step ?? ''

      if (status.status === 'completed') {
        clearInterval(dissolvePoller); dissolvePoller = null
        dissolveSummary.value = status.summary || null
        dissolvePhase.value = 'done'
        dissolveWorking.value = false
        // Update local user list
        const idx = users.value.findIndex(x => x.id === userId)
        if (idx !== -1) {
          users.value[idx] = { ...users.value[idx], active: false, points: 0 }
        }
      } else if (status.status === 'failed') {
        clearInterval(dissolvePoller); dissolvePoller = null
        dissolveError.value = status.error || 'Dissolve job failed. Contact engineering.'
        dissolvePhase.value = 'confirm'
        dissolveWorking.value = false
      }
    } catch {
      // transient poll error — keep trying
    }
  }, 1500)
}
async function confirmDissolve() {
  if (!dissolveTarget.value) return
  dissolveWorking.value = true
  dissolveError.value = ''
  try {
    const s = dissolveSchedule.value
    await $fetch(`/api/admin/users/${dissolveTarget.value.id}/dissolve`, {
      method: 'POST',
      body: {
        scheduleConfig: {
          startAtUtc:            new Date(s.startAtLocal).toISOString(),
          pokemonCadenceDays:    s.pokemonCadenceDays,
          pokemonPerCadence:     s.pokemonPerCadence,
          crazyRareCadenceDays:  s.crazyRareCadenceDays,
          crazyRarePerCadence:   s.crazyRarePerCadence,
          otherCadenceDays:      s.otherCadenceDays,
          otherPerCadence:       s.otherPerCadence,
        }
      }
    })
    dissolvePhase.value = 'working'
    dissolvePct.value = 0
    dissolveStep.value = 'Queued…'
    startDissolvePolling(dissolveTarget.value.id)
  } catch (e) {
    dissolveError.value = parseDissolveError(e)
    dissolveWorking.value = false
  }
}
</script>

<style scoped>
.tabular-nums { font-variant-numeric: tabular-nums; }
</style>
