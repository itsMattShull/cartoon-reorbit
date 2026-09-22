<template>
  <div class="bg-gray-50 text-xs">
    <div class="px-2 py-2">

      <div class="max-w-2xl mx-auto bg-white rounded-lg shadow p-3">
        <h1 class="text-base font-semibold mb-3">Add New cToon</h1>

        <form @submit.prevent="submitForm" class="space-y-3">

          <!-- ── Media ─────────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Media</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">The image and (optional) sound that represent this cToon in the c-mart and inventory.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Upload Image (PNG or GIF)</label>
              <input type="file" accept="image/png,image/gif" @change="handleFile" required class="text-xs" />
              <p class="text-[11px] text-gray-500">This image will represent the cToon visually. PNG or GIF only.</p>
              <p v-if="errors.image" class="text-red-600 text-[11px] mt-1">{{ errors.image }}</p>
              <div v-if="duplicateStatus !== 'idle'" class="mt-1">
                <p v-if="duplicateStatus === 'checking'" class="text-[11px] text-gray-500">Checking for duplicates...</p>
                <p v-else-if="duplicateStatus === 'error'" class="text-[11px] text-red-600">{{ duplicateError }}</p>
                <div v-else-if="duplicateMatch" class="border rounded-md p-2 bg-amber-50">
                  <p class="text-[11px] text-amber-700 font-medium">Possible duplicate found</p>
                  <div class="flex items-center gap-3 mt-2">
                    <img
                      v-if="duplicateMatch.ctoon && duplicateMatch.ctoon.assetPath"
                      :src="duplicateMatch.ctoon.assetPath"
                      alt="Possible duplicate"
                      class="w-20 h-20 object-contain border rounded bg-white"
                    />
                    <div class="text-[11px]">
                      <p class="font-medium">{{ duplicateMatch.ctoon?.name || 'Unknown cToon' }}</p>
                      <p class="text-gray-600">
                        pHash distance: {{ duplicateMatch.phashDist }}, dHash distance: {{ duplicateMatch.dhashDist }}
                      </p>
                    </div>
                  </div>
                </div>
                <p v-else class="text-[11px] text-green-600">No duplicates found.</p>
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Upload cToon Sound (optional)</label>
              <input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg" @change="handleSoundFile" class="text-xs" />
              <p class="text-[11px] text-gray-500">MP3, WAV, or OGG. Plays when the cToon info modal is opened.</p>
              <p v-if="errors.sound" class="text-red-600 text-[11px] mt-1">{{ errors.sound }}</p>
              <p v-if="soundFile" class="text-[11px] text-green-600 mt-1">Selected: {{ soundFile.name }}</p>
            </div>
          </section>

          <!-- ── Identity & Classification ────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Identity &amp; Classification</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">What this cToon is called and how it's grouped/priced by rarity.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Type</label>
              <input type="text" v-model="type" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              <p class="text-[11px] text-gray-500">Automatically determined from uploaded file.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Rarity</label>
              <select v-model="rarity" required class="border rounded-md px-2 py-1.5 text-sm bg-white">
                <option disabled value="">Select rarity</option>
                <option v-for="opt in rarityOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
              <p class="text-[11px] text-gray-500">Choose the rarity tier for this cToon. Drives the default price, quantity, and c-mart placement below.</p>
              <p v-if="errors.rarity" class="text-red-600 text-[11px] mt-1">{{ errors.rarity }}</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">cMoon (optional)</label>
              <CtoonCMoonSelect v-model="cMoonId" />
              <p class="text-[11px] text-gray-500">If set, this cToon's modal (outside cMart/Auction) is redesigned in this cMoon's colors, with a link to its cMoon page.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Name</label>
              <input v-model="name" type="text" required class="border rounded-md px-2 py-1.5 text-sm" placeholder="Enter cToon name" />
              <p class="text-[11px] text-gray-500">The display name for this cToon.</p>
              <p v-if="errors.name" class="text-red-600 text-[11px] mt-1">{{ errors.name }}</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Series</label>
              <input v-model="series" list="series-list" required class="border rounded-md px-2 py-1.5 text-sm" />
              <datalist v-if="series.length >= 3" id="series-list">
                <option v-for="opt in filteredSeriesOptions" :key="opt" :value="opt" />
              </datalist>
              <p class="text-[11px] text-gray-500">Used to group similar cToons. Choose from existing or enter a new one.</p>
              <p v-if="errors.series" class="text-red-600 text-[11px] mt-1">{{ errors.series }}</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Set</label>
              <input v-model="set" list="sets-list" required class="border rounded-md px-2 py-1.5 text-sm" />
              <datalist v-if="set.length >= 3" id="sets-list">
                <option v-for="opt in filteredSetsOptions" :key="opt" :value="opt" />
              </datalist>
              <p class="text-[11px] text-gray-500">Which collectible set this cToon belongs to. Choose from existing or enter a new one.</p>
            </div>
          </section>

          <!-- ── Pricing ───────────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Pricing</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Point cost to mint/purchase this cToon.</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Price</label>
              <input type="number" v-model.number="price" class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">Defaults based on rarity, but you can adjust it here.</p>
            </div>
          </section>

          <!-- ── Availability & Mint Limits ───────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Availability &amp; Mint Limits</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">When this cToon goes live, how many can be minted, and where it can be obtained.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Release Date</label>
              <input v-model="releaseDate" type="datetime-local" required class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">Must be set in the future. Determines when the cToon becomes available.</p>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint Limit</label>
              <select v-model="mintLimitType" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                <option value="defined">Defined Number Limit</option>
                <option value="timeBased">Time Based Limit</option>
              </select>
              <p class="text-[11px] text-gray-500">
                <template v-if="mintLimitType === 'defined'">Set a fixed quantity. cToon sells out when all are minted.</template>
                <template v-else>Allow unlimited minting until the Mint End Date, then cap based on demand.</template>
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3" v-if="mintLimitType === 'defined'">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Total Quantity</label>
                <input v-model.number="totalQuantity" type="number" min="1" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[11px] text-gray-500">Maximum number that can be minted. Leave blank for unlimited.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Quantity</label>
                <input v-model.number="initialQuantity" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[11px] text-gray-500">Number of First Editions available. Must be ≤ total quantity.</p>
              </div>
            </div>

            <div v-if="mintLimitType === 'timeBased'" class="flex flex-col gap-1">
              <label class="text-xs font-medium">Mint End Date/Time (CST)</label>
              <input v-model="mintEndDate" type="datetime-local" required class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">
                Minting will be open until this date/time, then the quantity will be capped.
              </p>
              <p v-if="mintEndDateLocal" class="text-[11px] text-blue-600 mt-1">
                (Your time: {{ mintEndDateLocal }})
              </p>
            </div>

            <div v-if="mintLimitType === 'timeBased'" class="border rounded-md bg-indigo-50 p-3 space-y-2">
              <div>
                <h3 class="text-xs font-semibold text-gray-800">Purchase Limit Override
                  <span class="text-[11px] font-normal text-gray-500 ml-1">— optional, overrides the rarity default from Global Settings</span>
                </h3>
                <p class="text-[11px] text-gray-500 mt-1">Leave either field blank to use the rarity default. Window blank = full release window.</p>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Limit Count</label>
                  <input
                    type="number"
                    min="1"
                    :value="timeBasedLimitCountStr"
                    @input="timeBasedLimitCountStr = $event.target.value"
                    placeholder="Use rarity default"
                    class="border rounded-md px-2 py-1.5 text-sm"
                  />
                  <p class="text-[11px] text-gray-500">Max purchases per user.</p>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-medium">Window (days)</label>
                  <input
                    type="number"
                    min="1"
                    :value="timeBasedLimitWindowDaysStr"
                    @input="timeBasedLimitWindowDaysStr = $event.target.value"
                    placeholder="Full duration"
                    class="border rounded-md px-2 py-1.5 text-sm"
                  />
                  <p class="text-[11px] text-gray-500">Rolling window. Blank = full release window.</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3" v-if="schedule.initialQty != null && schedule.finalAtDisplay">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Release %</label>
                <input :value="releasePercent + '%'" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Initial Release Qty</label>
                <input :value="schedule.initialQty" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Final Release At (CST/CDT)</label>
                <input :value="schedule.finalAtDisplay" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Final Release Qty</label>
                <input :value="schedule.finalQty" disabled class="border rounded-md px-2 py-1.5 text-sm bg-gray-100" />
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">Per-User Limit</label>
              <input v-model.number="perUserLimit" type="number" min="0" class="border rounded-md px-2 py-1.5 text-sm" />
              <p class="text-[11px] text-gray-500">Limit on how many each user can mint within the first 48 hours of release. Leave blank for no limit.</p>
            </div>

            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="inCmart" />
              <span class="text-xs font-medium">In Cmart</span>
            </label>
            <p class="text-[11px] text-gray-500">Whether this cToon is purchasable in the c-mart shop. Select "Code Only" rarity for exclusive reward drops instead.</p>
          </section>

          <!-- ── G-toon Gameplay ───────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">G-toon Gameplay</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Only needed if this cToon will be playable as a card in Clash.</p>
            </div>

            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="isGtoon" />
              <span class="text-xs font-medium">Is this a gToon?</span>
            </label>

            <div v-if="isGtoon" class="border rounded-md bg-indigo-50 p-3 space-y-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Type (gToon)</label>
                <input v-model="gtoonType" type="text" class="border rounded-md px-2 py-1.5 text-sm" placeholder="e.g. Beast, Robot, Support" />
                <p class="text-[11px] text-gray-500">Optional. Leave blank if none.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Cost <span class="text-[11px] font-normal text-gray-500">(1 – 6)</span></label>
                <input v-model.number="cost" type="number" min="0" max="6"
                      required class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[11px] text-gray-500">Energy needed to play this card in Clash.</p>
                <p v-if="errors.cost" class="text-red-600 text-[11px] mt-1">{{ errors.cost }}</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Power <span class="text-[11px] font-normal text-gray-500">(≥ 0)</span></label>
                <input v-model.number="power" type="number" min="0" max="12"
                      required class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[11px] text-gray-500">Base lane power the card contributes.</p>
                <p v-if="errors.power" class="text-red-600 text-[11px] mt-1">{{ errors.power }}</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Ability</label>
                <select v-model="abilityKey" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option disabled value="">Select an ability</option>
                  <option v-for="a in abilityKeyOptions" :key="a.key" :value="a.key">
                    {{ a.label }}
                  </option>
                </select>
                <p class="text-[11px] text-gray-500">
                  Determines the on-play effect. See the tips below for how each ability works.
                </p>
              </div>
              <div v-if="selectedAbility && selectedAbility.params?.length" class="flex flex-col gap-1">
                <label class="text-xs font-medium">
                  {{ selectedAbility.paramLabel }}
                </label>
                <select v-model="abilityParam" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option :value="null" disabled>Select a value</option>
                  <option v-for="opt in selectedAbility.params" :key="opt" :value="opt">
                    {{ opt }}
                  </option>
                </select>
                <p class="text-[11px] text-gray-500">
                  {{ selectedAbility.paramHelp }}
                </p>
              </div>
              <div class="text-[11px] text-left text-gray-600">
                <p class="font-semibold">Ability cheat-sheet:</p>
                <ul class="list-disc list-inside">
                  <li><strong>Flame Bug</strong> – Deals the selected damage to a random enemy
                      in the lane when played.</li>
                  <li><strong>Heal Ally</strong> – Heals all friendly cToons in the lane for
                      the selected amount.</li>
                  <!-- add more as you add registry entries -->
                </ul>
              </div>
            </div>
          </section>

          <!-- ── Original gToons Gameplay ─────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Original gToons Gameplay</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Only needed if this cToon will be playable as a card in the original gToons game (separate from Clash).</p>
            </div>

            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="isOgGtoon" />
              <span class="text-xs font-medium">Is this an original gToon?</span>
            </label>

            <div v-if="isOgGtoon" class="border rounded-md bg-amber-50 p-3 space-y-3">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Color</label>
                <select v-model="gtoonColor" required class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option disabled value="">Select a color</option>
                  <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                </select>
                <p class="text-[11px] text-gray-500">Black/Silver are neutral goal colors; every other color is non-neutral for the color-bonus scoring rule.</p>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Value <span class="text-[11px] font-normal text-gray-500">(0 – 99)</span></label>
                <input v-model.number="gtoonValue" type="number" min="0" max="99" required class="border rounded-md px-2 py-1.5 text-sm" />
                <p class="text-[11px] text-gray-500">Point value revealed each round.</p>
                <p v-if="errors.gtoonValue" class="text-red-600 text-[11px] mt-1">{{ errors.gtoonValue }}</p>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <div class="flex flex-col gap-1">
                  <label class="text-[11px] font-medium">Type 1</label>
                  <select v-model="gtoonType1" class="border rounded-md px-2 py-1.5 text-xs bg-white">
                    <option value="">None</option>
                    <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[11px] font-medium">Type 2</label>
                  <select v-model="gtoonType2" class="border rounded-md px-2 py-1.5 text-xs bg-white">
                    <option value="">None</option>
                    <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                  </select>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-[11px] font-medium">Type 3</label>
                  <select v-model="gtoonType3" class="border rounded-md px-2 py-1.5 text-xs bg-white">
                    <option value="">None</option>
                    <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                  </select>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Group</label>
                <select v-model="gtoonGroup" class="border rounded-md px-2 py-1.5 text-sm bg-white">
                  <option value="">None</option>
                  <option v-for="g in gtoonGroupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
                </select>
                <p class="text-[11px] text-gray-500">Team membership tag — powers like "each Justice League member in play" key off this.</p>
              </div>

              <div class="flex flex-col gap-1">
                <label class="text-xs font-medium">Power</label>
                <input
                  list="og-gtoon-power-list"
                  v-model="selectedPowerDescription"
                  @change="onPowerSelected"
                  class="border rounded-md px-2 py-1.5 text-sm"
                  placeholder="No Power"
                />
                <datalist id="og-gtoon-power-list">
                  <option value="No Power" />
                  <option v-for="p in powerCatalog" :key="p.description" :value="p.description" />
                </datalist>
                <p class="text-[11px] text-gray-500">Pick a historical power to auto-fill the effect below (marks this a Slam gToon), or leave as "No Power". You can still hand-tweak the result in Advanced.</p>
              </div>

              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="isSlamGtoon" />
                <span class="text-xs font-medium">Slam gToon (has a special ability)</span>
              </label>

              <details v-if="isSlamGtoon" class="space-y-2">
                <summary class="text-xs font-medium text-indigo-700 cursor-pointer select-none">Advanced: edit effect manually</summary>
                <div class="space-y-2 mt-2">
                <div v-for="(effect, i) in gtoonEffects" :key="i" class="border rounded-md bg-white p-2 space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-[11px] font-semibold text-gray-600">Effect {{ i + 1 }}</span>
                    <button type="button" class="text-red-600 text-[11px]" @click="gtoonEffects.splice(i, 1)">Remove</button>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label class="text-[11px] font-medium">Trigger</label>
                      <select v-model="effect.trigger" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option value="onReveal">On reveal</option>
                        <option value="static">Static (goal card only)</option>
                      </select>
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-[11px] font-medium">Target</label>
                      <select v-model="effect.target.selector" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option value="self">Self</option>
                        <option value="ownActiveCard">Your card this round</option>
                        <option value="opponentActiveCard">Opponent's card this round</option>
                        <option value="allOwnRevealed">All your revealed cards</option>
                        <option value="allOpponentRevealed">All opponent's revealed cards</option>
                        <option value="cardByCharacter">Card by character name</option>
                        <option value="neighborOwn">Your neighboring card(s)</option>
                        <option value="allMatching">All matching cards on the board</option>
                      </select>
                    </div>
                  </div>
                  <div v-if="effect.target.selector === 'cardByCharacter'" class="flex flex-col gap-1">
                    <label class="text-[11px] font-medium">Target character</label>
                    <input v-model="effect.target.character" type="text" class="border rounded-md px-2 py-1 text-xs" placeholder="e.g. Porky Pig" />
                  </div>

                  <div v-if="effect.target.selector === 'neighborOwn'" class="space-y-1">
                    <label class="text-[11px] font-medium">Which neighbor(s)</label>
                    <div class="flex gap-3">
                      <label class="flex items-center gap-1 text-[11px]"><input type="checkbox" v-model="effect.target.positions.prev" /> Previous round</label>
                      <label class="flex items-center gap-1 text-[11px]"><input type="checkbox" v-model="effect.target.positions.next" /> Next round</label>
                    </div>
                    <p class="text-[10px] text-gray-500">Leave both checked for "either neighbor."</p>
                    <div class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Only if neighbor is (optional)</label>
                        <select v-model="effect.target.filterBy" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option value="">Any neighbor</option>
                          <option value="type">a Type</option>
                          <option value="color">a Color</option>
                          <option value="group">a Group</option>
                          <option value="character">a Character</option>
                        </select>
                      </div>
                      <div class="flex flex-col gap-1" v-if="effect.target.filterBy">
                        <label class="text-[11px] font-medium">Value</label>
                        <select v-if="effect.target.filterBy === 'type'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                        </select>
                        <select v-else-if="effect.target.filterBy === 'color'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                        </select>
                        <select v-else-if="effect.target.filterBy === 'group'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="g in gtoonGroupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
                        </select>
                        <input v-else v-model="effect.target.filterValue" type="text" class="border rounded-md px-2 py-1 text-xs" />
                      </div>
                    </div>
                  </div>

                  <div v-if="effect.target.selector === 'allMatching'" class="space-y-1">
                    <div class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Scope</label>
                        <select v-model="effect.target.scope" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option value="both">Both sides</option>
                          <option value="own">Own side only</option>
                          <option value="opponent">Opponent side only</option>
                        </select>
                      </div>
                      <label class="flex items-center gap-1 text-[11px] mt-4">
                        <input type="checkbox" v-model="effect.target.excludeSelf" /> Exclude this card ("other X")
                      </label>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Match by</label>
                        <select v-model="effect.target.filterBy" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option value="type">Type</option>
                          <option value="color">Color</option>
                          <option value="group">Group</option>
                          <option value="value">Printed value</option>
                        </select>
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Value</label>
                        <select v-if="effect.target.filterBy === 'type'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                        </select>
                        <select v-else-if="effect.target.filterBy === 'color'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                        </select>
                        <select v-else-if="effect.target.filterBy === 'group'" v-model="effect.target.filterValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option v-for="g in gtoonGroupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
                        </select>
                        <input v-else v-model="effect.target.filterValue" type="number" class="border rounded-md px-2 py-1 text-xs" />
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="text-[11px] font-medium">Only if...</label>
                    <select v-model="effect.conditionType" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="none">(no condition)</option>
                      <option value="characterInPlay">A character is in play</option>
                      <option value="typeInPlay">A type is in play</option>
                      <option value="groupInPlay">A group is in play</option>
                      <option value="colorInPlay">A color is in play</option>
                      <option value="valueInPlay">A printed value is in play</option>
                      <option value="targetLacksType">The target card lacks a type</option>
                    </select>
                  </div>
                  <div v-if="effect.conditionType === 'characterInPlay'" class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label class="text-[11px] font-medium">Character</label>
                      <input v-model="effect.condition.character" type="text" class="border rounded-md px-2 py-1 text-xs" placeholder="e.g. Duck Dodgers" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-[11px] font-medium">Side</label>
                      <select v-model="effect.condition.side" :disabled="effect.condition.adjacentOnly" class="border rounded-md px-2 py-1 text-xs bg-white disabled:opacity-50">
                        <option value="either">Either side</option>
                        <option value="own">Own side</option>
                        <option value="opponent">Opponent side</option>
                      </select>
                    </div>
                    <label class="flex items-center gap-1 text-[11px] col-span-2">
                      <input type="checkbox" v-model="effect.condition.adjacentOnly" /> Only if next to (own neighboring card), i.e. "next to X"
                    </label>
                  </div>
                  <div v-if="effect.conditionType === 'typeInPlay'" class="grid grid-cols-2 gap-2">
                    <select v-model="effect.condition.cardType" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                    </select>
                    <select v-model="effect.condition.side" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="either">Either side</option>
                      <option value="own">Own side</option>
                      <option value="opponent">Opponent side</option>
                    </select>
                  </div>
                  <div v-if="effect.conditionType === 'groupInPlay'" class="grid grid-cols-2 gap-2">
                    <select v-model="effect.condition.group" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option v-for="g in gtoonGroupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
                    </select>
                    <select v-model="effect.condition.side" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="either">Either side</option>
                      <option value="own">Own side</option>
                      <option value="opponent">Opponent side</option>
                    </select>
                  </div>
                  <div v-if="effect.conditionType === 'colorInPlay'" class="grid grid-cols-2 gap-2">
                    <select v-model="effect.condition.color" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                    </select>
                    <select v-model="effect.condition.side" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="either">Either side</option>
                      <option value="own">Own side</option>
                      <option value="opponent">Opponent side</option>
                    </select>
                  </div>
                  <div v-if="effect.conditionType === 'valueInPlay'" class="grid grid-cols-2 gap-2">
                    <input v-model.number="effect.condition.value" type="number" class="border rounded-md px-2 py-1 text-xs" placeholder="e.g. 8" />
                    <select v-model="effect.condition.side" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="either">Either side</option>
                      <option value="own">Own side</option>
                      <option value="opponent">Opponent side</option>
                    </select>
                  </div>
                  <div v-if="effect.conditionType === 'targetLacksType'" class="flex flex-col gap-1">
                    <label class="text-[11px] font-medium">Type the target must lack</label>
                    <select v-model="effect.condition.cardType" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                    </select>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="text-[11px] font-medium">Action</label>
                    <select v-model="effect.action.type" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option value="modifyValue">Modify value</option>
                      <option value="setColor">Change color</option>
                      <option value="negateEffect">Negate effect</option>
                    </select>
                  </div>
                  <div v-if="effect.action.type === 'modifyValue'" class="space-y-1">
                    <div class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Operation</label>
                        <select v-model="effect.action.operation" class="border rounded-md px-2 py-1 text-xs bg-white">
                          <option value="add">Add</option>
                          <option value="multiply">Multiply</option>
                          <option value="set">Set to</option>
                        </select>
                      </div>
                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] font-medium">Amount</label>
                        <input v-model.number="effect.action.amount" type="number" class="border rounded-md px-2 py-1 text-xs" />
                      </div>
                    </div>
                    <label class="flex items-center gap-1 text-[11px]">
                      <input type="checkbox" v-model="effect.action.perMatch" /> Apply once per matching card ("+N for each X in play")
                    </label>
                    <div v-if="effect.action.perMatch" class="grid grid-cols-3 gap-2">
                      <select v-model="effect.action.perMatchBy" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option value="type">Type</option>
                        <option value="color">Color</option>
                        <option value="group">Group</option>
                        <option value="character">Character</option>
                      </select>
                      <select v-if="effect.action.perMatchBy === 'type'" v-model="effect.action.perMatchValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option v-for="t in gtoonTypeOptions" :key="t" :value="t">{{ titleCase(t) }}</option>
                      </select>
                      <select v-else-if="effect.action.perMatchBy === 'color'" v-model="effect.action.perMatchValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                      </select>
                      <select v-else-if="effect.action.perMatchBy === 'group'" v-model="effect.action.perMatchValue" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option v-for="g in gtoonGroupOptions" :key="g.value" :value="g.value">{{ g.label }}</option>
                      </select>
                      <input v-else v-model="effect.action.perMatchValue" type="text" class="border rounded-md px-2 py-1 text-xs" />
                      <select v-model="effect.action.perMatchScope" class="border rounded-md px-2 py-1 text-xs bg-white">
                        <option value="both">Both sides</option>
                        <option value="own">Own side</option>
                        <option value="opponent">Opponent side</option>
                        <option value="neighborOwn">Own neighboring cards</option>
                      </select>
                    </div>
                  </div>
                  <div v-if="effect.action.type === 'setColor'" class="flex flex-col gap-1">
                    <label class="text-[11px] font-medium">New color</label>
                    <select v-model="effect.action.color" class="border rounded-md px-2 py-1 text-xs bg-white">
                      <option v-for="c in gtoonColorOptions" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </div>
                </div>
                <button type="button" class="text-xs text-indigo-700 font-medium" @click="addGtoonEffect">+ Add effect</button>
                <p v-if="errors.gtoonEffects" class="text-red-600 text-[11px] mt-1">{{ errors.gtoonEffects }}</p>
                </div>
              </details>
            </div>
          </section>

          <!-- ── Second Edition ────────────────────────────────────── -->
          <section class="border rounded-lg p-3 space-y-3">
            <div>
              <h2 class="text-xs font-semibold text-gray-700 uppercase tracking-wide">Second Edition</h2>
              <p class="text-[11px] text-gray-500 mt-0.5">Mark this cToon as a reprint of an existing one, with an overlay badge.</p>
            </div>
            <SecondEditionFields
              v-model="secondEdition"
              :ctoon-image-src="imagePreview"
              :auto-note="autoSecondEditionNote"
            />
          </section>

          <!-- Submit -->
          <div class="text-right">
            <button class="px-4 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700">Create cToon</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, computed } from 'vue'
