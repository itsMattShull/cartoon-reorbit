<template>
  <Nav />

  <div class="min-h-screen bg-gray-100 p-6 mt-16 md:mt-20">
    <h1 class="text-3xl font-bold mb-6">Admin: Game Configuration</h1>

    <div class="bg-white rounded-lg shadow-md max-w-2xl mx-auto">
      <!-- Tabs -->
      <div
        ref="tabsScrollEl"
        class="border-b px-4 pt-4 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="Game configuration sections"
        @wheel="onTabsWheel"
      >
        <div class="flex gap-2 sm:gap-4 min-w-max">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="px-3 sm:px-4 py-2 text-sm font-medium rounded-t-md border-b-2"
            :class="activeTab === t.key
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'"
            role="tab"
            :aria-selected="activeTab === t.key"
            @click="switchTab(t.key)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Panels -->
      <div class="p-6 space-y-8">
        <!-- Global -->
        <section v-if="activeTab === 'Global'" role="tabpanel" aria-label="Global Settings">
          <h2 class="text-2xl font-semibold mb-4">Global Settings</h2>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700">Daily Point Cap</label>
            <input type="number" v-model.number="globalDailyPointLimit" class="input" />
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700">Daily TKO Points Cap</label>
            <input type="number" v-model.number="globalTkoDailyPointLimit" class="input" />
          </div>
          <button @click="saveGlobalConfig" :disabled="loadingGlobal" class="btn-primary">
            <span v-if="!loadingGlobal">Save Global Settings</span>
            <span v-else>Saving…</span>
          </button>

          <!-- Game Tile Images -->
          <div class="mt-8 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Game Tile Images</h3>
            <p class="text-xs text-gray-500 mb-4">Upload an image for each game tile on the Games page. Images replace the colored background.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div v-for="tile in gameTileSlots" :key="tile.slot" class="border rounded p-3 space-y-2">
                <h4 class="text-sm font-semibold text-gray-700">{{ tile.label }}</h4>
                <div class="w-full h-24 bg-gray-100 border rounded overflow-hidden flex items-center justify-center">
                  <img
                    v-if="gameTileImages[tile.slot]"
                    :src="gameTileImages[tile.slot]"
                    :alt="tile.label"
                    class="w-full h-full object-cover"
                  />
                  <span v-else class="text-gray-400 text-xs">No image</span>
                </div>
                <input
                  type="file"
                  accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
                  @change="onGameTileFile(tile.slot, $event)"
                  class="block w-full text-xs"
                />
                <div class="flex items-center gap-2">
                  <button
                    class="btn-primary text-sm py-1 px-3"
                    @click="uploadGameTile(tile.slot)"
                    :disabled="!gameTileFiles[tile.slot] || uploadingGameTile[tile.slot]"
                  >
                    <span v-if="!uploadingGameTile[tile.slot]">Upload</span>
                    <span v-else>Uploading…</span>
                  </button>
                  <button
                    v-if="gameTileImages[tile.slot]"
                    type="button"
                    class="px-3 py-1 text-sm rounded border"
                    @click="removeGameTile(tile.slot)"
                  >Remove</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Winball -->
        <section v-if="activeTab === 'Winball'" role="tabpanel" aria-label="Winball Settings">
          <h2 class="text-2xl font-semibold mb-4">Winball Settings</h2>
          <div class="mb-6 rounded border border-indigo-100 bg-indigo-50 p-4">
            <p class="text-sm text-indigo-900 mb-3">
              These settings are shared by the current Winball page and the new Winball page.
            </p>
            <NuxtLink
              to="/newsite/newwinball"
              class="inline-flex items-center rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Open New Winball
            </NuxtLink>
          </div>

          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Scoring</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Left Cup Points</label>
              <input type="number" v-model.number="leftCupPoints" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Right Cup Points</label>
              <input type="number" v-model.number="rightCupPoints" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Gold Cup Points</label>
              <input type="number" v-model.number="goldCupPoints" class="input" />
            </div>
            </div>
          </div>

          <div class="mb-6 border rounded-lg p-4 bg-gray-50">
            <h3 class="text-lg font-semibold mb-1">Playfield Layers</h3>
            <p class="text-xs text-gray-500 mb-4">Layer order: base color → board image → color transform with intensity → overlay color with alpha.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Base Board Color</label>
                <div class="flex items-center gap-2">
                  <input type="color" v-model="winballBoardLayer.winballColorBackboard" class="h-9 w-14 rounded border cursor-pointer p-0.5" />
                  <input type="text" v-model="winballBoardLayer.winballColorBackboard" class="input flex-1" maxlength="7" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Color Transform</label>
                <div class="flex items-center gap-2">
                  <input type="color" v-model="winballBoardLayer.winballColorTransform" class="h-9 w-14 rounded border cursor-pointer p-0.5" />
                  <input type="text" v-model="winballBoardLayer.winballColorTransform" class="input flex-1" maxlength="7" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Transform Intensity</label>
                <input type="number" min="0" max="1" step="0.01" v-model.number="winballBoardLayer.winballColorTransformIntensity" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Overlay Color</label>
                <div class="flex items-center gap-2">
                  <input type="color" v-model="winballBoardLayer.winballOverlayColor" class="h-9 w-14 rounded border cursor-pointer p-0.5" />
                  <input type="text" v-model="winballBoardLayer.winballOverlayColor" class="input flex-1" maxlength="7" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Overlay Alpha</label>
                <input type="number" min="0" max="1" step="0.01" v-model.number="winballBoardLayer.winballOverlayAlpha" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Image Width (%)</label>
                <input type="number" min="1" max="300" step="1" v-model.number="winballBoardLayer.winballImageWidthPercent" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Image Horizontal Offset (%)</label>
                <input type="number" step="0.5" v-model.number="winballBoardLayer.winballImageOffsetXPercent" class="input" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Image Vertical Offset (%)</label>
                <input type="number" step="0.5" v-model.number="winballBoardLayer.winballImageOffsetYPercent" class="input" />
              </div>
            </div>
          </div>

          <!-- Physics -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Physics</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div v-for="p in winballPhysicsFields" :key="p.key">
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ p.label }}</label>
                <p class="text-xs text-gray-400 mb-1">{{ p.hint }}</p>
                <input type="number" v-model.number="winballPhysics[p.key]" :step="p.step" class="input" />
              </div>
            </div>
          </div>

          <!-- Colors -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Component Colors</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div v-for="c in winballColorFields" :key="c.key">
                <label class="block text-sm font-medium text-gray-700 mb-1">{{ c.label }}</label>
                <div class="flex items-center gap-2">
                  <input type="color" v-model="winballColors[c.key]" class="h-9 w-14 rounded border cursor-pointer p-0.5" />
                  <input type="text" v-model="winballColors[c.key]" class="input flex-1" maxlength="7" />
                </div>
              </div>
            </div>
          </div>

          <!-- Backboard image upload -->
          <div class="space-y-3 mb-6 border rounded-lg p-4">
            <label class="block text-sm font-medium text-gray-700">
              Backboard Image (SVG/PNG/JPEG)
            </label>
            <p class="text-xs text-gray-400">Best size: 360 × 500 px (portrait, matches board proportions)</p>
            <input
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
              @change="onWinballBackboardFileChange"
              class="block w-full text-sm"
            />
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                @click="uploadWinballBackboardImage"
                :disabled="!winballBackboardFile || uploadingBackboard"
              >
                <span v-if="!uploadingBackboard">Upload Image</span>
                <span v-else>Uploading…</span>
              </button>
              <button
                v-if="winballBackboardImagePath"
                type="button"
                class="px-3 py-2 text-sm rounded border"
                @click="removeWinballBackboardImage"
              >Remove Image</button>
            </div>
            <div v-if="winballBackboardImagePath" class="mt-2">
              <p class="text-xs text-gray-600 break-all">Saved path: {{ winballBackboardImagePath }}</p>
              <div class="mt-2 border rounded p-2 bg-gray-50">
                <img :src="winballBackboardImagePath" alt="Backboard image preview" class="max-h-40 mx-auto" />
              </div>
            </div>
          </div>

          <!-- Bumper image uploads -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Bumper Images</h3>
            <p class="text-xs text-gray-400 mb-3">Best size: 256 × 256 px (square). Image is displayed on the face of each bumper.</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div v-for="(_, i) in [0, 1, 2]" :key="i" class="space-y-2">
                <label class="block text-sm font-medium text-gray-700">Bumper {{ i + 1 }} (SVG/PNG/JPEG)</label>
                <input
                  type="file"
                  accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
                  @change="onWinballBumperFileChange(i, $event)"
                  class="block w-full text-sm"
                />
                <div class="flex items-center gap-2">
                  <button
                    class="btn-primary"
                    @click="uploadWinballBumperImage(i)"
                    :disabled="!winballBumperFiles[i] || uploadingBumper[i]"
                  >
                    <span v-if="!uploadingBumper[i]">Upload</span>
                    <span v-else>Uploading…</span>
                  </button>
                  <button
                    v-if="winballBumperImagePaths[i]"
                    type="button"
                    class="px-3 py-2 text-sm rounded border"
                    @click="removeWinballBumperImage(i)"
                  >Remove</button>
                </div>
                <div v-if="winballBumperImagePaths[i]" class="mt-1">
                  <p class="text-xs text-gray-600 break-all">{{ winballBumperImagePaths[i] }}</p>
                  <img :src="winballBumperImagePaths[i]" alt="Bumper image preview" class="mt-1 max-h-20 rounded border" />
                </div>
              </div>
            </div>
          </div>

          <!-- Bumper Geometry -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Bumper Geometry</h3>
            <p class="text-xs text-gray-400 mb-3">Set radius to 0 to remove a bumper. Z is the depth position on the board.</p>
            <div class="space-y-4">
              <div v-for="(_, i) in [0, 1, 2]" :key="i" class="border rounded p-3">
                <h4 class="text-sm font-semibold mb-2">Bumper {{ i + 1 }}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Radius</label>
                    <input type="number" v-model.number="winballBumperGeometry[i].radius" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Height</label>
                    <input type="number" v-model.number="winballBumperGeometry[i].height" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">X Position</label>
                    <input type="number" v-model.number="winballBumperGeometry[i].x" step="0.5" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Z Position (Depth)</label>
                    <input type="number" v-model.number="winballBumperGeometry[i].z" step="0.5" class="input" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Triangle Geometry -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Triangle Geometry</h3>
            <p class="text-xs text-gray-400 mb-3">Set radius to 0 to remove a triangle. Depth controls how far the triangle protrudes from the wall.</p>
            <div class="space-y-4">
              <div v-for="(_, i) in [0, 1]" :key="i" class="border rounded p-3">
                <h4 class="text-sm font-semibold mb-2">Triangle {{ i + 1 }}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Radius</label>
                    <input type="number" v-model.number="winballTriangleGeometry[i].radius" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Depth</label>
                    <input type="number" v-model.number="winballTriangleGeometry[i].depth" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">X Position</label>
                    <input type="number" v-model.number="winballTriangleGeometry[i].x" step="0.5" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Z Position (Depth)</label>
                    <input type="number" v-model.number="winballTriangleGeometry[i].z" step="0.5" class="input" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Peg Geometry -->
          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Peg Geometry</h3>
            <p class="text-xs text-gray-400 mb-3">12 small round pegs that dampen the ball on contact. Set radius to 0 to remove a peg.</p>
            <div class="space-y-4">
              <div v-for="(_, i) in Array(12).fill(0)" :key="i" class="border rounded p-3">
                <h4 class="text-sm font-semibold mb-2">Peg {{ i + 1 }}</h4>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Radius</label>
                    <input type="number" v-model.number="winballPegGeometry[i].radius" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Height</label>
                    <input type="number" v-model.number="winballPegGeometry[i].height" step="0.5" min="0" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">X Position</label>
                    <input type="number" v-model.number="winballPegGeometry[i].x" step="0.5" class="input" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-700 mb-1">Z Position (Depth)</label>
                    <input type="number" v-model.number="winballPegGeometry[i].z" step="0.5" class="input" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Grand Prize selection + preview (moved above schedule) -->
          <div class="mb-8 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Grand Prize</h3>
            <div class="mb-3 relative">
              <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
              <input
                type="text"
                v-model="searchTerm"
                @focus="showDropdown = true"
                @input="onSearchInput"
                :placeholder="grandPrizeCtoon ? grandPrizeCtoon.name : 'Type a cToon name…'"
                class="input"
              />
              <ul
                v-if="showDropdown && filteredMatches.length"
                class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
              >
                <li
                  v-for="c in filteredMatches"
                  :key="c.id"
                  @mousedown.prevent="selectCtoon(c)"
                  class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
                >
                  <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
                  <div>
                    <p class="text-sm font-medium">{{ c.name }}</p>
                    <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
                  </div>
                </li>
              </ul>
              <button
                v-if="grandPrizeCtoon"
                @click="clearSelection"
                class="absolute top-0 right-0 mt-2 mr-2 text-gray-500 hover:text-gray-700"
              >✕</button>
            </div>

            <div v-if="grandPrizeCtoon" class="mt-4 flex items-center space-x-4">
              <img :src="grandPrizeCtoon.assetPath" alt="Grand Prize Preview" class="w-16 h-16 rounded border" />
              <div>
                <p class="font-medium">{{ grandPrizeCtoon.name }}</p>
                <p class="text-sm text-gray-600 capitalize">{{ grandPrizeCtoon.rarity }}</p>
              </div>
            </div>
          </div>

          <!-- Schedule UI -->
          <div class="mb-6 border rounded-lg p-4">
          <h3 class="text-lg font-semibold mb-3">Grand Prize Schedule</h3>
          <p class="text-sm text-gray-600 mb-2">
            All dates and times are interpreted as <strong>Central Time (US)</strong>. Default time is 8:00 PM (8:00 AM on Thursdays).
          </p>

          <div class="mb-4">
            <button @click="openAddModal" class="px-3 py-2 rounded bg-indigo-600 text-white">Add schedule</button>
          </div>

          <div class="border rounded mb-6">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="text-left p-2">Start (Central)</th>
                  <th class="text-left p-2">cToon</th>
                  <th class="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in schedules" :key="row.id" class="border-t">
                  <td class="p-2 whitespace-nowrap">{{ row.startsAtLocal }}</td>
                  <td class="p-2">
                    <div class="flex items-center gap-2">
                      <img :src="row.ctoon.assetPath" class="w-8 h-8 rounded border object-cover" alt="" />
                      <div>
                        <div class="font-medium">{{ row.ctoon.name }}</div>
                        <div class="text-xs text-gray-500 capitalize">{{ row.ctoon.rarity }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="p-2">
                    <div class="flex justify-end gap-2">
                      <button @click="openEditModal(row)" class="px-2 py-1 rounded border">Edit</button>
                      <button @click="removeSchedule(row)" class="px-2 py-1 rounded border">Remove</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!schedules.length">
                  <td colspan="3" class="p-3 text-gray-500">No scheduled grand prizes.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add modal -->
          <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-white rounded-lg w-full max-w-md p-4">
              <h3 class="text-lg font-semibold mb-3">Schedule Grand Prize</h3>
              <!-- selector -->
              <div class="mb-4 relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
                <input
                  type="text"
                  v-model="modalSearch"
                  @focus="modalShowDropdown = true"
                  @input="onModalSearchInput"
                  :placeholder="modalSelectedCtoon ? modalSelectedCtoon.name : 'Type a cToon name…'"
                  class="input"
                />
                <ul
                  v-if="modalShowDropdown && modalFiltered.length"
                  class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                >
                  <li
                    v-for="c in modalFiltered"
                    :key="c.id"
                    @mousedown.prevent="selectModalCtoon(c)"
                    class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
                  >
                    <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
                    <div>
                      <p class="text-sm font-medium">{{ c.name }}</p>
                      <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
                    </div>
                  </li>
                </ul>
              </div>
              <!-- date/time -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Date (Central)</label>
                  <input type="date" v-model="modalDate" class="input" @change="setModalTimeFromDate" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Time (Central)</label>
                  <input type="time" v-model="modalTime" class="input" />
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <button @click="closeAddModal" class="px-3 py-2 rounded border">Cancel</button>
                <button @click="createSchedule" :disabled="savingSchedule || !modalSelectedCtoon || !modalDate || !modalTime" class="px-3 py-2 rounded bg-indigo-600 text-white">
                  {{ savingSchedule ? 'Saving…' : 'Add' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Edit modal -->
          <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-white rounded-lg w-full max-w-md p-4">
              <h3 class="text-lg font-semibold mb-3">Edit Grand Prize Schedule</h3>
              <!-- selector -->
              <div class="mb-4 relative">
                <label class="block text-sm font-medium text-gray-700 mb-1">Grand Prize cToon</label>
                <input
                  type="text"
                  v-model="editSearch"
                  @focus="editShowDropdown = true"
                  @input="onEditSearchInput"
                  :placeholder="editSelectedCtoon ? editSelectedCtoon.name : 'Type a cToon name…'"
                  class="input"
                />
                <ul
                  v-if="editShowDropdown && editFiltered.length"
                  class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
                >
                  <li
                    v-for="c in editFiltered"
                    :key="c.id"
                    @mousedown.prevent="selectEditCtoon(c)"
                    class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
                  >
                    <img :src="c.assetPath" alt="" class="w-8 h-8 rounded mr-3 object-cover border" />
                    <div>
                      <p class="text-sm font-medium">{{ c.name }}</p>
                      <p class="text-xs text-gray-500 capitalize">{{ c.rarity }}</p>
                    </div>
                  </li>
                </ul>
              </div>
              <!-- date/time -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Date (Central)</label>
                  <input type="date" v-model="editDate" class="input" @change="setEditTimeFromDate" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Time (Central)</label>
                  <input type="time" v-model="editTime" class="input" />
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <button @click="closeEditModal" class="px-3 py-2 rounded border">Cancel</button>
                <button
                  @click="updateSchedule"
                  :disabled="savingEditSchedule || !editSelectedCtoon || !editDate || !editTime"
                  class="px-3 py-2 rounded bg-indigo-600 text-white"
                >
                  {{ savingEditSchedule ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          </div>

          </div>

          <button @click="saveWinballConfig" :disabled="loadingWinball" class="btn-primary">
            <span v-if="!loadingWinball">Save Winball Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>


        <!-- gToon Clash -->
        <section v-if="activeTab === 'Clash'" role="tabpanel" aria-label="gToon Clash Settings">
          <h2 class="text-2xl font-semibold mb-4">gToon Clash Settings</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Win</label>
              <input type="number" v-model.number="clashPointsPerWin" class="input" />
            </div>
          </div>
          <button @click="saveClashConfig" :disabled="loadingClash" class="btn-primary">
            <span v-if="!loadingClash">Save Clash Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Win Wheel -->
        <section v-if="activeTab === 'Winwheel'" role="tabpanel" aria-label="Win Wheel Settings">
          <h2 class="text-2xl font-semibold mb-4">Win Wheel Settings</h2>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Spin Cost (pts)</label>
              <input type="number" v-model.number="spinCostWW" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Won</label>
              <input type="number" v-model.number="pointsWonWW" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Daily Spins</label>
              <input type="number" v-model.number="maxDailySpinsWW" class="input" />
            </div>
          </div>

          <!-- Image upload for Win Wheel -->
          <div class="space-y-3 mb-6">
            <label class="block text-sm font-medium text-gray-700">
              Wheel Image (SVG/PNG/JPEG)
            </label>
            <input
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png"
              @change="onWinWheelFileChange"
              class="block w-full text-sm"
            />
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                @click="uploadWinWheelImage"
                :disabled="!winWheelFile || uploadingImage"
              >
                <span v-if="!uploadingImage">Upload Image</span>
                <span v-else>Uploading…</span>
              </button>
              <button
                v-if="winWheelImagePath"
                type="button"
                class="px-3 py-2 text-sm rounded border"
                @click="removeWinWheelImage"
              >Remove Image</button>
            </div>

            <div v-if="winWheelImagePath" class="mt-2">
              <p class="text-xs text-gray-600 break-all">Saved path: {{ winWheelImagePath }}</p>
              <div class="mt-2 border rounded p-2 bg-gray-50">
                <!-- preview with fallback -->
                <img :src="previewSrc" alt="Win Wheel image preview" class="max-h-40 mx-auto" />
              </div>
            </div>
          </div>

          <!-- Sound upload for Win Wheel -->
          <div class="space-y-3 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Spin Sound Behavior</label>
              <select v-model="winWheelSoundMode" class="input">
                <option value="repeat">Repeat Sound</option>
                <option value="once">Play Once</option>
              </select>
            </div>
            <label class="block text-sm font-medium text-gray-700">
              Wheel Sound (MP3/WAV/OGG)
            </label>
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg,.mp3,.wav,.ogg"
              @change="onWinWheelSoundChange"
              class="block w-full text-sm"
            />
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                @click="uploadWinWheelSound"
                :disabled="!winWheelSoundFile || uploadingSound"
              >
                <span v-if="!uploadingSound">Upload Sound</span>
                <span v-else>Uploading…</span>
              </button>
              <button
                v-if="winWheelSoundPath"
                type="button"
                class="px-3 py-2 text-sm rounded border"
                @click="removeWinWheelSound"
              >Remove Sound</button>
            </div>

            <div v-if="winWheelSoundPath" class="mt-2">
              <p class="text-xs text-gray-600 break-all">Saved path: {{ winWheelSoundPath }}</p>
              <audio :src="winWheelSoundPath" controls class="w-full mt-2"></audio>
            </div>
          </div>

          <div class="mb-6 relative">
            <label class="block text-sm font-medium text-gray-700 mb-1">Exclusive cToon Pool</label>
            <input
              type="text"
              v-model="searchTermWW"
              @focus="showDropdownWW = true"
              @input="onSearchInputWW"
              placeholder="Type to search…"
              class="input"
            />
            <ul
              v-if="showDropdownWW && filteredMatchesWW.length"
              class="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
            >
              <li
                v-for="c in filteredMatchesWW"
                :key="c.id"
                @mousedown.prevent="selectPoolCtoon(c)"
                class="flex items-center px-3 py-2 cursor-pointer hover:bg-indigo-50"
              >
                <img :src="c.assetPath" alt="" class="w-6 h-6 rounded mr-2 object-cover border" />
                <div>
                  <p class="text-sm">{{ c.name }}</p>
                  <p class="text-xs text-gray-500">{{ c.rarity }}</p>
                </div>
              </li>
            </ul>
          </div>

          <div class="flex flex-wrap gap-2 mb-6">
            <span
              v-for="c in poolCtoons"
              :key="c.id"
              class="flex items-center bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-sm"
            >
              {{ c.name }}
              <button class="ml-1" @click="removePoolCtoon(c)">✕</button>
            </span>
          </div>

          <button @click="saveWinWheelConfig" :disabled="loadingWinWheel" class="btn-primary">
            <span v-if="!loadingWinWheel">Save Win Wheel Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- ReOrbit Match -->
        <section v-if="activeTab === 'ReOrbitMatch'" role="tabpanel" aria-label="ReOrbit Match Settings">
          <h2 class="text-2xl font-semibold mb-4">ReOrbit Match Settings</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Plays Per Period</label>
              <p class="text-xs text-gray-400 mb-1">Number of games per 24-hour period (resets 8 PM CT)</p>
              <input type="number" v-model.number="reorbitPlaysPerPeriod" min="1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Game</label>
              <p class="text-xs text-gray-400 mb-1">Points awarded toward daily cap on game completion</p>
              <input type="number" v-model.number="reorbitPointsPerGame" min="0" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Time Per Game (seconds)</label>
              <p class="text-xs text-gray-400 mb-1">Leave empty for unlimited time</p>
              <input type="number" v-model="reorbitTimeSecondsInput" min="30" placeholder="Unlimited" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Grid Size (N×N)</label>
              <p class="text-xs text-gray-400 mb-1">Board dimensions (4–10)</p>
              <input type="number" v-model.number="reorbitGridSize" min="4" max="10" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Combo Cooldown (ms)</label>
              <p class="text-xs text-gray-400 mb-1">Time allowed between matches to keep the combo growing (1000–15000). Higher = combos are easier to hold.</p>
              <input type="number" v-model.number="reorbitComboMs" min="1000" max="15000" step="500" class="input" />
            </div>
          </div>

          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Emojis</h3>
            <p class="text-xs text-gray-400 mb-3">Min 4, max min(gridSize, 10). Leave empty to use defaults: ⭐ 🌙 🚀 🌍 ⚡ 💫 🪐 🎯</p>
            <div class="flex gap-2 mb-3">
              <input
                type="text"
                v-model="reorbitEmojiInput"
                placeholder="Paste an emoji…"
                class="input flex-1"
                @keydown.enter.prevent="addReorbitEmoji"
              />
              <button
                type="button"
                @click="addReorbitEmoji"
                class="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
                :disabled="reorbitEmojis.length >= Math.min(reorbitGridSize, 10)"
              >Add</button>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(e, i) in reorbitEmojis"
                :key="i"
                class="flex items-center gap-1 bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full text-lg"
              >
                {{ e }}
                <button type="button" class="ml-1 text-sm leading-none" @click="removeReorbitEmoji(i)">✕</button>
              </span>
              <span v-if="!reorbitEmojis.length" class="text-sm text-gray-400">Using defaults</span>
            </div>
          </div>

          <button @click="saveReorbitConfig" :disabled="loadingReorbit" class="btn-primary">
            <span v-if="!loadingReorbit">Save ReOrbit Match Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Tower Stack -->
        <section v-if="activeTab === 'TowerStack'" role="tabpanel" aria-label="Tower Stack Settings">
          <h2 class="text-2xl font-semibold mb-4">Tower Stack Settings</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Plays Per Period</label>
              <p class="text-xs text-gray-400 mb-1">Number of games per 24-hour period (resets 8 PM CT)</p>
              <input type="number" v-model.number="towerPlaysPerPeriod" min="1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Game</label>
              <p class="text-xs text-gray-400 mb-1">Points awarded toward daily cap on game completion</p>
              <input type="number" v-model.number="towerPointsPerGame" min="0" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Base Speed</label>
              <p class="text-xs text-gray-400 mb-1">Starting speed of the sliding block (world units/sec)</p>
              <input type="number" v-model.number="towerBaseSpeed" min="1" step="1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Speed Growth Per Layer</label>
              <p class="text-xs text-gray-400 mb-1">How much faster each layer gets (0.03 = +3% per layer)</p>
              <input type="number" v-model.number="towerSpeedGrowthPerLayer" min="0" step="0.005" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Speed Multiplier</label>
              <p class="text-xs text-gray-400 mb-1">Speed growth caps at this multiple of the base speed</p>
              <input type="number" v-model.number="towerMaxSpeedMultiplier" min="1" step="0.1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Perfect Alignment Tolerance</label>
              <p class="text-xs text-gray-400 mb-1">Taps within this distance of dead-center don't trim the tower's width</p>
              <input type="number" v-model.number="towerPerfectEpsilon" min="0" step="0.5" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Layers</label>
              <p class="text-xs text-gray-400 mb-1">Run ends automatically past this height (10–2000)</p>
              <input type="number" v-model.number="towerMaxLayers" min="10" max="2000" class="input" />
            </div>
          </div>

          <button @click="saveTowerConfig" :disabled="loadingTower" class="btn-primary">
            <span v-if="!loadingTower">Save Tower Stack Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Operation A.S.T.E.R.O.I.D. -->
        <section v-if="activeTab === 'OperationAsteroid'" role="tabpanel" aria-label="Operation A.S.T.E.R.O.I.D. Settings">
          <h2 class="text-2xl font-semibold mb-4">Operation A.S.T.E.R.O.I.D. Settings</h2>
          <p class="text-xs text-gray-500 mb-4">
            Plays are unlimited. Only the first few runs each day are ranked — those are the ones
            that record a score and award points. Timing values are in ticks; the game runs at 60
            ticks per second.
          </p>

          <h3 class="text-lg font-semibold mb-2">Plays &amp; Points</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Ranked Plays Per Period</label>
              <p class="text-xs text-gray-400 mb-1">Runs per 24-hour period that count for the leaderboard (resets 8 PM CT). Set 0 to make every run practice.</p>
              <input type="number" v-model.number="asteroidRankedPlaysPerPeriod" min="0" max="100" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Game</label>
              <p class="text-xs text-gray-400 mb-1">Points awarded toward the daily cap when a ranked run ends</p>
              <input type="number" v-model.number="asteroidPointsPerGame" min="0" class="input" />
            </div>
          </div>

          <h3 class="text-lg font-semibold mb-2">Difficulty</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Starting Lives</label>
              <input type="number" v-model.number="asteroidStartingLives" min="1" max="9" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Starting Asteroids</label>
              <p class="text-xs text-gray-400 mb-1">Large asteroids in wave 1 (1–12)</p>
              <input type="number" v-model.number="asteroidStartAsteroids" min="1" max="12" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Asteroids Added Per Wave</label>
              <input type="number" v-model.number="asteroidAsteroidsPerWave" min="0" max="4" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Asteroid Speed</label>
              <p class="text-xs text-gray-400 mb-1">World units per tick for a large asteroid (0.2–4)</p>
              <input type="number" v-model.number="asteroidAsteroidSpeed" min="0.2" max="4" step="0.05" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Wave Speed Growth</label>
              <p class="text-xs text-gray-400 mb-1">0.06 = asteroids get 6% faster each wave</p>
              <input type="number" v-model.number="asteroidWaveSpeedGrowth" min="0" max="0.5" step="0.01" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Speed Multiplier</label>
              <p class="text-xs text-gray-400 mb-1">Wave speed growth caps here (1–5)</p>
              <input type="number" v-model.number="asteroidMaxSpeedMultiplier" min="1" max="5" step="0.1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Turn Rate</label>
              <p class="text-xs text-gray-400 mb-1">Heading steps per tick out of 1024 (1–24). 6 ≈ a full turn in 1.7s.</p>
              <input type="number" v-model.number="asteroidTurnRate" min="1" max="24" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Thrust Acceleration</label>
              <input type="number" v-model.number="asteroidThrustAccel" min="0.02" max="1" step="0.005" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Max Ship Speed</label>
              <input type="number" v-model.number="asteroidMaxShipSpeed" min="1" max="16" step="0.1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Ship Drag</label>
              <p class="text-xs text-gray-400 mb-1">Velocity kept each tick (0.9–1). 1 = no drag, pure inertia.</p>
              <input type="number" v-model.number="asteroidShipDrag" min="0.9" max="1" step="0.001" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Fire Interval (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">Ticks between auto-fired shots (3–60). Blue power-up halves this.</p>
              <input type="number" v-model.number="asteroidFireIntervalTicks" min="3" max="60" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Extra Life Score</label>
              <p class="text-xs text-gray-400 mb-1">Award a life every this many points. 0 disables.</p>
              <input type="number" v-model.number="asteroidExtraLifeScore" min="0" max="1000000" class="input" />
            </div>
          </div>

          <h3 class="text-lg font-semibold mb-2">Physics &amp; Geometry</h3>
          <p class="text-xs text-gray-500 mb-2">
            Sizes are in world units on the fixed 640&times;480 playfield. Durations are in ticks
            (60 per second). Changing these alters how the game feels but never how it is scored.
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Ship Collision Radius</label>
              <p class="text-xs text-gray-400 mb-1">Bigger is easier to hit (4&ndash;40). The Green power-up halves this.</p>
              <input type="number" v-model.number="asteroidShipRadius" min="4" max="40" step="0.5" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Bullet Speed</label>
              <p class="text-xs text-gray-400 mb-1">World units per tick, added to the ship's own velocity (1&ndash;20)</p>
              <input type="number" v-model.number="asteroidBulletSpeed" min="1" max="20" step="0.1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Bullet Range (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">How long a shot lives before fizzling (10&ndash;300). Longer means the auto-cannon sweeps more of the field.</p>
              <input type="number" v-model.number="asteroidBulletLifeTicks" min="10" max="300" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Respawn Invulnerability (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">Grace period after losing a life (0&ndash;600). 96 &asymp; 1.6s.</p>
              <input type="number" v-model.number="asteroidRespawnInvulnTicks" min="0" max="600" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Power-Up Pickup Radius</label>
              <input type="number" v-model.number="asteroidPowerupRadius" min="5" max="40" step="0.5" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Power-Up Lifetime (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">How long an uncollected power-up waits (60&ndash;3600). 600 = 10s.</p>
              <input type="number" v-model.number="asteroidPowerupLifeTicks" min="60" max="3600" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Large Asteroid Radius</label>
              <input type="number" v-model.number="asteroidLargeRadius" min="10" max="80" step="0.5" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Medium Asteroid Radius</label>
              <input type="number" v-model.number="asteroidMediumRadius" min="6" max="60" step="0.5" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Small Asteroid Radius</label>
              <input type="number" v-model.number="asteroidSmallRadius" min="3" max="40" step="0.5" class="input" />
            </div>
          </div>

          <h3 class="text-lg font-semibold mb-2">Scoring</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Large Asteroid</label>
              <input type="number" v-model.number="asteroidPointsLarge" min="0" max="10000" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Medium Asteroid</label>
              <input type="number" v-model.number="asteroidPointsMedium" min="0" max="10000" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Small Asteroid</label>
              <input type="number" v-model.number="asteroidPointsSmall" min="0" max="10000" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Wave Clear Bonus</label>
              <input type="number" v-model.number="asteroidWaveClearBonus" min="0" max="100000" class="input" />
            </div>
          </div>

          <h3 class="text-lg font-semibold mb-2">Power-Ups</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div class="sm:col-span-2 flex flex-wrap gap-4">
              <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" v-model="asteroidPowerupsEnabled" /> Power-ups enabled
              </label>
              <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" v-model="asteroidPowerupBlueEnabled" /> Blue (2x fire rate)
              </label>
              <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" v-model="asteroidPowerupRedEnabled" /> Red (invincibility)
              </label>
              <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" v-model="asteroidPowerupGreenEnabled" /> Green (half size)
              </label>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Spawn Interval (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">Ticks between spawn attempts (60–36000). 900 = every 15s.</p>
              <input type="number" v-model.number="asteroidPowerupIntervalTicks" min="60" max="36000" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Spawn Chance (%)</label>
              <p class="text-xs text-gray-400 mb-1">Chance each attempt actually drops a power-up</p>
              <input type="number" v-model.number="asteroidPowerupChancePercent" min="0" max="100" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Blue Duration (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">600 = 10s</p>
              <input type="number" v-model.number="asteroidPowerupBlueTicks" min="0" max="7200" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Red Duration (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">420 = 7s</p>
              <input type="number" v-model.number="asteroidPowerupRedTicks" min="0" max="7200" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Green Duration (ticks)</label>
              <p class="text-xs text-gray-400 mb-1">720 = 12s</p>
              <input type="number" v-model.number="asteroidPowerupGreenTicks" min="0" max="7200" class="input" />
            </div>
          </div>

          <button @click="saveAsteroidConfig" :disabled="loadingAsteroid" class="btn-primary">
            <span v-if="!loadingAsteroid">Save Operation A.S.T.E.R.O.I.D. Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- ReOrbit Memory -->
        <section v-if="activeTab === 'ReOrbitMemory'" role="tabpanel" aria-label="ReOrbit Memory Settings">
          <h2 class="text-2xl font-semibold mb-4">ReOrbit Memory Settings</h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Plays Per Period</label>
              <p class="text-xs text-gray-400 mb-1">Number of games per 24-hour period (resets 8 PM CT)</p>
              <input type="number" v-model.number="reorbitMemoryPlaysPerPeriod" min="1" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Game</label>
              <p class="text-xs text-gray-400 mb-1">Points awarded toward daily cap on game completion</p>
              <input type="number" v-model.number="reorbitMemoryPointsPerGame" min="0" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Number of Pairs</label>
              <p class="text-xs text-gray-400 mb-1">Board size — kept small enough to stay tappable on phones</p>
              <select v-model.number="reorbitMemoryPairs" class="input">
                <option :value="6">6 pairs (3×4 — 12 cards)</option>
                <option :value="8">8 pairs (4×4 — 16 cards)</option>
                <option :value="10">10 pairs (4×5 — 20 cards)</option>
                <option :value="12">12 pairs (4×6 — 24 cards)</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Time Per Game (seconds)</label>
              <p class="text-xs text-gray-400 mb-1">Leave empty for unlimited time</p>
              <input type="number" v-model="reorbitMemoryTimeSecondsInput" min="30" placeholder="Unlimited" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Flip-back Delay (ms)</label>
              <p class="text-xs text-gray-400 mb-1">How long a mismatched pair stays face up before flipping back (300–3000)</p>
              <input type="number" v-model.number="reorbitMemoryFlipBackDelayMs" min="300" max="3000" step="100" class="input" />
            </div>
          </div>

          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-1">Card Back Image</h3>
            <p class="text-xs text-gray-500 mb-3">Shown on the back of every face-down card. Card fronts are random cToon images, chosen automatically each game.</p>
            <div class="w-24 h-32 bg-gray-100 border rounded overflow-hidden flex items-center justify-center mb-2">
              <img
                v-if="reorbitMemoryCardBackImage"
                :src="reorbitMemoryCardBackImage"
                alt="Card back"
                class="w-full h-full object-cover"
              />
              <span v-else class="text-gray-400 text-xs px-1 text-center">No image</span>
            </div>
            <input
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,.jpg,.jpeg,.png,image/gif,.gif"
              @change="onReorbitMemoryCardBackFile"
              class="block w-full text-xs mb-2"
            />
            <button
              class="btn-primary text-sm py-1 px-3"
              @click="uploadReorbitMemoryCardBack"
              :disabled="!reorbitMemoryCardBackFile || uploadingReorbitMemoryCardBack"
            >
              <span v-if="!uploadingReorbitMemoryCardBack">Upload</span>
              <span v-else>Uploading…</span>
            </button>
          </div>

          <button @click="saveReorbitMemoryConfig" :disabled="loadingReorbitMemory" class="btn-primary">
            <span v-if="!loadingReorbitMemory">Save ReOrbit Memory Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- Guess that cToon! -->
        <section v-if="activeTab === 'GuessCtoon'" role="tabpanel" aria-label="Guess that cToon Settings">
          <h2 class="text-2xl font-semibold mb-4">Guess that cToon! Settings</h2>

          <p class="text-sm text-gray-500 mb-4">
            Plays are unlimited. Only the first few runs each day count toward points and the
            leaderboard — everything after that is playable as practice.
            Saved changes apply to new games within about a minute, and never disrupt a run
            already in progress.
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700">Scoring Plays Per Period</label>
              <p class="text-xs text-gray-400 mb-1">
                Runs per 24-hour period (resets 8 PM CT) that count for points and the
                leaderboard. Set to 0 to make every run practice-only.
              </p>
              <input type="number" v-model.number="guessCtoonScoredPlaysPerPeriod" min="0" max="100" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Points Per Game</label>
              <p class="text-xs text-gray-400 mb-1">Points awarded toward the shared daily cap when a scoring run ends</p>
              <input type="number" v-model.number="guessCtoonPointsPerGame" min="0" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Seconds Per cToon</label>
              <p class="text-xs text-gray-400 mb-1">Countdown per question — running out counts as a wrong answer (4–120)</p>
              <input type="number" v-model.number="guessCtoonSecondsPerQuestion" min="4" max="120" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Answer Choices</label>
              <p class="text-xs text-gray-400 mb-1">How many names to pick from, including the correct one</p>
              <select v-model.number="guessCtoonChoices" class="input">
                <option :value="3">3 choices</option>
                <option :value="4">4 choices</option>
                <option :value="5">5 choices</option>
                <option :value="6">6 choices</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Questions Per Run</label>
              <p class="text-xs text-gray-400 mb-1">Longest possible streak — answering them all is a perfect run (5–100)</p>
              <input type="number" v-model.number="guessCtoonMaxQuestions" min="5" max="100" class="input" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Minimum Streak For Points</label>
              <p class="text-xs text-gray-400 mb-1">Runs shorter than this record a score but earn no points</p>
              <input type="number" v-model.number="guessCtoonMinStreakForPoints" min="0" max="100" class="input" />
            </div>
          </div>

          <button @click="saveGuessCtoonConfig" :disabled="loadingGuessCtoon" class="btn-primary">
            <span v-if="!loadingGuessCtoon">Save Guess that cToon! Settings</span>
            <span v-else>Saving…</span>
          </button>
        </section>

        <!-- TKO -->
        <section v-if="activeTab === 'TKO'" role="tabpanel" aria-label="TKO Events">
          <h2 class="text-2xl font-semibold mb-4">TKO Events</h2>

          <div class="mb-6 border rounded-lg p-4">
            <h3 class="text-lg font-semibold mb-3">Settings</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label class="block text-sm font-medium text-gray-700">Points Per Win</label>
                <input type="number" v-model.number="tkoPointsPerWin" min="0" class="input" />
              </div>
            </div>
            <button @click="saveTkoConfig" :disabled="loadingTkoConfig" class="btn-primary">
              <span v-if="!loadingTkoConfig">Save TKO Settings</span>
              <span v-else>Saving…</span>
            </button>
          </div>

          <div v-if="tkoLoading" class="text-gray-500 py-8 text-center">Loading…</div>

          <template v-else>
            <!-- Stats -->
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="border rounded-lg p-4 text-center">
                <p class="text-3xl font-bold text-indigo-600">{{ tkoTotalEvents.toLocaleString() }}</p>
                <p class="text-sm text-gray-500 mt-1">Total Events</p>
              </div>
              <div class="border rounded-lg p-4 text-center">
                <p class="text-3xl font-bold text-indigo-600">{{ tkoUniqueUsers.toLocaleString() }}</p>
                <p class="text-sm text-gray-500 mt-1">Unique Reorbit Users</p>
              </div>
            </div>

            <h3 class="text-lg font-semibold mb-3">Most Recent 20 Events</h3>

            <div v-if="!tkoEvents.length" class="text-gray-500">No events recorded yet.</div>

            <!-- Desktop table -->
            <div v-else class="hidden md:block border rounded-lg overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-left">
                  <tr>
                    <th class="px-3 py-2 font-medium text-gray-600">Date</th>
                    <th class="px-3 py-2 font-medium text-gray-600">Match / Round</th>
                    <th class="px-3 py-2 font-medium text-gray-600">Winner</th>
                    <th class="px-3 py-2 font-medium text-gray-600">Loser</th>
                    <th class="px-3 py-2 font-medium text-gray-600">Win Type</th>
                    <th class="px-3 py-2 font-medium text-gray-600">Counted</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="e in tkoEvents" :key="e.id" class="hover:bg-gray-50">
                    <td class="px-3 py-2 whitespace-nowrap text-gray-700">{{ fmtDate(e.endedAt) }}</td>
                    <td class="px-3 py-2">
                      <div class="font-mono text-xs text-gray-500 truncate max-w-[140px]" :title="e.match.externalMatchId">{{ e.match.externalMatchId }}</div>
                      <div class="text-xs text-gray-400">Round {{ e.roundNumber }} of {{ e.bestOf }} · {{ e.match.mode }}</div>
                    </td>
                    <td class="px-3 py-2">
                      <div class="font-medium">{{ e.winnerUsername }}</div>
                      <div class="text-xs text-gray-400">{{ e.winnerCharacterName }}</div>
                      <div v-if="!e.winnerUserId" class="text-xs text-amber-500">no account</div>
                    </td>
                    <td class="px-3 py-2">
                      <div class="font-medium">{{ e.loserUsername }}</div>
                      <div class="text-xs text-gray-400">{{ e.loserCharacterName }}</div>
                      <div v-if="!e.loserUserId" class="text-xs text-amber-500">no account</div>
                    </td>
                    <td class="px-3 py-2 capitalize">{{ e.winType }}</td>
                    <td class="px-3 py-2">
                      <span
                        class="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        :class="e.counted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
                      >{{ e.counted ? 'Yes' : 'No' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile cards -->
            <div class="md:hidden space-y-3">
              <div v-for="e in tkoEvents" :key="e.id" class="border rounded-lg p-4 bg-white space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-xs text-gray-400 font-mono truncate max-w-[200px]" :title="e.match.externalMatchId">{{ e.match.externalMatchId }}</div>
                    <div class="text-xs text-gray-400">Round {{ e.roundNumber }}/{{ e.bestOf }} · {{ e.match.mode }}</div>
                  </div>
                  <span
                    class="shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="e.counted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
                  >{{ e.counted ? 'Counted' : 'Not counted' }}</span>
                </div>
                <div class="text-xs text-gray-500">{{ fmtDate(e.endedAt) }}</div>
                <div class="grid grid-cols-2 gap-3 pt-1 border-t">
                  <div>
                    <div class="text-xs font-semibold text-green-600 mb-0.5">Winner</div>
                    <div class="font-medium text-sm">{{ e.winnerUsername }}</div>
                    <div class="text-xs text-gray-400">{{ e.winnerCharacterName }}</div>
                    <div v-if="!e.winnerUserId" class="text-xs text-amber-500">no account</div>
                  </div>
                  <div>
                    <div class="text-xs font-semibold text-red-500 mb-0.5">Loser</div>
                    <div class="font-medium text-sm">{{ e.loserUsername }}</div>
                    <div class="text-xs text-gray-400">{{ e.loserCharacterName }}</div>
                    <div v-if="!e.loserUserId" class="text-xs text-amber-500">no account</div>
                  </div>
                </div>
                <div class="text-xs text-gray-500 pt-1 border-t capitalize">Win type: <span class="font-medium text-gray-700">{{ e.winType }}</span></div>
              </div>
            </div>
          </template>
        </section>

        <!-- Toast -->
        <div
          v-if="toastMessage"
          :class="[toastClass, 'fixed bottom-4 left-1/2 transform -translate-x-1/2']"
        >
          {{ toastMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Nav from '@/components/Nav.vue'

definePageMeta({
  title: 'Admin - Games',
  middleware: ['auth', 'admin'],
  layout: 'admin'
})

const tabs = [
  { key: 'Global',       label: 'Global Settings' },
  { key: 'Winball',      label: 'Winball' },
  { key: 'Clash',        label: 'gToon Clash' },
  { key: 'Winwheel',     label: 'Win Wheel' },
  { key: 'TKO',          label: 'TKO' },
  { key: 'ReOrbitMatch', label: 'ReOrbit Match' },
  { key: 'TowerStack',   label: 'Tower Stack' },
  { key: 'ReOrbitMemory', label: 'ReOrbit Memory' },
  { key: 'GuessCtoon',   label: 'Guess that cToon!' },
  { key: 'OperationAsteroid', label: 'Op. A.S.T.E.R.O.I.D.' }
]
const activeTab = ref('Global')
async function switchTab(k) {
  activeTab.value = k
  if (k === 'TKO' && !tkoLoaded.value) await loadTkoEvents()
}

// Desktop mouse wheels only scroll vertically by default, so this tab strip (scrollbar
// hidden for touch-friendly styling) would otherwise be unreachable without a trackpad.
const tabsScrollEl = ref(null)
function onTabsWheel(e) {
  const el = tabsScrollEl.value
  if (!el || el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

// ── Settings state ────────────────────────────
const globalDailyPointLimit = ref(100)
const globalTkoDailyPointLimit = ref(250)
const loadingGlobal         = ref(false)
const leftCupPoints         = ref(0)
const rightCupPoints        = ref(0)
const goldCupPoints         = ref(0)
const clashPointsPerWin     = ref(1)
const tkoPointsPerWin       = ref(300)
const loadingWinball        = ref(false)
const winballBackboardFile  = ref(null)
const uploadingBackboard    = ref(false)
const winballBackboardImagePath = ref('')
const winballBumperFiles    = ref([null, null, null])
const uploadingBumper       = ref([false, false, false])
const winballBumperImagePaths = ref(['', '', ''])
const loadingClash          = ref(false)
const loadingTkoConfig      = ref(false)

const winballBumperGeometry = ref([
  { radius: 6, height: 6, x: -8, z: -9 },
  { radius: 6, height: 6, x: -1, z:  0 },
  { radius: 6, height: 6, x:  6, z: -9 }
])
const winballTriangleGeometry = ref([
  { radius: 6, depth: 6, x: -15, z: -2 },
  { radius: 0, depth: 6, x:  15, z: -2 }
])
const winballPegGeometry = ref([
  { radius: 1.5, height: 4, x: -11, z: -17 },
  { radius: 1.5, height: 4, x:  -3, z: -17 },
  { radius: 1.5, height: 4, x:   5, z: -17 },
  { radius: 1.5, height: 4, x:  12, z: -17 },
  { radius: 1.5, height: 4, x: -12, z:  -6 },
  { radius: 1.5, height: 4, x:  -5, z:  -6 },
  { radius: 1.5, height: 4, x:   2, z:  -6 },
  { radius: 1.5, height: 4, x:  10, z:  -6 },
  { radius: 1.5, height: 4, x: -12, z:   4 },
  { radius: 1.5, height: 4, x:  -5, z:   5 },
  { radius: 1.5, height: 4, x:   3, z:   4 },
  { radius: 1.5, height: 4, x:  11, z:   4 }
])

const winballColorFields = [
  { key: 'winballColorBackground', label: 'Background' },
  { key: 'winballColorWalls',      label: 'Walls' },
  { key: 'winballColorBall',       label: 'Ball' },
  { key: 'winballColorBumpers',    label: 'Bumpers' },
  { key: 'winballColorLeftCup',    label: 'Left Cup' },
  { key: 'winballColorRightCup',   label: 'Right Cup' },
  { key: 'winballColorGoldCup',    label: 'Gold Cup' },
  { key: 'winballColorCap',        label: 'Cap' }
]
const winballColors = ref({
  winballColorBackground: '#ffffff',
  winballColorWalls:      '#4b4b4b',
  winballColorBall:       '#ff0000',
  winballColorBumpers:    '#8c8cff',
  winballColorLeftCup:    '#8c8cff',
  winballColorRightCup:   '#8c8cff',
  winballColorGoldCup:    '#FFD700',
  winballColorCap:        '#ffd000'
})


const winballBoardLayer = ref({
  winballColorBackboard: '#F0E6FF',
  winballColorTransform: '#ffffff',
  winballColorTransformIntensity: 0,
  winballOverlayColor: '#ffffff',
  winballOverlayAlpha: 0,
  winballImageWidthPercent: 100,
  winballImageOffsetXPercent: 0,
  winballImageOffsetYPercent: 0
})

const winballPhysicsFields = [
  { key: 'winballGravity',             label: 'Gravity',               hint: 'Board downhill pull (default 15)',    step: 0.5 },
  { key: 'winballBallMass',            label: 'Ball Mass',             hint: 'Heavier = more momentum (default 8)', step: 0.5 },
  { key: 'winballBallLinearDamping',   label: 'Linear Damping',        hint: 'Rolling slowdown 0–1 (default 0.2)',  step: 0.01 },
  { key: 'winballBallAngularDamping',  label: 'Angular Damping',       hint: 'Spin slowdown 0–1 (default 0)',       step: 0.01 },
  { key: 'winballBallWallRestitution', label: 'Wall Bounciness',       hint: 'Bounce off walls (default 1.2)',      step: 0.05 },
  { key: 'winballPlungerMaxPull',      label: 'Plunger Max Pull',      hint: 'Max pull distance (default 0.6)',     step: 0.05 },
  { key: 'winballPlungerImpactFactor', label: 'Plunger Impact Factor', hint: 'Velocity transfer 0–1 (default 0.2)', step: 0.01 },
  { key: 'winballPlungerForce',        label: 'Plunger Force',         hint: 'Launch impulse strength (default 500)', step: 10 }
]
const winballPhysics = ref({
  winballGravity:             15,
  winballBallMass:            8,
  winballBallLinearDamping:   0.2,
  winballBallAngularDamping:  0,
  winballBallWallRestitution: 1.2,
  winballPlungerMaxPull:      0.6,
  winballPlungerImpactFactor: 0.2,
  winballPlungerForce:        500
})

const grandPrizeCtoon       = ref(null)
const selectedCtoonId       = ref('')
const allCtoons             = ref([])
const searchTerm            = ref('')
const showDropdown          = ref(false)

const toastMessage = ref('')
const toastType    = ref('')
const toastClass   = computed(() => [
  'mt-4 px-4 py-2 rounded',
  toastType.value === 'error'
    ? 'bg-red-100 text-red-700'
    : 'bg-green-100 text-green-700'
])

const schedules = ref([])

async function loadSchedules() {
  const res = await $fetch('/api/admin/winball-grand-prize')
  schedules.value = res.items || []
}

const DEFAULT_WINBALL_TIME = '20:00'
const THURSDAY_WINBALL_TIME = '08:00'
function getDefaultWinballTime(dateStr) {
  if (!dateStr) return DEFAULT_WINBALL_TIME
  const date = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(date.getTime())) return DEFAULT_WINBALL_TIME
  return date.getDay() === 4 ? THURSDAY_WINBALL_TIME : DEFAULT_WINBALL_TIME
}
function splitStartsAtLocal(value) {
  if (!value || typeof value !== 'string') return { date: '', time: '' }
  const [date, time] = value.trim().split(' ')
  return { date: date || '', time: time || '' }
}

// modal state
const showAddModal = ref(false)
const savingSchedule = ref(false)
const modalSelectedCtoon = ref(null)
const modalSearch = ref('')
const modalShowDropdown = ref(false)
const modalDate = ref('')
const modalTime = ref(DEFAULT_WINBALL_TIME)

const showEditModal = ref(false)
const savingEditSchedule = ref(false)
const editingSchedule = ref(null)
const editSelectedCtoon = ref(null)
const editSearch = ref('')
const editShowDropdown = ref(false)
const editDate = ref('')
const editTime = ref(DEFAULT_WINBALL_TIME)

const modalFiltered = computed(() => {
  const t = modalSearch.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => c.name.toLowerCase().includes(t))
    .slice(0, 8)
})
function onModalSearchInput() { modalShowDropdown.value = !!modalSearch.value.trim() }
function selectModalCtoon(c) {
  modalSelectedCtoon.value = c
  modalSearch.value = c.name
  modalShowDropdown.value = false
}

const editFiltered = computed(() => {
  const t = editSearch.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => c.name.toLowerCase().includes(t))
    .slice(0, 8)
})
function onEditSearchInput() { editShowDropdown.value = !!editSearch.value.trim() }
function selectEditCtoon(c) {
  editSelectedCtoon.value = c
  editSearch.value = c.name
  editShowDropdown.value = false
}

function openAddModal() {
  modalSelectedCtoon.value = null
  modalSearch.value = ''
  modalShowDropdown.value = false
  // default date = today
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  modalDate.value = `${y}-${m}-${d}`
  modalTime.value = getDefaultWinballTime(modalDate.value)
  showAddModal.value = true
}
function closeAddModal() { showAddModal.value = false }
function setModalTimeFromDate() { modalTime.value = getDefaultWinballTime(modalDate.value) }

function openEditModal(row) {
  if (!row) return
  editingSchedule.value = row
  editSelectedCtoon.value = row.ctoon || null
  editSearch.value = row.ctoon?.name || ''
  editShowDropdown.value = false
  const { date, time } = splitStartsAtLocal(row.startsAtLocal)
  editDate.value = date
  editTime.value = time || getDefaultWinballTime(date)
  showEditModal.value = true
}
function closeEditModal() { showEditModal.value = false }
function setEditTimeFromDate() { editTime.value = getDefaultWinballTime(editDate.value) }

async function createSchedule() {
  if (!modalSelectedCtoon.value || !modalDate.value || !modalTime.value) return
  savingSchedule.value = true
  toastMessage.value = ''
  try {
    // send local Central datetime as "YYYY-MM-DD HH:mm" string
    const startsAtLocal = `${modalDate.value} ${modalTime.value}`
    const res = await $fetch('/api/admin/winball-grand-prize', {
      method: 'POST',
      body: {
        ctoonId: modalSelectedCtoon.value.id,
        startsAtLocal
      }
    })
    schedules.value.unshift({
      id: res.item.id,
      ctoon: res.item.ctoon,
      // the GET formats startsAtLocal for display; call loadSchedules to normalize
    })
    await loadSchedules()
    toastMessage.value = 'Grand prize schedule added'
    toastType.value = 'success'
    showAddModal.value = false
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Failed to add schedule'
    toastType.value = 'error'
  } finally {
    savingSchedule.value = false
  }
}

async function updateSchedule() {
  if (!editingSchedule.value?.id || !editSelectedCtoon.value || !editDate.value || !editTime.value) return
  savingEditSchedule.value = true
  toastMessage.value = ''
  try {
    const startsAtLocal = `${editDate.value} ${editTime.value}`
    await $fetch(`/api/admin/winball-grand-prize/${editingSchedule.value.id}`, {
      method: 'PUT',
      body: {
        ctoonId: editSelectedCtoon.value.id,
        startsAtLocal
      }
    })
    await loadSchedules()
    toastMessage.value = 'Schedule updated'
    toastType.value = 'success'
    showEditModal.value = false
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Failed to update schedule'
    toastType.value = 'error'
  } finally {
    savingEditSchedule.value = false
  }
}

async function removeSchedule(row) {
  if (!row?.id) return
  toastMessage.value = ''
  try {
    await $fetch(`/api/admin/winball-grand-prize/${row.id}`, { method: 'DELETE' })
    schedules.value = schedules.value.filter(r => r.id !== row.id)
    toastMessage.value = 'Schedule removed'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Failed to remove schedule'
    toastType.value = 'error'
  }
}

// ── Autocomplete ─────────────────────────────
const filteredMatches = computed(() => {
  const t = searchTerm.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c => c.name.toLowerCase().includes(t))
    .slice(0, 8)
})
function onSearchInput() { showDropdown.value = !!searchTerm.value.trim() }
function selectCtoon(c) {
  selectedCtoonId.value = c.id
  grandPrizeCtoon.value = c
  searchTerm.value      = c.name
  showDropdown.value    = false
}
function clearSelection() {
  selectedCtoonId.value = ''
  grandPrizeCtoon.value = null
  searchTerm.value      = ''
  showDropdown.value    = false
}

// ── Lifecycle & data loading ─────────────────
async function loadSettings() {
  const g = await $fetch('/api/admin/global-config')
  globalDailyPointLimit.value = g.dailyPointLimit
  globalTkoDailyPointLimit.value = g.tkoDailyPointLimit
  gameTileImages.value.winball      = g.gameTileWinballImagePath      || ''
  gameTileImages.value.lotto        = g.gameTileLottoImagePath        || ''
  gameTileImages.value.winwheel     = g.gameTileWinwheelImagePath     || ''
  gameTileImages.value.clash        = g.gameTileClashImagePath        || ''
  gameTileImages.value.tko          = g.gameTileTkoImagePath          || ''
  gameTileImages.value.reorbitmatch = g.gameTileReorbitmatchImagePath || ''
  gameTileImages.value.tower        = g.gameTileTowerImagePath        || ''
  gameTileImages.value.asteroid     = g.gameTileAsteroidImagePath     || ''
  gameTileImages.value.reorbitmemory = g.gameTileReorbitmemoryImagePath || ''
  gameTileImages.value.guessctoon   = g.gameTileGuessctoonImagePath   || ''

  const wb = await $fetch('/api/admin/game-config?gameName=Winball')
  leftCupPoints.value  = wb.leftCupPoints
  rightCupPoints.value = wb.rightCupPoints
  goldCupPoints.value  = wb.goldCupPoints
  if (wb.grandPrizeCtoon) {
    grandPrizeCtoon.value = wb.grandPrizeCtoon
    selectedCtoonId.value = wb.grandPrizeCtoon.id
    searchTerm.value      = wb.grandPrizeCtoon.name
  }
  winballBackboardImagePath.value = wb.winballBackboardImagePath || ''
  winballBumperImagePaths.value = [
    wb.winballBumper1ImagePath || '',
    wb.winballBumper2ImagePath || '',
    wb.winballBumper3ImagePath || ''
  ]
  if (wb.winballColorBackboard) winballBoardLayer.value.winballColorBackboard = wb.winballColorBackboard
  if (wb.winballColorTransform) winballBoardLayer.value.winballColorTransform = wb.winballColorTransform
  if (wb.winballColorTransformIntensity != null) winballBoardLayer.value.winballColorTransformIntensity = wb.winballColorTransformIntensity
  if (wb.winballOverlayColor) winballBoardLayer.value.winballOverlayColor = wb.winballOverlayColor
  if (wb.winballOverlayAlpha != null) winballBoardLayer.value.winballOverlayAlpha = wb.winballOverlayAlpha
  if (wb.winballImageWidthPercent != null) winballBoardLayer.value.winballImageWidthPercent = wb.winballImageWidthPercent
  if (wb.winballImageOffsetXPercent != null) winballBoardLayer.value.winballImageOffsetXPercent = wb.winballImageOffsetXPercent
  if (wb.winballImageOffsetYPercent != null) winballBoardLayer.value.winballImageOffsetYPercent = wb.winballImageOffsetYPercent

  for (const fld of winballColorFields) {
    if (wb[fld.key]) winballColors.value[fld.key] = wb[fld.key]
  }
  for (const fld of winballPhysicsFields) {
    if (wb[fld.key] != null) winballPhysics.value[fld.key] = wb[fld.key]
  }

  if (wb.winballBumper1Radius != null) winballBumperGeometry.value[0].radius = wb.winballBumper1Radius
  if (wb.winballBumper1Height != null) winballBumperGeometry.value[0].height = wb.winballBumper1Height
  if (wb.winballBumper1X      != null) winballBumperGeometry.value[0].x      = wb.winballBumper1X
  if (wb.winballBumper1Z      != null) winballBumperGeometry.value[0].z      = wb.winballBumper1Z
  if (wb.winballBumper2Radius != null) winballBumperGeometry.value[1].radius = wb.winballBumper2Radius
  if (wb.winballBumper2Height != null) winballBumperGeometry.value[1].height = wb.winballBumper2Height
  if (wb.winballBumper2X      != null) winballBumperGeometry.value[1].x      = wb.winballBumper2X
  if (wb.winballBumper2Z      != null) winballBumperGeometry.value[1].z      = wb.winballBumper2Z
  if (wb.winballBumper3Radius != null) winballBumperGeometry.value[2].radius = wb.winballBumper3Radius
  if (wb.winballBumper3Height != null) winballBumperGeometry.value[2].height = wb.winballBumper3Height
  if (wb.winballBumper3X      != null) winballBumperGeometry.value[2].x      = wb.winballBumper3X
  if (wb.winballBumper3Z      != null) winballBumperGeometry.value[2].z      = wb.winballBumper3Z

  if (wb.winballTriangle1Radius != null) winballTriangleGeometry.value[0].radius = wb.winballTriangle1Radius
  if (wb.winballTriangle1Depth  != null) winballTriangleGeometry.value[0].depth  = wb.winballTriangle1Depth
  if (wb.winballTriangle1X      != null) winballTriangleGeometry.value[0].x      = wb.winballTriangle1X
  if (wb.winballTriangle1Z      != null) winballTriangleGeometry.value[0].z      = wb.winballTriangle1Z
  if (wb.winballTriangle2Radius != null) winballTriangleGeometry.value[1].radius = wb.winballTriangle2Radius
  if (wb.winballTriangle2Depth  != null) winballTriangleGeometry.value[1].depth  = wb.winballTriangle2Depth
  if (wb.winballTriangle2X      != null) winballTriangleGeometry.value[1].x      = wb.winballTriangle2X
  if (wb.winballTriangle2Z      != null) winballTriangleGeometry.value[1].z      = wb.winballTriangle2Z

  for (let i = 0; i < 12; i++) {
    const n = i + 1
    if (wb[`winballPeg${n}Radius`] != null) winballPegGeometry.value[i].radius = wb[`winballPeg${n}Radius`]
    if (wb[`winballPeg${n}Height`] != null) winballPegGeometry.value[i].height = wb[`winballPeg${n}Height`]
    if (wb[`winballPeg${n}X`]      != null) winballPegGeometry.value[i].x      = wb[`winballPeg${n}X`]
    if (wb[`winballPeg${n}Z`]      != null) winballPegGeometry.value[i].z      = wb[`winballPeg${n}Z`]
  }

  allCtoons.value = await $fetch('/api/admin/game-ctoons?select=id,name,rarity,assetPath,quantity')

  const cc = await $fetch('/api/admin/game-config?gameName=Clash')
  clashPointsPerWin.value = cc.pointsPerWin

  const tc = await $fetch('/api/admin/game-config?gameName=TKO')
  tkoPointsPerWin.value = tc.pointsPerWin ?? 300

  const ro = await $fetch('/api/admin/game-config?gameName=ReOrbitMatch')
  reorbitPlaysPerPeriod.value   = ro.reorbitPlaysPerPeriod ?? 3
  reorbitPointsPerGame.value    = ro.reorbitPointsPerGame ?? 50
  reorbitTimeSecondsInput.value = ro.reorbitTimeSeconds != null ? String(ro.reorbitTimeSeconds) : ''
  reorbitEmojis.value           = ro.reorbitEmojis ?? []
  reorbitGridSize.value         = ro.reorbitGridSize ?? 8
  reorbitComboMs.value          = ro.reorbitComboMs ?? 3500

  const tw = await $fetch('/api/admin/game-config?gameName=TowerStack')
  towerPlaysPerPeriod.value      = tw.towerPlaysPerPeriod ?? 3
  towerPointsPerGame.value       = tw.towerPointsPerGame ?? 50
  towerBaseSpeed.value           = tw.towerBaseSpeed ?? 90
  towerSpeedGrowthPerLayer.value = tw.towerSpeedGrowthPerLayer ?? 0.03
  towerMaxSpeedMultiplier.value  = tw.towerMaxSpeedMultiplier ?? 2.5
  towerPerfectEpsilon.value      = tw.towerPerfectEpsilon ?? 4
  towerMaxLayers.value           = tw.towerMaxLayers ?? 800

  const ast = await $fetch('/api/admin/game-config?gameName=OperationAsteroid')
  // Column defaults are NOT NULL in the schema, so a present config always has every key; the
  // ?? keeps the existing ref default if the API ever omits one.
  for (const key of ASTEROID_FIELD_KEYS) {
    if (ast[key] != null) asteroidCfg[key].value = ast[key]
  }

  const rm = await $fetch('/api/admin/game-config?gameName=ReOrbitMemory')
  reorbitMemoryPlaysPerPeriod.value    = rm.reorbitMemoryPlaysPerPeriod ?? 3
  reorbitMemoryPointsPerGame.value     = rm.reorbitMemoryPointsPerGame ?? 50
  reorbitMemoryPairs.value             = rm.reorbitMemoryPairs ?? 8
  reorbitMemoryTimeSecondsInput.value  = rm.reorbitMemoryTimeSeconds != null ? String(rm.reorbitMemoryTimeSeconds) : ''
  reorbitMemoryFlipBackDelayMs.value   = rm.reorbitMemoryFlipBackDelayMs ?? 800
  reorbitMemoryCardBackImage.value     = rm.reorbitMemoryCardBackImagePath || ''

  const gc = await $fetch('/api/admin/game-config?gameName=GuessCtoon')
  guessCtoonScoredPlaysPerPeriod.value = gc.guessCtoonScoredPlaysPerPeriod ?? 3
  guessCtoonPointsPerGame.value        = gc.guessCtoonPointsPerGame ?? 50
  guessCtoonSecondsPerQuestion.value   = gc.guessCtoonSecondsPerQuestion ?? 12
  guessCtoonChoices.value              = gc.guessCtoonChoices ?? 4
  guessCtoonMaxQuestions.value         = gc.guessCtoonMaxQuestions ?? 25
  guessCtoonMinStreakForPoints.value   = gc.guessCtoonMinStreakForPoints ?? 3
}

// Win Wheel state
const spinCostWW       = ref(100)
const pointsWonWW      = ref(250)
const maxDailySpinsWW  = ref(2)
const poolCtoons       = ref([])
const searchTermWW     = ref('')
const showDropdownWW   = ref(false)
const loadingWinWheel  = ref(false)

// image upload state
const winWheelFile       = ref(null)
const uploadingImage     = ref(false)
const winWheelImagePath  = ref('')
// sound upload state
const winWheelSoundFile  = ref(null)
const uploadingSound     = ref(false)
const winWheelSoundPath  = ref('')
const winWheelSoundMode  = ref('repeat')

// preview fallback
const previewSrc = computed(() => winWheelImagePath.value || '/images/wheel.svg')

const filteredMatchesWW = computed(() => {
  const t = searchTermWW.value.trim().toLowerCase()
  if (!t) return []
  return allCtoons.value
    .filter(c =>
      (c.quantity === null || c.quantity === '') &&
      c.name.toLowerCase().includes(t) &&
      !poolCtoons.value.some(p => p.id === c.id)
    )
    .slice(0, 8)
})
function onSearchInputWW() { showDropdownWW.value = !!searchTermWW.value.trim() }
function selectPoolCtoon(c) {
  poolCtoons.value.push(c)
  searchTermWW.value = ''
  showDropdownWW.value = false
}
function removePoolCtoon(c) {
  poolCtoons.value = poolCtoons.value.filter(x => x.id !== c.id)
}

async function loadWinWheelConfig() {
  const ww = await $fetch('/api/admin/game-config?gameName=Winwheel')
  spinCostWW.value        = ww.spinCost
  pointsWonWW.value       = ww.pointsWon
  maxDailySpinsWW.value   = ww.maxDailySpins
  winWheelImagePath.value = ww.winWheelImagePath || ''
  winWheelSoundPath.value = ww.winWheelSoundPath || ''
  winWheelSoundMode.value = ww.winWheelSoundMode || 'repeat'
  poolCtoons.value        = (ww.exclusiveCtoons || []).map(o => o.ctoon)
}

// ── Image upload handlers ────────────────────
function onWinWheelFileChange(e) {
  const f = e.target.files?.[0]
  winWheelFile.value = f || null
}
async function uploadWinWheelImage() {
  if (!winWheelFile.value) return
  uploadingImage.value = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', winWheelFile.value)
    fd.append('label', 'winwheel')

    const res = await $fetch('/api/admin/winwheel-image', {
      method: 'POST',
      body: fd
    })
    winWheelImagePath.value = res.assetPath
    toastMessage.value = 'Image uploaded.'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Image upload failed'
    toastType.value = 'error'
  } finally {
    uploadingImage.value = false
    winWheelFile.value = null
  }
}
function removeWinWheelImage() {
  winWheelImagePath.value = ''
}

// ── Sound upload handlers ────────────────────
function onWinWheelSoundChange(e) {
  const f = e.target.files?.[0]
  winWheelSoundFile.value = f || null
}
async function uploadWinWheelSound() {
  if (!winWheelSoundFile.value) return
  uploadingSound.value = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('sound', winWheelSoundFile.value)
    fd.append('label', 'winwheel-sound')

    const res = await $fetch('/api/admin/winwheel-sound', {
      method: 'POST',
      body: fd
    })
    winWheelSoundPath.value = res.assetPath
    toastMessage.value = 'Sound uploaded.'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Sound upload failed'
    toastType.value = 'error'
  } finally {
    uploadingSound.value = false
    winWheelSoundFile.value = null
  }
}
function removeWinWheelSound() {
  winWheelSoundPath.value = ''
}

// ── Winball backboard image upload handlers ──
function onWinballBackboardFileChange(e) {
  const f = e.target.files?.[0]
  winballBackboardFile.value = f || null
}
async function uploadWinballBackboardImage() {
  if (!winballBackboardFile.value) return
  uploadingBackboard.value = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', winballBackboardFile.value)
    fd.append('label', 'winball-backboard')

    const res = await $fetch('/api/admin/winball-backboard-image', {
      method: 'POST',
      body: fd
    })
    winballBackboardImagePath.value = res.assetPath
    toastMessage.value = 'Backboard image uploaded.'
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = 'Backboard image upload failed'
    toastType.value = 'error'
  } finally {
    uploadingBackboard.value = false
    winballBackboardFile.value = null
  }
}
function removeWinballBackboardImage() {
  winballBackboardImagePath.value = ''
}

// ── Winball bumper image upload handlers ──
function onWinballBumperFileChange(idx, e) {
  const f = e.target.files?.[0]
  winballBumperFiles.value[idx] = f || null
}
async function uploadWinballBumperImage(idx) {
  if (!winballBumperFiles.value[idx]) return
  uploadingBumper.value[idx] = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', winballBumperFiles.value[idx])
    fd.append('bumperIndex', String(idx + 1))

    const res = await $fetch('/api/admin/winball-bumper-image', {
      method: 'POST',
      body: fd
    })
    winballBumperImagePaths.value[idx] = res.assetPath
    toastMessage.value = `Bumper ${idx + 1} image uploaded.`
    toastType.value = 'success'
  } catch (e) {
    console.error(e)
    toastMessage.value = `Bumper ${idx + 1} image upload failed`
    toastType.value = 'error'
  } finally {
    uploadingBumper.value[idx] = false
    winballBumperFiles.value[idx] = null
  }
}
function removeWinballBumperImage(idx) {
  winballBumperImagePaths.value[idx] = ''
}

// ── Saves ────────────────────────────────────
async function saveWinWheelConfig() {
  loadingWinWheel.value = true
  toastMessage.value    = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:          'Winwheel',
        spinCost:          spinCostWW.value,
        pointsWon:         pointsWonWW.value,
        maxDailySpins:     maxDailySpinsWW.value,
        exclusiveCtoons:   poolCtoons.value.map(c => c.id),
        winWheelImagePath: winWheelImagePath.value || null,
        winWheelSoundPath: winWheelSoundPath.value || null,
        winWheelSoundMode: winWheelSoundMode.value || 'repeat'
      }
    })
    toastMessage.value = 'Win Wheel settings saved!'
    toastType.value    = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving Win Wheel settings'
    toastType.value    = 'error'
  } finally {
    loadingWinWheel.value = false
  }
}

async function saveGlobalConfig() {
  loadingGlobal.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/global-config', {
      method: 'POST',
      body: {
        dailyPointLimit: globalDailyPointLimit.value,
        tkoDailyPointLimit: globalTkoDailyPointLimit.value
      }
    })
    toastMessage.value = 'Global settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving global settings'; toastType.value = 'error'
  } finally {
    loadingGlobal.value = false
  }
}

async function saveWinballConfig() {
  loadingWinball.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:                 'Winball',
        leftCupPoints:            leftCupPoints.value,
        rightCupPoints:           rightCupPoints.value,
        goldCupPoints:            goldCupPoints.value,
        dailyPointLimit:          globalDailyPointLimit.value,
        grandPrizeCtoonId:        selectedCtoonId.value || null,
        winballBackboardImagePath: winballBackboardImagePath.value || null,
        winballBumper1ImagePath:   winballBumperImagePaths.value[0] || null,
        winballBumper2ImagePath:   winballBumperImagePaths.value[1] || null,
        winballBumper3ImagePath:   winballBumperImagePaths.value[2] || null,
        winballBumper1Radius: winballBumperGeometry.value[0].radius,
        winballBumper1Height: winballBumperGeometry.value[0].height,
        winballBumper1X:      winballBumperGeometry.value[0].x,
        winballBumper1Z:      winballBumperGeometry.value[0].z,
        winballBumper2Radius: winballBumperGeometry.value[1].radius,
        winballBumper2Height: winballBumperGeometry.value[1].height,
        winballBumper2X:      winballBumperGeometry.value[1].x,
        winballBumper2Z:      winballBumperGeometry.value[1].z,
        winballBumper3Radius: winballBumperGeometry.value[2].radius,
        winballBumper3Height: winballBumperGeometry.value[2].height,
        winballBumper3X:      winballBumperGeometry.value[2].x,
        winballBumper3Z:      winballBumperGeometry.value[2].z,
        winballTriangle1Radius: winballTriangleGeometry.value[0].radius,
        winballTriangle1Depth:  winballTriangleGeometry.value[0].depth,
        winballTriangle1X:      winballTriangleGeometry.value[0].x,
        winballTriangle1Z:      winballTriangleGeometry.value[0].z,
        winballTriangle2Radius: winballTriangleGeometry.value[1].radius,
        winballTriangle2Depth:  winballTriangleGeometry.value[1].depth,
        winballTriangle2X:      winballTriangleGeometry.value[1].x,
        winballTriangle2Z:      winballTriangleGeometry.value[1].z,
        ...Object.fromEntries(
          winballPegGeometry.value.flatMap((p, i) => [
            [`winballPeg${i+1}Radius`, p.radius],
            [`winballPeg${i+1}Height`, p.height],
            [`winballPeg${i+1}X`,      p.x],
            [`winballPeg${i+1}Z`,      p.z]
          ])
        ),
        ...winballBoardLayer.value,
        ...winballColors.value,
        ...winballPhysics.value
      }
    })
    toastMessage.value = 'Winball settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving Winball settings'; toastType.value = 'error'
  } finally {
    loadingWinball.value = false
  }
}

