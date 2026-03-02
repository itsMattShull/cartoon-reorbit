<template>
  <div class="min-h-screen bg-gray-50 p-6 mt-16 md:mt-20">
    <Nav />

    <div class="max-w-6xl mx-auto bg-white rounded-lg shadow p-6 mt-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 class="text-2xl font-semibold">Manage cZone Search</h1>
          <p class="text-sm text-gray-500">Times display in Central Time (CST/CDT).</p>
        </div>
        <button
          class="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          @click="openCreate"
        >
          Create Search
        </button>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <input id="show-all" type="checkbox" v-model="showAll" class="h-4 w-4" />
        <label for="show-all" class="text-sm text-gray-700">Show All Searches</label>
      </div>

      <div v-if="error" class="text-red-600 mb-4">
        {{ error.message || 'Failed to load cZone Searches' }}
      </div>
      <div v-if="pending" class="text-gray-500">Loading...</div>

      <div v-if="searches.length">
        <!-- Mobile cards -->
        <div class="space-y-4 sm:hidden">
          <div v-for="row in searches" :key="row.id" class="border rounded-lg p-4 bg-white">
            <div class="text-sm font-semibold text-gray-900">{{ displayName(row.name) }}</div>
            <div class="text-xs text-gray-500">Start (CST)</div>
            <div class="font-medium text-gray-900">{{ formatCentral(row.startAt) }}</div>
            <div class="mt-2 text-xs text-gray-500">End (CST)</div>
            <div class="font-medium text-gray-900">{{ formatCentral(row.endAt) }}</div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
              <div><span class="font-semibold">Appearance:</span> {{ row.appearanceRatePercent }}%</div>
              <div><span class="font-semibold">Reset:</span> {{ resetLabel(row) }}</div>
              <div v-if="isDailyReset(row)" class="col-span-2">
                <span class="font-semibold">Able To Collect Daily:</span> {{ dailyLimitLabel(row) }}
              </div>
              <div v-else><span class="font-semibold">Cooldown:</span> {{ row.cooldownHours }}h</div>
              <div class="col-span-2"><span class="font-semibold">Collection:</span> {{ collectionLabel(row.collectionType) }}</div>
              <div class="col-span-2"><span class="font-semibold">Prize Pool:</span> {{ row.prizePool.length }} cToons</div>
            </div>
            <div class="mt-3 flex gap-3">
              <NuxtLink class="text-blue-600 hover:text-blue-800" :to="`/czonesearch/${row.id}`">View</NuxtLink>
              <button class="text-blue-600 hover:text-blue-800" @click="openEdit(row)">Edit</button>
              <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
            </div>
          </div>
        </div>

        <!-- Desktop table -->
        <div class="hidden sm:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-2 pr-4">Name</th>
                <th class="py-2 pr-4">Start (CST)</th>
                <th class="py-2 pr-4">End (CST)</th>
                <th class="py-2 pr-4">Appearance %</th>
                <th class="py-2 pr-4">Reset</th>
                <th class="py-2 pr-4">Collection</th>
                <th class="py-2 pr-4">Prize Pool</th>
                <th class="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in searches" :key="row.id" class="border-b last:border-b-0">
                <td class="py-3 pr-4 font-medium">{{ displayName(row.name) }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatCentral(row.startAt) }}</td>
                <td class="py-3 pr-4 whitespace-nowrap">{{ formatCentral(row.endAt) }}</td>
                <td class="py-3 pr-4">{{ row.appearanceRatePercent }}%</td>
                <td class="py-3 pr-4">
                  <div>{{ resetLabel(row) }}</div>
                  <div v-if="isDailyReset(row)" class="text-xs text-gray-500">
                    Able To Collect Daily: {{ dailyLimitLabel(row) }}
                  </div>
                  <div v-else class="text-xs text-gray-500">{{ row.cooldownHours }}h</div>
                </td>
                <td class="py-3 pr-4">{{ collectionLabel(row.collectionType) }}</td>
                <td class="py-3 pr-4">{{ row.prizePool.length }} cToons</td>
                <td class="py-3 pr-4 whitespace-nowrap">
                  <NuxtLink class="text-blue-600 hover:text-blue-800 mr-3" :to="`/czonesearch/${row.id}`">View</NuxtLink>
                  <button class="text-blue-600 hover:text-blue-800 mr-3" @click="openEdit(row)">Edit</button>
                  <button class="text-red-600 hover:text-red-800" @click="remove(row)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else-if="!pending" class="text-gray-500">No cZone Searches found.</div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="closeModal"></div>
      <div class="relative bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div class="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h2 class="text-lg font-semibold">{{ modalTitle }}</h2>
          <button class="text-gray-600 hover:text-gray-800" @click="closeModal">Close</button>
        </div>

        <div class="p-4 overflow-y-auto flex-1">
          <div class="space-y-4">
            <div>
              <label class="block mb-1 font-medium">Search Name</label>
              <input v-model="form.name" type="text" class="w-full border rounded px-3 py-2" placeholder="e.g. Fall Gold Hunt" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block mb-1 font-medium">Start (CST)</label>
                <input v-model="form.startAt" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">End (CST)</label>
                <input v-model="form.endAt" type="datetime-local" class="w-full border rounded px-3 py-2" />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block mb-1 font-medium">Appearance Rate %</label>
                <input v-model.number="form.appearanceRatePercent" type="number" min="0" max="100" step="0.01" class="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label class="block mb-1 font-medium">Reset Type</label>
                <select v-model="form.resetType" class="w-full border rounded px-3 py-2">
                  <option value="COOLDOWN_HOURS">Cooldown in Hours</option>
                  <option value="DAILY_AT_RESET">Daily at 8pm CT</option>
                </select>
              </div>
              <div>
                <label class="block mb-1 font-medium">Collection Type</label>
                <select v-model="form.collectionType" class="w-full border rounded px-3 py-2">
                  <option value="ONCE">Collect Each cToon Once</option>
                  <option value="MULTIPLE">Collect Each cToon Multiple Times</option>
                  <option value="CUSTOM_PER_CTOON">Custom Per cToon</option>
                </select>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <input id="link-in-onboarding" v-model="form.linkInOnboarding" type="checkbox" class="h-4 w-4" />
              <label for="link-in-onboarding" class="text-sm text-gray-700">Link in Onboarding</label>
            </div>

            <div v-if="form.resetType === 'COOLDOWN_HOURS'" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block mb-1 font-medium">Cooldown (Hours)</label>
                <input v-model.number="form.cooldownHours" type="number" min="0" step="1" class="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block mb-1 font-medium">Able To Collect Daily</label>
                <input v-model="form.dailyCollectLimit" type="number" min="1" step="1" class="w-full border rounded px-3 py-2" />
                <p class="text-xs text-gray-500 mt-1">Leave blank for unlimited.</p>
              </div>
            </div>

            <div>
              <label class="block mb-1 font-medium">Prize Pool</label>
              <p v-if="form.collectionType === 'CUSTOM_PER_CTOON'" class="text-xs text-gray-500 mb-2">
                Max Captures: leave blank for unlimited.
              </p>
              <div class="relative">
                <input
                  v-model="ctoonSearchTerm"
                  type="text"
                  placeholder="Type 3+ characters to search cToons"
                  class="w-full border rounded px-3 py-2"
                  @focus="searchFocused = true"
                  @blur="searchFocused = false"
                />
                <ul v-if="ctoonSearchTerm.length >= 3 && searchFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                  <li v-if="searchingCtoons" class="px-3 py-2 text-gray-500">Searching...</li>
                  <li v-else-if="!ctoonSearchResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
                  <li
                    v-for="ctoon in ctoonSearchResults"
                    :key="ctoon.id"
                    class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                    @mousedown.prevent="addCtoonToPool(ctoon)"
                  >
                    <img :src="ctoon.assetPath" class="h-10 w-auto rounded" />
                    <div>
                      <p class="font-medium">{{ ctoon.name }}</p>
                      <p class="text-xs text-gray-500">{{ ctoon.rarity }}</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div v-if="!form.prizePool.length" class="text-sm text-gray-500 mt-2">Add at least one cToon to the prize pool.</div>
              <div class="mt-3 space-y-2">
                <div
                  v-for="(row, idx) in form.prizePool"
                  :key="row.ctoonId"
                  class="bg-gray-50 rounded p-2 space-y-3"
                >
                  <div class="flex flex-col sm:flex-row sm:items-center gap-3">
                    <button type="button" class="flex items-center gap-3 flex-1 text-left" @click="togglePrizeRow(row)">
                      <img :src="row.ctoon.assetPath" class="h-10 w-auto rounded" />
                      <div>
                        <div class="font-medium">{{ row.ctoon.name }}</div>
                        <div class="text-xs text-gray-500">{{ row.ctoon.rarity }}</div>
                      </div>
                    </button>
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-gray-500">Chance %</label>
                      <input v-model.number="row.chancePercent" type="number" min="0" max="100" step="0.01" class="w-28 border rounded px-2 py-1" />
                    </div>
                    <div v-if="form.collectionType === 'CUSTOM_PER_CTOON'" class="flex items-center gap-2">
                      <label class="text-xs text-gray-500">Max Captures</label>
                      <input v-model="row.maxCaptures" type="number" min="1" step="1" placeholder="Unlimited" class="w-28 border rounded px-2 py-1" />
                    </div>
                    <button class="text-red-600 hover:text-red-800 text-sm" @click="removeCtoon(idx)">Remove</button>
                  </div>

                  <div v-if="expandedPrizeId === row.ctoonId" class="border-t pt-3 space-y-4">
                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionDateEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'date')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">Date</div>
                        <p class="text-xs text-gray-500">Must be within the search start/end date.</p>
                        <div v-if="row.conditionDateEnabled" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          <div>
                            <label class="text-xs text-gray-500">Start Date</label>
                            <input v-model="row.conditionDateStart" type="date" :min="searchDateBounds.start" :max="searchDateBounds.end" class="w-full border rounded px-2 py-1" />
                          </div>
                          <div>
                            <label class="text-xs text-gray-500">End Date</label>
                            <input v-model="row.conditionDateEnd" type="date" :min="searchDateBounds.start" :max="searchDateBounds.end" class="w-full border rounded px-2 py-1" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionTimeEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'time')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">Time of Day</div>
                        <p class="text-xs text-gray-500">Based on the viewer's local timezone.</p>
                        <div v-if="row.conditionTimeEnabled" class="mt-2">
                          <select v-model="row.conditionTimeOfDay" class="w-full border rounded px-2 py-1">
                            <option value="">Select a time of day</option>
                            <option value="MORNING">Morning (6am–11:59am)</option>
                            <option value="AFTERNOON">Afternoon (12pm–4:59pm)</option>
                            <option value="EVENING">Evening (5pm–9:59pm)</option>
                            <option value="NIGHT">Night (10pm–5:59am)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionBackgroundEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'background')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">cZone Background</div>
                        <p class="text-xs text-gray-500">Select one or more backgrounds.</p>
                        <div v-if="row.conditionBackgroundEnabled" class="mt-2">
                          <div v-if="backgroundsLoading" class="text-xs text-gray-500">Loading backgrounds...</div>
                          <div v-else-if="backgroundsError" class="text-xs text-red-600">{{ backgroundsError }}</div>
                          <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              v-for="bg in backgrounds"
                              :key="bg.id"
                              type="button"
                              class="border rounded overflow-hidden text-left"
                              :class="row.conditionBackgrounds.includes(bg.filename) ? 'ring-2 ring-blue-500 border-blue-500' : 'border-gray-200'"
                              @click="toggleBackground(row, bg)"
                            >
                              <img :src="bg.imagePath" :alt="bg.label || bg.filename" class="w-full h-16 object-cover" />
                              <div class="px-2 py-1 text-xs truncate">{{ bg.label || bg.filename }}</div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionCtoonInZoneEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'ctoonInZone')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">cToon in cZone</div>
                        <p class="text-xs text-gray-500">Select one cToon that must appear in the viewed cZone.</p>
                        <div v-if="row.conditionCtoonInZoneEnabled" class="mt-2">
                          <div class="relative">
                            <input
                              v-model="row.conditionCtoonInZoneTerm"
                              type="text"
                              placeholder="Type 3+ characters to search cToons"
                              class="w-full border rounded px-2 py-1"
                              @focus="row.conditionCtoonInZoneFocused = true"
                              @blur="row.conditionCtoonInZoneFocused = false"
                              @input="searchConditionCtoons(row, 'zone')"
                            />
                            <ul v-if="row.conditionCtoonInZoneTerm.length >= 3 && row.conditionCtoonInZoneFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                              <li v-if="row.conditionCtoonInZoneSearching" class="px-3 py-2 text-gray-500">Searching...</li>
                              <li v-else-if="!row.conditionCtoonInZoneResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
                              <li
                                v-for="ctoon in row.conditionCtoonInZoneResults"
                                :key="ctoon.id"
                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                                @mousedown.prevent="selectConditionCtoonInZone(row, ctoon)"
                              >
                                <img :src="ctoon.assetPath" class="h-8 w-auto rounded" />
                                <div>
                                  <p class="font-medium">{{ ctoon.name }}</p>
                                  <p class="text-xs text-gray-500">{{ ctoon.rarity }}</p>
                                </div>
                              </li>
                            </ul>
                          </div>
                          <div v-if="row.conditionCtoonInZone" class="mt-2 flex items-center gap-3 bg-white border rounded px-2 py-1">
                            <img :src="row.conditionCtoonInZone.assetPath" class="h-8 w-auto rounded" />
                            <div class="flex-1 text-sm">{{ row.conditionCtoonInZone.name }}</div>
                            <button type="button" class="text-xs text-red-600" @click="clearConditionCtoonInZone(row)">Remove</button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionUserOwnsEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'userOwns')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">User Owns cToon</div>
                        <p class="text-xs text-gray-500">All selected cToons and counts must be met.</p>
                        <div v-if="row.conditionUserOwnsEnabled" class="mt-2 space-y-2">
                          <div class="relative">
                            <input
                              v-model="row.conditionUserOwnsTerm"
                              type="text"
                              placeholder="Type 3+ characters to search cToons"
                              class="w-full border rounded px-2 py-1"
                              @focus="row.conditionUserOwnsFocused = true"
                              @blur="row.conditionUserOwnsFocused = false"
                              @input="searchConditionCtoons(row, 'owns')"
                            />
                            <ul v-if="row.conditionUserOwnsTerm.length >= 3 && row.conditionUserOwnsFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                              <li v-if="row.conditionUserOwnsSearching" class="px-3 py-2 text-gray-500">Searching...</li>
                              <li v-else-if="!row.conditionUserOwnsResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
                              <li
                                v-for="ctoon in row.conditionUserOwnsResults"
                                :key="ctoon.id"
                                class="px-3 py-2 hover:bg-gray-100 cursor-pointer flex items-center gap-3"
                                @mousedown.prevent="addConditionUserOwns(row, ctoon)"
                              >
                                <img :src="ctoon.assetPath" class="h-8 w-auto rounded" />
                                <div>
                                  <p class="font-medium">{{ ctoon.name }}</p>
                                  <p class="text-xs text-gray-500">{{ ctoon.rarity }}</p>
                                </div>
                              </li>
                            </ul>
                          </div>
                          <div v-if="row.conditionUserOwnsList.length" class="space-y-2">
                            <div v-for="entry in row.conditionUserOwnsList" :key="entry.ctoonId" class="flex items-center gap-3 bg-white border rounded px-2 py-1">
                              <img v-if="entry.ctoon?.assetPath" :src="entry.ctoon.assetPath" class="h-8 w-auto rounded" />
                              <div class="flex-1 text-sm">{{ entry.ctoon?.name || entry.ctoonId }}</div>
                              <div class="flex items-center gap-2">
                                <label class="text-xs text-gray-500"># Owned</label>
                                <input v-model.number="entry.count" type="number" min="1" step="1" class="w-20 border rounded px-2 py-1" />
                              </div>
                              <button type="button" class="text-xs text-red-600" @click="removeConditionUserOwns(row, entry.ctoonId)">Remove</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                      <div class="flex items-start gap-3">
                        <input v-model="row.conditionUserPointsEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'userPoints')" />
                        <div class="flex-1">
                          <div class="text-sm font-medium">User Points</div>
                          <div v-if="row.conditionUserPointsEnabled" class="mt-1">
                            <input v-model.number="row.conditionUserPointsMin" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
                          </div>
                        </div>
                      </div>

                      <div class="flex items-start gap-3">
                        <input v-model="row.conditionUserTotalCountEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'userTotal')" />
                        <div class="flex-1">
                          <div class="text-sm font-medium">User Total cToon Count</div>
                          <div v-if="row.conditionUserTotalCountEnabled" class="mt-1">
                            <input v-model.number="row.conditionUserTotalCountMin" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
                          </div>
                        </div>
                      </div>

                      <div class="flex items-start gap-3">
                        <input v-model="row.conditionUserUniqueCountEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'userUnique')" />
                        <div class="flex-1">
                          <div class="text-sm font-medium">User Unique cToon Count</div>
                          <div v-if="row.conditionUserUniqueCountEnabled" class="mt-1">
                            <input v-model.number="row.conditionUserUniqueCountMin" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
                          </div>
                        </div>
                      </div>

                      <div class="flex items-start gap-3">
                        <input v-model="row.conditionSetUniqueCountEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'setUnique')" />
                        <div class="flex-1">
                          <div class="text-sm font-medium"># of unique cToons from set</div>
                          <div v-if="row.conditionSetUniqueCountEnabled" class="mt-1 space-y-1">
                            <input v-model.number="row.conditionSetUniqueCountMin" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
                            <div class="relative">
                              <input
                                v-model="row.conditionSetUniqueCountSet"
                                type="text"
                                placeholder="Type 3+ characters for set"
                                class="w-full border rounded px-2 py-1"
                                @focus="row.conditionSetUniqueCountFocused = true"
                                @blur="row.conditionSetUniqueCountFocused = false"
                                @input="searchConditionSets(row, 'unique')"
                              />
                              <ul v-if="row.conditionSetUniqueCountSet.length >= 3 && row.conditionSetUniqueCountFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                                <li v-if="row.conditionSetUniqueCountSearching" class="px-3 py-2 text-gray-500">Searching...</li>
                                <li v-else-if="!row.conditionSetUniqueCountResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
                                <li
                                  v-for="setName in row.conditionSetUniqueCountResults"
                                  :key="setName"
                                  class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                  @mousedown.prevent="selectConditionSet(row, 'unique', setName)"
                                >
                                  {{ setName }}
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="flex items-start gap-3">
                        <input v-model="row.conditionSetTotalCountEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'setTotal')" />
                        <div class="flex-1">
                          <div class="text-sm font-medium"># of total cToons from set</div>
                          <div v-if="row.conditionSetTotalCountEnabled" class="mt-1 space-y-1">
                            <input v-model.number="row.conditionSetTotalCountMin" type="number" min="1" step="1" class="w-full border rounded px-2 py-1" />
                            <div class="relative">
                              <input
                                v-model="row.conditionSetTotalCountSet"
                                type="text"
                                placeholder="Type 3+ characters for set"
                                class="w-full border rounded px-2 py-1"
                                @focus="row.conditionSetTotalCountFocused = true"
                                @blur="row.conditionSetTotalCountFocused = false"
                                @input="searchConditionSets(row, 'total')"
                              />
                              <ul v-if="row.conditionSetTotalCountSet.length >= 3 && row.conditionSetTotalCountFocused" class="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                                <li v-if="row.conditionSetTotalCountSearching" class="px-3 py-2 text-gray-500">Searching...</li>
                                <li v-else-if="!row.conditionSetTotalCountResults.length" class="px-3 py-2 text-gray-500">No results found.</li>
                                <li
                                  v-for="setName in row.conditionSetTotalCountResults"
                                  :key="setName"
                                  class="px-3 py-2 hover:bg-gray-100 cursor-pointer"
                                  @mousedown.prevent="selectConditionSet(row, 'total', setName)"
                                >
                                  {{ setName }}
                                </li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <input v-model="row.conditionOwnsLessThanEnabled" type="checkbox" class="mt-1" @change="onConditionToggle(row, 'ownsLessThan')" />
                      <div class="flex-1">
                        <div class="text-sm font-medium">User Owns This cToon Less Than X</div>
                        <p class="text-xs text-gray-500">This cToon is eligible only if the user owns fewer than X copies (ignoring burned).</p>
                        <div v-if="row.conditionOwnsLessThanEnabled" class="mt-1">
                          <input v-model.number="row.conditionOwnsLessThanCount" type="number" min="1" step="1" placeholder="X (e.g. 1)" class="w-full border rounded px-2 py-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="formError" class="text-red-600 text-sm">{{ formError }}</div>
          </div>
        </div>

        <div class="p-4 border-t flex justify-end gap-2 flex-shrink-0">
          <button class="px-4 py-2 rounded border" @click="closeModal">Cancel</button>
          <button
            class="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="saving"
            @click="saveSearch"
          >
            <span v-if="!saving">Save</span>
            <span v-else>Saving...</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ title: 'Admin - Manage cZone Search', middleware: ['auth', 'admin'], layout: 'default' })