import { zonedTimeToUtc } from 'date-fns-tz'
import abilityMeta from '~/data/abilities.json'
import { useRouter } from 'vue-router'
import SecondEditionFields from '~/components/admin/SecondEditionFields.vue'

const router = useRouter()
const name = ref('')
const series = ref('')
const type = ref('')
const rarity = ref('')
const cMoonId = ref(null)
const set = ref('')
const characters = ref('')
const releaseDate = ref('')
const mintLimitType = ref('defined')
const mintEndDate = ref('')
const timeBasedLimitCountStr = ref('')      // '' = use rarity default
const timeBasedLimitWindowDaysStr = ref('') // '' = use rarity default / full duration
const totalQuantity = ref(null)
const initialQuantity = ref(null)
const perUserLimit = ref(null)
const codeOnly = ref(false)
const inCmart = ref(false)
const price = ref(0)
const imageFile = ref(null)
const seriesOptions = ref([])
const setsOptions = ref([])
const duplicateStatus = ref('idle')
const duplicateMatch = ref(null)
const duplicateError = ref('')
const imagePreview = ref('')

/* ── Second Edition ─────────────────────────────────────── */
const secondEdition = ref({
  isSecondEdition: false,
  relatedFirstEditionId: null,
  relatedFirstEditionName: '',
  overlayX: 85,
  overlayY: 85,
  overlaySize: 100
})
const autoSecondEditionNote = ref('')
/* ── NEW: G-toon state ───────────────────────────────── */
const isGtoon     = ref(false)
const cost        = ref(1)
const power       = ref(1)
const abilityKey  = ref('')
const abilityParam = ref(null)
const gtoonType = ref('')