async function saveClashConfig() {
  loadingClash.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:        'Clash',
        pointsPerWin:    clashPointsPerWin.value,
        dailyPointLimit: globalDailyPointLimit.value
      }
    })
    toastMessage.value = 'Clash settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving Clash settings'; toastType.value = 'error'
  } finally {
    loadingClash.value = false
  }
}

async function saveTkoConfig() {
  loadingTkoConfig.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:        'TKO',
        pointsPerWin:    tkoPointsPerWin.value,
        dailyPointLimit: globalDailyPointLimit.value
      }
    })
    toastMessage.value = 'TKO settings saved!'; toastType.value = 'success'
  } catch {
    toastMessage.value = 'Error saving TKO settings'; toastType.value = 'error'
  } finally {
    loadingTkoConfig.value = false
  }
}

// ── Game Tile Images ─────────────────────────
const gameTileSlots = [
  { slot: 'winball',      label: 'Winball' },
  { slot: 'lotto',        label: 'Lotto' },
  { slot: 'winwheel',     label: 'Win Wheel' },
  { slot: 'clash',        label: 'gToons Clash' },
  { slot: 'tko',          label: 'TKO' },
  { slot: 'reorbitmatch', label: 'ReOrbit Match' },
  { slot: 'tower',        label: 'Tower Stack' },
  { slot: 'reorbitmemory', label: 'ReOrbit Memory' },
  { slot: 'guessctoon',   label: 'Guess that cToon!' },
  { slot: 'asteroid',     label: 'Op. A.S.T.E.R.O.I.D.' }
]
const gameTileImages = ref({ winball: '', lotto: '', winwheel: '', clash: '', tko: '', reorbitmatch: '', tower: '', reorbitmemory: '', guessctoon: '', asteroid: '' })
const gameTileFiles  = ref({ winball: null, lotto: null, winwheel: null, clash: null, tko: null, reorbitmatch: null, tower: null, reorbitmemory: null, guessctoon: null, asteroid: null })
const uploadingGameTile = ref({ winball: false, lotto: false, winwheel: false, clash: false, tko: false, reorbitmatch: false, tower: false, reorbitmemory: false, guessctoon: false, asteroid: false })