const searches = ref([])
const pending = ref(false)
const error = ref(null)
const showAll = ref(false)

const showModal = ref(false)
const saving = ref(false)
const formError = ref('')
const isSettingForm = ref(false)
const expandedPrizeId = ref(null)

const backgrounds = ref([])
const backgroundsLoading = ref(false)
const backgroundsError = ref('')

const form = reactive({
  id: null,
  name: '',
  startAt: '',
  endAt: '',
  appearanceRatePercent: 0,
  cooldownHours: 0,
  resetType: 'COOLDOWN_HOURS',
  dailyCollectLimit: '',
  collectionType: 'MULTIPLE',
  linkInOnboarding: false,
  prizePool: []
})

const ctoonSearchTerm = ref('')
const ctoonSearchResults = ref([])
const searchingCtoons = ref(false)
const searchFocused = ref(false)

const modalTitle = computed(() => (form.id ? 'Edit cZone Search' : 'Create cZone Search'))
const searchDateBounds = computed(() => {
  const start = String(form.startAt || '').split('T')[0] || ''
  const end = String(form.endAt || '').split('T')[0] || ''
  return { start, end }
})

function collectionLabel(value) {
  if (value === 'ONCE') return 'Collect Each cToon Once'
  if (value === 'CUSTOM_PER_CTOON') return 'Custom Per cToon'
  return 'Collect Each cToon Multiple Times'
}

