<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">
    <h1 class="text-base font-semibold mb-3">Admin: Global Settings</h1>

    <div class="bg-white rounded-lg shadow p-3">
      <!-- Tabs -->
      <div class="border-b mb-3">
        <nav class="flex gap-2 overflow-x-auto whitespace-nowrap -mb-px hide-scrollbar">
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Global Points' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Global Points'">Global Points</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Rarity Settings' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Rarity Settings'">Rarity Settings</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Image Duplicates' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Image Duplicates'">Image Duplicates</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Auctions' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Auctions'">Auctions</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='cMart' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='cMart'">cMart</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Second Editions' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Second Editions'">Second Editions</button>
          <button
            class="px-2 py-1.5 text-xs border-b-2"
            :class="activeTab==='Discord' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'"
            @click="activeTab='Discord'">Discord</button>
        </nav>
      </div>

      <!-- Global Points tab -->
      <section v-if="activeTab==='Global Points'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Configure global point awards. These values control daily login bonus, cZone visit points, and game cap.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Daily Login Points</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="dailyLoginPoints" />
            <p class="text-[10px] text-gray-500">Awarded once per 24h window (8pm CST reset).</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Daily Login Points (New Users)</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="dailyNewUserPoints" />
            <p class="text-[10px] text-gray-500">For accounts created within the last 7 days.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">cZone Visit Points</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="czoneVisitPoints" />
            <p class="text-[10px] text-gray-500">Awarded per unique zone owner within the daily window.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Daily Game Point Cap</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="dailyPointLimit" />
            <p class="text-[10px] text-gray-500">Max points from Winball, ReOrbit Match, and Monster scans per 24h window (excludes the head-to-head games: TKO, gToons Clash and Ed, Edd n Eddy RPS).</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Head-to-Head Daily Points Cap</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="tkoDailyPointLimit" />
            <p class="text-[10px] text-gray-500">Combined max points from TKO, gToons Clash and Ed, Edd n Eddy RPS wins per 24h window (shared pool, same 8pm CST reset).</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">TKO Points Per Win</label>
            <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="tkoPointsPerWin" />
            <p class="text-[10px] text-gray-500">Points awarded to the winner of each TKO round.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Max cZone Visits Per Day</label>
            <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="czoneVisitMaxPerDay" />
            <p class="text-[10px] text-gray-500">Maximum unique cZones that award visit points per day.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Global cZone Count</label>
            <input type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="czoneCount" />
            <p class="text-[10px] text-gray-500">Base number of zones each user can have (before per-user additions).</p>
          </div>
        </div>
        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingGlobal" @click="saveGlobal">
            <span v-if="!savingGlobal">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Rarity Settings tab -->
      <section v-if="activeTab==='Rarity Settings'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Configure default values per rarity tier. These defaults prefill Add cToon and Bulk Upload forms.
        </p>
        <!-- Desktop table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full text-xs">
            <thead>
              <tr>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Rarity</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Total Qty</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Initial Qty</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Per-User Limit</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">In cMart</th>
                <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Price</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rarityOrder" :key="r" class="border-b">
                <td class="px-2 py-1.5 font-medium">{{ r }}</td>
                <td class="px-2 py-1.5"><input type="number" class="border rounded-md px-2 py-1 text-xs w-20" v-model.number="rarityDefaults[r].totalQuantity" /></td>
                <td class="px-2 py-1.5"><input type="number" class="border rounded-md px-2 py-1 text-xs w-20" v-model.number="rarityDefaults[r].initialQuantity" /></td>
                <td class="px-2 py-1.5"><input type="number" class="border rounded-md px-2 py-1 text-xs w-20" v-model.number="rarityDefaults[r].perUserLimit" /></td>
                <td class="px-2 py-1.5 text-center"><input type="checkbox" v-model="rarityDefaults[r].inCmart" /></td>
                <td class="px-2 py-1.5"><input type="number" class="border rounded-md px-2 py-1 text-xs w-20" v-model.number="rarityDefaults[r].price" /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="space-y-2 sm:hidden">
          <div
            v-for="r in rarityOrder"
            :key="r"
            class="bg-white border rounded-lg shadow p-2"
          >
            <div class="font-semibold text-xs text-gray-800 mb-1.5">{{ r }}</div>
            <div class="grid grid-cols-1 gap-2">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total Qty</label>
                <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="rarityDefaults[r].totalQuantity" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Qty</label>
                <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="rarityDefaults[r].initialQuantity" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Per-User Limit</label>
                <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="rarityDefaults[r].perUserLimit" />
              </div>
              <div class="flex items-center gap-2">
                <input type="checkbox" v-model="rarityDefaults[r].inCmart" :id="`inCmart-${r}`" />
                <label class="text-xs text-gray-700" :for="`inCmart-${r}`">In cMart</label>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Price</label>
                <input type="number" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="rarityDefaults[r].price" />
              </div>
            </div>
          </div>
        </div>
        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingRarity" @click="saveRarity">
            <span v-if="!savingRarity">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Image Duplicates tab -->
      <section v-if="activeTab==='Image Duplicates'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Tune how sensitive duplicate detection should be. Higher numbers flag more possible duplicates.
          Detection uses Hamming distance on 64-bit hashes and flags a match when
          <strong>pHash ≤ threshold</strong> or <strong>dHash ≤ threshold</strong>.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">pHash Threshold</label>
            <input type="number" min="0" max="64" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="phashDuplicateThreshold" />
            <p class="text-[10px] text-gray-500">
              Lower = stricter (fewer matches), higher = more possible duplicates. Typical range: 10–20.
            </p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">dHash Threshold</label>
            <input type="number" min="0" max="64" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="dhashDuplicateThreshold" />
            <p class="text-[10px] text-gray-500">
              Lower = stricter (fewer matches), higher = more possible duplicates. Typical range: 12–22.
            </p>
          </div>
        </div>
        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingDuplicates" @click="saveDuplicateSettings">
            <span v-if="!savingDuplicates">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Auctions tab -->
      <section v-if="activeTab==='Auctions'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Configure the featured auction schedule. All times are in CST.
        </p>

        <!-- 24-hour grid -->
        <div>
          <label class="block text-xs font-medium mb-1.5">Featured Auction Hours (CST)</label>
          <div class="grid grid-cols-6 gap-1">
            <label
              v-for="h in 24"
              :key="h - 1"
              class="flex flex-col items-center gap-1 p-1.5 rounded-md border cursor-pointer select-none"
              :class="featuredAuctionHours.includes(h - 1)
                ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                : 'bg-gray-50 border-gray-200 text-gray-600'"
            >
              <input
                type="checkbox"
                class="sr-only"
                :value="h - 1"
                :checked="featuredAuctionHours.includes(h - 1)"
                @change="toggleHour(h - 1)"
              />
              <span class="text-[11px] font-mono font-semibold">{{ formatHour(h - 1) }}</span>
            </label>
          </div>
          <p class="text-[10px] text-gray-500 mt-1.5">
            {{ featuredAuctionHours.length === 0
              ? 'No hours selected — featured auctions are disabled.'
              : `${featuredAuctionHours.length} hour(s) selected: ${featuredAuctionHours.slice().sort((a, b) => a - b).map(formatHour).join(', ')}` }}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Interval (every N days)</label>
            <input type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="featuredAuctionIntervalDays" />
            <p class="text-[10px] text-gray-500">1 = fire every day, 2 = every other day, etc.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Auctions Per Slot</label>
            <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="featuredAuctionsPerSlot" />
            <p class="text-[10px] text-gray-500">How many featured auctions to create each time a scheduled hour fires. Set to 0 to disable.</p>
          </div>
        </div>

        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingAuctions" @click="saveAuctions">
            <span v-if="!savingAuctions">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- cMart tab -->
      <section v-if="activeTab==='cMart'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Configure cMart upgrade pricing.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">First additional cZone cost</label>
            <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="firstAdditionalCzoneCost" />
            <p class="text-[10px] text-gray-500">Cost when a user has 0 additional cZones.</p>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium">Subsequent additional cZone cost</label>
            <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="subsequentAdditionalCzoneCost" />
            <p class="text-[10px] text-gray-500">Cost when a user already has 1 or more additional cZones.</p>
          </div>
        </div>

        <!-- Global Price Changes -->
        <div class="border-t pt-3">
          <h2 class="text-xs font-semibold text-gray-800 mb-1">Global Price Changes</h2>
          <p class="text-[10px] text-gray-500 mb-2">
            When enabled, all cToon and pack prices in cMart will be cut in half at purchase time.
            Prices shown to users will reflect the discount.
          </p>
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="cmartHalfPriceEnabled"
              class="h-4 w-4 text-indigo-600 border-gray-300 rounded"
            />
            <span class="text-xs font-medium text-gray-700">
              Enable 50% off all cToons &amp; packs
            </span>
          </label>
          <p v-if="cmartHalfPriceEnabled" class="mt-1.5 text-[10px] text-indigo-600 font-medium">
            Half-price mode is currently ON. Users will be charged half the listed price.
          </p>
        </div>

        <!-- Pack Pricing Decay -->
        <div class="border-t pt-3">
          <h2 class="text-xs font-semibold text-gray-800 mb-1">Pack Pricing Decay</h2>
          <p class="text-[10px] text-gray-500 mb-2">
            Pack prices automatically decrease over time after they go live in cMart.
            The price drops by the decay amount every N days until it hits the floor.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Decay Amount (pts)</label>
              <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="packPriceDecayAmount" />
              <p class="text-[10px] text-gray-500">Points to drop per period (e.g. 100).</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Decay Period (days)</label>
              <input type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="packPriceDecayDays" />
              <p class="text-[10px] text-gray-500">How many days between each price drop (e.g. 7).</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Price Floor (pts)</label>
              <input type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="packPriceFloor" />
              <p class="text-[10px] text-gray-500">Minimum price a pack can decay to (e.g. 700).</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Max Default Pack Buys Per User</label>
              <input type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" v-model.number="packMaxDefaultBuysPerUser" />
              <p class="text-[10px] text-gray-500">Total times a user can buy a new pack (applied when pack is created).</p>
            </div>
          </div>
        </div>

        <!-- Time-Based Release Purchase Limits -->
        <div class="border-t pt-3">
          <h2 class="text-xs font-semibold text-gray-800 mb-1">Time-Based Release Purchase Limits</h2>
          <p class="text-[10px] text-gray-500 mb-2">
            Default per-user purchase limits for time-based releases, applied by rarity tier.
            These are overridden per-cToon when a cToon has its own limit set.
            Leave <strong>Window (days)</strong> blank to use the full release window (release date → mint end date).
          </p>

          <!-- Desktop table -->
          <div class="overflow-x-auto hidden sm:block mb-3">
            <table class="min-w-full text-xs">
              <thead>
                <tr>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Rarity</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Purchase Limit</th>
                  <th class="px-2 py-1.5 text-left text-[11px] font-semibold text-gray-600 bg-gray-100">Window (days)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in timeBasedRarities" :key="r" class="border-b">
                  <td class="px-2 py-1.5 font-medium">{{ r }}</td>
                  <td class="px-2 py-1.5">
                    <input
                      type="number"
                      min="1"
                      class="border rounded-md px-2 py-1 text-xs w-24"
                      :value="timeBasedLimits[r].countStr"
                      @input="timeBasedLimits[r].countStr = $event.target.value"
                      placeholder="No limit"
                    />
                  </td>
                  <td class="px-2 py-1.5">
                    <input
                      type="number"
                      min="1"
                      class="border rounded-md px-2 py-1 text-xs w-24"
                      :value="timeBasedLimits[r].windowDaysStr"
                      @input="timeBasedLimits[r].windowDaysStr = $event.target.value"
                      placeholder="Full duration"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile cards -->
          <div class="space-y-2 sm:hidden mb-3">
            <div
              v-for="r in timeBasedRarities"
              :key="r"
              class="bg-white border rounded-lg shadow p-2"
            >
              <div class="font-semibold text-xs text-gray-800 mb-1.5">{{ r }}</div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Purchase Limit</label>
                  <input
                    type="number"
                    min="1"
                    class="border rounded-md px-2 py-1.5 text-sm"
                    :value="timeBasedLimits[r].countStr"
                    @input="timeBasedLimits[r].countStr = $event.target.value"
                    placeholder="No limit"
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Window (days)</label>
                  <input
                    type="number"
                    min="1"
                    class="border rounded-md px-2 py-1.5 text-sm"
                    :value="timeBasedLimits[r].windowDaysStr"
                    @input="timeBasedLimits[r].windowDaysStr = $event.target.value"
                    placeholder="Full duration"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingCmart" @click="saveCmart">
            <span v-if="!savingCmart">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Second Editions tab -->
      <section v-if="activeTab==='Second Editions'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Upload the icon overlaid on the bottom-right corner of every Second Edition cToon's image
          sitewide. Admins can adjust position and size per cToon on the Add/Edit cToon pages.
        </p>
        <div class="flex items-start gap-3 flex-wrap">
          <div>
            <div class="w-32 h-32 border rounded bg-gray-50 flex items-center justify-center overflow-hidden">
              <img v-if="secondEditionOverlayPath" :src="secondEditionOverlayPath" alt="Second Edition overlay" class="max-w-full max-h-full object-contain" />
              <span v-else class="text-xs text-gray-400">No image set</span>
            </div>
            <p v-if="secondEditionOverlayWidth" class="text-[10px] text-gray-500 mt-1 text-center">
              {{ secondEditionOverlayWidth }}×{{ secondEditionOverlayHeight }}px
            </p>
          </div>
          <div class="flex-1 min-w-[220px]">
            <label class="block text-xs font-medium mb-1">Upload Overlay Icon (PNG or GIF)</label>
            <input type="file" accept="image/png,image/gif" class="w-full text-xs" @change="handleOverlayFile" />
            <p class="text-[10px] text-gray-500 mt-1">Max 3MB. Use a transparent PNG for best results.</p>
            <p v-if="overlayUploadError" class="text-[10px] text-red-600 mt-1">{{ overlayUploadError }}</p>
            <button
              class="mt-2 px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!overlayFile || savingOverlay"
              @click="uploadOverlay"
            >
              <span v-if="!savingOverlay">Upload</span><span v-else>Uploading…</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Discord tab -->
      <section v-if="activeTab==='Discord'" class="space-y-3">
        <p class="text-xs text-gray-600">
          Configure where Discord announcements for site events are posted. More announcement
          types may be added here over time.
        </p>
        <div class="max-w-md flex flex-col gap-1">
          <label for="czoneContestDiscordChannelId" class="text-xs font-medium">
            cZone Contest Winner Channel ID
          </label>
          <input
            id="czoneContestDiscordChannelId"
            v-model.trim="czoneContestDiscordChannelId"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            class="border rounded-md px-2 py-1.5 text-sm"
            placeholder="123456789012345678"
          />
          <p class="text-[10px] text-gray-500">
            When an admin distributes cZone Contest prizes, an announcement is posted here.
            Leave blank to use the DISCORD_ANNOUNCEMENTS_CHANNEL environment variable.
          </p>
        </div>
        <div>
          <button class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" :disabled="savingDiscord" @click="saveDiscord">
            {{ savingDiscord ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </section>

      <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 text-xs rounded-md',
                                 toast.type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700']">
        {{ toast.msg }}
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const activeTab = ref('Global Points')
const toast  = ref(null)
const savingGlobal = ref(false)
const savingRarity = ref(false)
const savingDuplicates = ref(false)
const savingAuctions = ref(false)
const savingCmart = ref(false)
const savingDiscord = ref(false)
const czoneContestDiscordChannelId = ref('')

// cMart state
const firstAdditionalCzoneCost      = ref(25000)
const subsequentAdditionalCzoneCost = ref(50000)
const cmartHalfPriceEnabled         = ref(false)
const packPriceDecayAmount          = ref(100)
const packPriceDecayDays            = ref(7)
const packPriceFloor                = ref(700)
const packMaxDefaultBuysPerUser     = ref(5)

// Time-based purchase limits (per rarity)
const timeBasedRarities = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare']
const defaultTimeBasedCounts = { 'Common': 5, 'Uncommon': 4, 'Rare': 3, 'Very Rare': 2, 'Crazy Rare': 1 }
const timeBasedLimits = ref(
  Object.fromEntries(timeBasedRarities.map(r => [
    r,
    { countStr: String(defaultTimeBasedCounts[r]), windowDaysStr: '' }
  ]))
)

// Global Points state
const dailyLoginPoints     = ref(500)
const dailyNewUserPoints   = ref(1000)
const czoneVisitPoints     = ref(20)
const dailyPointLimit      = ref(250)
const tkoDailyPointLimit   = ref(250)
const tkoPointsPerWin      = ref(300)
const czoneVisitMaxPerDay  = ref(10)
const czoneCount           = ref(3)
const phashDuplicateThreshold = ref(14)
const dhashDuplicateThreshold = ref(16)
const featuredAuctionHours        = ref([])
const featuredAuctionIntervalDays = ref(1)
const featuredAuctionsPerSlot     = ref(1)

// Second Editions state
const secondEditionOverlayPath   = ref(null)
const secondEditionOverlayWidth  = ref(null)
const secondEditionOverlayHeight = ref(null)
const overlayFile        = ref(null)
const overlayUploadError = ref('')
const savingOverlay       = ref(false)

function handleOverlayFile(e) {
  overlayUploadError.value = ''
  const file = e.target.files?.[0]
  if (!file) { overlayFile.value = null; return }
  if (!['image/png', 'image/gif'].includes(file.type)) {
    overlayUploadError.value = 'Only PNG or GIF files allowed.'
    overlayFile.value = null
    return
  }
  if (file.size > 3 * 1024 * 1024) {
    overlayUploadError.value = 'Image must be 3MB or smaller.'
    overlayFile.value = null
    return
  }
  overlayFile.value = file
}

async function uploadOverlay() {
  if (!overlayFile.value) return
  savingOverlay.value = true
  overlayUploadError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', overlayFile.value)
    const res = await fetch('/api/admin/global-config/second-edition-overlay', {
      method: 'POST',
      credentials: 'include',
      body: fd
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.statusMessage || 'Upload failed')
    const data = await res.json()
    secondEditionOverlayPath.value   = data.secondEditionOverlayPath
    secondEditionOverlayWidth.value  = data.secondEditionOverlayWidth
    secondEditionOverlayHeight.value = data.secondEditionOverlayHeight
    overlayFile.value = null
    toast.value = { type: 'ok', msg: 'Second Edition overlay saved.' }
  } catch (e) {
    overlayUploadError.value = e?.message || 'Upload failed'
  } finally {
    savingOverlay.value = false
    setTimeout(() => { toast.value = null }, 2500)
  }
}

async function loadGlobal() {
  try {
    const g = await $fetch('/api/admin/global-config')
    // fallbacks if fields missing (pre-migration)
    dailyLoginPoints.value     = Number(g?.dailyLoginPoints     ?? 500)
    dailyNewUserPoints.value   = Number(g?.dailyNewUserPoints   ?? 1000)
    czoneVisitPoints.value     = Number(g?.czoneVisitPoints     ?? 20)
    dailyPointLimit.value      = Number(g?.dailyPointLimit      ?? 250)
    tkoDailyPointLimit.value   = Number(g?.tkoDailyPointLimit   ?? 250)
    czoneVisitMaxPerDay.value  = Number(g?.czoneVisitMaxPerDay  ?? 10)
    czoneCount.value           = Number(g?.czoneCount           ?? 3)
    phashDuplicateThreshold.value = Number(g?.phashDuplicateThreshold ?? 14)
    dhashDuplicateThreshold.value = Number(g?.dhashDuplicateThreshold ?? 16)
    featuredAuctionHours.value        = Array.isArray(g?.featuredAuctionHours) ? g.featuredAuctionHours : []
    featuredAuctionIntervalDays.value = Number(g?.featuredAuctionIntervalDays ?? 1)
    featuredAuctionsPerSlot.value     = Number(g?.featuredAuctionsPerSlot ?? 1)
    cmartHalfPriceEnabled.value         = Boolean(g?.cmartHalfPriceEnabled ?? false)
    packPriceDecayAmount.value          = Number(g?.packPriceDecayAmount          ?? 100)
    packPriceDecayDays.value            = Number(g?.packPriceDecayDays            ?? 7)
    packPriceFloor.value                = Number(g?.packPriceFloor                ?? 700)
    packMaxDefaultBuysPerUser.value     = Number(g?.packMaxDefaultBuysPerUser     ?? 5)
    secondEditionOverlayPath.value   = g?.secondEditionOverlayPath   ?? null
    secondEditionOverlayWidth.value  = g?.secondEditionOverlayWidth  ?? null
    secondEditionOverlayHeight.value = g?.secondEditionOverlayHeight ?? null
    czoneContestDiscordChannelId.value = g?.czoneContestDiscordChannelId ?? ''
    if (g?.timeBasedPurchaseLimits) {
      for (const r of timeBasedRarities) {
        const def = g.timeBasedPurchaseLimits[r]
        if (def) {
          timeBasedLimits.value[r] = {
            countStr:      def.count      != null ? String(def.count)      : String(defaultTimeBasedCounts[r]),
            windowDaysStr: def.windowDays != null ? String(def.windowDays) : ''
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to load global config', e)
  }
  try {
    const tc = await $fetch('/api/admin/game-config?gameName=TKO')
    tkoPointsPerWin.value = Number(tc?.pointsPerWin ?? 300)
  } catch (e) {
    console.error('Failed to load TKO config', e)
  }
}

async function saveGlobal() {
  savingGlobal.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyLoginPoints:     Number(dailyLoginPoints.value),
        dailyNewUserPoints:   Number(dailyNewUserPoints.value),
        czoneVisitPoints:     Number(czoneVisitPoints.value),
        dailyPointLimit:      Number(dailyPointLimit.value),
        tkoDailyPointLimit:   Number(tkoDailyPointLimit.value),
        czoneVisitMaxPerDay:  Number(czoneVisitMaxPerDay.value),
        czoneCount:           Number(czoneCount.value)
      }
    })
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:     'TKO',
        pointsPerWin: Number(tkoPointsPerWin.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Global points saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingGlobal.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadGlobal)

// Rarity defaults
const rarityOrder = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Auction Only', 'Prize Only', 'Code Only'
]
const rarityDefaults = ref({
  'Common':       { totalQuantity: 160, initialQuantity: 160, perUserLimit: 7, inCmart: true,  price: 100 },
  'Uncommon':     { totalQuantity: 120, initialQuantity: 120, perUserLimit: 5, inCmart: true,  price: 200 },
  'Rare':         { totalQuantity: 80,  initialQuantity: 80,  perUserLimit: 3, inCmart: true,  price: 400 },
  'Very Rare':    { totalQuantity: 60,  initialQuantity: 60,  perUserLimit: 2, inCmart: true,  price: 750 },
  'Crazy Rare':   { totalQuantity: 40,  initialQuantity: 40,  perUserLimit: 1, inCmart: true,  price: 1250 },
  'Auction Only': { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Prize Only':   { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 },
  'Code Only':    { totalQuantity: null, initialQuantity: null, perUserLimit: null, inCmart: false, price: 0 }
})

async function loadRarityDefaults() {
  try {
    const res = await $fetch('/api/admin/rarity-defaults')
    if (res?.defaults) rarityDefaults.value = res.defaults
  } catch (e) {
    console.error('Failed to load rarity defaults', e)
  }
}

async function saveRarity() {
  savingRarity.value = true; toast.value = null
  try {
    await $fetch('/api/admin/rarity-defaults', {
      method: 'POST',
      body: { defaults: rarityDefaults.value }
    })
    toast.value = { type: 'ok', msg: 'Rarity defaults saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingRarity.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

onMounted(loadRarityDefaults)

async function saveAuctions() {
  savingAuctions.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyPointLimit: Number(dailyPointLimit.value),
        featuredAuctionHours: featuredAuctionHours.value,
        featuredAuctionIntervalDays: Number(featuredAuctionIntervalDays.value),
        featuredAuctionsPerSlot: Number(featuredAuctionsPerSlot.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Auction settings saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingAuctions.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

function toggleHour(h) {
  const idx = featuredAuctionHours.value.indexOf(h)
  if (idx === -1) featuredAuctionHours.value = [...featuredAuctionHours.value, h]
  else featuredAuctionHours.value = featuredAuctionHours.value.filter(x => x !== h)
}

function formatHour(h) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

async function saveCmart() {
  savingCmart.value = true; toast.value = null
  if (typeof cmartHalfPriceEnabled.value !== 'boolean') {
    toast.value = { type: 'error', msg: 'Invalid value for half-price toggle.' }
    savingCmart.value = false
    return
  }
  // Build the time-based limits payload (convert strings → numbers/null)
  const timeBasedPurchaseLimits = {}
  for (const r of timeBasedRarities) {
    const { countStr, windowDaysStr } = timeBasedLimits.value[r]
    timeBasedPurchaseLimits[r] = {
      count:      countStr      !== '' && !isNaN(Number(countStr))      ? Number(countStr)      : null,
      windowDays: windowDaysStr !== '' && !isNaN(Number(windowDaysStr)) ? Number(windowDaysStr) : null
    }
  }
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyPointLimit: Number(dailyPointLimit.value),
        cmartHalfPriceEnabled: cmartHalfPriceEnabled.value,
        timeBasedPurchaseLimits,
        packPriceDecayAmount:      Number(packPriceDecayAmount.value),
        packPriceDecayDays:        Number(packPriceDecayDays.value),
        packPriceFloor:            Number(packPriceFloor.value),
        packMaxDefaultBuysPerUser: Number(packMaxDefaultBuysPerUser.value)
      }
    })
    toast.value = { type: 'ok', msg: 'cMart settings saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingCmart.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveDiscord() {
  savingDiscord.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyPointLimit: Number(dailyPointLimit.value),
        czoneContestDiscordChannelId: czoneContestDiscordChannelId.value
      }
    })
    toast.value = { type: 'ok', msg: 'Discord settings saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || e?.data?.statusMessage || 'Save failed' }
  } finally {
    savingDiscord.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}

async function saveDuplicateSettings() {
  savingDuplicates.value = true; toast.value = null
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyPointLimit: Number(dailyPointLimit.value),
        phashDuplicateThreshold: Number(phashDuplicateThreshold.value),
        dhashDuplicateThreshold: Number(dhashDuplicateThreshold.value)
      }
    })
    toast.value = { type: 'ok', msg: 'Duplicate thresholds saved.' }
  } catch (e) {
    console.error(e); toast.value = { type: 'error', msg: e?.statusMessage || 'Save failed' }
  } finally {
    savingDuplicates.value = false; setTimeout(() => { toast.value = null }, 2500)
  }
}
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
.hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.hide-scrollbar::-webkit-scrollbar { display: none; }
</style>