function onGameTileFile(slot, e) {
  gameTileFiles.value[slot] = e.target.files?.[0] || null
}

async function uploadGameTile(slot) {
  const file = gameTileFiles.value[slot]
  if (!file) return
  uploadingGameTile.value[slot] = true
  toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', file)
    fd.append('slot', slot)
    const res = await $fetch('/api/admin/game-tile-image', { method: 'POST', body: fd })
    gameTileImages.value[slot] = res.assetPath
    gameTileFiles.value[slot] = null
    toastMessage.value = 'Game tile image uploaded.'
    toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Upload failed'
    toastType.value = 'error'
  } finally {
    uploadingGameTile.value[slot] = false
  }
}

async function removeGameTile(slot) {
  toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-tile-image', { method: 'DELETE', body: { slot } })
    gameTileImages.value[slot] = ''
    toastMessage.value = 'Game tile image removed.'
    toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Remove failed'
    toastType.value = 'error'
  }
}

// ── ReOrbit Match ─────────────────────────────
const reorbitPlaysPerPeriod  = ref(3)
const reorbitPointsPerGame   = ref(50)
const reorbitTimeSecondsInput = ref('')  // '' = unlimited (null)
const reorbitEmojis          = ref([])
const reorbitGridSize        = ref(8)
const reorbitComboMs         = ref(3500)
const reorbitEmojiInput      = ref('')
const loadingReorbit         = ref(false)