function normalizeResetType(value) {
  return value === 'DAILY_AT_RESET' ? 'DAILY_AT_RESET' : 'COOLDOWN_HOURS'
}

function isDailyReset(row) {
  return normalizeResetType(row?.resetType) === 'DAILY_AT_RESET'
}

function resetLabel(row) {
  return isDailyReset(row) ? 'Daily at 8pm CT' : 'Cooldown in Hours'
}

function dailyLimitLabel(row) {
  const limit = Number(row?.dailyCollectLimit ?? 0)
  return limit > 0 ? String(limit) : 'Unlimited'
}

function initPrizeRow(row) {
  return {
    ...row,
    conditionDateEnabled: Boolean(row.conditionDateEnabled),
    conditionDateStart: row.conditionDateStart || '',
    conditionDateEnd: row.conditionDateEnd || '',
    conditionTimeEnabled: Boolean(row.conditionTimeEnabled),
    conditionTimeOfDay: row.conditionTimeOfDay || '',
    conditionBackgroundEnabled: Boolean(row.conditionBackgroundEnabled),
    conditionBackgrounds: Array.isArray(row.conditionBackgrounds) ? [...row.conditionBackgrounds] : [],
    conditionCtoonInZoneEnabled: Boolean(row.conditionCtoonInZoneEnabled),
    conditionCtoonInZoneId: row.conditionCtoonInZoneId || '',
    conditionCtoonInZone: row.conditionCtoonInZone || null,
    conditionCtoonInZoneTerm: '',
    conditionCtoonInZoneResults: [],
    conditionCtoonInZoneSearching: false,
    conditionCtoonInZoneFocused: false,
    conditionUserOwnsEnabled: Boolean(row.conditionUserOwnsEnabled),
    conditionUserOwnsList: Array.isArray(row.conditionUserOwns)
      ? row.conditionUserOwns.map((entry) => ({
        ctoonId: entry?.ctoonId || '',
        count: Number(entry?.count || 1),
        ctoon: null
      }))
      : [],
    conditionUserOwnsTerm: '',
    conditionUserOwnsResults: [],
    conditionUserOwnsSearching: false,
    conditionUserOwnsFocused: false,
    conditionUserPointsEnabled: Boolean(row.conditionUserPointsEnabled),
    conditionUserPointsMin: row.conditionUserPointsMin ?? '',
    conditionUserTotalCountEnabled: Boolean(row.conditionUserTotalCountEnabled),
    conditionUserTotalCountMin: row.conditionUserTotalCountMin ?? '',
    conditionUserUniqueCountEnabled: Boolean(row.conditionUserUniqueCountEnabled),
    conditionUserUniqueCountMin: row.conditionUserUniqueCountMin ?? '',
    conditionSetUniqueCountEnabled: Boolean(row.conditionSetUniqueCountEnabled),
    conditionSetUniqueCountMin: row.conditionSetUniqueCountMin ?? '',
    conditionSetUniqueCountSet: row.conditionSetUniqueCountSet || '',
    conditionSetUniqueCountResults: [],
    conditionSetUniqueCountSearching: false,
    conditionSetUniqueCountFocused: false,
    conditionSetTotalCountEnabled: Boolean(row.conditionSetTotalCountEnabled),
    conditionSetTotalCountMin: row.conditionSetTotalCountMin ?? '',
    conditionSetTotalCountSet: row.conditionSetTotalCountSet || '',
    conditionSetTotalCountResults: [],
    conditionSetTotalCountSearching: false,
    conditionSetTotalCountFocused: false,
    conditionOwnsLessThanEnabled: Boolean(row.conditionOwnsLessThanEnabled),
    conditionOwnsLessThanCount: row.conditionOwnsLessThanCount ?? ''
  }
}