/* ── NEW: Original gToons state ─────────────────────── */
const gtoonColorOptions = ['BLACK', 'SILVER', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE', 'PINK']
const gtoonTypeOptions = ['ANIMAL', 'FEMALE', 'HERO', 'MALE', 'MONSTER', 'PLACE', 'PROP', 'VEHICLE', 'VILLAIN']
// value/label pairs match prisma/schema.prisma's GtoonGroup @map(...) display labels exactly.
const gtoonGroupOptions = [
  { value: 'BEAN_SCOUTS', label: 'Bean Scouts' },
  { value: 'DAILY_PLANET', label: 'Daily Planet' },
  { value: 'GLOBAL', label: 'G.L.O.B.A.L.' },
  { value: 'IMAGINARY_FRIEND', label: 'Imaginary Friend' },
  { value: 'INJUSTICE_GANG', label: 'Injustice Gang' },
  { value: 'JUSTICE_FRIENDS', label: 'Justice Friends' },
  { value: 'JUSTICE_LEAGUE', label: 'Justice League' },
  { value: 'MUCHA_LUCHA', label: 'Mucha Lucha' },
  { value: 'MYSTERY_INC', label: 'Mystery, Inc.' },
  { value: 'POWERPUFF_GIRLS', label: 'Powerpuff Girls' },
  { value: 'SQUIRREL_SCOUTS', label: 'Squirrel Scouts' },
  { value: 'TEEN_TITANS', label: 'Teen Titans' },
  { value: 'TIME_SQUAD', label: 'Time Squad' },
  { value: 'WOOHP', label: 'WOOHP' }
]
function titleCase(s) { return s ? s.charAt(0) + s.slice(1).toLowerCase() : s }

const isOgGtoon   = ref(false)
const gtoonColor  = ref('')
const gtoonValue  = ref(1)
const gtoonType1  = ref('')
const gtoonType2  = ref('')
const gtoonType3  = ref('')
const gtoonGroup  = ref('')
const isSlamGtoon = ref(false)
const gtoonEffects = ref([])

/* ── Power catalog (server/utils/ogGtoonPowerCatalog.js) ─────────── */
const powerCatalog = ref([])
const selectedPowerDescription = ref('No Power')
onMounted(async () => {
  try {
    const res = await $fetch('/api/admin/oggtoons/power-catalog')
    powerCatalog.value = res.catalog || []
  } catch { /* admin can still hand-build a power in Advanced */ }
})
function onPowerSelected() {
  const desc = selectedPowerDescription.value
  const entry = powerCatalog.value.find(e => e.description === desc)
  if (!entry || desc === 'No Power' || desc === 'No power') {
    isSlamGtoon.value = false
    gtoonEffects.value = []
    return
  }
  isSlamGtoon.value = true
  gtoonEffects.value = entry.effect.length ? entry.effect.map(schemaToUiEffect) : [newGtoonEffect()]
}

function newGtoonEffect() {
  return {
    trigger: 'onReveal',
    target: {
      selector: 'self', character: '',
      positions: { prev: true, next: true }, filterBy: '', filterValue: '',
      scope: 'both', excludeSelf: false
    },
    conditionType: 'none',
    condition: { character: '', cardType: '', group: '', color: '', value: 0, side: 'either', adjacentOnly: false },
    action: {
      type: 'modifyValue', operation: 'add', amount: 1, color: 'BLACK',
      perMatch: false, perMatchBy: 'type', perMatchValue: '', perMatchScope: 'both'
    }
  }
}
function addGtoonEffect() { gtoonEffects.value.push(newGtoonEffect()) }
watch(isSlamGtoon, val => {
  if (val && gtoonEffects.value.length === 0) addGtoonEffect()
  if (!val) { gtoonEffects.value = []; selectedPowerDescription.value = 'No Power' }
})

/** Maps one server-schema effect object (from the power catalog, or a prior save) into the UI's editable row shape. */
function schemaToUiEffect(eff) {
  const ui = newGtoonEffect()
  ui.trigger = eff.trigger || 'onReveal'
  const t = eff.target || { selector: 'self' }
  ui.target.selector = t.selector
  ui.target.character = t.character || ''
  ui.target.scope = t.scope || 'both'
  ui.target.excludeSelf = !!t.excludeSelf
  if (Array.isArray(t.positions)) {
    ui.target.positions = { prev: t.positions.includes('prev'), next: t.positions.includes('next') }
  }
  const filt = t.filter || (Array.isArray(t.filters) ? t.filters[0] : null)
  if (filt) { ui.target.filterBy = filt.by; ui.target.filterValue = String(filt.value) }

  const c = eff.condition
  if (c) {
    ui.conditionType = c.type
    ui.condition.character = c.character || ''
    ui.condition.cardType = c.cardType || ''
    ui.condition.group = c.group || ''
    ui.condition.color = c.color || ''
    ui.condition.value = c.value ?? 0
    ui.condition.side = c.side || 'either'
    ui.condition.adjacentOnly = !!c.adjacentOnly
  } else {
    ui.conditionType = 'none'
  }

  const a = eff.action || {}
  ui.action.type = a.type || 'modifyValue'
  if (ui.action.type === 'modifyValue') {
    ui.action.operation = a.operation || 'add'
    ui.action.amount = a.amount ?? 0
    if (a.perMatch) {
      ui.action.perMatch = true
      const pmFilt = a.perMatch.by ? { by: a.perMatch.by, value: a.perMatch.value } : (a.perMatch.filters || [])[0]
      if (pmFilt) { ui.action.perMatchBy = pmFilt.by; ui.action.perMatchValue = String(pmFilt.value) }
      ui.action.perMatchScope = a.perMatch.scope || 'both'
    }
  } else if (ui.action.type === 'setColor') {
    ui.action.color = a.color || 'BLACK'
  }
  return ui
}

function coerceFilterValue(by, v) { return by === 'value' ? Number(v) : v }

/** Strips UI-only fields and maps each effect row to the server's schema shape. */
function buildGtoonEffectPayload() {
  return gtoonEffects.value.map(e => {
    let target
    if (e.target.selector === 'cardByCharacter') {
      target = { selector: 'cardByCharacter', character: (e.target.character || '').trim() }
    } else if (e.target.selector === 'neighborOwn') {
      target = { selector: 'neighborOwn' }
      const pos = []
      if (e.target.positions.prev) pos.push('prev')
      if (e.target.positions.next) pos.push('next')
      if (pos.length === 1) target.positions = pos
      if (e.target.filterBy && e.target.filterValue !== '') {
        target.filter = { by: e.target.filterBy, value: coerceFilterValue(e.target.filterBy, e.target.filterValue) }
      }
    } else if (e.target.selector === 'allMatching') {
      target = { selector: 'allMatching', scope: e.target.scope || 'both' }
      if (e.target.filterBy && e.target.filterValue !== '') {
        target.filters = [{ by: e.target.filterBy, value: coerceFilterValue(e.target.filterBy, e.target.filterValue) }]
      }
      if (e.target.excludeSelf) target.excludeSelf = true
    } else {
      target = { selector: e.target.selector }
    }

    const out = { trigger: e.trigger, target }

    if (e.conditionType && e.conditionType !== 'none') {
      const c = { type: e.conditionType }
      if (e.conditionType === 'characterInPlay') c.character = (e.condition.character || '').trim()
      if (e.conditionType === 'typeInPlay') c.cardType = e.condition.cardType
      if (e.conditionType === 'groupInPlay') c.group = e.condition.group
      if (e.conditionType === 'colorInPlay') c.color = e.condition.color
      if (e.conditionType === 'valueInPlay') c.value = Number(e.condition.value)
      if (e.conditionType === 'targetLacksType') c.cardType = e.condition.cardType
      if (e.conditionType !== 'targetLacksType') {
        if (e.condition.adjacentOnly) c.adjacentOnly = true
        else c.side = e.condition.side
      }
      out.condition = c
    }

    if (e.action.type === 'modifyValue') {
      out.action = { type: 'modifyValue', operation: e.action.operation, amount: Number(e.action.amount) }
      if (e.action.perMatch && e.action.perMatchBy && e.action.perMatchValue !== '') {
        out.action.perMatch = {
          by: e.action.perMatchBy,
          value: coerceFilterValue(e.action.perMatchBy, e.action.perMatchValue),
          scope: e.action.perMatchScope || 'both'
        }
      }
    } else if (e.action.type === 'setColor') {
      out.action = { type: 'setColor', color: e.action.color }
    } else {
      out.action = { type: 'negateEffect' }
    }
    return out
  })
}

const abilityKeyOptions = abilityMeta

 /* computed helper */
 const selectedAbility = computed(() =>
   abilityKeyOptions.find(a => a.key === abilityKey.value) || null
 )

/* reset param when ability changes */
watch(abilityKey, () => { abilityParam.value = null })

// Added rarityOptions array
const rarityOptions = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Crazy Rare', 'Prize Only', 'Code Only', 'Auction Only']

const soundFile = ref(null)
const errors = reactive({ image: '', name: '', series: '', rarity: '', cost: '', power: '', sound: '', gtoonValue: '', gtoonEffects: '' })

// only show suggestions once the user has typed ≥3 chars
const filteredSeriesOptions = computed(() => {
  if (series.value.length < 3) return []
  return seriesOptions.value.filter(opt =>
    opt.toLowerCase().includes(series.value.toLowerCase())
  )
})

const filteredSetsOptions = computed(() => {
  if (set.value.length < 3) return []
  return setsOptions.value.filter(opt =>
    opt.toLowerCase().includes(set.value.toLowerCase())
  )
})

// rarity defaults fetched from server
const rarityDefaults = ref(null)
const releasePercent = ref(75)
const delayHours = ref(12)

onMounted(async () => {
  const [seriesRes, setsRes, rarityRes, relRes] = await Promise.all([
    fetch('/api/admin/series', { credentials: 'include' }),
    fetch('/api/admin/sets', { credentials: 'include' }),
    fetch('/api/rarity-defaults'),
    fetch('/api/release-settings')
  ])
  seriesOptions.value = await seriesRes.json()
  setsOptions.value = await setsRes.json()
  try { const j = await rarityRes.json(); rarityDefaults.value = j?.defaults || null } catch {}
  try { const r = await relRes.json(); releasePercent.value = Number(r.initialReleasePercent ?? 75); delayHours.value = Number(r.finalReleaseDelayHours ?? 12) } catch {}
})

watch(rarity, val => {
  const d = rarityDefaults.value?.[val]
  if (d) {
    totalQuantity.value   = d.totalQuantity ?? null
    initialQuantity.value = d.initialQuantity ?? null
    perUserLimit.value    = d.perUserLimit ?? null
    inCmart.value         = !!d.inCmart
    price.value           = Number(d.price ?? 0)
  } else {
    // fallback hard-coded
    const pricing = { Common: 100, Uncommon: 200, Rare: 400, 'Very Rare': 750, 'Crazy Rare': 1250 }
    price.value = pricing[val] || 0
    switch (val) {
      case 'Common':
        initialQuantity.value = 160; totalQuantity.value = 160; perUserLimit.value = 7; inCmart.value = true; break
      case 'Uncommon':
        initialQuantity.value = 120; totalQuantity.value = 120; perUserLimit.value = 5; inCmart.value = true; break
      case 'Rare':
        initialQuantity.value = 80; totalQuantity.value = 80; perUserLimit.value = 3; inCmart.value = true; break
      case 'Very Rare':
        initialQuantity.value = 60; totalQuantity.value = 60; perUserLimit.value = 2; inCmart.value = true; break
      case 'Crazy Rare':
        initialQuantity.value = 40; totalQuantity.value = 40; perUserLimit.value = 1; inCmart.value = true; break
      default:
        break
    }
  }
  codeOnly.value = val === 'Code Only'
  if (val === 'Code Only') inCmart.value = false
})

function handleSoundFile(e) {
  errors.sound = ''
  const file = e.target.files?.[0]
  if (!file) { soundFile.value = null; return }
  const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg']
  if (!allowed.includes(file.type)) {
    errors.sound = 'Only MP3, WAV, or OGG files allowed.'
    soundFile.value = null
    return
  }
  soundFile.value = file
}

function handleFile(e) {
  const file = e.target.files[0]
  errors.image = ''
  duplicateStatus.value = 'idle'
  duplicateMatch.value = null
  duplicateError.value = ''
  if (!file) {
    errors.image = 'Image is required.'
    return
  }
  if (!['image/png', 'image/gif'].includes(file.type)) {
    errors.image = 'Only PNG or GIF files allowed.'
    return
  }
  imageFile.value = file
  type.value = file.type

  if (imagePreview.value) URL.revokeObjectURL(imagePreview.value)
  imagePreview.value = URL.createObjectURL(file)

  checkDuplicate(file)
}

async function checkDuplicate(file) {
  duplicateStatus.value = 'checking'
  duplicateMatch.value = null
  duplicateError.value = ''
  const formData = new FormData()
  formData.append('image', file)

  try {
    const res = await fetch('/api/admin/ctoon-duplicate', {
      method: 'POST',
      credentials: 'include',
      body: formData
    })
    if (!res.ok) {
      duplicateStatus.value = 'error'
      duplicateError.value = 'Duplicate check failed.'
      return
    }
    const data = await res.json()
    duplicateMatch.value = data?.duplicate ? data.match : null
    duplicateStatus.value = 'done'

    // Auto-set Second Edition when both duplicate-distance values are exactly 0
    // (i.e. the image is pixel-identical to an existing cToon's image).
    const m = duplicateMatch.value
    if (m && m.phashDist === 0 && m.dhashDist === 0 && m.ctoon) {
      secondEdition.value = {
        ...secondEdition.value,
        isSecondEdition: true,
        relatedFirstEditionId: m.ctoon.id,
        relatedFirstEditionName: m.ctoon.name,
        overlayX: secondEdition.value.overlayX ?? 85,
        overlayY: secondEdition.value.overlayY ?? 85,
        overlaySize: secondEdition.value.overlaySize ?? 100
      }
      autoSecondEditionNote.value = `Auto-set from exact image match with "${m.ctoon.name}". You can change this.`
    } else {
      autoSecondEditionNote.value = ''
    }
  } catch {
    duplicateStatus.value = 'error'
    duplicateError.value = 'Duplicate check failed.'
  }
}

// Compute the user's local timezone display for the mint end date
const mintEndDateLocal = computed(() => {
  if (!mintEndDate.value) return ''
  try {
    const utc = zonedTimeToUtc(mintEndDate.value, 'America/Chicago')
    return utc.toLocaleString('en-US', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour12: true })
  } catch {
    return ''
  }
})