// ── Tower Stack ────────────────────────────────
const towerPlaysPerPeriod      = ref(3)
const towerPointsPerGame       = ref(50)
const towerBaseSpeed           = ref(90)
const towerSpeedGrowthPerLayer = ref(0.03)
const towerMaxSpeedMultiplier  = ref(2.5)
const towerPerfectEpsilon      = ref(4)
const towerMaxLayers           = ref(800)
const loadingTower              = ref(false)

// ── Operation A.S.T.E.R.O.I.D. ────────────────
// Defaults mirror DEFAULT_CONFIG in lib/asteroidSim.js. Declared as one map so the template,
// the loader and the saver all iterate the same key list instead of repeating 27 names.
const loadingAsteroid = ref(false)
const asteroidRankedPlaysPerPeriod = ref(3)
const asteroidPointsPerGame        = ref(50)
const asteroidStartingLives        = ref(3)
const asteroidStartAsteroids       = ref(4)
const asteroidAsteroidsPerWave     = ref(1)
const asteroidAsteroidSpeed        = ref(1.15)
const asteroidWaveSpeedGrowth      = ref(0.06)
const asteroidMaxSpeedMultiplier   = ref(2.2)
const asteroidTurnRate             = ref(6)
const asteroidThrustAccel          = ref(0.145)
const asteroidMaxShipSpeed         = ref(5.6)
const asteroidShipDrag             = ref(0.992)
const asteroidFireIntervalTicks    = ref(13)
const asteroidExtraLifeScore       = ref(10000)
const asteroidShipRadius           = ref(13)
const asteroidBulletSpeed          = ref(6.2)
const asteroidBulletLifeTicks      = ref(66)
const asteroidRespawnInvulnTicks   = ref(96)
const asteroidPowerupRadius        = ref(13)
const asteroidPowerupLifeTicks     = ref(600)
const asteroidLargeRadius          = ref(34)
const asteroidMediumRadius         = ref(20)
const asteroidSmallRadius          = ref(11)
const asteroidPointsLarge          = ref(20)
const asteroidPointsMedium         = ref(50)
const asteroidPointsSmall          = ref(100)
const asteroidWaveClearBonus       = ref(250)
const asteroidPowerupsEnabled      = ref(true)
const asteroidPowerupBlueEnabled   = ref(true)
const asteroidPowerupRedEnabled    = ref(true)
const asteroidPowerupGreenEnabled  = ref(true)
const asteroidPowerupIntervalTicks = ref(900)
const asteroidPowerupChancePercent = ref(65)
const asteroidPowerupBlueTicks     = ref(600)
const asteroidPowerupRedTicks      = ref(420)
const asteroidPowerupGreenTicks    = ref(720)