function togglePrizeRow(row) {
  expandedPrizeId.value = expandedPrizeId.value === row.ctoonId ? null : row.ctoonId
}

function onConditionToggle(row, key) {
  if (key === 'date' && !row.conditionDateEnabled) {
    row.conditionDateStart = ''
    row.conditionDateEnd = ''
  }
  if (key === 'time' && !row.conditionTimeEnabled) {
    row.conditionTimeOfDay = ''
  }
  if (key === 'background' && !row.conditionBackgroundEnabled) {
    row.conditionBackgrounds = []
  }
  if (key === 'ctoonInZone' && !row.conditionCtoonInZoneEnabled) {
    clearConditionCtoonInZone(row)
  }
  if (key === 'userOwns' && !row.conditionUserOwnsEnabled) {
    row.conditionUserOwnsList = []
    row.conditionUserOwnsTerm = ''
    row.conditionUserOwnsResults = []
    row.conditionUserOwnsSearching = false
    row.conditionUserOwnsFocused = false
  }
  if (key === 'userPoints' && !row.conditionUserPointsEnabled) {
    row.conditionUserPointsMin = ''
  }
  if (key === 'userTotal' && !row.conditionUserTotalCountEnabled) {
    row.conditionUserTotalCountMin = ''
  }
  if (key === 'userUnique' && !row.conditionUserUniqueCountEnabled) {
    row.conditionUserUniqueCountMin = ''
  }
  if (key === 'setUnique' && !row.conditionSetUniqueCountEnabled) {
    row.conditionSetUniqueCountMin = ''
    row.conditionSetUniqueCountSet = ''
    row.conditionSetUniqueCountResults = []
    row.conditionSetUniqueCountSearching = false
    row.conditionSetUniqueCountFocused = false
  }
  if (key === 'setTotal' && !row.conditionSetTotalCountEnabled) {
    row.conditionSetTotalCountMin = ''
    row.conditionSetTotalCountSet = ''
    row.conditionSetTotalCountResults = []
    row.conditionSetTotalCountSearching = false
    row.conditionSetTotalCountFocused = false
  }
  if (key === 'ownsLessThan' && !row.conditionOwnsLessThanEnabled) {
    row.conditionOwnsLessThanCount = ''
  }
}

