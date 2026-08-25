<template>
  <div class="admin-cmoon bg-gray-50 text-xs">
    <div class="px-2 py-2">
      <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h1 class="text-base font-semibold">cMoons</h1>
        <button
          class="cm-tap px-3 text-xs font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          @click="openCreateModal"
        >+ Create cMoon</button>
      </div>

      <!-- Feature flag -->
      <div class="bg-white rounded border p-3 mb-4">
        <label class="flex items-center gap-2">
          <input type="checkbox" v-model="flagEnabled" :disabled="flagSaving" @change="toggleFlag" />
          <span class="font-medium">cMoons enabled</span>
        </label>
        <p class="text-[11px] text-gray-600 mt-1">
          Off by default. Turning this on starts a 3-day window for existing players to pick a
          cMoon before they're auto-assigned to whichever has the fewest members; new players
          always get 3 days from when they join.
        </p>
        <p v-if="cMoonEnabledAt" class="text-[11px] text-gray-600 mt-1">
          Launched {{ formatDate(cMoonEnabledAt) }} · existing-player deadline {{ formatDate(cMoonSelectionDeadlineAt) }}
        </p>
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
              <span class="font-semibold break-words min-w-0">{{ c.name }}</span>
              <span class="text-[11px] text-gray-600">{{ c.memberCount }} member{{ c.memberCount === 1 ? '' : 's' }}</span>
              <!-- Kept together so they travel as a unit when the row wraps on narrow screens. -->
              <div class="ml-auto flex items-center gap-3 flex-shrink-0">
                <button class="cm-tap text-[11px] text-indigo-600 hover:underline" @click="startEdit(c)">Edit</button>
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
                  <span class="text-gray-500 truncate max-w-[10rem]">{{ r.discordRoleId || 'no role' }}</span>
                  <button type="button" class="cm-tap text-indigo-600" @click="startEditRank(c, r)">Edit</button>
                  <button type="button" class="cm-tap text-red-600" @click="removeRank(c, r)">Delete</button>
                </div>
              </div>
              <div v-else class="text-[11px] text-gray-500">No ranks yet.</div>
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
              </select>
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
            <label class="block text-xs font-medium mb-1">cMoon page image (exactly 800×600 after processing)</label>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to upload a page image.</p>
            </template>
            <template v-else>
              <img v-if="pageImagePreview" :src="pageImagePreview" class="cm-page-image-preview" alt="Selected image preview" />
              <img v-else-if="currentPageImagePath" :src="currentPageImagePath" class="cm-page-image-preview" alt="Current cMoon page image" />
              <p v-else class="text-[11px] text-gray-600 mb-1">No image uploaded yet.</p>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="cm-field" @change="handlePageImageFile" />
              <p class="text-[11px] text-gray-500 mt-1">Any photo works — it's auto-cropped/resized to 800×600 on upload.</p>
              <button
                type="button"
                class="cm-tap mt-2 px-3 border rounded bg-white"
                :disabled="!pageImageFile || pageImageUploading"
                @click="uploadPageImage"
              >{{ pageImageUploading ? 'Uploading…' : 'Upload image' }}</button>
              <p v-if="pageImageError" class="text-[11px] text-red-600 mt-1">{{ pageImageError }}</p>
              <NuxtLink :to="`/newsite/cmoon/${editId}`" class="block text-[11px] text-indigo-600 hover:underline mt-2">View cMoon page</NuxtLink>
            </template>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">cToon modal banner (small wide graphic, replaces the "cWorld" text link)</label>
            <template v-if="!editId">
              <p class="text-[11px] text-gray-600">Save this cMoon first, then Edit it to upload a banner.</p>
            </template>
            <template v-else>
              <img v-if="bannerImagePreview" :src="bannerImagePreview" class="cm-banner-image-preview" alt="Selected banner preview" />
              <img v-else-if="currentBannerImagePath" :src="currentBannerImagePath" class="cm-banner-image-preview" alt="Current cMoon modal banner" />
              <p v-else class="text-[11px] text-gray-600 mb-1">No banner uploaded yet — the modal shows a plain text link instead.</p>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="cm-field" @change="handleBannerImageFile" />
              <p class="text-[11px] text-gray-500 mt-1">Any image works — it's auto-cropped/resized to a wide 800×200 banner on upload.</p>
              <button
                type="button"
                class="cm-tap mt-2 px-3 border rounded bg-white"
                :disabled="!bannerImageFile || bannerImageUploading"
                @click="uploadBannerImage"
              >{{ bannerImageUploading ? 'Uploading…' : 'Upload banner' }}</button>
              <p v-if="bannerImageError" class="text-[11px] text-red-600 mt-1">{{ bannerImageError }}</p>
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
          <div>
            <label class="block text-xs font-medium mb-1">Rank name</label>
            <input v-model="rankForm.name" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" placeholder="e.g. Sergeant" />
          </div>
          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="rankForm.sortOrder" type="number" inputmode="numeric" class="cm-field w-full border rounded px-2 py-1" style="font-size:16px" aria-label="Ladder order" />
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
  </div>
</template>

<script setup>
import { cMoonPillStyle, isSafeCMoonColor, cMoonContrastRatio } from '~/utils/cmoonColor'
import { cMoonPalette } from '~/utils/cmoonPalette'

const rs = useAdminResources()