const asteroidCfg = {
  asteroidRankedPlaysPerPeriod, asteroidPointsPerGame,
  asteroidStartingLives, asteroidStartAsteroids, asteroidAsteroidsPerWave,
  asteroidAsteroidSpeed, asteroidWaveSpeedGrowth, asteroidMaxSpeedMultiplier,
  asteroidTurnRate, asteroidThrustAccel, asteroidMaxShipSpeed, asteroidShipDrag,
  asteroidFireIntervalTicks, asteroidExtraLifeScore,
  asteroidShipRadius, asteroidBulletSpeed, asteroidBulletLifeTicks,
  asteroidRespawnInvulnTicks, asteroidPowerupRadius, asteroidPowerupLifeTicks,
  asteroidLargeRadius, asteroidMediumRadius, asteroidSmallRadius,
  asteroidPointsLarge, asteroidPointsMedium, asteroidPointsSmall, asteroidWaveClearBonus,
  asteroidPowerupsEnabled, asteroidPowerupBlueEnabled, asteroidPowerupRedEnabled,
  asteroidPowerupGreenEnabled, asteroidPowerupIntervalTicks, asteroidPowerupChancePercent,
  asteroidPowerupBlueTicks, asteroidPowerupRedTicks, asteroidPowerupGreenTicks
}
const ASTEROID_FIELD_KEYS = Object.keys(asteroidCfg)