function toggleBackground(row, bg) {
  const filename = String(bg?.filename || '').trim()
  if (!filename) return
  if (row.conditionBackgrounds.includes(filename)) {
    row.conditionBackgrounds = row.conditionBackgrounds.filter(b => b !== filename)
  } else {
    row.conditionBackgrounds = [...row.conditionBackgrounds, filename]
  }
}

function clearConditionCtoonInZone(row) {
  row.conditionCtoonInZoneId = ''
  row.conditionCtoonInZone = null
  row.conditionCtoonInZoneTerm = ''
  row.conditionCtoonInZoneResults = []
  row.conditionCtoonInZoneSearching = false
  row.conditionCtoonInZoneFocused = false
}

function selectConditionCtoonInZone(row, ctoon) {
  row.conditionCtoonInZoneId = ctoon.id
  row.conditionCtoonInZone = ctoon
  row.conditionCtoonInZoneTerm = ''
  row.conditionCtoonInZoneResults = []
  row.conditionCtoonInZoneFocused = false
}

function addConditionUserOwns(row, ctoon) {
  if (row.conditionUserOwnsList.some(entry => entry.ctoonId === ctoon.id)) {
    row.conditionUserOwnsTerm = ''
    row.conditionUserOwnsResults = []
    row.conditionUserOwnsFocused = false
    return
  }
  row.conditionUserOwnsList.push({ ctoonId: ctoon.id, count: 1, ctoon })
  row.conditionUserOwnsTerm = ''
  row.conditionUserOwnsResults = []
  row.conditionUserOwnsFocused = false
}

function removeConditionUserOwns(row, ctoonId) {
  row.conditionUserOwnsList = row.conditionUserOwnsList.filter(entry => entry.ctoonId !== ctoonId)
}

async function loadBackgrounds() {
  backgroundsLoading.value = true
  backgroundsError.value = ''
  try {
    const data = await $fetch('/api/admin/backgrounds')
    backgrounds.value = Array.isArray(data) ? data : []
  } catch (err) {
    backgrounds.value = []
    backgroundsError.value = err?.data?.statusMessage || 'Failed to load backgrounds.'
  } finally {
    backgroundsLoading.value = false
  }
}

async function searchConditionCtoons(row, type) {
  const isZone = type === 'zone'
  const term = isZone ? row.conditionCtoonInZoneTerm.trim() : row.conditionUserOwnsTerm.trim()
  const timerKey = isZone ? '_ctoonInZoneTimer' : '_userOwnsTimer'
  clearTimeout(row[timerKey])
  if (term.length < 3) {
    if (isZone) {
      row.conditionCtoonInZoneResults = []
      row.conditionCtoonInZoneSearching = false
    } else {
      row.conditionUserOwnsResults = []
      row.conditionUserOwnsSearching = false
    }
    return
  }
  if (isZone) row.conditionCtoonInZoneSearching = true
  else row.conditionUserOwnsSearching = true
  row[timerKey] = setTimeout(async () => {
    try {
      const results = await $fetch('/api/admin/search-ctoons', { query: { q: term } })
      const list = Array.isArray(results) ? results : []
      if (isZone) {
        row.conditionCtoonInZoneResults = list
      } else {
        const selected = new Set(row.conditionUserOwnsList.map(entry => entry.ctoonId))
        row.conditionUserOwnsResults = list.filter(ctoon => !selected.has(ctoon.id))
      }
    } catch {
      if (isZone) row.conditionCtoonInZoneResults = []
      else row.conditionUserOwnsResults = []
    } finally {
      if (isZone) row.conditionCtoonInZoneSearching = false
      else row.conditionUserOwnsSearching = false
    }
  }, 300)
}



function selectConditionSet(row, type, setName) {
  if (type === 'unique') {
    row.conditionSetUniqueCountSet = setName
    row.conditionSetUniqueCountResults = []
    row.conditionSetUniqueCountFocused = false
  } else {
    row.conditionSetTotalCountSet = setName
    row.conditionSetTotalCountResults = []
    row.conditionSetTotalCountFocused = false
  }
}