// Auto-set mintEndDate to releaseDate + 7 days when switching to timeBased or when releaseDate changes
watch([releaseDate, mintLimitType], () => {
  if (mintLimitType.value === 'timeBased' && releaseDate.value && !mintEndDate.value) {
    const base = new Date(releaseDate.value)
    base.setDate(base.getDate() + 7)
    // Format as datetime-local string (YYYY-MM-DDTHH:mm)
    const pad = n => String(n).padStart(2, '0')
    mintEndDate.value = `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`
  }
})

const schedule = computed(() => {
  const qty = Number(totalQuantity.value)
  const hasQty = Number.isFinite(qty) && qty > 0
  const hasDate = Boolean(releaseDate.value)
  if (!hasQty || !hasDate) return { initialQty: null, finalQty: null, finalAt: null, finalAtDisplay: '' }
  const init = Math.max(1, Math.floor((qty * Number(releasePercent.value)) / 100))
  const fin = Math.max(0, qty - init)
  const base = new Date(releaseDate.value)
  const finAt = new Date(base.getTime() + Number(delayHours.value) * 60 * 60 * 1000)
  const finDisplay = finAt.toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false })
  return { initialQty: init, finalQty: fin, finalAt: finAt, finalAtDisplay: finDisplay }
})

async function submitForm() {
  // Validate
  if (!name.value.trim()) errors.name = 'Name is required.'
  if (!series.value.trim()) errors.series = 'Series is required.'
  if (!rarity.value) errors.rarity = 'Rarity is required.'
  if (isOgGtoon.value) {
    if (!gtoonColor.value) errors.gtoonValue = 'Color and value are required.'
    else if (gtoonValue.value == null || gtoonValue.value < 0 || gtoonValue.value > 99) errors.gtoonValue = 'Value must be 0-99.'
  }
  if (Object.values(errors).some(e => e)) return

  // Build form data
  const formData = new FormData()
  formData.append('image', imageFile.value)
  formData.append('name', name.value)
  formData.append('series', series.value)
  formData.append('type', type.value)
  formData.append('rarity', rarity.value)
  if (cMoonId.value) formData.append('cMoonId', cMoonId.value)
  formData.append('set', set.value)
  formData.append('characters', JSON.stringify(characters.value.split(',').map(c => c.trim())))
  // Convert admin-entered CST/CDT time to UTC
  try {
    const utcIso = zonedTimeToUtc(releaseDate.value, 'America/Chicago').toISOString()
    formData.append('releaseDate', utcIso)
  } catch {
    formData.append('releaseDate', new Date(releaseDate.value).toISOString())
  }
  formData.append('mintLimitType', mintLimitType.value)
  if (mintLimitType.value === 'timeBased' && mintEndDate.value) {
    try {
      const utcMintEnd = zonedTimeToUtc(mintEndDate.value, 'America/Chicago').toISOString()
      formData.append('mintEndDate', utcMintEnd)
    } catch {
      formData.append('mintEndDate', new Date(mintEndDate.value).toISOString())
    }
  }
  formData.append('timeBasedLimitCount',      timeBasedLimitCountStr.value)
  formData.append('timeBasedLimitWindowDays', timeBasedLimitWindowDaysStr.value)
  formData.append('totalQuantity', mintLimitType.value === 'defined' ? (totalQuantity.value ?? '') : '')
  formData.append('initialQuantity', mintLimitType.value === 'defined' ? (initialQuantity.value ?? '') : '')
  // advisory schedule fields
  formData.append('initialReleaseAt', releaseDate.value ? new Date(releaseDate.value).toISOString() : '')
  formData.append('finalReleaseAt', schedule.value.finalAt ? schedule.value.finalAt.toISOString() : '')
  formData.append('initialReleaseQty', schedule.value.initialQty ?? '')
  formData.append('finalReleaseQty', schedule.value.finalQty ?? '')
  formData.append('perUserLimit', perUserLimit.value ?? '')
  formData.append('codeOnly', codeOnly.value)
  formData.append('inCmart', inCmart.value)
  formData.append('price', price.value)
  formData.append('isGtoon',      isGtoon.value)
  if (isGtoon.value) {
    formData.append('gtoonType', gtoonType.value ?? '')
    formData.append('cost',       cost.value)
    formData.append('power',      power.value)
    formData.append('abilityKey', abilityKey.value)
    const abilityData = selectedAbility.value && abilityParam.value != null
      ? JSON.stringify({ [selectedAbility.value.paramLabel.toLowerCase().split(' ')[0]]: abilityParam.value })
      : '{}'
    formData.append('abilityData', abilityData)
  }
  formData.append('isOgGtoon', isOgGtoon.value)
  if (isOgGtoon.value) {
    formData.append('gtoonColor', gtoonColor.value)
    formData.append('gtoonValue', gtoonValue.value)
    formData.append('isSlamGtoon', isSlamGtoon.value)
    formData.append('gtoonEffect', isSlamGtoon.value ? JSON.stringify(buildGtoonEffectPayload()) : '')
    formData.append('gtoonType1', gtoonType1.value)
    formData.append('gtoonType2', gtoonType2.value)
    formData.append('gtoonType3', gtoonType3.value)
    formData.append('gtoonGroup', gtoonGroup.value)
  }

  if (soundFile.value) formData.append('sound', soundFile.value)

  formData.append('isSecondEdition', secondEdition.value.isSecondEdition)
  if (secondEdition.value.isSecondEdition) {
    formData.append('relatedFirstEditionId', secondEdition.value.relatedFirstEditionId ?? '')
    formData.append('secondEditionOverlayX', secondEdition.value.overlayX)
    formData.append('secondEditionOverlayY', secondEdition.value.overlayY)
    formData.append('secondEditionOverlaySize', secondEdition.value.overlaySize)
  }

  const res = await fetch('/api/admin/ctoon', {
    method: 'POST',
    credentials: 'include',
    body: formData
  })

  if (res.ok) router.push('/newsite/admin/ctoons')
  else alert('Failed to create cToon')
}
</script>