const loading = ref(false)
const saving = ref(false)
const formError = ref('')
const cmoons = ref([])
const admins = ref([])
const ctoons = ref([])
const flagEnabled = ref(false)
const flagSaving = ref(false)
const cMoonEnabledAt = ref(null)
const cMoonSelectionDeadlineAt = ref(null)

const EFFECT_LABELS = { GLITCH: 'Glitch Effect', SLIME: 'Slime Effect' }
function effectLabel(type) {
  return EFFECT_LABELS[type] || type
}

const editId = ref('')
const formOpen = ref(false)
const emptyForm = () => ({ name: '', color: '', discordRoleId: '', pageDescription: '', effectType: '', captainIds: [], prizeCtoons: [] })
const form = reactive(emptyForm())
const prizeCtoonSearch = ref('')
const prizeCtoonQty = ref(1)

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
const pageImageFile = ref(null)
const pageImagePreview = ref('')
const pageImageUploading = ref(false)
const pageImageError = ref('')
const currentPageImagePath = ref('')

// ── cToon modal banner (separate step — needs an existing cMoon row) ───
const bannerImageFile = ref(null)
const bannerImagePreview = ref('')
const bannerImageUploading = ref(false)
const bannerImageError = ref('')
const currentBannerImagePath = ref('')

const palettePreview = computed(() => isValidColor(form.color) ? cMoonPalette(form.color) : null)

function handlePageImageFile(e) {
  const file = e.target.files?.[0] || null
  pageImageFile.value = file
  pageImageError.value = ''
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadPageImage() {
  if (!editId.value || !pageImageFile.value || pageImageUploading.value) return
  pageImageUploading.value = true
  pageImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', pageImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/page-image`, { method: 'POST', body })
    currentPageImagePath.value = res.pageImagePath
    pageImageFile.value = null
    if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
    pageImagePreview.value = ''
    await load()
  } catch (e) {
    pageImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    pageImageUploading.value = false
  }
}

function handleBannerImageFile(e) {
  const file = e.target.files?.[0] || null
  bannerImageFile.value = file
  bannerImageError.value = ''
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = file ? URL.createObjectURL(file) : ''
}

async function uploadBannerImage() {
  if (!editId.value || !bannerImageFile.value || bannerImageUploading.value) return
  bannerImageUploading.value = true
  bannerImageError.value = ''
  try {
    const body = new FormData()
    body.append('image', bannerImageFile.value)
    const res = await $fetch(`/api/admin/cmoons/${editId.value}/banner-image`, { method: 'POST', body })
    currentBannerImagePath.value = res.bannerImagePath
    bannerImageFile.value = null
    if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
    bannerImagePreview.value = ''
    await load()
  } catch (e) {
    bannerImageError.value = e?.data?.statusMessage || 'Upload failed'
  } finally {
    bannerImageUploading.value = false
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
    captainIds: c.captains.map(cap => cap.userId),
    prizeCtoons: c.prizeCtoons.map(p => ({ ctoonId: p.ctoonId, quantity: p.quantity })),
  })
  currentPageImagePath.value = c.pageImagePath || ''
  pageImageFile.value = null
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = ''
  pageImageError.value = ''
  currentBannerImagePath.value = c.bannerImagePath || ''
  bannerImageFile.value = null
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = ''
  bannerImageError.value = ''
  formError.value = ''
  clearImageSelection()
  currentImagePath.value = c.imagePath || ''
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
  currentPageImagePath.value = ''
  pageImageFile.value = null
  if (pageImagePreview.value) URL.revokeObjectURL(pageImagePreview.value)
  pageImagePreview.value = ''
  pageImageError.value = ''
  currentBannerImagePath.value = ''
  bannerImageFile.value = null
  if (bannerImagePreview.value) URL.revokeObjectURL(bannerImagePreview.value)
  bannerImagePreview.value = ''
  bannerImageError.value = ''
}

function closeModal() {
  resetForm()
  formOpen.value = false
}

// Ranks: one shared edit-form object, scoped to whichever cMoon it's open for
// (rankCMoon), mirroring the single-form-at-a-time pattern used for cMoons above.
const emptyRankForm = () => ({ id: '', name: '', sortOrder: 0, discordRoleId: '' })
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
  Object.assign(rankForm, { id: r.id, name: r.name, sortOrder: r.sortOrder, discordRoleId: r.discordRoleId || '' })
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

async function load() {
  loading.value = true
  try {
    const [data, adminsData, ctoonsData] = await Promise.all([
      $fetch('/api/admin/cmoons'),
      $fetch('/api/admin/cmoon-admins'),
      $fetch('/api/admin/list-ctoons'),
    ])
    cmoons.value = data.cmoons || []
    flagEnabled.value = !!data.cMoonEnabled
    cMoonEnabledAt.value = data.cMoonEnabledAt
    cMoonSelectionDeadlineAt.value = data.cMoonSelectionDeadlineAt
    admins.value = adminsData || []
    ctoons.value = ctoonsData || []
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
    cMoonSelectionDeadlineAt.value = res.cMoonSelectionDeadlineAt
  } catch (e) {
    flagEnabled.value = !flagEnabled.value
    alert(e?.data?.statusMessage || 'Failed to update flag')
  } finally {
    flagSaving.value = false
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

onMounted(() => {
  load()
  loadScoring()
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

.cm-banner-image-preview {
  display: block;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 4 / 1;
  object-fit: cover;
  border-radius: 4px;
  margin-bottom: 6px;
}
</style>