async function searchConditionSets(row, type) {
  const isUnique = type === 'unique'
  const term = isUnique ? row.conditionSetUniqueCountSet.trim() : row.conditionSetTotalCountSet.trim()
  const timerKey = isUnique ? '_setUniqueTimer' : '_setTotalTimer'
  clearTimeout(row[timerKey])
  if (term.length < 3) {
    if (isUnique) {
      row.conditionSetUniqueCountResults = []
      row.conditionSetUniqueCountSearching = false
    } else {
      row.conditionSetTotalCountResults = []
      row.conditionSetTotalCountSearching = false
    }
    return
  }
  if (isUnique) row.conditionSetUniqueCountSearching = true
  else row.conditionSetTotalCountSearching = true
  row[timerKey] = setTimeout(async () => {
    try {
      const results = await $fetch('/api/admin/ctoon-sets', { query: { q: term } })
      if (isUnique) row.conditionSetUniqueCountResults = Array.isArray(results) ? results : []
      else row.conditionSetTotalCountResults = Array.isArray(results) ? results : []
    } catch {
      if (isUnique) row.conditionSetUniqueCountResults = []
      else row.conditionSetTotalCountResults = []
    } finally {
      if (isUnique) row.conditionSetUniqueCountSearching = false
      else row.conditionSetTotalCountSearching = false
    }
  }, 300)
}

async function hydrateConditionCtoons(rows) {
  const ids = new Set()
  for (const row of rows) {
    if (row.conditionCtoonInZoneId) ids.add(row.conditionCtoonInZoneId)
    for (const entry of row.conditionUserOwnsList || []) {
      if (entry.ctoonId) ids.add(entry.ctoonId)
    }
  }
  if (!ids.size) return
  try {
    const data = await $fetch('/api/admin/ctoons/by-ids', { method: 'POST', body: { ids: Array.from(ids) } })
    const list = Array.isArray(data) ? data : []
    const map = new Map(list.map(ctoon => [ctoon.id, ctoon]))
    for (const row of rows) {
      if (row.conditionCtoonInZoneId) {
        row.conditionCtoonInZone = map.get(row.conditionCtoonInZoneId) || null
      }
      row.conditionUserOwnsList = (row.conditionUserOwnsList || []).map((entry) => ({
        ...entry,
        ctoon: map.get(entry.ctoonId) || entry.ctoon || null
      }))
    }
  } catch {
    // leave existing ids if fetch fails
  }
}

function formatCentral(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  })
}

function displayName(name) {
  const cleaned = String(name || '').trim()
  return cleaned || 'Untitled'
}