// ── ReOrbit Memory ────────────────────────────
const reorbitMemoryPlaysPerPeriod  = ref(3)
const reorbitMemoryPointsPerGame   = ref(50)
const reorbitMemoryPairs           = ref(8)
const reorbitMemoryTimeSecondsInput = ref('')  // '' = unlimited (null)
const reorbitMemoryFlipBackDelayMs = ref(800)
const reorbitMemoryCardBackImage   = ref('')
const reorbitMemoryCardBackFile    = ref(null)
const uploadingReorbitMemoryCardBack = ref(false)
const loadingReorbitMemory         = ref(false)

function onReorbitMemoryCardBackFile(e) {
  reorbitMemoryCardBackFile.value = e.target.files?.[0] || null
}

async function uploadReorbitMemoryCardBack() {
  const file = reorbitMemoryCardBackFile.value
  if (!file) return
  uploadingReorbitMemoryCardBack.value = true; toastMessage.value = ''
  try {
    const fd = new FormData()
    fd.append('image', file)
    const res = await $fetch('/api/admin/reorbitmemory-cardback-image', { method: 'POST', body: fd })
    reorbitMemoryCardBackImage.value = res.assetPath
    reorbitMemoryCardBackFile.value = null
    toastMessage.value = 'Card back image uploaded.'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Upload failed'; toastType.value = 'error'
  } finally {
    uploadingReorbitMemoryCardBack.value = false
  }
}

