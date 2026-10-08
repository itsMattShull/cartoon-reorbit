<template>
  <div class="admin-cmoon-enemies bg-gray-50 text-xs" style="color-scheme: light;">
    <div class="px-2 py-2 space-y-4">
      <h1 class="text-base font-semibold">Manage cMoon Enemies</h1>
      <p class="text-gray-600">
        Build NPC factions that appear as a random site-wide battle popup. Each faction just groups
        its members for organization — HP, battle mode, cMoon points, and prizes are all set per
        member. Popup appearance rate and cooldown live on the
        <NuxtLink to="/newsite/admin/cMoon" class="text-indigo-600 hover:underline">cMoons</NuxtLink> page;
        results are recorded on the
        <NuxtLink to="/newsite/admin/cMoonBattleLogs" class="text-indigo-600 hover:underline">cMoon Battle Logs</NuxtLink> page.
      </p>

      <p v-if="loadError" class="text-red-600">{{ loadError }}</p>

      <!-- ── Global spawn behavior ────────────────────────────────── -->
      <section class="bg-white border rounded p-3 space-y-2">
        <h2 class="font-semibold text-sm">Encounter spawning</h2>
        <label class="flex items-start gap-2">
          <input type="checkbox" v-model="higherTierFirst" class="mt-0.5" @change="saveHigherTierFirst" :disabled="savingHigherTierFirst" />
          <span>
            <span class="font-medium">Higher tiered enemies first</span>
            <p class="text-[11px] text-gray-500 mt-0.5">
              When on, the popup roll only considers the HIGHEST rank currently available to a given
              player (not gatekept by "min. personal wins to unlock") — a Final Boss beats an
              Underboss beats an Enforcer beats a Goon, whenever one is actually offerable. When off
              (default), every eligible rank is offered together, weighted by each enemy's own
              occurrence weight below.
            </p>
          </span>
        </label>
        <p v-if="higherTierFirstError" class="text-red-600">{{ higherTierFirstError }}</p>
      </section>

      <!-- ── Special attacks ──────────────────────────────────────── -->
      <section class="space-y-2">
        <h2 class="font-semibold text-sm">Manage Special Attacks</h2>
        <p class="text-gray-600">
          A reusable library — build attacks here, then assign one to any cMoon below (its own players can
          charge and fire it after 3 consecutive hits) and/or any enemy faction (its NPCs fire it back the
          same way). The same attack can be assigned to several cMoons/factions at once.
        </p>
        <div class="space-y-2">
          <div v-for="a in specialAttacks" :key="a.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <div class="font-semibold break-words">{{ a.name }}</div>
              <div v-if="a.description" class="text-[11px] text-gray-600 break-words">{{ a.description }}</div>
              <div class="text-[11px] text-gray-600">
                {{ SPECIAL_ATTACK_EFFECT_LABELS[a.effectType] }} ({{ a.amount }})
                <span v-if="a.cmoonUsageCount || a.enemyFactionUsageCount">
                  · used by {{ a.cmoonUsageCount }} cMoon(s), {{ a.enemyFactionUsageCount }} faction(s)
                </span>
              </div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <button type="button" class="text-indigo-600 hover:underline" @click="startEditSpecialAttack(a)">Edit</button>
              <button
                type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="(a.cmoonUsageCount > 0 || a.enemyFactionUsageCount > 0) || deletingSpecialAttackId === a.id"
                :title="(a.cmoonUsageCount > 0 || a.enemyFactionUsageCount > 0) ? 'Reassign every cMoon/faction using it first' : ''"
                @click="removeSpecialAttack(a)"
              >{{ deletingSpecialAttackId === a.id ? 'Deleting…' : 'Delete' }}</button>
            </div>
          </div>
          <p v-if="!loading && !specialAttacks.length" class="text-gray-500">No special attacks yet.</p>
        </div>

        <div class="bg-white border rounded p-3 space-y-3">
          <h3 class="font-semibold text-sm">{{ specialAttackForm.id ? 'Edit special attack' : 'New special attack' }}</h3>
          <p v-if="specialAttackFormError" class="text-red-600">{{ specialAttackFormError }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="specialAttackForm.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Toxic Bite" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Description (optional, shown in the player's "?" tooltip, {{ specialAttackForm.description.length }}/300)</label>
            <textarea v-model="specialAttackForm.description" maxlength="300" rows="2" class="w-full border rounded px-2 py-1"></textarea>
          </div>
          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Effect</label>
              <select v-model="specialAttackForm.effectType" class="w-full border rounded px-2 py-1">
                <option v-for="t in SPECIAL_ATTACK_EFFECT_TYPES" :key="t" :value="t">{{ SPECIAL_ATTACK_EFFECT_LABELS[t] }}</option>
              </select>
            </div>
            <div class="w-28 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Amount (1-999)</label>
              <input v-model.number="specialAttackForm.amount" type="number" min="1" max="999" class="w-full border rounded px-2 py-1" />
            </div>
          </div>
          <p class="text-[11px] text-gray-500">{{ SPECIAL_ATTACK_EFFECT_HELP[specialAttackForm.effectType] }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Sound (optional, MP3/OGG/WAV, max 3MB)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <audio v-if="specialAttackSavedSoundPath" :src="specialAttackSavedSoundPath" controls class="h-8" style="max-width: 220px;" />
              <span v-else class="text-[10px] text-gray-400">No sound</span>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" class="block w-full" @change="onSpecialAttackSoundFile" />
                <p class="text-[10px] text-gray-500">Plays the instant this attack fires, for whichever side cast it.</p>
                <p v-if="specialAttackSoundError" class="text-red-600">{{ specialAttackSoundError }}</p>
                <button
                  v-if="specialAttackForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!specialAttackPendingSoundFile || specialAttackUploadingSound" @click="uploadSpecialAttackSound"
                >{{ specialAttackUploadingSound ? 'Uploading…' : 'Upload sound' }}</button>
                <p v-else-if="specialAttackPendingSoundFile" class="text-[11px] text-gray-500">Uploads together with "Create attack" below.</p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="specialAttackSaving" @click="saveSpecialAttack"
            >{{ specialAttackSaving ? 'Saving…' : (specialAttackForm.id ? 'Save changes' : 'Create attack') }}</button>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetSpecialAttackForm">Cancel</button>
          </div>
        </div>
      </section>

      <!-- ── Factions ─────────────────────────────────────────────── -->
      <section class="space-y-2">
        <h2 class="font-semibold text-sm">Factions</h2>
        <div class="space-y-2">
          <div v-for="f in factions" :key="f.id" class="bg-white rounded border p-3 flex items-center gap-3 flex-wrap">
            <div class="w-20 h-14 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
              <img v-if="f.bannerImagePath" :src="f.bannerImagePath" alt="" class="w-full h-full object-cover" />
              <span v-else class="text-gray-400 text-[10px]">No banner</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold break-words">{{ f.name }}<span v-if="!f.active" class="ml-2 text-[10px] font-normal text-gray-500">(inactive)</span></div>
              <div v-if="f.description" class="text-[11px] text-gray-600 break-words">{{ f.description }}</div>
              <div class="text-[11px] text-gray-600">
                {{ f.memberCount }} member{{ f.memberCount === 1 ? '' : 's' }}
                <span v-if="f.appearEffect"> · Appear effect: {{ f.appearEffect.name }}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
              <button type="button" class="text-indigo-600 hover:underline" @click="startEditFaction(f)">Edit</button>
              <button
                type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="f.memberCount > 0 || deletingFactionId === f.id"
                :title="f.memberCount > 0 ? 'Delete or move its members first' : ''"
                @click="removeFaction(f)"
              >{{ deletingFactionId === f.id ? 'Deleting…' : 'Delete' }}</button>
            </div>
          </div>
          <p v-if="!loading && !factions.length" class="text-gray-500">No enemy factions yet.</p>
        </div>

        <div class="bg-white border rounded p-3 space-y-3">
          <h3 class="font-semibold text-sm">{{ factionForm.id ? 'Edit faction' : 'New faction' }}</h3>
          <p v-if="factionFormError" class="text-red-600">{{ factionFormError }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="factionForm.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. The Void Syndicate" />
          </div>
          <div>
            <label class="block text-xs font-medium mb-1">Description (optional, {{ factionForm.description.length }}/500)</label>
            <textarea v-model="factionForm.description" maxlength="500" rows="2" class="w-full border rounded px-2 py-1"></textarea>
          </div>
          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="factionForm.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex items-end pb-1.5">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="factionForm.active" />
                <span class="text-xs font-medium">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Appear effect (optional)</label>
            <select v-model="factionForm.appearEffectId" class="w-full border rounded px-2 py-1">
              <option value="">No effect — popup shows immediately</option>
              <option v-for="fx in joinEffects" :key="fx.id" :value="fx.id">{{ fx.name }}</option>
            </select>
            <p class="text-[10px] text-gray-500 mt-1">
              Full-screen effect played the moment the battle popup first offers a member of this faction. Built in
              <NuxtLink to="/newsite/admin/cMoonJoinEffects" class="text-indigo-600 hover:underline">Manage cMoon Join Effects</NuxtLink>.
            </p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Special attack (optional)</label>
            <select v-model="factionForm.specialAttackId" class="w-full border rounded px-2 py-1">
              <option value="">None — this faction's NPCs never fire one</option>
              <option v-for="a in specialAttacks" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <p class="text-[10px] text-gray-500 mt-1">
              Every member of this faction charges and fires this one attack after landing 3 consecutive hits on a
              player. Built above in "Manage Special Attacks".
            </p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Banner (optional, static or animated GIF)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <div class="w-32 h-[42px] bg-gray-100 border rounded flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="factionPreviewImageSrc" :src="factionPreviewImageSrc" alt="" class="w-full h-full object-cover" />
                <span v-else class="text-gray-400 text-[10px]">No banner</span>
              </div>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block w-full" @change="onFactionFile" />
                <p class="text-[10px] text-gray-500">PNG, JPEG, WEBP, or animated GIF. Max 5MB. Cropped to fill a 3:1 banner.</p>
                <p v-if="factionImageError" class="text-red-600">{{ factionImageError }}</p>
                <button
                  v-if="factionForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!factionPendingFile || factionUploadingImage" @click="uploadFactionImage"
                >{{ factionUploadingImage ? 'Uploading…' : 'Upload banner' }}</button>
                <p v-else class="text-[11px] text-gray-500">Picking a file here uploads it together with "Create faction" below.</p>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Battle music (optional, MP3/OGG/WAV, max 3MB)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <audio v-if="factionSavedMusicPath" :src="factionSavedMusicPath" controls class="h-8" style="max-width: 240px;" />
              <span v-else class="text-[10px] text-gray-400">No music</span>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" class="block w-full" @change="onFactionMusicFile" />
                <p class="text-[10px] text-gray-500">Loops for as long as a player is fighting any member of this faction.</p>
                <p v-if="factionMusicError" class="text-red-600">{{ factionMusicError }}</p>
                <button
                  v-if="factionForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!factionPendingMusicFile || factionUploadingMusic" @click="uploadFactionMusic"
                >{{ factionUploadingMusic ? 'Uploading…' : 'Upload music' }}</button>
                <p v-else-if="factionPendingMusicFile" class="text-[11px] text-gray-500">Uploads together with "Create faction" below.</p>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Default battle sounds (optional, MP3/OGG/WAV, max 3MB each)</label>
            <p class="text-[10px] text-gray-500 mb-2">
              Used by any member of this faction that hasn't uploaded its own sound for that moment — a member's
              own upload always overrides this.
            </p>
            <div class="space-y-2">
              <div v-for="slot in FACTION_SOUND_SLOTS" :key="slot.key" class="border rounded p-2 flex items-center gap-3 flex-wrap">
                <div class="w-40 flex-shrink-0">
                  <div class="font-medium">{{ slot.label }}</div>
                  <div class="text-[10px] text-gray-500">{{ slot.help }}</div>
                </div>
                <audio v-if="factionSoundState[slot.key].savedPath" :src="factionSoundState[slot.key].savedPath" controls class="h-8 flex-shrink-0" style="max-width: 220px;" />
                <span v-else class="text-[10px] text-gray-400 flex-shrink-0">No default sound</span>
                <div class="space-y-1 flex-1 min-w-[180px]">
                  <input
                    type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" class="block w-full text-[11px]"
                    @change="onFactionSoundFile(slot.key, $event)"
                  />
                  <p v-if="factionSoundState[slot.key].error" class="text-red-600">{{ factionSoundState[slot.key].error }}</p>
                  <button
                    v-if="factionForm.id" type="button" class="px-2 py-1 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    :disabled="!factionSoundState[slot.key].pendingFile || factionSoundState[slot.key].uploading" @click="uploadFactionSound(slot.key)"
                  >{{ factionSoundState[slot.key].uploading ? 'Uploading…' : 'Upload' }}</button>
                  <p v-else-if="factionSoundState[slot.key].pendingFile" class="text-[11px] text-gray-500">Uploads together with "Create faction" below.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="factionSaving" @click="saveFaction"
            >{{ factionSaving ? 'Saving…' : (factionForm.id ? 'Save changes' : 'Create faction') }}</button>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetFactionForm">Cancel</button>
          </div>
        </div>
      </section>

      <!-- ── Members ──────────────────────────────────────────────── -->
      <section class="space-y-2 pt-2 border-t">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-semibold text-sm">Enemy Members</h2>
          <select v-model="memberFactionFilter" class="border rounded px-2 py-1">
            <option value="">All factions</option>
            <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </div>

        <div class="space-y-2">
          <div v-for="m in filteredMembers" :key="m.id" class="bg-white rounded border p-3 space-y-2">
            <div class="flex items-center gap-3 flex-wrap">
              <div class="w-14 h-14 rounded border flex-shrink-0 overflow-hidden bg-gray-100 flex items-center justify-center">
                <img v-if="m.imagePath" :src="m.imagePath" alt="" class="max-w-full max-h-full object-contain" />
                <span v-else class="text-gray-400 text-[10px]">No art</span>
              </div>
              <div class="min-w-0 flex-1">
                <div class="font-semibold break-words">
                  {{ m.name }}
                  <span v-if="!m.active" class="ml-1 text-[10px] font-normal text-gray-500">(inactive)</span>
                  <span v-if="m.defeatedAt" class="ml-1 text-[10px] font-normal text-red-600">(defeated)</span>
                  <span v-if="raidBossStatus(m)" class="ml-1 text-[10px] font-normal text-red-600">({{ raidBossStatus(m) }})</span>
                </div>
                <div class="text-[11px] text-gray-600 break-words">
                  <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold" :class="RANK_BADGE_CLASS[m.rank]">{{ RANK_LABELS[m.rank] }}</span>
                  <span v-if="m.isRaidBoss" class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white ml-1">🐲 Raid Boss</span> ·
                  {{ m.faction?.name }} · {{ m.battleMode === 'SHARED_POOL' ? 'Shared pool' : 'Per player' }} ·
                  HP {{ m.battleMode === 'SHARED_POOL' ? `${m.currentHp}/${m.maxHp}` : m.maxHp }} ·
                  {{ m.cMoonPointsReward }} cMoon pts · {{ m.rewardCount }} prize row{{ m.rewardCount === 1 ? '' : 's' }} ·
                  {{ m.battleCount }} battle{{ m.battleCount === 1 ? '' : 's' }} fought
                  <span v-if="m.minPriorDefeats > 0"> · requires {{ m.minPriorDefeats }} prior win{{ m.minPriorDefeats === 1 ? '' : 's' }}</span>
                  <span v-if="m.isRaidBoss && m.raidOneTime"> · one-time raid boss</span>
                  <span v-else-if="m.isRaidBoss && m.raidCooldownMinutes > 0"> · {{ formatCooldown(m.raidCooldownMinutes) }} raid cooldown</span>
                </div>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <button
                  v-if="(m.battleMode === 'SHARED_POOL' && m.defeatedAt) || !!raidBossStatus(m)"
                  type="button" class="text-indigo-600 hover:underline disabled:opacity-40"
                  :disabled="resettingId === m.id" @click="resetMember(m)"
                >{{ resettingId === m.id ? 'Reviving…' : 'Revive' }}</button>
                <button type="button" class="text-purple-600 hover:underline" @click="previewMemberId = m.id">Preview</button>
                <button
                  v-if="m.isRaidBoss" type="button" class="text-purple-600 hover:underline disabled:opacity-40"
                  :disabled="startingRaidPreviewId === m.id" @click="startRaidPreview(m)"
                  title="Live-test the co-op raid flow — other admins get notified and can join, nothing is real"
                >{{ startingRaidPreviewId === m.id ? 'Starting…' : 'Preview Raid' }}</button>
                <button type="button" class="text-indigo-600 hover:underline" @click="startEditMember(m)">Edit</button>
                <button
                  type="button" class="text-red-600 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                  :disabled="m.hasBattles || deletingMemberId === m.id"
                  :title="m.hasBattles ? 'Has battle history — deactivate instead of deleting' : ''"
                  @click="removeMember(m)"
                >{{ deletingMemberId === m.id ? 'Deleting…' : 'Delete' }}</button>
              </div>
            </div>
          </div>
          <p v-if="!loading && !filteredMembers.length" class="text-gray-500">No enemy members yet.</p>
        </div>

        <div class="bg-white border rounded p-3 space-y-3">
          <h3 class="font-semibold text-sm">{{ memberForm.id ? 'Edit member' : 'New member' }}</h3>
          <p v-if="memberFormError" class="text-red-600">{{ memberFormError }}</p>

          <div>
            <label class="block text-xs font-medium mb-1">Faction</label>
            <select v-model="memberForm.factionId" class="w-full border rounded px-2 py-1">
              <option value="" disabled>Select a faction…</option>
              <option v-for="f in factions" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Name</label>
            <input v-model="memberForm.name" maxlength="60" class="w-full border rounded px-2 py-1" placeholder="e.g. Grim Sentinel" />
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Battle mode</label>
            <select v-model="memberForm.battleMode" class="w-full border rounded px-2 py-1" :disabled="editingMemberHasBattles">
              <option value="PER_PLAYER">Per player — every player fights their own fresh copy</option>
              <option value="SHARED_POOL">Shared pool — all players chip away at one HP total</option>
            </select>
            <p v-if="editingMemberHasBattles" class="text-[11px] text-gray-500 mt-1">Can't change once this enemy has been fought.</p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Rank</label>
            <select v-model="memberForm.rank" class="w-full border rounded px-2 py-1" :disabled="editingMemberHasBattles">
              <option v-for="r in RANKS" :key="r" :value="r">{{ RANK_LABELS[r] }}</option>
            </select>
            <p class="text-[11px] text-gray-500 mt-1">Cosmetic tier badge shown to admins and players — doesn't affect HP, crit chance, or rewards, but achievements can require wins by rank.</p>
            <p v-if="editingMemberHasBattles" class="text-[11px] text-gray-500 mt-1">Can't change once this enemy has been fought — rank-scoped achievements count wins against the member's current rank.</p>
          </div>

          <div v-if="memberForm.rank === 'FINAL_BOSS'" class="border rounded p-2 space-y-2 bg-red-50/50">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="memberForm.isRaidBoss" />
              <span class="text-xs font-medium">Group raid boss</span>
            </label>
            <p class="text-[11px] text-gray-500">
              The first eligible player to encounter this boss can start a raid instead of fighting solo: up to 3 more
              eligible members of their own cMoon get a 60-second window to join before it auto-starts, everyone sees
              each other's moves live, and a party win grants the same shared prize to everyone who joined.
            </p>
            <div v-if="memberForm.isRaidBoss">
              <label class="block text-[11px] font-medium mb-1">Discord announcement (optional)</label>
              <textarea
                v-model="memberForm.raidAnnouncementText" rows="2" maxlength="500"
                class="w-full border rounded px-2 py-1 text-xs"
                placeholder="🚨 A raid boss ({enemy}) is being fought in {cmoon}! Up to 4 members can join the fight."
              ></textarea>
              <p class="text-[10px] text-gray-500 mt-1">Posted the moment a raid starts. {cmoon} and {enemy} are replaced automatically. Leave blank to use the default wording above.</p>
            </div>
            <div v-if="memberForm.isRaidBoss" class="pt-1">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="memberForm.raidOneTime" />
                <span class="text-[11px] font-medium">One-time raid boss</span>
              </label>
              <p class="text-[10px] text-gray-500 mt-1">
                Once defeated, this boss can never be raided again until an admin hits "Revive" below — overrides the
                cooldown, if one is also set.
              </p>
            </div>
            <div v-if="memberForm.isRaidBoss && !memberForm.raidOneTime">
              <label class="block text-[11px] font-medium mb-1">Raid cooldown after a win, in minutes (0-43200)</label>
              <input v-model.number="memberForm.raidCooldownMinutes" type="number" min="0" max="43200" class="w-full border rounded px-2 py-1 text-xs" />
              <p class="text-[10px] text-gray-500 mt-1">0 means it can be raided again immediately. Automatically becomes raidable again once the cooldown passes — no admin action needed.</p>
            </div>
          </div>
          <p v-else-if="memberForm.isRaidBoss" class="text-[11px] text-amber-600">This member is marked as a raid boss but is no longer Final Boss rank — switch it back to Final Boss to keep raid mode, or it will be turned off on save.</p>

          <div>
            <label class="block text-xs font-medium mb-1">Min. personal wins to unlock (0-100000)</label>
            <input v-model.number="memberForm.minPriorDefeats" type="number" min="0" max="100000" class="w-full border rounded px-2 py-1" />
            <p class="text-[11px] text-gray-500 mt-1">This player's OWN lifetime cMoon Enemy Battle win count, not the team's or the server's — 0 means anyone can encounter this enemy. Safe to change anytime.</p>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Occurrence weight (1-100)</label>
            <input v-model.number="memberForm.occurrencePercent" type="number" min="1" max="100" class="w-full border rounded px-2 py-1" />
            <p class="text-[11px] text-gray-500 mt-1">
              A RELATIVE weight against whichever other eligible enemies are offered alongside this one in the
              same roll — not a probability out of 100, and it doesn't need to sum to 100 across your roster. An
              enemy at 90 is offered roughly 9x as often as one at 10 in the same roll. Every enemy defaults to
              50, so leaving this alone keeps the roll exactly as even as it's always been.
            </p>
          </div>

          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Max HP (1-200)</label>
              <input v-model.number="memberForm.maxHp" type="number" min="1" max="200" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">cMoon points on win (0-5000)</label>
              <input v-model.number="memberForm.cMoonPointsReward" type="number" min="0" max="5000" class="w-full border rounded px-2 py-1" />
            </div>
          </div>

          <div class="flex gap-2">
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Crit chance against (0-100%)</label>
              <input v-model.number="memberForm.critChanceAgainstPercent" type="number" min="0" max="100" class="w-full border rounded px-2 py-1" />
              <p class="text-[10px] text-gray-500 mt-1">Chance the player's attack lands as a critical (2x damage) against this enemy.</p>
            </div>
            <div class="flex-1 min-w-0">
              <label class="block text-xs font-medium mb-1">Crit chance from (0-100%)</label>
              <input v-model.number="memberForm.critChanceFromPercent" type="number" min="0" max="100" class="w-full border rounded px-2 py-1" />
              <p class="text-[10px] text-gray-500 mt-1">Chance this enemy's attack lands as a critical (2x damage) against the player.</p>
            </div>
          </div>

          <div class="flex gap-2">
            <div class="w-24 flex-shrink-0">
              <label class="block text-xs font-medium mb-1">Order</label>
              <input v-model.number="memberForm.sortOrder" type="number" class="w-full border rounded px-2 py-1" />
            </div>
            <div class="flex items-end pb-1.5">
              <label class="flex items-center gap-2">
                <input type="checkbox" v-model="memberForm.active" />
                <span class="text-xs font-medium">Active</span>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Portrait (optional, static or animated GIF)</label>
            <div class="flex items-center gap-4 flex-wrap">
              <div class="w-24 h-24 bg-gray-100 border rounded flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="memberPreviewImageSrc" :src="memberPreviewImageSrc" alt="" class="max-w-full max-h-full object-contain" />
                <span v-else class="text-gray-400 text-[10px]">No art</span>
              </div>
              <div class="space-y-2 flex-1 min-w-[200px]">
                <input type="file" accept="image/png,image/jpeg,.jpg,.jpeg,.png,image/webp,.webp,image/gif,.gif" class="block w-full" @change="onMemberFile" />
                <p class="text-[10px] text-gray-500">PNG, JPEG, WEBP, or animated GIF. Max 5MB. Letterboxed, never cropped.</p>
                <p v-if="memberImageError" class="text-red-600">{{ memberImageError }}</p>
                <button
                  v-if="memberForm.id" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  :disabled="!memberPendingFile || memberUploadingImage" @click="uploadMemberImage"
                >{{ memberUploadingImage ? 'Uploading…' : 'Upload portrait' }}</button>
                <p v-else class="text-[11px] text-gray-500">Picking a file here uploads it together with "Create member" below.</p>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium mb-1">Battle sounds (optional, MP3/OGG/WAV, max 3MB each)</label>
            <div class="space-y-2">
              <div v-for="slot in SOUND_SLOTS" :key="slot.key" class="border rounded p-2 flex items-center gap-3 flex-wrap">
                <div class="w-40 flex-shrink-0">
                  <div class="font-medium">{{ slot.label }}</div>
                  <div class="text-[10px] text-gray-500">{{ slot.help }}</div>
                </div>
                <audio v-if="memberSoundState[slot.key].savedPath" :src="memberSoundState[slot.key].savedPath" controls class="h-8 flex-shrink-0" style="max-width: 220px;" />
                <span v-else class="text-[10px] text-gray-400 flex-shrink-0">No sound</span>
                <div class="space-y-1 flex-1 min-w-[180px]">
                  <input
                    type="file" accept="audio/mpeg,audio/ogg,audio/wav,.mp3,.ogg,.wav" class="block w-full text-[11px]"
                    @change="onSoundFile(slot.key, $event)"
                  />
                  <p v-if="memberSoundState[slot.key].error" class="text-red-600">{{ memberSoundState[slot.key].error }}</p>
                  <button
                    v-if="memberForm.id" type="button" class="px-2 py-1 text-[11px] font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    :disabled="!memberSoundState[slot.key].pendingFile || memberSoundState[slot.key].uploading" @click="uploadSound(slot.key)"
                  >{{ memberSoundState[slot.key].uploading ? 'Uploading…' : 'Upload' }}</button>
                  <p v-else-if="memberSoundState[slot.key].pendingFile" class="text-[11px] text-gray-500">Uploads together with "Create member" below.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="memberSaving" @click="saveMember"
            >{{ memberSaving ? 'Saving…' : (memberForm.id ? 'Save changes' : 'Create member') }}</button>
            <button type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md border hover:bg-gray-50" @click="resetMemberForm">Cancel</button>
          </div>

          <!-- Rewards can only attach to an already-created member (needs its id) -->
          <div v-if="memberForm.id" class="pt-2 border-t space-y-2">
            <h4 class="font-semibold text-xs">Potential prizes on a win (each rolled independently)</h4>
            <div v-if="editingMemberRewards.length" class="space-y-1">
              <div v-for="r in editingMemberRewards" :key="r.id" class="flex items-center gap-2 text-[11px] bg-gray-50 rounded px-2 py-1">
                <span class="flex-1 min-w-0 break-words">
                  {{ rewardLabel(r) }} — {{ r.dropChancePercent }}% chance<span v-if="r.rewardType === 'CTOON'"> · x{{ r.quantity }}</span>
                </span>
                <button type="button" class="text-red-600 hover:underline flex-shrink-0" :disabled="deletingRewardId === r.id" @click="removeReward(r)">
                  {{ deletingRewardId === r.id ? 'Removing…' : 'Remove' }}
                </button>
              </div>
            </div>
            <p v-else class="text-gray-500">No prizes configured yet — a win still awards cMoon points either way.</p>

            <p v-if="rewardFormError" class="text-red-600">{{ rewardFormError }}</p>
            <div class="flex gap-2 flex-wrap items-end">
              <div class="w-32 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Prize type</label>
                <select v-model="rewardForm.rewardType" class="w-full border rounded px-2 py-1">
                  <option value="CTOON">cToon</option>
                  <option value="AVATAR">Avatar</option>
                  <option value="BACKGROUND">Background</option>
                  <option value="POINTS">Points</option>
                </select>
              </div>
              <div class="w-24 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Drop % (0-100)</label>
                <input v-model.number="rewardForm.dropChancePercent" type="number" min="0" max="100" step="0.1" class="w-full border rounded px-2 py-1" />
              </div>
              <div v-if="rewardForm.rewardType === 'CTOON'" class="w-20 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Qty (1-20)</label>
                <input v-model.number="rewardForm.quantity" type="number" min="1" max="20" class="w-full border rounded px-2 py-1" />
              </div>
              <div v-if="rewardForm.rewardType === 'POINTS'" class="w-28 flex-shrink-0">
                <label class="block text-[11px] font-medium mb-1">Points (1-5000)</label>
                <input v-model.number="rewardForm.pointsAmount" type="number" min="1" max="5000" class="w-full border rounded px-2 py-1" />
              </div>
            </div>

            <p v-if="rewardForm.rewardType === 'POINTS'" class="text-[11px] text-gray-500">
              Plain site points, separate from the cMoon points on win above — not tied to any cMoon team.
            </p>

            <div v-if="rewardForm.rewardType === 'CTOON'">
              <label class="block text-[11px] font-medium mb-1">cToon</label>
              <input
                v-model="rewardCtoonSearch"
                class="w-full border rounded px-2 py-1"
                :placeholder="rewardForm.ctoonId ? rewardCtoonSelectedName : 'Type 3+ characters of a cToon'"
                autocapitalize="none" autocorrect="off" spellcheck="false"
              />
              <div v-if="rewardCtoonSuggestions.length" class="mt-1 border rounded divide-y bg-white max-h-32 overflow-y-auto">
                <button
                  v-for="c in rewardCtoonSuggestions" :key="c.id" type="button"
                  class="w-full text-left px-2 py-1 text-[11px] hover:bg-gray-100"
                  @click="selectRewardCtoon(c)"
                >{{ c.name }}</button>
              </div>
            </div>
            <div v-else-if="rewardForm.rewardType === 'AVATAR'">
              <label class="block text-[11px] font-medium mb-1">Avatar</label>
              <select v-model="rewardForm.avatarId" class="w-full border rounded px-2 py-1">
                <option value="">Select an avatar…</option>
                <option v-for="av in avatarsCatalog" :key="av.id" :value="av.id">{{ av.label || av.filename }}</option>
              </select>
            </div>
            <div v-else-if="rewardForm.rewardType === 'BACKGROUND'">
              <label class="block text-[11px] font-medium mb-1">Background</label>
              <select v-model="rewardForm.backgroundId" class="w-full border rounded px-2 py-1">
                <option value="">Select a background…</option>
                <option v-for="bg in backgrounds" :key="bg.id" :value="bg.id">{{ bg.label || bg.filename }}</option>
              </select>
            </div>
            <!-- POINTS needs no catalog picker — its amount is the "Points (1-5000)" input above. -->

            <button
              type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="rewardSaving" @click="addReward"
            >{{ rewardSaving ? 'Adding…' : 'Add prize' }}</button>
          </div>
        </div>
      </section>
    </div>

    <CMoonEnemyPreviewModal v-if="previewMemberId" :member-id="previewMemberId" @close="previewMemberId = null" />
  </div>
</template>

<script setup>
const factions = ref([])
const members = ref([])
const backgrounds = ref([])
const avatarsCatalog = ref([])
const ctoonsCatalog = ref([])
const joinEffects = ref([])
const specialAttacks = ref([])
const loading = ref(false)
const loadError = ref('')

// Mirrors server/utils/cmoonEnemy.js's SPECIAL_ATTACK_EFFECT_TYPES — duplicated client-side
// since that file is server-only, same as RANKS/RANK_LABELS below.
const SPECIAL_ATTACK_EFFECT_TYPES = ['DAMAGE_OPPONENT', 'HEAL_SELF', 'PARALYZE_OPPONENT', 'LOWER_OPPONENT_ATTACK', 'RAISE_ALLY_ATTACK']
const SPECIAL_ATTACK_EFFECT_LABELS = {
  DAMAGE_OPPONENT: 'Damage opponent',
  HEAL_SELF: 'Heal self',
  PARALYZE_OPPONENT: 'Paralyze opponent',
  LOWER_OPPONENT_ATTACK: "Lower opponent's attack",
  RAISE_ALLY_ATTACK: 'Raise own attack',
}
const SPECIAL_ATTACK_EFFECT_HELP = {
  DAMAGE_OPPONENT: 'Deals Amount flat damage to the enemy, bypassing block entirely.',
  HEAL_SELF: 'Heals the caster for Amount HP.',
  PARALYZE_OPPONENT: 'The enemy cannot attack or block for Amount upcoming rounds.',
  LOWER_OPPONENT_ATTACK: "Reduces the enemy's own landed-hit damage by Amount for the rest of the fight.",
  RAISE_ALLY_ATTACK: "Increases the caster's own landed-hit damage by Amount for the rest of the fight.",
}

const memberFactionFilter = ref('')
const filteredMembers = computed(() => {
  if (!memberFactionFilter.value) return members.value
  return members.value.filter(m => m.factionId === memberFactionFilter.value)
})

// ── Global spawn behavior ─────────────────────────────────────────
// GlobalGameConfig.cMoonEnemyHigherTierFirst — lives on the same row as every other cMoon Enemy
// Battles toggle (cMoonEnemyBattlesEnabled, popup chance/cooldown, default HP), surfaced here
// instead of the Manage cMoons page since it's specifically about THIS page's roster.
const higherTierFirst = ref(false)
const savingHigherTierFirst = ref(false)
const higherTierFirstError = ref('')

async function saveHigherTierFirst() {
  higherTierFirstError.value = ''
  const next = higherTierFirst.value
  savingHigherTierFirst.value = true
  try {
    await $fetch('/api/admin/cmoon-settings', { method: 'POST', body: { cMoonEnemyHigherTierFirst: next } })
  } catch (e) {
    higherTierFirst.value = !next // revert the optimistic checkbox toggle on failure
    higherTierFirstError.value = e?.data?.statusMessage || 'Failed to save'
  } finally {
    savingHigherTierFirst.value = false
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [factionsData, membersData, backgroundsData, avatarsData, ctoonsData, joinEffectsData, cmoonsData, specialAttacksData] = await Promise.all([
      $fetch('/api/admin/cmoon-enemy-factions'),
      $fetch('/api/admin/cmoon-enemy-members'),
      $fetch('/api/admin/backgrounds'),
      $fetch('/api/admin/avatars'),
      $fetch('/api/admin/list-ctoons'),
      $fetch('/api/admin/cmoon-join-effects'),
      $fetch('/api/admin/cmoons'),
      $fetch('/api/admin/cmoon-special-attacks'),
    ])
    factions.value = factionsData?.factions || []
    members.value = membersData?.members || []
    backgrounds.value = backgroundsData || []
    avatarsCatalog.value = avatarsData || []
    ctoonsCatalog.value = ctoonsData || []
    joinEffects.value = joinEffectsData?.effects || []
    higherTierFirst.value = !!cmoonsData?.cMoonEnemyHigherTierFirst
    specialAttacks.value = specialAttacksData?.attacks || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to load cMoon enemies'
  } finally {
    loading.value = false
  }
}

// ── Special attacks (library CRUD, assigned by id on the faction/cMoon forms) ──────────────
const specialAttackSaving = ref(false)
const specialAttackFormError = ref('')
const deletingSpecialAttackId = ref('')
const specialAttackPendingSoundFile = ref(null)
const specialAttackUploadingSound = ref(false)
const specialAttackSoundError = ref('')
const specialAttackSavedSoundPath = ref('')

const emptySpecialAttackForm = () => ({ id: '', name: '', description: '', effectType: 'DAMAGE_OPPONENT', amount: 10 })
const specialAttackForm = reactive(emptySpecialAttackForm())

function resetSpecialAttackForm() {
  specialAttackFormError.value = ''
  specialAttackPendingSoundFile.value = null
  specialAttackUploadingSound.value = false
  specialAttackSoundError.value = ''
  specialAttackSavedSoundPath.value = ''
  Object.assign(specialAttackForm, emptySpecialAttackForm())
}

function startEditSpecialAttack(a) {
  resetSpecialAttackForm()
  specialAttackForm.id = a.id
  specialAttackForm.name = a.name
  specialAttackForm.description = a.description || ''
  specialAttackForm.effectType = a.effectType
  specialAttackForm.amount = a.amount
  specialAttackSavedSoundPath.value = a.soundPath || ''
}

function onSpecialAttackSoundFile(ev) {
  specialAttackSoundError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['audio/mpeg', 'audio/ogg', 'audio/wav'].includes(f.type)) {
    specialAttackSoundError.value = 'MP3, OGG, or WAV only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 3 * 1024 * 1024) {
    specialAttackSoundError.value = 'Audio must be 3MB or smaller.'
    ev.target.value = ''
    return
  }
  specialAttackPendingSoundFile.value = f
}

async function uploadSpecialAttackSoundFor(id) {
  if (!specialAttackPendingSoundFile.value || !id) return
  specialAttackUploadingSound.value = true
  specialAttackSoundError.value = ''
  try {
    const fd = new FormData()
    fd.append('audio', specialAttackPendingSoundFile.value)
    const res = await $fetch(`/api/admin/cmoon-special-attacks/${id}/sound`, { method: 'POST', body: fd })
    specialAttackSavedSoundPath.value = res.soundPath || specialAttackSavedSoundPath.value
    specialAttackPendingSoundFile.value = null
  } catch (e) {
    specialAttackSoundError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    specialAttackUploadingSound.value = false
  }
}

async function uploadSpecialAttackSound() {
  if (!specialAttackForm.id) return
  await uploadSpecialAttackSoundFor(specialAttackForm.id)
  await load()
}

async function saveSpecialAttack() {
  specialAttackFormError.value = ''
  if (!specialAttackForm.name.trim()) { specialAttackFormError.value = 'Name is required.'; return }
  const amount = Math.trunc(Number(specialAttackForm.amount))
  if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
    specialAttackFormError.value = 'Amount must be between 1 and 999.'
    return
  }

  specialAttackSaving.value = true
  try {
    const body = {
      name: specialAttackForm.name.trim(),
      description: specialAttackForm.description.trim() || null,
      effectType: specialAttackForm.effectType,
      amount,
    }
    if (specialAttackForm.id) {
      await $fetch(`/api/admin/cmoon-special-attacks/${specialAttackForm.id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-special-attacks', { method: 'POST', body })
      specialAttackForm.id = res.id
    }
    if (specialAttackPendingSoundFile.value) await uploadSpecialAttackSoundFor(specialAttackForm.id)
    resetSpecialAttackForm()
    await load()
  } catch (e) {
    specialAttackFormError.value = e?.data?.statusMessage || 'Failed to save special attack'
  } finally {
    specialAttackSaving.value = false
  }
}

async function removeSpecialAttack(a) {
  if (a.cmoonUsageCount > 0 || a.enemyFactionUsageCount > 0) return
  if (!confirm(`Delete special attack "${a.name}"? This can't be undone.`)) return
  deletingSpecialAttackId.value = a.id
  try {
    await $fetch(`/api/admin/cmoon-special-attacks/${a.id}`, { method: 'DELETE' })
    if (specialAttackForm.id === a.id) resetSpecialAttackForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete special attack'
  } finally {
    deletingSpecialAttackId.value = ''
  }
}

// ── Factions ───────────────────────────────────────────────────────
const factionSaving = ref(false)
const factionFormError = ref('')
const deletingFactionId = ref('')
const factionPendingFile = ref(null)
const factionPendingFilePreviewUrl = ref(null)
const factionUploadingImage = ref(false)
const factionImageError = ref('')
const factionSavedImagePath = ref('')
const factionPendingMusicFile = ref(null)
const factionUploadingMusic = ref(false)
const factionMusicError = ref('')
const factionSavedMusicPath = ref('')

// ── Faction default battle sounds (six slots, uploaded via cmoon-enemy-factions/[id]/sound —
// FACTION_DEFAULT_SOUND_SLOTS in server/utils/cmoonEnemy.js is the source of truth for the field
// names; kept in sync here by hand, same as SOUND_SLOTS/MEMBER_SOUND_SLOTS below) ──────────────
const FACTION_SOUND_SLOTS = [
  { key: 'appear', field: 'defaultAppearSoundPath', label: 'Appearance', help: 'Default for a member with no appearance sound of its own.' },
  { key: 'damageTaken', field: 'defaultDamageTakenSoundPath', label: 'Damage taken', help: "Default for a member with no damage-taken sound of its own." },
  { key: 'damageAvoided', field: 'defaultDamageAvoidedSoundPath', label: 'Damage avoided', help: 'Default for a member with no damage-avoided sound of its own.' },
  { key: 'attacking', field: 'defaultAttackingSoundPath', label: 'Attacking', help: "Default for a member with no attacking sound of its own." },
  { key: 'victory', field: 'defaultVictorySoundPath', label: 'Victory (enemy defeated)', help: 'Default for a member with no victory sound of its own.' },
  { key: 'defeat', field: 'defaultDefeatSoundPath', label: 'Defeat (enemy wins)', help: 'Default for a member with no defeat sound of its own.' },
]
const emptyFactionSoundState = () => ({ pendingFile: null, uploading: false, error: '', savedPath: '' })
const factionSoundState = reactive(Object.fromEntries(FACTION_SOUND_SLOTS.map(s => [s.key, emptyFactionSoundState()])))

function resetFactionSoundState() {
  for (const s of FACTION_SOUND_SLOTS) Object.assign(factionSoundState[s.key], emptyFactionSoundState())
}

function onFactionSoundFile(slotKey, ev) {
  const state = factionSoundState[slotKey]
  state.error = ''
  const f = ev.target.files?.[0] || null
  if (f && !['audio/mpeg', 'audio/ogg', 'audio/wav'].includes(f.type)) {
    state.error = 'MP3, OGG, or WAV only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 3 * 1024 * 1024) {
    state.error = 'Audio must be 3MB or smaller.'
    ev.target.value = ''
    return
  }
  state.pendingFile = f
}

async function uploadFactionSoundFor(slotKey, id) {
  const slot = FACTION_SOUND_SLOTS.find(s => s.key === slotKey)
  const state = factionSoundState[slotKey]
  if (!state.pendingFile || !id) return
  state.uploading = true
  state.error = ''
  try {
    const fd = new FormData()
    fd.append('audio', state.pendingFile)
    fd.append('slot', slot.field)
    const res = await $fetch(`/api/admin/cmoon-enemy-factions/${id}/sound`, { method: 'POST', body: fd })
    state.savedPath = res.soundPath || state.savedPath
    state.pendingFile = null
  } catch (e) {
    state.error = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    state.uploading = false
  }
}

async function uploadFactionSound(slotKey) {
  if (!factionForm.id) return
  await uploadFactionSoundFor(slotKey, factionForm.id)
  await load()
}

const emptyFactionForm = () => ({ id: '', name: '', description: '', active: true, sortOrder: 0, appearEffectId: '', specialAttackId: '' })
const factionForm = reactive(emptyFactionForm())
const factionPreviewImageSrc = computed(() => factionPendingFilePreviewUrl.value || factionSavedImagePath.value || '')

function clearFactionPendingFile() {
  if (factionPendingFilePreviewUrl.value) { try { URL.revokeObjectURL(factionPendingFilePreviewUrl.value) } catch {} }
  factionPendingFile.value = null
  factionPendingFilePreviewUrl.value = null
}

function resetFactionForm() {
  factionFormError.value = ''
  factionImageError.value = ''
  clearFactionPendingFile()
  factionSavedImagePath.value = ''
  factionPendingMusicFile.value = null
  factionMusicError.value = ''
  factionSavedMusicPath.value = ''
  resetFactionSoundState()
  Object.assign(factionForm, emptyFactionForm())
}

function startEditFaction(f) {
  resetFactionForm()
  factionForm.id = f.id
  factionForm.name = f.name
  factionForm.description = f.description || ''
  factionForm.active = !!f.active
  factionForm.sortOrder = f.sortOrder
  factionForm.appearEffectId = f.appearEffectId || ''
  factionForm.specialAttackId = f.specialAttackId || ''
  factionSavedImagePath.value = f.bannerImagePath || ''
  factionSavedMusicPath.value = f.battleMusicPath || ''
  for (const s of FACTION_SOUND_SLOTS) factionSoundState[s.key].savedPath = f[s.field] || ''
}

function onFactionMusicFile(ev) {
  factionMusicError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['audio/mpeg', 'audio/ogg', 'audio/wav'].includes(f.type)) {
    // A fast client-side hint only — the real check is server-side magic-byte sniffing
    // (audioUploadValidation.js), since browsers are inconsistent about audio MIME types.
    factionMusicError.value = 'MP3, OGG, or WAV only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 3 * 1024 * 1024) {
    factionMusicError.value = 'Audio must be 3MB or smaller.'
    ev.target.value = ''
    return
  }
  factionPendingMusicFile.value = f
}

async function uploadFactionMusicFor(id) {
  if (!factionPendingMusicFile.value || !id) return
  factionUploadingMusic.value = true
  factionMusicError.value = ''
  try {
    const fd = new FormData()
    fd.append('audio', factionPendingMusicFile.value)
    const res = await $fetch(`/api/admin/cmoon-enemy-factions/${id}/music`, { method: 'POST', body: fd })
    factionSavedMusicPath.value = res.battleMusicPath || factionSavedMusicPath.value
    factionPendingMusicFile.value = null
  } catch (e) {
    factionMusicError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    factionUploadingMusic.value = false
  }
}

async function uploadFactionMusic() {
  if (!factionPendingMusicFile.value || !factionForm.id) return
  await uploadFactionMusicFor(factionForm.id)
  await load()
}

function onFactionFile(ev) {
  factionImageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    factionImageError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    factionImageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearFactionPendingFile()
  factionPendingFile.value = f
  factionPendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadFactionImageFor(id) {
  if (!factionPendingFile.value || !id) return
  factionUploadingImage.value = true
  factionImageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', factionPendingFile.value)
    const res = await $fetch(`/api/admin/cmoon-enemy-factions/${id}/image`, { method: 'POST', body: fd })
    factionSavedImagePath.value = res.bannerImagePath || factionSavedImagePath.value
    clearFactionPendingFile()
  } catch (e) {
    factionImageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    factionUploadingImage.value = false
  }
}

async function uploadFactionImage() {
  if (!factionPendingFile.value || !factionForm.id) return
  await uploadFactionImageFor(factionForm.id)
  await load()
}

async function saveFaction() {
  factionFormError.value = ''
  if (!factionForm.name.trim()) { factionFormError.value = 'Name is required.'; return }

  factionSaving.value = true
  try {
    const body = {
      name: factionForm.name.trim(),
      description: factionForm.description.trim() || null,
      active: factionForm.active,
      sortOrder: Math.trunc(Number(factionForm.sortOrder)) || 0,
      appearEffectId: factionForm.appearEffectId || null,
      specialAttackId: factionForm.specialAttackId || null,
    }
    if (factionForm.id) {
      await $fetch(`/api/admin/cmoon-enemy-factions/${factionForm.id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-enemy-factions', { method: 'POST', body })
      factionForm.id = res.id
    }
    if (factionPendingFile.value) await uploadFactionImageFor(factionForm.id)
    if (factionPendingMusicFile.value) await uploadFactionMusicFor(factionForm.id)
    for (const s of FACTION_SOUND_SLOTS) {
      if (factionSoundState[s.key].pendingFile) await uploadFactionSoundFor(s.key, factionForm.id)
    }
    resetFactionForm()
    await load()
  } catch (e) {
    factionFormError.value = e?.data?.statusMessage || 'Failed to save faction'
  } finally {
    factionSaving.value = false
  }
}

async function removeFaction(f) {
  if (f.memberCount > 0) return
  if (!confirm(`Delete faction "${f.name}"? This can't be undone.`)) return
  deletingFactionId.value = f.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-factions/${f.id}`, { method: 'DELETE' })
    if (factionForm.id === f.id) resetFactionForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete faction'
  } finally {
    deletingFactionId.value = ''
  }
}

// ── Members ────────────────────────────────────────────────────────
const memberSaving = ref(false)
const memberFormError = ref('')
const deletingMemberId = ref('')
const resettingId = ref('')
const previewMemberId = ref(null)
const startingRaidPreviewId = ref('')
const editingMemberHasBattles = ref(false)
const editingMemberRewards = ref([])
const memberPendingFile = ref(null)
const memberPendingFilePreviewUrl = ref(null)
const memberUploadingImage = ref(false)
const memberImageError = ref('')
const memberSavedImagePath = ref('')

// ── Battle sounds (six independent slots, uploaded via cmoon-enemy-members/[id]/sound —
// server/utils/cmoonEnemy.js#MEMBER_SOUND_SLOTS is the source of truth for the field names; kept
// in sync here by hand since that file is server-only) ──────────────
// Mirrors server/utils/cmoonEnemy.js's ENEMY_RANKS/RANK_LABELS (named RANKS here since this
// file has no blackjackEngine.js-style collision to avoid) — duplicated client-side rather than
// imported, since that file is server-only and can't be imported client-side.
const RANKS = ['GOON', 'ENFORCER', 'UNDERBOSS', 'FINAL_BOSS']
const RANK_LABELS = { GOON: 'Goon', ENFORCER: 'Enforcer', UNDERBOSS: 'Underboss', FINAL_BOSS: 'Final Boss' }
const RANK_BADGE_CLASS = {
  GOON: 'bg-gray-200 text-gray-700',
  ENFORCER: 'bg-blue-100 text-blue-700',
  UNDERBOSS: 'bg-purple-100 text-purple-700',
  FINAL_BOSS: 'bg-red-100 text-red-700',
}

const SOUND_SLOTS = [
  { key: 'appear', field: 'appearSoundPath', label: 'Appearance', help: 'Plays when this enemy first appears in the popup.' },
  { key: 'damageTaken', field: 'damageTakenSoundPath', label: 'Damage taken', help: "Plays when the player's attack lands on this enemy." },
  { key: 'damageAvoided', field: 'damageAvoidedSoundPath', label: 'Damage avoided', help: "Plays when this enemy blocks the player's attack." },
  { key: 'attacking', field: 'attackingSoundPath', label: 'Attacking', help: "Plays when this enemy's attack lands on the player." },
  { key: 'victory', field: 'victorySoundPath', label: 'Victory (enemy defeated)', help: 'Plays when the player defeats this enemy.' },
  { key: 'defeat', field: 'defeatSoundPath', label: 'Defeat (enemy wins)', help: 'Plays when this enemy defeats the player.' },
]
const emptySoundState = () => ({ pendingFile: null, uploading: false, error: '', savedPath: '' })
const memberSoundState = reactive(Object.fromEntries(SOUND_SLOTS.map(s => [s.key, emptySoundState()])))

function resetMemberSoundState() {
  for (const s of SOUND_SLOTS) Object.assign(memberSoundState[s.key], emptySoundState())
}

function onSoundFile(slotKey, ev) {
  const state = memberSoundState[slotKey]
  state.error = ''
  const f = ev.target.files?.[0] || null
  if (f && !['audio/mpeg', 'audio/ogg', 'audio/wav'].includes(f.type)) {
    // A fast client-side hint only — browsers are inconsistent about the MIME type they report
    // for audio, so the real check is server-side magic-byte sniffing (audioUploadValidation.js).
    state.error = 'MP3, OGG, or WAV only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 3 * 1024 * 1024) {
    state.error = 'Audio must be 3MB or smaller.'
    ev.target.value = ''
    return
  }
  state.pendingFile = f
}

async function uploadSoundFor(slotKey, id) {
  const slot = SOUND_SLOTS.find(s => s.key === slotKey)
  const state = memberSoundState[slotKey]
  if (!state.pendingFile || !id) return
  state.uploading = true
  state.error = ''
  try {
    const fd = new FormData()
    fd.append('audio', state.pendingFile)
    fd.append('slot', slot.field)
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${id}/sound`, { method: 'POST', body: fd })
    state.savedPath = res.soundPath || state.savedPath
    state.pendingFile = null
  } catch (e) {
    state.error = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    state.uploading = false
  }
}

async function uploadSound(slotKey) {
  if (!memberForm.id) return
  await uploadSoundFor(slotKey, memberForm.id)
  await load()
}

const emptyMemberForm = () => ({
  id: '', factionId: '', name: '', maxHp: 5, battleMode: 'PER_PLAYER', rank: 'GOON', minPriorDefeats: 0,
  occurrencePercent: 50,
  cMoonPointsReward: 10, critChanceAgainstPercent: 0, critChanceFromPercent: 0, active: true, sortOrder: 0,
  isRaidBoss: false, raidAnnouncementText: '', raidOneTime: false, raidCooldownMinutes: 0,
})
const memberForm = reactive(emptyMemberForm())
const memberPreviewImageSrc = computed(() => memberPendingFilePreviewUrl.value || memberSavedImagePath.value || '')

function clearMemberPendingFile() {
  if (memberPendingFilePreviewUrl.value) { try { URL.revokeObjectURL(memberPendingFilePreviewUrl.value) } catch {} }
  memberPendingFile.value = null
  memberPendingFilePreviewUrl.value = null
}

function resetMemberForm() {
  memberFormError.value = ''
  memberImageError.value = ''
  clearMemberPendingFile()
  memberSavedImagePath.value = ''
  resetMemberSoundState()
  editingMemberHasBattles.value = false
  editingMemberRewards.value = []
  resetRewardForm()
  Object.assign(memberForm, emptyMemberForm())
  if (memberFactionFilter.value) memberForm.factionId = memberFactionFilter.value
}

// Ticked every 30s purely to force raidBossStatus()/the Revive button's re-evaluation as a
// cooldown actually elapses — without this, an admin watching the page would keep seeing a stale
// "on cooldown" label (and a hidden Revive button) for a boss that's already raidable again,
// until some unrelated reactive update or a page reload happened to refresh it.
const nowTick = ref(Date.now())
let nowTickTimer = null

// Mirrors checkRaidBossAvailability (server/utils/cmoonEnemyRaid.js) purely for display — the
// server is always the authority on whether a raid can actually start, this just tells an admin
// at a glance why one might currently be blocked.
function raidBossStatus(m) {
  if (!m.isRaidBoss || !m.raidDefeatedAt) return null
  if (m.raidOneTime) return 'raid defeated — awaiting revive'
  if (m.raidCooldownMinutes > 0) {
    const availableAt = new Date(m.raidDefeatedAt).getTime() + m.raidCooldownMinutes * 60000
    if (availableAt > nowTick.value) return `raid cooldown until ${new Date(availableAt).toLocaleString()}`
  }
  return null
}
function formatCooldown(minutes) {
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`
  return `${Math.round(minutes / 1440)}d`
}

function startEditMember(m) {
  resetMemberForm()
  Object.assign(memberForm, {
    id: m.id, factionId: m.factionId, name: m.name, maxHp: m.maxHp, battleMode: m.battleMode, rank: m.rank || 'GOON',
    minPriorDefeats: m.minPriorDefeats ?? 0, occurrencePercent: m.occurrencePercent ?? 50,
    cMoonPointsReward: m.cMoonPointsReward, critChanceAgainstPercent: m.critChanceAgainstPercent ?? 0,
    critChanceFromPercent: m.critChanceFromPercent ?? 0, active: !!m.active, sortOrder: m.sortOrder,
    isRaidBoss: !!m.isRaidBoss, raidAnnouncementText: m.raidAnnouncementText || '',
    raidOneTime: !!m.raidOneTime, raidCooldownMinutes: m.raidCooldownMinutes ?? 0,
  })
  memberSavedImagePath.value = m.imagePath || ''
  for (const s of SOUND_SLOTS) memberSoundState[s.key].savedPath = m[s.field] || ''
  editingMemberHasBattles.value = !!m.hasBattles
  editingMemberRewards.value = m.rewards || []
}

function onMemberFile(ev) {
  memberImageError.value = ''
  const f = ev.target.files?.[0] || null
  if (f && !['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(f.type)) {
    memberImageError.value = 'PNG, JPEG, WEBP, or GIF only.'
    ev.target.value = ''
    return
  }
  if (f && f.size > 5 * 1024 * 1024) {
    memberImageError.value = 'Image must be 5MB or smaller.'
    ev.target.value = ''
    return
  }
  clearMemberPendingFile()
  memberPendingFile.value = f
  memberPendingFilePreviewUrl.value = f ? URL.createObjectURL(f) : null
}

async function uploadMemberImageFor(id) {
  if (!memberPendingFile.value || !id) return
  memberUploadingImage.value = true
  memberImageError.value = ''
  try {
    const fd = new FormData()
    fd.append('image', memberPendingFile.value)
    const res = await $fetch(`/api/admin/cmoon-enemy-members/${id}/image`, { method: 'POST', body: fd })
    memberSavedImagePath.value = res.imagePath || memberSavedImagePath.value
    clearMemberPendingFile()
  } catch (e) {
    memberImageError.value = e?.data?.statusMessage || 'Upload failed.'
  } finally {
    memberUploadingImage.value = false
  }
}

async function uploadMemberImage() {
  if (!memberPendingFile.value || !memberForm.id) return
  await uploadMemberImageFor(memberForm.id)
  await load()
}

async function saveMember() {
  memberFormError.value = ''
  if (!memberForm.factionId) { memberFormError.value = 'Pick a faction.'; return }
  if (!memberForm.name.trim()) { memberFormError.value = 'Name is required.'; return }
  const maxHp = Math.trunc(Number(memberForm.maxHp))
  if (!Number.isInteger(maxHp) || maxHp < 1 || maxHp > 200) { memberFormError.value = 'Max HP must be between 1 and 200.'; return }
  const cMoonPointsReward = Math.trunc(Number(memberForm.cMoonPointsReward))
  if (!Number.isInteger(cMoonPointsReward) || cMoonPointsReward < 0 || cMoonPointsReward > 5000) {
    memberFormError.value = 'cMoon points reward must be between 0 and 5000.'
    return
  }
  const critChanceAgainstPercent = Math.trunc(Number(memberForm.critChanceAgainstPercent))
  if (!Number.isInteger(critChanceAgainstPercent) || critChanceAgainstPercent < 0 || critChanceAgainstPercent > 100) {
    memberFormError.value = 'Crit chance against this enemy must be between 0 and 100.'
    return
  }
  const critChanceFromPercent = Math.trunc(Number(memberForm.critChanceFromPercent))
  if (!Number.isInteger(critChanceFromPercent) || critChanceFromPercent < 0 || critChanceFromPercent > 100) {
    memberFormError.value = 'Crit chance from this enemy must be between 0 and 100.'
    return
  }
  const minPriorDefeats = Math.trunc(Number(memberForm.minPriorDefeats))
  if (!Number.isInteger(minPriorDefeats) || minPriorDefeats < 0 || minPriorDefeats > 100000) {
    memberFormError.value = 'Minimum personal wins to unlock must be between 0 and 100000.'
    return
  }
  const occurrencePercent = Math.trunc(Number(memberForm.occurrencePercent))
  if (!Number.isInteger(occurrencePercent) || occurrencePercent < 1 || occurrencePercent > 100) {
    memberFormError.value = 'Occurrence weight must be between 1 and 100.'
    return
  }
  const raidAnnouncementText = memberForm.raidAnnouncementText?.trim() || ''
  if (raidAnnouncementText.length > 500) {
    memberFormError.value = 'Raid announcement must be 500 characters or fewer.'
    return
  }
  // Mirrors the server's own rule (isRaidBoss requires rank FINAL_BOSS) rather than letting a
  // stale checkbox from before a rank change get silently rejected by the API.
  const isRaidBoss = memberForm.rank === 'FINAL_BOSS' && memberForm.isRaidBoss
  const raidCooldownMinutes = Math.trunc(Number(memberForm.raidCooldownMinutes)) || 0
  if (!Number.isInteger(raidCooldownMinutes) || raidCooldownMinutes < 0 || raidCooldownMinutes > 43200) {
    memberFormError.value = 'Raid cooldown must be between 0 and 43200 minutes.'
    return
  }

  memberSaving.value = true
  try {
    const body = {
      factionId: memberForm.factionId,
      name: memberForm.name.trim(),
      maxHp,
      battleMode: memberForm.battleMode,
      rank: memberForm.rank,
      minPriorDefeats,
      occurrencePercent,
      cMoonPointsReward,
      critChanceAgainstPercent,
      critChanceFromPercent,
      active: memberForm.active,
      sortOrder: Math.trunc(Number(memberForm.sortOrder)) || 0,
      isRaidBoss,
      raidAnnouncementText: raidAnnouncementText || null,
      // NOT gated by isRaidBoss, unlike the checkbox's own value above — raidOneTime persists
      // independent of the on/off switch, same stance raidAnnouncementText/raidCooldownMinutes
      // already take (see raidOneTime's own schema comment), so toggling raid mode off and back
      // on later doesn't silently reset it.
      raidOneTime: memberForm.raidOneTime,
      raidCooldownMinutes,
    }
    let id = memberForm.id
    if (id) {
      await $fetch(`/api/admin/cmoon-enemy-members/${id}`, { method: 'PUT', body })
    } else {
      const res = await $fetch('/api/admin/cmoon-enemy-members', { method: 'POST', body })
      id = res.id
      memberForm.id = id
    }
    if (memberPendingFile.value) await uploadMemberImageFor(id)
    for (const s of SOUND_SLOTS) {
      if (memberSoundState[s.key].pendingFile) await uploadSoundFor(s.key, id)
    }
    await load()
    // Re-select the freshly saved member from the reloaded list so its rewards/hasBattles reflect
    // the DB, rather than trusting this form's own local state.
    const fresh = members.value.find(m => m.id === id)
    if (fresh) startEditMember(fresh)
  } catch (e) {
    memberFormError.value = e?.data?.statusMessage || 'Failed to save member'
  } finally {
    memberSaving.value = false
  }
}

async function removeMember(m) {
  if (m.hasBattles) return
  if (!confirm(`Delete member "${m.name}"? This can't be undone.`)) return
  deletingMemberId.value = m.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${m.id}`, { method: 'DELETE' })
    if (memberForm.id === m.id) resetMemberForm()
    await load()
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to delete member'
  } finally {
    deletingMemberId.value = ''
  }
}

async function resetMember(m) {
  resettingId.value = m.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${m.id}/reset`, { method: 'POST' })
    await load()
    if (memberForm.id === m.id) {
      const fresh = members.value.find(x => x.id === m.id)
      if (fresh) startEditMember(fresh)
    }
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to revive member'
  } finally {
    resettingId.value = ''
  }
}

// Same "start over the socket, watch for the created/error pair, then navigate" pattern
// CMoonBattlePopupHost.vue's onFight() uses for a real raid — see
// server/utils/cmoonRaidPreviewSocket.js for why this is a fully separate, consequence-free
// engine rather than a flag on the real one. Other admins are notified server-side and can join
// from their own notifications drawer; this admin is taken straight to the live preview.
function startRaidPreview(m) {
  startingRaidPreviewId.value = m.id
  const previewSocket = useCMoonRaidPreviewSocket()
  previewSocket.lastError.value = ''
  previewSocket.raidState.value = null
  previewSocket.startRaid(m.id)
  const router = useRouter()
  const stopWatching = watch([previewSocket.raidState, previewSocket.lastError], ([state, err]) => {
    if (state?.id) {
      stopWatching()
      startingRaidPreviewId.value = ''
      router.push(`/newsite/cmoon-raid-preview/${state.id}`)
    } else if (err) {
      stopWatching()
      startingRaidPreviewId.value = ''
      loadError.value = err
    }
  })
}

// ── Rewards (per-member, add/remove one row at a time) ──────────────
const rewardSaving = ref(false)
const rewardFormError = ref('')
const deletingRewardId = ref('')
const rewardCtoonSearch = ref('')

const emptyRewardForm = () => ({ rewardType: 'CTOON', ctoonId: '', avatarId: '', backgroundId: '', dropChancePercent: 10, quantity: 1, pointsAmount: 100 })
const rewardForm = reactive(emptyRewardForm())

function resetRewardForm() {
  rewardFormError.value = ''
  rewardCtoonSearch.value = ''
  Object.assign(rewardForm, emptyRewardForm())
}

watch(() => rewardForm.rewardType, () => {
  rewardForm.ctoonId = ''
  rewardForm.avatarId = ''
  rewardForm.backgroundId = ''
  rewardCtoonSearch.value = ''
})

const rewardCtoonSelectedName = computed(() => ctoonsCatalog.value.find(c => c.id === rewardForm.ctoonId)?.name || '')
const rewardCtoonSuggestions = computed(() => {
  const v = rewardCtoonSearch.value.trim().toLowerCase()
  if (v.length < 3) return []
  return ctoonsCatalog.value.filter(c => c.name?.toLowerCase().includes(v)).slice(0, 20)
})
function selectRewardCtoon(c) {
  rewardForm.ctoonId = c.id
  rewardCtoonSearch.value = c.name
}

function rewardLabel(r) {
  if (r.rewardType === 'CTOON') return r.ctoon?.name || 'Unknown cToon'
  if (r.rewardType === 'AVATAR') return r.avatar?.label || 'Unknown avatar'
  if (r.rewardType === 'POINTS') return `${r.quantity} points`
  return r.background?.label || 'Unknown background'
}

async function addReward() {
  rewardFormError.value = ''
  if (!memberForm.id) return
  const dropChancePercent = Number(rewardForm.dropChancePercent)
  if (!Number.isFinite(dropChancePercent) || dropChancePercent < 0 || dropChancePercent > 100) {
    rewardFormError.value = 'Drop chance must be between 0 and 100.'
    return
  }
  const body = { rewardType: rewardForm.rewardType, dropChancePercent }
  if (rewardForm.rewardType === 'CTOON') {
    if (!rewardForm.ctoonId) { rewardFormError.value = 'Pick a cToon.'; return }
    body.ctoonId = rewardForm.ctoonId
    const quantity = Math.trunc(Number(rewardForm.quantity)) || 1
    if (quantity < 1 || quantity > 20) { rewardFormError.value = 'Quantity must be between 1 and 20.'; return }
    body.quantity = quantity
  } else if (rewardForm.rewardType === 'AVATAR') {
    if (!rewardForm.avatarId) { rewardFormError.value = 'Pick an avatar.'; return }
    body.avatarId = rewardForm.avatarId
  } else if (rewardForm.rewardType === 'BACKGROUND') {
    if (!rewardForm.backgroundId) { rewardFormError.value = 'Pick a background.'; return }
    body.backgroundId = rewardForm.backgroundId
  } else {
    // POINTS
    const pointsAmount = Math.trunc(Number(rewardForm.pointsAmount))
    if (!Number.isInteger(pointsAmount) || pointsAmount < 1 || pointsAmount > 5000) {
      rewardFormError.value = 'Points amount must be between 1 and 5000.'
      return
    }
    body.quantity = pointsAmount
  }

  rewardSaving.value = true
  try {
    await $fetch(`/api/admin/cmoon-enemy-members/${memberForm.id}/rewards`, { method: 'POST', body })
    resetRewardForm()
    await load()
    const fresh = members.value.find(m => m.id === memberForm.id)
    if (fresh) editingMemberRewards.value = fresh.rewards || []
  } catch (e) {
    rewardFormError.value = e?.data?.statusMessage || 'Failed to add prize'
  } finally {
    rewardSaving.value = false
  }
}

async function removeReward(r) {
  if (!confirm('Remove this prize row?')) return
  deletingRewardId.value = r.id
  try {
    await $fetch(`/api/admin/cmoon-enemy-rewards/${r.id}`, { method: 'DELETE' })
    await load()
    const fresh = members.value.find(m => m.id === memberForm.id)
    if (fresh) editingMemberRewards.value = fresh.rewards || []
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Failed to remove prize'
  } finally {
    deletingRewardId.value = ''
  }
}

onMounted(() => {
  load()
  nowTickTimer = setInterval(() => { nowTick.value = Date.now() }, 30000)
})
onBeforeUnmount(() => {
  clearFactionPendingFile()
  clearMemberPendingFile()
  if (nowTickTimer) clearInterval(nowTickTimer)
})
</script>