function isoToCSTLocal(iso) {
  const date = new Date(iso)
  const parts = date.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).split(', ')
  const [m, d, y] = parts[0].split('/')
  const time = parts[1]
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${time}`
}

function cstLocalToUtcISO(localValue) {
  const [dateStr, timeStr] = String(localValue || '').split('T')
  if (!dateStr || !timeStr) return ''
  const [y, m, d] = dateStr.split('-').map(n => parseInt(n, 10))
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10))

  const partsInChicago = (date) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    })
    const obj = {}
    for (const p of dtf.formatToParts(date)) obj[p.type] = p.value
    return {
      year: Number(obj.year),
      month: Number(obj.month),
      day: Number(obj.day),
      hour: Number(obj.hour),
      minute: Number(obj.minute),
      second: Number(obj.second)
    }
  }

  let utcMs = Date.UTC(y, m - 1, d, hh, mm, 0)
  for (let i = 0; i < 3; i++) {
    const p = partsInChicago(new Date(utcMs))
    const gotMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const wantMs = Date.UTC(y, m - 1, d, hh, mm, 0)
    const diff = wantMs - gotMs
    utcMs += diff
    if (Math.abs(diff) < 1000) break
  }
  return new Date(utcMs).toISOString()
}

async function loadSearches() {
  pending.value = true
  error.value = null
  try {
    const data = await $fetch('/api/admin/czone-searches', { query: { showAll: showAll.value ? '1' : '0' } })
    searches.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

function resetForm() {
  form.id = null
  form.name = ''
  form.startAt = ''
  form.endAt = ''
  form.appearanceRatePercent = 0
  form.cooldownHours = 0
  form.resetType = 'COOLDOWN_HOURS'
  form.dailyCollectLimit = ''
  form.collectionType = 'MULTIPLE'
  form.linkInOnboarding = false
  form.prizePool = []
  formError.value = ''
  expandedPrizeId.value = null
  ctoonSearchTerm.value = ''
  ctoonSearchResults.value = []
}

function openCreate() {
  isSettingForm.value = true
  resetForm()
  showModal.value = true
  setTimeout(() => { isSettingForm.value = false }, 0)
}

async function openEdit(row) {
  isSettingForm.value = true
  expandedPrizeId.value = null
  form.id = row.id
  form.name = row.name || ''
  form.startAt = isoToCSTLocal(row.startAt)
  form.endAt = isoToCSTLocal(row.endAt)
  form.appearanceRatePercent = Number(row.appearanceRatePercent)
  form.cooldownHours = Number(row.cooldownHours)
  form.resetType = row.resetType || 'COOLDOWN_HOURS'
  form.dailyCollectLimit = row.dailyCollectLimit === null || row.dailyCollectLimit === undefined
    ? ''
    : Number(row.dailyCollectLimit)
  form.collectionType = row.collectionType || 'MULTIPLE'
  form.linkInOnboarding = Boolean(row.linkInOnboarding)
  form.prizePool = row.prizePool.map((p) => initPrizeRow({
    ctoonId: p.ctoonId,
    chancePercent: Number(p.chancePercent),
    maxCaptures: p.maxCaptures === null || p.maxCaptures === undefined ? '' : Number(p.maxCaptures),
    conditionDateEnabled: p.conditionDateEnabled,
    conditionDateStart: p.conditionDateStart,
    conditionDateEnd: p.conditionDateEnd,
    conditionTimeEnabled: p.conditionTimeEnabled,
    conditionTimeOfDay: p.conditionTimeOfDay,
    conditionBackgroundEnabled: p.conditionBackgroundEnabled,
    conditionBackgrounds: p.conditionBackgrounds,
    conditionCtoonInZoneEnabled: p.conditionCtoonInZoneEnabled,
    conditionCtoonInZoneId: p.conditionCtoonInZoneId,
    conditionUserOwnsEnabled: p.conditionUserOwnsEnabled,
    conditionUserOwns: p.conditionUserOwns,
    conditionUserPointsEnabled: p.conditionUserPointsEnabled,
    conditionUserPointsMin: p.conditionUserPointsMin,
    conditionUserTotalCountEnabled: p.conditionUserTotalCountEnabled,
    conditionUserTotalCountMin: p.conditionUserTotalCountMin,
    conditionUserUniqueCountEnabled: p.conditionUserUniqueCountEnabled,
    conditionUserUniqueCountMin: p.conditionUserUniqueCountMin,
    conditionSetUniqueCountEnabled: p.conditionSetUniqueCountEnabled,
    conditionSetUniqueCountMin: p.conditionSetUniqueCountMin,
    conditionSetUniqueCountSet: p.conditionSetUniqueCountSet,
    conditionSetTotalCountEnabled: p.conditionSetTotalCountEnabled,
    conditionSetTotalCountMin: p.conditionSetTotalCountMin,
    conditionSetTotalCountSet: p.conditionSetTotalCountSet,
    conditionOwnsLessThanEnabled: p.conditionOwnsLessThanEnabled,
    conditionOwnsLessThanCount: p.conditionOwnsLessThanCount,
    ctoon: p.ctoon
  }))
  formError.value = ''
  showModal.value = true
  await hydrateConditionCtoons(form.prizePool)
  setTimeout(() => { isSettingForm.value = false }, 0)
}

function closeModal() {
  showModal.value = false
  expandedPrizeId.value = null
}

function removeCtoon(idx) {
  if (expandedPrizeId.value && form.prizePool[idx]?.ctoonId === expandedPrizeId.value) {
    expandedPrizeId.value = null
  }
  form.prizePool.splice(idx, 1)
}

async function saveSearch() {
  formError.value = ''
  const startIso = cstLocalToUtcISO(form.startAt)
  const endIso = cstLocalToUtcISO(form.endAt)
  const nameValue = String(form.name || '').trim()
  if (!startIso || !endIso) {
    formError.value = 'Please select a start and end date/time.'
    return
  }
  if (!nameValue) {
    formError.value = 'Please enter a search name.'
    return
  }
  if (new Date(endIso) <= new Date(startIso)) {
    formError.value = 'End date/time must be after start date/time.'
    return
  }
  if (!form.prizePool.length) {
    formError.value = 'Add at least one cToon to the prize pool.'
    return
  }
  if (!form.prizePool.some(p => Number(p.chancePercent) > 0)) {
    formError.value = 'At least one prize pool cToon must have a chance above 0%.'
    return
  }
  const windowStart = searchDateBounds.value.start
  const windowEnd = searchDateBounds.value.end
  for (const row of form.prizePool) {
    const label = row.ctoon?.name || 'cToon'
    if (row.conditionDateEnabled) {
      if (!row.conditionDateStart || !row.conditionDateEnd) {
        formError.value = `Date condition requires start and end dates for ${label}.`
        return
      }
      if (row.conditionDateStart > row.conditionDateEnd) {
        formError.value = `Date condition start must be before end for ${label}.`
        return
      }
      if (windowStart && row.conditionDateStart < windowStart) {
        formError.value = `Date condition start must be within the search window for ${label}.`
        return
      }
      if (windowEnd && row.conditionDateEnd > windowEnd) {
        formError.value = `Date condition end must be within the search window for ${label}.`
        return
      }
    }
    if (row.conditionTimeEnabled && !row.conditionTimeOfDay) {
      formError.value = `Time of day is required for ${label}.`
      return
    }
    if (row.conditionBackgroundEnabled && !row.conditionBackgrounds.length) {
      formError.value = `Select at least one background for ${label}.`
      return
    }
    if (row.conditionCtoonInZoneEnabled && !row.conditionCtoonInZoneId) {
      formError.value = `Select a cToon-in-cZone condition for ${label}.`
      return
    }
    if (row.conditionUserOwnsEnabled) {
      if (!row.conditionUserOwnsList.length) {
        formError.value = `Select at least one user-owns cToon for ${label}.`
        return
      }
      for (const entry of row.conditionUserOwnsList) {
        const count = Number(entry.count)
        if (!entry.ctoonId || !Number.isInteger(count) || count < 1) {
          formError.value = `User-owns counts must be 1 or higher for ${label}.`
          return
        }
      }
    }
    if (row.conditionUserPointsEnabled) {
      const points = Number(row.conditionUserPointsMin)
      if (!Number.isInteger(points) || points < 1) {
        formError.value = `User points must be 1 or higher for ${label}.`
        return
      }
    }
    if (row.conditionUserTotalCountEnabled) {
      const total = Number(row.conditionUserTotalCountMin)
      if (!Number.isInteger(total) || total < 1) {
        formError.value = `User total cToon count must be 1 or higher for ${label}.`
        return
      }
    }
    if (row.conditionUserUniqueCountEnabled) {
      const unique = Number(row.conditionUserUniqueCountMin)
      if (!Number.isInteger(unique) || unique < 1) {
        formError.value = `User unique cToon count must be 1 or higher for ${label}.`
        return
      }
    }
    if (row.conditionSetUniqueCountEnabled) {
      const uniqueSetMin = Number(row.conditionSetUniqueCountMin)
      if (!Number.isInteger(uniqueSetMin) || uniqueSetMin < 1) {
        formError.value = `# of unique cToons from set must be 1 or higher for ${label}.`
        return
      }
      if (!String(row.conditionSetUniqueCountSet || '').trim()) {
        formError.value = `Set name is required for unique cToons from set for ${label}.`
        return
      }
    }
    if (row.conditionSetTotalCountEnabled) {
      const totalSetMin = Number(row.conditionSetTotalCountMin)
      if (!Number.isInteger(totalSetMin) || totalSetMin < 1) {
        formError.value = `# of total cToons from set must be 1 or higher for ${label}.`
        return
      }
      if (!String(row.conditionSetTotalCountSet || '').trim()) {
        formError.value = `Set name is required for total cToons from set for ${label}.`
        return
      }
    }
    if (row.conditionOwnsLessThanEnabled) {
      const lessThan = Number(row.conditionOwnsLessThanCount)
      if (!Number.isInteger(lessThan) || lessThan < 1) {
        formError.value = `"Owns less than" count must be 1 or higher for ${label}.`
        return
      }
    }
  }
  const isCustomCollection = form.collectionType === 'CUSTOM_PER_CTOON'
  if (isCustomCollection) {
    for (const row of form.prizePool) {
      if (row.maxCaptures === '' || row.maxCaptures === null || row.maxCaptures === undefined) continue
      const maxCaptures = Number(row.maxCaptures)
      if (!Number.isInteger(maxCaptures) || maxCaptures <= 0) {
        formError.value = 'Max Captures must be a positive whole number or left blank.'
        return
      }
    }
  }
  const resetType = form.resetType === 'DAILY_AT_RESET' ? 'DAILY_AT_RESET' : 'COOLDOWN_HOURS'
  let cooldownValue = 0
  if (resetType === 'COOLDOWN_HOURS') {
    cooldownValue = Number(form.cooldownHours)
    if (!Number.isInteger(cooldownValue) || cooldownValue < 0) {
      formError.value = 'Cooldown must be a whole number of hours (0 or higher).'
      return
    }
  }
  let dailyCollectLimit = null
  if (resetType === 'DAILY_AT_RESET') {
    if (form.dailyCollectLimit !== '' && form.dailyCollectLimit !== null && form.dailyCollectLimit !== undefined) {
      const limitValue = Number(form.dailyCollectLimit)
      if (!Number.isInteger(limitValue) || limitValue <= 0) {
        formError.value = 'Able To Collect Daily must be a positive whole number or left blank.'
        return
      }
      dailyCollectLimit = limitValue
    }
  }

  const payload = {
    name: nameValue,
    startAt: startIso,
    endAt: endIso,
    appearanceRatePercent: Number(form.appearanceRatePercent),
    cooldownHours: cooldownValue,
    resetType,
    dailyCollectLimit,
    collectionType: form.collectionType,
    linkInOnboarding: Boolean(form.linkInOnboarding),
    prizePool: form.prizePool.map(p => ({
      ctoonId: p.ctoonId,
      chancePercent: Number(p.chancePercent),
      maxCaptures: isCustomCollection
        ? (p.maxCaptures === '' || p.maxCaptures === null || p.maxCaptures === undefined ? null : Number(p.maxCaptures))
        : null,
      conditionDateEnabled: Boolean(p.conditionDateEnabled),
      conditionDateStart: p.conditionDateEnabled ? p.conditionDateStart : null,
      conditionDateEnd: p.conditionDateEnabled ? p.conditionDateEnd : null,
      conditionTimeEnabled: Boolean(p.conditionTimeEnabled),
      conditionTimeOfDay: p.conditionTimeEnabled ? p.conditionTimeOfDay : null,
      conditionBackgroundEnabled: Boolean(p.conditionBackgroundEnabled),
      conditionBackgrounds: p.conditionBackgroundEnabled ? p.conditionBackgrounds : [],
      conditionCtoonInZoneEnabled: Boolean(p.conditionCtoonInZoneEnabled),
      conditionCtoonInZoneId: p.conditionCtoonInZoneEnabled ? p.conditionCtoonInZoneId : null,
      conditionUserOwnsEnabled: Boolean(p.conditionUserOwnsEnabled),
      conditionUserOwns: p.conditionUserOwnsEnabled
        ? p.conditionUserOwnsList.map(entry => ({
          ctoonId: entry.ctoonId,
          count: Number(entry.count)
        }))
        : [],
      conditionUserPointsEnabled: Boolean(p.conditionUserPointsEnabled),
      conditionUserPointsMin: p.conditionUserPointsEnabled ? Number(p.conditionUserPointsMin) : null,
      conditionUserTotalCountEnabled: Boolean(p.conditionUserTotalCountEnabled),
      conditionUserTotalCountMin: p.conditionUserTotalCountEnabled ? Number(p.conditionUserTotalCountMin) : null,
      conditionUserUniqueCountEnabled: Boolean(p.conditionUserUniqueCountEnabled),
      conditionUserUniqueCountMin: p.conditionUserUniqueCountEnabled ? Number(p.conditionUserUniqueCountMin) : null,
      conditionSetUniqueCountEnabled: Boolean(p.conditionSetUniqueCountEnabled),
      conditionSetUniqueCountMin: p.conditionSetUniqueCountEnabled ? Number(p.conditionSetUniqueCountMin) : null,
      conditionSetUniqueCountSet: p.conditionSetUniqueCountEnabled ? String(p.conditionSetUniqueCountSet || '').trim() : null,
      conditionSetTotalCountEnabled: Boolean(p.conditionSetTotalCountEnabled),
      conditionSetTotalCountMin: p.conditionSetTotalCountEnabled ? Number(p.conditionSetTotalCountMin) : null,
      conditionSetTotalCountSet: p.conditionSetTotalCountEnabled ? String(p.conditionSetTotalCountSet || '').trim() : null,
      conditionOwnsLessThanEnabled: Boolean(p.conditionOwnsLessThanEnabled),
      conditionOwnsLessThanCount: p.conditionOwnsLessThanEnabled ? Number(p.conditionOwnsLessThanCount) : null
    }))
  }

  saving.value = true
  try {
    if (form.id) {
      await $fetch(`/api/admin/czone-searches/${form.id}`, { method: 'PUT', body: payload })
    } else {
      await $fetch('/api/admin/czone-searches', { method: 'POST', body: payload })
    }
    await loadSearches()
    closeModal()
  } catch (err) {
    formError.value = err?.data?.statusMessage || 'Failed to save cZone Search.'
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  if (!confirm('Delete this cZone Search? This cannot be undone.')) return
  try {
    await $fetch(`/api/admin/czone-searches/${row.id}`, { method: 'DELETE' })
    await loadSearches()
  } catch (err) {
    error.value = err
  }
}