async function saveReorbitMemoryConfig() {
  loadingReorbitMemory.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:                      'ReOrbitMemory',
        reorbitMemoryPlaysPerPeriod:   reorbitMemoryPlaysPerPeriod.value,
        reorbitMemoryPointsPerGame:    reorbitMemoryPointsPerGame.value,
        reorbitMemoryPairs:            reorbitMemoryPairs.value,
        reorbitMemoryTimeSeconds:      reorbitMemoryTimeSecondsInput.value !== '' ? Number(reorbitMemoryTimeSecondsInput.value) : null,
        reorbitMemoryFlipBackDelayMs:  reorbitMemoryFlipBackDelayMs.value,
        reorbitMemoryCardBackImagePath: reorbitMemoryCardBackImage.value || null
      }
    })
    toastMessage.value = 'ReOrbit Memory settings saved!'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving ReOrbit Memory settings'; toastType.value = 'error'
  } finally {
    loadingReorbitMemory.value = false
  }
}

// ── Guess that cToon! ──────────────────────────────────────────────────────────
const guessCtoonScoredPlaysPerPeriod = ref(3)
const guessCtoonPointsPerGame        = ref(50)
const guessCtoonSecondsPerQuestion   = ref(12)
const guessCtoonChoices              = ref(4)
const guessCtoonMaxQuestions         = ref(25)
const guessCtoonMinStreakForPoints   = ref(3)
const loadingGuessCtoon              = ref(false)

