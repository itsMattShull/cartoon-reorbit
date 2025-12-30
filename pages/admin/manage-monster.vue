<template>
  <Nav />
  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Manage Barcode Monsters</h1>

    <div class="bg-white rounded-lg shadow-md p-6 max-w-6xl mx-auto">
      <!-- Tabs -->
      <div class="border-b mb-6">
        <nav class="flex gap-4">
          <button class="px-3 py-2 border-b-2" :class="activeTab==='Game Config' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'" @click="activeTab='Game Config'">Game Config</button>
          <button class="px-3 py-2 border-b-2" :class="activeTab==='Monsters' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'" @click="activeTab='Monsters'">Monsters</button>
          <button class="px-3 py-2 border-b-2" :class="activeTab==='AI Monsters' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'" @click="activeTab='AI Monsters'">AI Monsters</button>
          <button class="px-3 py-2 border-b-2" :class="activeTab==='Items' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'" @click="activeTab='Items'">Items</button>
        </nav>
      </div>

      <!-- Game Config -->
      <section v-if="activeTab==='Game Config'" class="space-y-8">
        <div class="text-sm text-gray-600">
          Configure scanning odds and rarity distribution for the active barcode game version. Changes affect future scans immediately.
        </div>

        <!-- Odds -->
        <div>
          <h2 class="text-lg font-semibold mb-2">Scan Outcome Odds</h2>
          <p class="text-sm text-gray-600 mb-3">Odds must sum to 1.00. These control the chance of a scan yielding nothing, an item, or a monster.</p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Odds — Nothing</label>
              <input type="number" class="input" step="0.01" min="0" max="1" v-model.number="oddsNothing" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Odds — Item</label>
              <input type="number" class="input" step="0.01" min="0" max="1" v-model.number="oddsItem" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Odds — Monster</label>
              <input type="number" class="input" step="0.01" min="0" max="1" v-model.number="oddsMonster" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Odds — Battle</label>
              <input type="number" class="input" step="0.01" min="0" max="1" v-model.number="oddsBattle" />
            </div>
          </div>
          <div class="text-xs mt-1" :class="sumOddsOk ? 'text-green-700' : 'text-red-700'">Sum: {{ sumOddsDisplay }}</div>
        </div>

        <!-- Distributions: side-by-side on large screens, stacked on mobile -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Monster Rarity Distribution -->
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 class="text-lg font-semibold mb-2">Monster Rarity Distribution</h2>
            <p class="text-sm text-gray-600 mb-3">Percentages per monster rarity. Values are normalized; higher values increase selection odds when a scan yields a monster.</p>
            <!-- Desktop table -->
            <div class="overflow-x-auto hidden sm:block">
              <table class="min-w-full border-separate border-spacing-y-1">
                <thead>
                  <tr class="text-left text-sm text-gray-600">
                    <th class="px-3 py-2">Rarity</th>
                    <th class="px-3 py-2">Percent</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rarityDisplayOrder" :key="r.key" class="bg-white">
                    <td class="px-3 py-2 font-medium">{{ r.label }}</td>
                    <td class="px-3 py-2 w-48">
                      <div class="flex items-center gap-2">
                        <input type="number" class="input" min="0" max="100" step="1" v-model.number="rarityPercents[r.key]" />
                        <span class="text-sm text-gray-600">%</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Mobile cards -->
            <div class="space-y-3 sm:hidden">
              <div v-for="r in rarityDisplayOrder" :key="r.key" class="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div class="font-semibold text-gray-800 mb-2">{{ r.label }}</div>
                <div class="flex items-center gap-2">
                  <input type="number" class="input" min="0" max="100" step="1" v-model.number="rarityPercents[r.key]" />
                  <span class="text-sm text-gray-600">%</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Item Rarity Distribution -->
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 class="text-lg font-semibold mb-2">Item Rarity Distribution</h2>
            <p class="text-sm text-gray-600 mb-3">Percentages per item rarity. Item selection happens in two steps: pick rarity based on these weights, then pick uniformly among items of that rarity.</p>
            <!-- Desktop table -->
            <div class="overflow-x-auto hidden sm:block">
              <table class="min-w-full border-separate border-spacing-y-1">
                <thead>
                  <tr class="text-left text-sm text-gray-600">
                    <th class="px-3 py-2">Rarity</th>
                    <th class="px-3 py-2">Percent</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="bg-white">
                    <td class="px-3 py-2 font-medium">Crazy Rare</td>
                    <td class="px-3 py-2 w-48"><div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.CrazyRare" /><span class="text-sm text-gray-600">%</span></div></td>
                  </tr>
                  <tr class="bg-white">
                    <td class="px-3 py-2 font-medium">Rare</td>
                    <td class="px-3 py-2 w-48"><div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.Rare" /><span class="text-sm text-gray-600">%</span></div></td>
                  </tr>
                  <tr class="bg-white">
                    <td class="px-3 py-2 font-medium">Common</td>
                    <td class="px-3 py-2 w-48"><div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.Common" /><span class="text-sm text-gray-600">%</span></div></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Mobile cards -->
            <div class="space-y-3 sm:hidden">
              <div class="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div class="font-semibold text-gray-800 mb-2">Crazy Rare</div>
                <div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.CrazyRare" /><span class="text-sm text-gray-600">%</span></div>
              </div>
              <div class="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div class="font-semibold text-gray-800 mb-2">Rare</div>
                <div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.Rare" /><span class="text-sm text-gray-600">%</span></div>
              </div>
              <div class="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div class="font-semibold text-gray-800 mb-2">Common</div>
                <div class="flex items-center gap-2"><input type="number" class="input" min="0" max="100" step="1" v-model.number="itemRarityPercents.Common" /><span class="text-sm text-gray-600">%</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Variance, Decay, Daily Limit & Cooldown -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label class="block text-sm font-medium text-gray-700">Monster Stat Variance</label>
            <input type="number" class="input" min="0" max="50" step="1" v-model.number="variancePct" />
            <p class="text-xs text-gray-500 mt-1">Percent variability applied per monster instance when rolled (e.g., 12 means ±12%).</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Inactivity HP Decay (hours)</label>
            <input type="number" class="input" min="0" max="720" step="1" v-model.number="decayHours" />
            <p class="text-xs text-gray-500 mt-1">Hours until the last-selected monster reaches 0 HP with no activity. Set to 0 to disable.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Daily Scan Limit</label>
            <input type="number" class="input" min="0" max="500" step="1" v-model.number="dailyScanLimit" />
            <p class="text-xs text-gray-500 mt-1">Max scans per user per day. Resets at 8am CST. Set to 0 to disable.</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700">Barcode Cooldown (days)</label>
            <input type="number" class="input" min="0" max="365" step="1" v-model.number="cooldownDays" />
            <p class="text-xs text-gray-500 mt-1">Per-user cooldown per barcode mapping before scanning again grants a result.</p>
          </div>
        </div>

        <div>
          <button class="btn-primary" :disabled="savingCfg || !sumOddsOk" @click="saveConfig">
            <span v-if="!savingCfg">Save</span><span v-else>Saving…</span>
          </button>
        </div>
      </section>

      <!-- Monsters (Species) -->
      <section v-if="activeTab==='Monsters'" class="space-y-6">
        <div class="text-sm text-gray-600">Create, edit, and delete species templates. New species indexes are assigned automatically.</div>

        <!-- Add species toolbar -->
        <div class="flex justify-end">
          <button class="btn-primary" @click="openAddSpeciesModal">Add Species</button>
        </div>

        <!-- Add Species Modal -->
        <transition name="fade">
          <div v-if="showAddSpeciesModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeAddSpeciesModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="addSpeciesTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="addSpeciesTitle" class="text-lg font-semibold">Add Species</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeAddSpeciesModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Species Name</label>
                    <input class="input" placeholder="e.g., Zapling" v-model="newSpecies.name" />
                    <p class="text-xs text-gray-500 mt-1">Display name used in scan results and owned monster lists.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Monster Type</label>
                    <input class="input" placeholder="e.g., Electric" v-model="newSpecies.type" />
                    <p class="text-xs text-gray-500 mt-1">Free-form category (e.g., Fire, Water). Shown to players for flavor and balancing.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="newSpecies.rarity">
                      <option v-for="r in monsterRarities" :key="r.key" :value="r.key">{{ r.label }}</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Affects how often this species is selected when a scan yields a monster. Final odds also depend on the Game Config rarity distribution.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Base Stats</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600">Base HP</label>
                        <input class="input" type="number" min="1" v-model.number="newSpecies.baseHp" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base ATK</label>
                        <input class="input" type="number" min="1" v-model.number="newSpecies.baseAtk" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base DEF</label>
                        <input class="input" type="number" min="1" v-model.number="newSpecies.baseDef" />
                      </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">Players receive per-instance rolled stats based on these values, varied by the configured variance percent.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Images</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Walking</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'walking')" />
                        <p class="text-xs text-gray-500 mt-1">PNG/JPG/GIF. Used for walking animation/frame.</p>
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Standing Still</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'standing')" />
                        <p class="text-xs text-gray-500 mt-1">PNG/JPG/GIF. Used for idle pose.</p>
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Jumping</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onFileChange($event, 'jumping')" />
                        <p class="text-xs text-gray-500 mt-1">PNG/JPG/GIF. Used for jumping animation/frame.</p>
                      </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">All three images are required to create a species.</p>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-2">
                  <button class="px-3 py-2 rounded border" @click="closeAddSpeciesModal">Cancel</button>
                  <button class="btn-primary" :disabled="addingSpecies" @click="confirmAddSpecies">
                    <span v-if="!addingSpecies">Add Species</span>
                    <span v-else>Adding…</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <!-- Edit Species Modal -->
        <transition name="fade">
          <div v-if="showEditSpeciesModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeEditSpeciesModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="editSpeciesTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="editSpeciesTitle" class="text-lg font-semibold">Edit Species</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeEditSpeciesModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Species Name</label>
                    <input class="input" v-model="editSpecies.name" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Monster Type</label>
                    <input class="input" v-model="editSpecies.type" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="editSpecies.rarity">
                      <option v-for="r in monsterRarities" :key="r.key" :value="r.key">{{ r.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Base Stats</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600">Base HP</label>
                        <input class="input" type="number" min="1" v-model.number="editSpecies.baseHp" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base ATK</label>
                        <input class="input" type="number" min="1" v-model.number="editSpecies.baseAtk" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base DEF</label>
                        <input class="input" type="number" min="1" v-model.number="editSpecies.baseDef" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Replace Images (optional)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Walking</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditSpeciesFileChange($event, 'walking')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Standing Still</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditSpeciesFileChange($event, 'standing')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Jumping</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditSpeciesFileChange($event, 'jumping')" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-2">
                  <button class="px-3 py-2 rounded border" @click="closeEditSpeciesModal">Cancel</button>
                  <button class="btn-primary" :disabled="savingSpecies" @click="saveSpecies(editSpeciesIndex)">Save</button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <!-- Desktop table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr class="text-left text-sm text-gray-600">
                <th class="px-3 py-2">Index</th>
                <th class="px-3 py-2">Name</th>
                <th class="px-3 py-2">Type</th>
                <th class="px-3 py-2">Rarity</th>
                <th class="px-3 py-2">Base HP</th>
                <th class="px-3 py-2">Base ATK</th>
                <th class="px-3 py-2">Base DEF</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in species" :key="s.speciesIndex" class="bg-gray-50">
                <td class="px-3 py-2">{{ s.speciesIndex }}</td>
                <td class="px-3 py-2">{{ s.name }}</td>
                <td class="px-3 py-2">{{ s.type }}</td>
                <td class="px-3 py-2 w-48">{{ rarityLabel(s.rarity) }}</td>
                <td class="px-3 py-2 w-28">{{ s.baseHp }}</td>
                <td class="px-3 py-2 w-28">{{ s.baseAtk }}</td>
                <td class="px-3 py-2 w-28">{{ s.baseDef }}</td>
                <td class="px-3 py-2">
                  <div class="flex gap-2">
                    <button class="px-3 py-2 rounded border" @click="startEditSpecies(s)">Edit</button>
                    <button class="px-3 py-2 rounded border border-red-300 text-red-600" @click="removeSpecies(s.speciesIndex)" :disabled="deletingSpecies">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Mobile cards -->
        <div class="space-y-3 sm:hidden">
          <div v-for="s in species" :key="s.speciesIndex" class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="flex justify-between items-center">
              <div class="font-semibold text-gray-800">#{{ s.speciesIndex }} — {{ s.name }}</div>
              <div class="text-sm text-gray-600">{{ rarityLabel(s.rarity) }}</div>
            </div>
            <div class="text-sm text-gray-700">Type: {{ s.type }}</div>
            <div class="text-sm text-gray-700">Stats: HP {{ s.baseHp }} • ATK {{ s.baseAtk }} • DEF {{ s.baseDef }}</div>
            <div class="mt-3 flex gap-2">
              <button class="px-3 py-2 rounded border" @click="startEditSpecies(s)">Edit</button>
              <button class="px-3 py-2 rounded border border-red-300 text-red-600" @click="removeSpecies(s.speciesIndex)">Delete</button>
            </div>
          </div>
        </div>
      </section>

      <!-- AI Monsters -->
      <section v-if="activeTab==='AI Monsters'" class="space-y-6">
        <div class="text-sm text-gray-600">Create, edit, and delete AI monster templates used for battles.</div>

        <div class="flex justify-end">
          <button class="btn-primary" @click="openAddAiMonsterModal">Add AI Monster</button>
        </div>

        <transition name="fade">
          <div v-if="showAddAiMonsterModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeAddAiMonsterModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="addAiMonsterTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="addAiMonsterTitle" class="text-lg font-semibold">Add AI Monster</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeAddAiMonsterModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Name</label>
                    <input class="input" placeholder="e.g., Shockjaw" v-model="newAiMonster.name" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Monster Type</label>
                    <input class="input" placeholder="e.g., Electric" v-model="newAiMonster.type" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="newAiMonster.rarity">
                      <option v-for="r in monsterRarities" :key="r.key" :value="r.key">{{ r.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Base Stats</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600">Base HP</label>
                        <input class="input" type="number" min="1" v-model.number="newAiMonster.baseHp" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base ATK</label>
                        <input class="input" type="number" min="1" v-model.number="newAiMonster.baseAtk" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base DEF</label>
                        <input class="input" type="number" min="1" v-model.number="newAiMonster.baseDef" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Images</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Walking</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onAiMonsterFileChange($event, 'walking')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Standing Still</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onAiMonsterFileChange($event, 'standing')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Jumping</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onAiMonsterFileChange($event, 'jumping')" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-3">
                  <button class="px-4 py-2 rounded border" @click="closeAddAiMonsterModal">Cancel</button>
                  <button class="btn-primary" :disabled="addingAiMonster" @click="confirmAddAiMonster">
                    <span v-if="!addingAiMonster">Create</span><span v-else>Saving…</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <transition name="fade">
          <div v-if="showEditAiMonsterModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeEditAiMonsterModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="editAiMonsterTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="editAiMonsterTitle" class="text-lg font-semibold">Edit AI Monster</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeEditAiMonsterModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Name</label>
                    <input class="input" v-model="editAiMonster.name" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Monster Type</label>
                    <input class="input" v-model="editAiMonster.type" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="editAiMonster.rarity">
                      <option v-for="r in monsterRarities" :key="r.key" :value="r.key">{{ r.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Base Stats</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600">Base HP</label>
                        <input class="input" type="number" min="1" v-model.number="editAiMonster.baseHp" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base ATK</label>
                        <input class="input" type="number" min="1" v-model.number="editAiMonster.baseAtk" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600">Base DEF</label>
                        <input class="input" type="number" min="1" v-model.number="editAiMonster.baseDef" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Replace Images (optional)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Walking</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditAiMonsterFileChange($event, 'walking')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Standing Still</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditAiMonsterFileChange($event, 'standing')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Jumping</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onEditAiMonsterFileChange($event, 'jumping')" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-3">
                  <button class="px-4 py-2 rounded border" @click="closeEditAiMonsterModal">Cancel</button>
                  <button class="btn-primary" :disabled="savingAiMonster" @click="saveAiMonster(editAiMonsterId)">
                    <span v-if="!savingAiMonster">Save</span><span v-else>Saving…</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <div v-if="!aiMonsters.length" class="text-sm text-gray-500">No AI monsters yet.</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div v-for="m in aiMonsters" :key="m.id" class="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="text-lg font-semibold text-gray-800">{{ m.name }}</div>
                <div class="text-sm text-gray-600">{{ m.type }} · {{ rarityLabel(m.rarity) }}</div>
                <div class="text-sm text-gray-600 mt-1">HP {{ m.baseHp }} · ATK {{ m.baseAtk }} · DEF {{ m.baseDef }}</div>
              </div>
              <div class="flex gap-2">
                <button class="px-3 py-2 rounded border border-gray-300 text-gray-700" @click="startEditAiMonster(m)">Edit</button>
                <button class="px-3 py-2 rounded border border-red-300 text-red-600" @click="removeAiMonster(m.id)">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Items -->
      <section v-if="activeTab==='Items'" class="space-y-6">
        <div class="text-sm text-gray-600">Create, edit, and delete items.</div>

        <!-- Add item toolbar -->
        <div class="flex justify-end">
          <button class="btn-primary" @click="openAddItemModal">Add Item</button>
        </div>

        <!-- Add Item Modal -->
        <transition name="fade">
          <div v-if="showAddItemModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeAddItemModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="addItemTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="addItemTitle" class="text-lg font-semibold">Add Item</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeAddItemModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Item Code</label>
                    <input class="input" type="number" min="1" placeholder="e.g., 1" v-model.number="newItem.code" />
                    <p class="text-xs text-gray-500 mt-1">Unique per active config. Used to identify items; duplicates are blocked.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Item Name</label>
                    <input class="input" placeholder="e.g., Power Crystal" v-model="newItem.name" />
                    <p class="text-xs text-gray-500 mt-1">Displayed to players when they receive an item from a scan.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="newItem.rarity">
                      <option v-for="r in itemRarities" :key="r" :value="r">{{ r }}</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Rarity of the item to determine chances.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Power</label>
                    <input class="input" type="number" min="0" placeholder="e.g., 25" v-model.number="newItem.power" />
                    <p class="text-xs text-gray-500 mt-1">Stat stored with the item and included in scan results. Non-negative integer.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Effect</label>
                    <select class="input" v-model="newItem.effect">
                      <option v-for="e in itemEffects" :key="e" :value="e">{{ e }}</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Defines what the item does when used.</p>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Images</label>
                    <p class="text-xs text-gray-500 mb-2">Upload up to three images. At least one is required.</p>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 0</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onNewItemFileChange($event, 'image0')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 1 (optional)</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onNewItemFileChange($event, 'image1')" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 2 (optional)</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="onNewItemFileChange($event, 'image2')" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-2">
                  <button class="px-3 py-2 rounded border" @click="closeAddItemModal">Cancel</button>
                  <button class="btn-primary" :disabled="addingItem" @click="confirmAddItem">
                    <span v-if="!addingItem">Add Item</span>
                    <span v-else>Adding…</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <!-- Edit Item Modal -->
        <transition name="fade">
          <div v-if="showEditItemModal" class="fixed inset-0 z-50">
            <div class="absolute inset-0 bg-black/40" @click="closeEditItemModal" />
            <div class="absolute inset-0 flex items-center justify-center p-4">
              <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-xl flex flex-col" role="dialog" aria-modal="true" aria-labelledby="editItemTitle">
                <div class="px-6 py-4 border-b flex items-center justify-between">
                  <h3 id="editItemTitle" class="text-lg font-semibold">Edit Item</h3>
                  <button class="text-gray-500 hover:text-gray-700" @click="closeEditItemModal" aria-label="Close">✕</button>
                </div>
                <div class="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Item Code</label>
                    <input class="input" type="number" min="1" v-model.number="editItem.code" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Item Name</label>
                    <input class="input" v-model="editItem.name" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Rarity</label>
                    <select class="input" v-model="editItem.rarity">
                      <option v-for="r in itemRarities" :key="r" :value="r">{{ r }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Power</label>
                    <input class="input" type="number" min="0" v-model.number="editItem.power" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Effect</label>
                    <select class="input" v-model="editItem.effect">
                      <option v-for="e in itemEffects" :key="e" :value="e">{{ e }}</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700">Replace Images (optional)</label>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 0</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="e => editItemFiles.image0 = e?.target?.files?.[0] || null" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 1</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="e => editItemFiles.image1 = e?.target?.files?.[0] || null" />
                      </div>
                      <div>
                        <label class="block text-xs text-gray-600 mb-1">Image 2</label>
                        <input class="input" type="file" accept="image/png,image/jpeg,image/jpg,image/gif" @change="e => editItemFiles.image2 = e?.target?.files?.[0] || null" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="px-6 py-4 border-t flex justify-end gap-2">
                  <button class="px-3 py-2 rounded border" @click="closeEditItemModal">Cancel</button>
                  <button class="btn-primary" :disabled="savingItem" @click="saveItem(editItemId)">Save</button>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <!-- Desktop table -->
        <div class="overflow-x-auto hidden sm:block">
          <table class="min-w-full border-separate border-spacing-y-1">
            <thead>
              <tr class="text-left text-sm text-gray-600">
                <th class="px-3 py-2">Code</th>
                <th class="px-3 py-2">Name</th>
                <th class="px-3 py-2">Rarity</th>
                <th class="px-3 py-2">Power</th>
                <th class="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in items" :key="it.id" class="bg-gray-50">
                <td class="px-3 py-2 w-24">{{ it.code }}</td>
                <td class="px-3 py-2">{{ it.name }}</td>
                <td class="px-3 py-2 w-40">{{ it.rarity }}</td>
                <td class="px-3 py-2 w-28">{{ it.power }}</td>
                <td class="px-3 py-2">
                  <div class="flex gap-2">
                    <button class="px-3 py-2 rounded border" @click="startEditItem(it)">Edit</button>
                    <button class="px-3 py-2 rounded border border-red-300 text-red-600" @click="removeItem(it.id)" :disabled="deletingItem">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Mobile cards -->
        <div class="space-y-3 sm:hidden">
          <div v-for="it in items" :key="it.id" class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div class="flex justify-between items-center">
              <div class="font-semibold text-gray-800">#{{ it.code }} — {{ it.name }}</div>
              <div class="text-sm text-gray-600">{{ it.rarity }}</div>
            </div>
            <div class="text-sm text-gray-700">Power: {{ it.power }}</div>
            <div class="mt-3 flex gap-2">
              <button class="px-3 py-2 rounded border" @click="startEditItem(it)">Edit</button>
              <button class="px-3 py-2 rounded border border-red-300 text-red-600" @click="removeItem(it.id)">Delete</button>
            </div>
          </div>
        </div>
      </section>

      <div v-if="toast" :class="['fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded', toast.type==='error'?'bg-red-100 text-red-700':'bg-green-100 text-green-700']">{{ toast.msg }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({ middleware: ['auth','admin'], layout: 'default' })

const activeTab = ref('Game Config')

// Toast
const toast = ref(null)
function showToast(type, msg) { toast.value = { type, msg }; setTimeout(() => { toast.value = null }, 2500) }

// Game Config state
  const oddsNothing = ref(0.20)
  const oddsItem    = ref(0.30)
  const oddsMonster = ref(0.50)
  const oddsBattle  = ref(0.00)
  const variancePct = ref(12)
  const decayHours = ref(48)
  const dailyScanLimit = ref(20)
  const cooldownDays = ref(7)
  const rarityPercents = reactive({ Common: 60, Uncommon: 25, Rare: 10, VeryRare: 4, CrazyRare: 1 })
  const itemRarityPercents = reactive({ Common: 70, Rare: 25, CrazyRare: 5 })

const rarityDisplayOrder = [
  { key: 'CrazyRare', label: 'Crazy Rare' },
  { key: 'VeryRare',  label: 'Very Rare' },
  { key: 'Rare',      label: 'Rare' },
  { key: 'Uncommon',  label: 'Uncommon' },
  { key: 'Common',    label: 'Common' }
]

const sumOdds = computed(() => (Number(oddsNothing.value) || 0) + (Number(oddsItem.value) || 0) + (Number(oddsMonster.value) || 0) + (Number(oddsBattle.value) || 0))
const sumOddsDisplay = computed(() => sumOdds.value.toFixed(2))
const sumOddsOk = computed(() => Math.abs(sumOdds.value - 1) < 1e-6)

const savingCfg = ref(false)
  async function loadConfig() {
    try {
      const cfg = await $fetch('/api/admin/barcode-config')
    if (cfg?.oddsNothing != null) oddsNothing.value = Number(cfg.oddsNothing)
    if (cfg?.oddsItem    != null) oddsItem.value    = Number(cfg.oddsItem)
    if (cfg?.oddsMonster != null) oddsMonster.value = Number(cfg.oddsMonster)
    if (cfg?.oddsBattle  != null) oddsBattle.value  = Number(cfg.oddsBattle)
    if (cfg?.monsterStatVariancePct != null) variancePct.value = Math.round(Number(cfg.monsterStatVariancePct) * 100)
    if (cfg?.monsterInactivityDecayHours != null) decayHours.value = Number(cfg.monsterInactivityDecayHours)
    if (cfg?.monsterDailyScanLimit != null) dailyScanLimit.value = Number(cfg.monsterDailyScanLimit)
    if (cfg?.barcodeCooldownDays != null) cooldownDays.value = Number(cfg.barcodeCooldownDays)
      const c = cfg?.monsterRarityChances || {}
      rarityPercents.Common    = Number(c.Common ?? c.COMMON ?? rarityPercents.Common)
      rarityPercents.Uncommon  = Number(c.Uncommon ?? c.UNCOMMON ?? rarityPercents.Uncommon)
      rarityPercents.Rare      = Number(c.Rare ?? c.RARE ?? rarityPercents.Rare)
      rarityPercents.VeryRare  = Number(c.VeryRare ?? c.VERY_RARE ?? rarityPercents.VeryRare)
      rarityPercents.CrazyRare = Number(c.CrazyRare ?? c.CRAZY_RARE ?? rarityPercents.CrazyRare)

      const ic = cfg?.itemRarityChances || {}
      itemRarityPercents.Common    = Number(ic.Common ?? ic.COMMON ?? itemRarityPercents.Common)
      itemRarityPercents.Rare      = Number(ic.Rare ?? ic.RARE ?? itemRarityPercents.Rare)
      itemRarityPercents.CrazyRare = Number(ic.CrazyRare ?? ic.CRAZY_RARE ?? itemRarityPercents.CrazyRare)
    } catch (e) {
      console.error('Failed to load barcode config', e)
    }
  }

async function saveConfig() {
  if (!sumOddsOk.value) return
  savingCfg.value = true
  try {
    await $fetch('/api/admin/barcode-config', {
      method: 'POST',
      body: {
        oddsNothing: Number(oddsNothing.value),
        oddsItem: Number(oddsItem.value),
        oddsMonster: Number(oddsMonster.value),
        oddsBattle: Number(oddsBattle.value),
        monsterRarityChances: { ...rarityPercents },
        itemRarityChances: { ...itemRarityPercents },
        monsterStatVariancePct: Number(variancePct.value), // percent 0..50
        monsterInactivityDecayHours: Number(decayHours.value),
        monsterDailyScanLimit: Number(dailyScanLimit.value),
        barcodeCooldownDays: Number(cooldownDays.value)
      }
    })
    showToast('ok', 'Game config saved')
  } catch (e) {
    console.error(e)
    showToast('error', e?.statusMessage || 'Save failed')
  } finally {
    savingCfg.value = false
  }
}

onMounted(loadConfig)

// Species
const species = ref([])
const addingSpecies = ref(false)
const showAddSpeciesModal = ref(false)
const showEditSpeciesModal = ref(false)
const savingSpecies = ref(false)
const deletingSpecies = ref(false)

const monsterRarities = [
  { key: 'COMMON', label: 'Common' },
  { key: 'UNCOMMON', label: 'Uncommon' },
  { key: 'RARE', label: 'Rare' },
  { key: 'VERY_RARE', label: 'Very Rare' },
  { key: 'CRAZY_RARE', label: 'Crazy Rare' }
]

const newSpecies = reactive({ name: '', type: '', rarity: 'COMMON', baseHp: 10, baseAtk: 5, baseDef: 5 })
const newSpeciesFiles = reactive({ walking: null, standing: null, jumping: null })
let editSpeciesIndex = ref(null)
const editSpecies = reactive({ name: '', type: '', rarity: 'COMMON', baseHp: 1, baseAtk: 1, baseDef: 1 })

// Prefill base stats by rarity
const rarityBasePresets = {
  COMMON:     { hp: 50,  atk: 10, def: 10 },
  UNCOMMON:   { hp: 60,  atk: 12, def: 12 },
  RARE:       { hp: 75,  atk: 15, def: 15 },
  VERY_RARE:  { hp: 90,  atk: 18, def: 18 },
  CRAZY_RARE: { hp: 110, atk: 22, def: 22 },
}

function applyPresetToNew(rKey) {
  const p = rarityBasePresets[rKey] || rarityBasePresets.COMMON
  newSpecies.baseHp = p.hp
  newSpecies.baseAtk = p.atk
  newSpecies.baseDef = p.def
}
function applyPresetToEdit(rKey) {
  const p = rarityBasePresets[rKey] || rarityBasePresets.COMMON
  editSpecies.baseHp = p.hp
  editSpecies.baseAtk = p.atk
  editSpecies.baseDef = p.def
}

watch(() => newSpecies.rarity, (r) => applyPresetToNew(r))
watch(() => editSpecies.rarity, (r) => { if (editSpeciesIndex.value != null) applyPresetToEdit(r) })

function rarityLabel(key) {
  const m = monsterRarities.find(r => r.key === key)
  return m ? m.label : key
}

async function loadSpecies() {
  try {
    const res = await $fetch('/api/admin/barcode-species')
    species.value = Array.isArray(res?.species) ? res.species : []
  } catch (e) { console.error('Failed to load species', e) }
}

function openAddSpeciesModal() {
  Object.assign(newSpecies, { name: '', type: '', rarity: 'COMMON', baseHp: 10, baseAtk: 5, baseDef: 5 })
  Object.assign(newSpeciesFiles, { walking: null, standing: null, jumping: null })
  // apply preset for default rarity
  applyPresetToNew(newSpecies.rarity)
  showAddSpeciesModal.value = true
}
function closeAddSpeciesModal() { showAddSpeciesModal.value = false }
async function confirmAddSpecies() {
  addingSpecies.value = true
  try {
    if (!newSpeciesFiles.walking || !newSpeciesFiles.standing || !newSpeciesFiles.jumping) {
      showToast('error', 'Please upload Walking, Standing Still, and Jumping images')
      return
    }
    const fd = new FormData()
    fd.append('name', newSpecies.name)
    fd.append('type', newSpecies.type)
    fd.append('rarity', newSpecies.rarity)
    fd.append('baseHp', String(newSpecies.baseHp))
    fd.append('baseAtk', String(newSpecies.baseAtk))
    fd.append('baseDef', String(newSpecies.baseDef))
    fd.append('walking', newSpeciesFiles.walking)
    fd.append('standingstill', newSpeciesFiles.standing)
    fd.append('jumping', newSpeciesFiles.jumping)
    const res = await $fetch('/api/admin/barcode-species', { method: 'POST', body: fd })
    if (res?.species) species.value.push(res.species)
    showToast('ok', 'Species added')
    closeAddSpeciesModal()
  } catch (e) { showToast('error', e?.statusMessage || 'Add failed') }
  finally { addingSpecies.value = false }
}

function onFileChange(e, which) {
  const file = e?.target?.files?.[0] || null
  if (!file) return
  if (which === 'walking') newSpeciesFiles.walking = file
  else if (which === 'standing') newSpeciesFiles.standing = file
  else if (which === 'jumping') newSpeciesFiles.jumping = file
}

function startEditSpecies(s) {
  editSpeciesIndex.value = s.speciesIndex
  Object.assign(editSpecies, s)
  // reset optional edit file selections
  if (typeof editSpeciesFiles !== 'undefined') {
    Object.assign(editSpeciesFiles, { walking: null, standing: null, jumping: null })
  }
  showEditSpeciesModal.value = true
}
function closeEditSpeciesModal() { showEditSpeciesModal.value = false; editSpeciesIndex.value = null }
async function saveSpecies(index) {
  savingSpecies.value = true
  try {
    const fd = new FormData()
    fd.append('name', editSpecies.name)
    fd.append('type', editSpecies.type)
    fd.append('rarity', editSpecies.rarity)
    fd.append('baseHp', String(editSpecies.baseHp))
    fd.append('baseAtk', String(editSpecies.baseAtk))
    fd.append('baseDef', String(editSpecies.baseDef))
    if (editSpeciesFiles?.walking) fd.append('walking', editSpeciesFiles.walking)
    if (editSpeciesFiles?.standing) fd.append('standingstill', editSpeciesFiles.standing)
    if (editSpeciesFiles?.jumping) fd.append('jumping', editSpeciesFiles.jumping)
    const res = await $fetch(`/api/admin/barcode-species/${index}`, { method: 'PUT', body: fd })
    const i = species.value.findIndex(s => s.speciesIndex === index)
    if (i !== -1) species.value[i] = res.species
    editSpeciesIndex.value = null
    showEditSpeciesModal.value = false
    showToast('ok', 'Species saved')
  } catch (e) { showToast('error', e?.statusMessage || 'Save failed') }
  finally { savingSpecies.value = false }
}
// helper for editing species images
const editSpeciesFiles = reactive ? reactive({ walking: null, standing: null, jumping: null }) : { walking: null, standing: null, jumping: null }
function onEditSpeciesFileChange(e, which) {
  const file = e?.target?.files?.[0] || null
  if (!file) return
  if (which === 'walking') editSpeciesFiles.walking = file
  else if (which === 'standing') editSpeciesFiles.standing = file
  else if (which === 'jumping') editSpeciesFiles.jumping = file
}
async function removeSpecies(index) {
  if (!confirm('Delete this species?')) return
  deletingSpecies.value = true
  try {
    await $fetch(`/api/admin/barcode-species/${index}`, { method: 'DELETE' })
    species.value = species.value.filter(s => s.speciesIndex !== index)
    showToast('ok', 'Species deleted')
  } catch (e) { showToast('error', e?.statusMessage || 'Delete failed') }
  finally { deletingSpecies.value = false }
}

// AI Monsters
const aiMonsters = ref([])
const addingAiMonster = ref(false)
const savingAiMonster = ref(false)
const deletingAiMonster = ref(false)
const showAddAiMonsterModal = ref(false)
const showEditAiMonsterModal = ref(false)

const newAiMonster = reactive({ name: '', type: '', rarity: 'COMMON', baseHp: 10, baseAtk: 5, baseDef: 5 })
const newAiMonsterFiles = reactive({ walking: null, standing: null, jumping: null })
const editAiMonsterId = ref(null)
const editAiMonster = reactive({ name: '', type: '', rarity: 'COMMON', baseHp: 1, baseAtk: 1, baseDef: 1 })
const editAiMonsterFiles = reactive({ walking: null, standing: null, jumping: null })

function applyPresetToNewAi(rKey) {
  const p = rarityBasePresets[rKey] || rarityBasePresets.COMMON
  newAiMonster.baseHp = p.hp
  newAiMonster.baseAtk = p.atk
  newAiMonster.baseDef = p.def
}
function applyPresetToEditAi(rKey) {
  const p = rarityBasePresets[rKey] || rarityBasePresets.COMMON
  editAiMonster.baseHp = p.hp
  editAiMonster.baseAtk = p.atk
  editAiMonster.baseDef = p.def
}

watch(() => newAiMonster.rarity, (r) => applyPresetToNewAi(r))
watch(() => editAiMonster.rarity, (r) => { if (editAiMonsterId.value) applyPresetToEditAi(r) })

async function loadAiMonsters() {
  try {
    const res = await $fetch('/api/admin/ai-monsters')
    aiMonsters.value = Array.isArray(res?.monsters) ? res.monsters : []
  } catch (e) { console.error('Failed to load AI monsters', e) }
}

function openAddAiMonsterModal() {
  Object.assign(newAiMonster, { name: '', type: '', rarity: 'COMMON', baseHp: 10, baseAtk: 5, baseDef: 5 })
  Object.assign(newAiMonsterFiles, { walking: null, standing: null, jumping: null })
  applyPresetToNewAi(newAiMonster.rarity)
  showAddAiMonsterModal.value = true
}
function closeAddAiMonsterModal() { showAddAiMonsterModal.value = false }

function onAiMonsterFileChange(e, which) {
  const file = e?.target?.files?.[0] || null
  if (!file) return
  if (which === 'walking') newAiMonsterFiles.walking = file
  else if (which === 'standing') newAiMonsterFiles.standing = file
  else if (which === 'jumping') newAiMonsterFiles.jumping = file
}

async function confirmAddAiMonster() {
  addingAiMonster.value = true
  try {
    if (!newAiMonsterFiles.walking || !newAiMonsterFiles.standing || !newAiMonsterFiles.jumping) {
      showToast('error', 'Please upload Walking, Standing Still, and Jumping images')
      return
    }
    const fd = new FormData()
    fd.append('name', newAiMonster.name)
    fd.append('type', newAiMonster.type)
    fd.append('rarity', newAiMonster.rarity)
    fd.append('baseHp', String(newAiMonster.baseHp))
    fd.append('baseAtk', String(newAiMonster.baseAtk))
    fd.append('baseDef', String(newAiMonster.baseDef))
    fd.append('walking', newAiMonsterFiles.walking)
    fd.append('standingstill', newAiMonsterFiles.standing)
    fd.append('jumping', newAiMonsterFiles.jumping)
    const res = await $fetch('/api/admin/ai-monsters', { method: 'POST', body: fd })
    if (res?.monster) aiMonsters.value.unshift(res.monster)
    showToast('ok', 'AI monster added')
    closeAddAiMonsterModal()
  } catch (e) { showToast('error', e?.statusMessage || 'Add failed') }
  finally { addingAiMonster.value = false }
}

function startEditAiMonster(m) {
  editAiMonsterId.value = m.id
  Object.assign(editAiMonster, m)
  Object.assign(editAiMonsterFiles, { walking: null, standing: null, jumping: null })
  showEditAiMonsterModal.value = true
}
function closeEditAiMonsterModal() { showEditAiMonsterModal.value = false; editAiMonsterId.value = null }

function onEditAiMonsterFileChange(e, which) {
  const file = e?.target?.files?.[0] || null
  if (!file) return
  if (which === 'walking') editAiMonsterFiles.walking = file
  else if (which === 'standing') editAiMonsterFiles.standing = file
  else if (which === 'jumping') editAiMonsterFiles.jumping = file
}

async function saveAiMonster(id) {
  if (!id) return
  savingAiMonster.value = true
  try {
    const fd = new FormData()
    fd.append('name', editAiMonster.name)
    fd.append('type', editAiMonster.type)
    fd.append('rarity', editAiMonster.rarity)
    fd.append('baseHp', String(editAiMonster.baseHp))
    fd.append('baseAtk', String(editAiMonster.baseAtk))
    fd.append('baseDef', String(editAiMonster.baseDef))
    if (editAiMonsterFiles.walking) fd.append('walking', editAiMonsterFiles.walking)
    if (editAiMonsterFiles.standing) fd.append('standingstill', editAiMonsterFiles.standing)
    if (editAiMonsterFiles.jumping) fd.append('jumping', editAiMonsterFiles.jumping)
    const res = await $fetch(`/api/admin/ai-monsters/${id}`, { method: 'PUT', body: fd })
    const i = aiMonsters.value.findIndex(m => m.id === id)
    if (i !== -1) aiMonsters.value[i] = res.monster
    showToast('ok', 'AI monster saved')
    closeEditAiMonsterModal()
  } catch (e) { showToast('error', e?.statusMessage || 'Save failed') }
  finally { savingAiMonster.value = false }
}

async function removeAiMonster(id) {
  if (!confirm('Delete this AI monster?')) return
  deletingAiMonster.value = true
  try {
    await $fetch(`/api/admin/ai-monsters/${id}`, { method: 'DELETE' })
    aiMonsters.value = aiMonsters.value.filter(m => m.id !== id)
    showToast('ok', 'AI monster deleted')
  } catch (e) { showToast('error', e?.statusMessage || 'Delete failed') }
  finally { deletingAiMonster.value = false }
}

// Items
const items = ref([])
const itemRarities = ['COMMON','RARE','CRAZY_RARE']
const itemEffects = ['HEAL']
const newItem = reactive({ code: 1, name: '', rarity: 'COMMON', power: 0, effect: 'HEAL' })
const newItemFiles = reactive({ image0: null, image1: null, image2: null })
let editItemId = ref(null)
const editItem = reactive({ code: 1, name: '', rarity: 'COMMON', power: 0, effect: 'HEAL' })
const editItemFiles = reactive({ image0: null, image1: null, image2: null })
const addingItem = ref(false)
const savingItem = ref(false)
const deletingItem = ref(false)
const showAddItemModal = ref(false)
const showEditItemModal = ref(false)

async function loadItems() {
  try {
    const res = await $fetch('/api/admin/barcode-items')
    items.value = Array.isArray(res?.items) ? res.items : []
  } catch (e) { console.error('Failed to load items', e) }
}
function openAddItemModal() {
  Object.assign(newItem, { code: 1, name: '', rarity: 'COMMON', power: 0, effect: 'HEAL' })
  Object.assign(newItemFiles, { image0: null, image1: null, image2: null })
  showAddItemModal.value = true
}
function closeAddItemModal() { showAddItemModal.value = false }
async function confirmAddItem() {
  addingItem.value = true
  try {
    if (!newItemFiles.image0 && !newItemFiles.image1 && !newItemFiles.image2) {
      showToast('error', 'Please upload at least one image')
      return
    }
    const fd = new FormData()
    fd.append('code', String(newItem.code))
    fd.append('name', newItem.name)
    fd.append('rarity', newItem.rarity)
    fd.append('power', String(newItem.power))
    fd.append('effect', newItem.effect)
    if (newItemFiles.image0) fd.append('image0', newItemFiles.image0)
    if (newItemFiles.image1) fd.append('image1', newItemFiles.image1)
    if (newItemFiles.image2) fd.append('image2', newItemFiles.image2)
    const res = await $fetch('/api/admin/barcode-items', { method: 'POST', body: fd })
    if (res?.item) items.value.push(res.item)
    showToast('ok', 'Item added')
    closeAddItemModal()
  } catch (e) { showToast('error', e?.statusMessage || 'Add failed') }
  finally { addingItem.value = false }
}
function onNewItemFileChange(e, which) {
  const file = e?.target?.files?.[0] || null
  if (!file) return
  newItemFiles[which] = file
}
function startEditItem(it) {
  editItemId.value = it.id
  Object.assign(editItem, it)
  if (!editItem.effect) editItem.effect = 'HEAL'
  Object.assign(editItemFiles, { image0: null, image1: null, image2: null })
  showEditItemModal.value = true
}
function closeEditItemModal() { showEditItemModal.value = false; editItemId.value = null }
async function saveItem(id) {
  savingItem.value = true
  try {
    const fd = new FormData()
    fd.append('code', String(editItem.code))
    fd.append('name', editItem.name)
    fd.append('rarity', editItem.rarity)
    fd.append('power', String(editItem.power))
    fd.append('effect', editItem.effect)
    if (editItemFiles.image0) fd.append('image0', editItemFiles.image0)
    if (editItemFiles.image1) fd.append('image1', editItemFiles.image1)
    if (editItemFiles.image2) fd.append('image2', editItemFiles.image2)
    const res = await $fetch(`/api/admin/barcode-items/${id}`, { method: 'PUT', body: fd })
    const i = items.value.findIndex(it => it.id === id)
    if (i !== -1) items.value[i] = res.item
    editItemId.value = null
    showEditItemModal.value = false
    showToast('ok', 'Item saved')
  } catch (e) { showToast('error', e?.statusMessage || 'Save failed') }
  finally { savingItem.value = false }
}
async function removeItem(id) {
  if (!confirm('Delete this item?')) return
  deletingItem.value = true
  try {
    await $fetch(`/api/admin/barcode-items/${id}`, { method: 'DELETE' })
    items.value = items.value.filter(it => it.id !== id)
    showToast('ok', 'Item deleted')
  } catch (e) { showToast('error', e?.statusMessage || 'Delete failed') }
  finally { deletingItem.value = false }
}

onMounted(async () => { await Promise.all([loadConfig(), loadSpecies(), loadAiMonsters(), loadItems()]) })
</script>

<style scoped>
.btn-primary{ background-color:#6366F1; color:#fff; padding:.5rem 1.25rem; border-radius:.375rem }
.btn-primary:disabled{ opacity:.5 }
.input { margin-top: .25rem; width: 100%; border: 1px solid #D1D5DB; border-radius: .375rem; padding: .5rem; outline: none }
.input:focus { border-color: #6366F1; box-shadow: 0 0 0 1px #6366F1 }
</style>