let searchDebounce = null
watch(ctoonSearchTerm, (val) => {
  clearTimeout(searchDebounce)
  const term = val.trim()
  if (term.length < 3) {
    ctoonSearchResults.value = []
    searchingCtoons.value = false
    return
  }
  searchingCtoons.value = true
  searchDebounce = setTimeout(async () => {
    try {
      const results = await $fetch('/api/admin/search-ctoons', { query: { q: term } })
      const poolIds = new Set(form.prizePool.map(p => p.ctoonId))
      ctoonSearchResults.value = (Array.isArray(results) ? results : []).filter(r => !poolIds.has(r.id))
    } catch {
      ctoonSearchResults.value = []
    } finally {
      searchingCtoons.value = false
    }
  }, 300)
})

watch(() => form.resetType, (value) => {
  if (value === 'DAILY_AT_RESET') {
    form.cooldownHours = 0
  } else {
    form.dailyCollectLimit = ''
  }
})

watch(() => form.collectionType, (value, oldValue) => {
  if (isSettingForm.value) return
  if (value !== 'CUSTOM_PER_CTOON') return
  if (oldValue === 'CUSTOM_PER_CTOON') return
  for (const row of form.prizePool) {
    if (row.maxCaptures === null || row.maxCaptures === undefined || row.maxCaptures === '') {
      row.maxCaptures = 1
    }
  }
})

function addCtoonToPool(ctoon) {
  if (!form.prizePool.some(p => p.ctoonId === ctoon.id)) {
    form.prizePool.push(initPrizeRow({
      ctoonId: ctoon.id,
      chancePercent: 0,
      maxCaptures: form.collectionType === 'CUSTOM_PER_CTOON' ? 1 : '',
      ctoon
    }))
  }
  ctoonSearchTerm.value = ''
  ctoonSearchResults.value = []
}

watch(showAll, loadSearches)

onMounted(async () => {
  await Promise.all([loadSearches(), loadBackgrounds()])
})
</script>