async function saveGuessCtoonConfig() {
  loadingGuessCtoon.value = true
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:                       'GuessCtoon',
        guessCtoonScoredPlaysPerPeriod: guessCtoonScoredPlaysPerPeriod.value,
        guessCtoonPointsPerGame:        guessCtoonPointsPerGame.value,
        guessCtoonSecondsPerQuestion:   guessCtoonSecondsPerQuestion.value,
        guessCtoonChoices:              guessCtoonChoices.value,
        guessCtoonMaxQuestions:         guessCtoonMaxQuestions.value,
        guessCtoonMinStreakForPoints:   guessCtoonMinStreakForPoints.value
      }
    })
    toastMessage.value = 'Guess that cToon! settings saved!'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving Guess that cToon! settings'; toastType.value = 'error'
  } finally {
    loadingGuessCtoon.value = false
  }
}

function addReorbitEmoji() {
  const e = reorbitEmojiInput.value.trim()
  if (!e) return
  const maxEmojis = Math.min(reorbitGridSize.value, 10)
  if (reorbitEmojis.value.length >= maxEmojis) return
  if (!reorbitEmojis.value.includes(e)) reorbitEmojis.value.push(e)
  reorbitEmojiInput.value = ''
}
function removeReorbitEmoji(i) {
  reorbitEmojis.value.splice(i, 1)
}

async function saveReorbitConfig() {
  loadingReorbit.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:             'ReOrbitMatch',
        reorbitPlaysPerPeriod: reorbitPlaysPerPeriod.value,
        reorbitPointsPerGame:  reorbitPointsPerGame.value,
        reorbitTimeSeconds:    reorbitTimeSecondsInput.value !== '' ? Number(reorbitTimeSecondsInput.value) : null,
        reorbitEmojis:         reorbitEmojis.value,
        reorbitGridSize:       reorbitGridSize.value,
        reorbitComboMs:        reorbitComboMs.value
      }
    })
    toastMessage.value = 'ReOrbit Match settings saved!'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving ReOrbit Match settings'; toastType.value = 'error'
  } finally {
    loadingReorbit.value = false
  }
}

async function saveTowerConfig() {
  loadingTower.value = true; toastMessage.value = ''
  try {
    await $fetch('/api/admin/game-config', {
      method: 'POST',
      body: {
        gameName:                 'TowerStack',
        towerPlaysPerPeriod:      towerPlaysPerPeriod.value,
        towerPointsPerGame:       towerPointsPerGame.value,
        towerBaseSpeed:           towerBaseSpeed.value,
        towerSpeedGrowthPerLayer: towerSpeedGrowthPerLayer.value,
        towerMaxSpeedMultiplier:  towerMaxSpeedMultiplier.value,
        towerPerfectEpsilon:      towerPerfectEpsilon.value,
        towerMaxLayers:           towerMaxLayers.value
      }
    })
    toastMessage.value = 'Tower Stack settings saved!'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    toastMessage.value = 'Error saving Tower Stack settings'; toastType.value = 'error'
  } finally {
    loadingTower.value = false
  }
}

// ── Operation A.S.T.E.R.O.I.D. ───────────────
// The field list is shared by the loader and the saver so a new knob only has to be named once
// here (and in ASTEROID_NUMERIC_RANGES / ASTEROID_BOOLEAN_FIELDS server-side).
async function saveAsteroidConfig() {
  loadingAsteroid.value = true; toastMessage.value = ''
  try {
    const body = { gameName: 'OperationAsteroid' }
    for (const key of ASTEROID_FIELD_KEYS) body[key] = asteroidCfg[key].value
    await $fetch('/api/admin/game-config', { method: 'POST', body })
    toastMessage.value = 'Operation A.S.T.E.R.O.I.D. settings saved!'; toastType.value = 'success'
  } catch (err) {
    console.error(err)
    const msg = err?.data?.statusMessage || 'Error saving Operation A.S.T.E.R.O.I.D. settings'
    toastMessage.value = msg; toastType.value = 'error'
  } finally {
    loadingAsteroid.value = false
  }
}

// ── TKO ──────────────────────────────────────
const tkoLoaded      = ref(false)
const tkoLoading     = ref(false)
const tkoTotalEvents = ref(0)
const tkoUniqueUsers = ref(0)
const tkoEvents      = ref([])

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  })
}

async function loadTkoEvents() {
  tkoLoading.value = true
  try {
    const res = await $fetch('/api/admin/tko-events')
    tkoTotalEvents.value = res.totalEvents
    tkoUniqueUsers.value = res.uniqueReorbitUsers
    tkoEvents.value      = res.events || []
    tkoLoaded.value      = true
  } catch (e) {
    console.error(e)
  } finally {
    tkoLoading.value = false
  }
}

onMounted(async () => {
  await loadSettings()
  await loadWinWheelConfig()
  await loadSchedules()
})
</script>

<style scoped>
.input {
  margin-top: .25rem;
  width: 100%;
  border: 1px solid #D1D5DB;
  border-radius: .375rem;
  padding: .5rem;
  outline: none;
}
.input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 1px #6366F1;
}
.btn-primary {
  margin-top: .25rem;
  background-color: #6366F1;
  color: white;
  padding: .5rem 1.25rem;
  border-radius: .375rem;
}
.btn-primary:disabled { opacity: .5; }

/* hide horizontal scrollbar on mobile tab strip */
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
