<template>
  <div class="settings-content">
        <div class="settings-id-bar">
          <span class="settings-id-label">ReOrbit ID:</span>
          <span class="settings-id-value">{{ user?.id ?? '—' }}</span>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h1 class="settings-title">Settings</h1>
            <p class="settings-subtitle">Manage account preferences.</p>

            <div class="settings-button-row">
              <button class="btn-avatar" @click="openAvatarModal">Change Avatar</button>
              <button class="btn-username" @click="openUsernameModal">Change Username</button>
              <button v-if="showTeamChangeButton" class="btn-team" @click="openTeamChangeModal">
                {{ pendingRequest ? 'Team Change: Pending' : 'Request Team Change' }}
              </button>
            </div>
          </div>

          <div class="settings-body">
            <div class="settings-row">
              <div>
                <!-- Named for the channel it actually controls. In-app
                     notifications are a separate channel and deliberately ignore
                     this flag: turning it off means "stop DMing me", not "hide
                     alerts inside the site I am looking at". -->
                <h2 class="settings-row-title">Auction Discord DMs</h2>
                <p class="settings-row-desc">Receive Discord DMs when you're outbid on an auction.</p>
              </div>

              <div class="toggle-wrap">
                <div v-if="loading" class="toggle-skeleton"></div>
                <label v-else class="toggle-label">
                  <input type="checkbox" class="sr-only" v-model="allow" @change="onToggle" :disabled="saving || loading" />
                  <div :class="['toggle-track', allow ? 'toggle-on' : 'toggle-off']">
                    <div :class="['toggle-knob', allow ? 'toggle-knob-on' : '']"></div>
                  </div>
                </label>
              </div>
            </div>

            <p class="settings-status" :class="{ 'settings-status-dim': saving || loading }">
              {{ loading ? 'Loading current setting…' : saving ? 'Saving…' : 'Changes are saved instantly.' }}
            </p>
            <p v-if="error" class="settings-error">{{ error }}</p>

            <div class="settings-row settings-row-haptic">
              <div>
                <h2 class="settings-row-title">Haptic Sounds</h2>
                <p class="settings-row-desc">Play a click sound and highlight buttons when you tap or click them, like the original Cartoon Orbit.</p>
              </div>

              <div class="toggle-wrap">
                <label class="toggle-label">
                  <input type="checkbox" class="sr-only" :checked="hapticSoundsEnabled" @change="onToggleHapticSounds" />
                  <div :class="['toggle-track', hapticSoundsEnabled ? 'toggle-on' : 'toggle-off']">
                    <div :class="['toggle-knob', hapticSoundsEnabled ? 'toggle-knob-on' : '']"></div>
                  </div>
                </label>
              </div>
            </div>
            <p class="settings-status">Saved on this device only.</p>
          </div>
        </div>
      </div>

      <!-- Avatar modal -->
      <!-- Teleported to body: .site-container carries a `transform`, which makes it the
           containing block for `position: fixed` descendants and then clips them with
           `overflow: hidden`. Without this the overlay is pinned to the chrome's box
           rather than the viewport, so on a page scrolled down it renders offset and
           partly unreachable. Same approach as AuctionModal / CtoonInfoCard / Trade. -->
      <Teleport to="body">
        <div v-if="showAvatarModal" class="modal-overlay" @click.self="closeAvatarModal">
          <div class="modal-box">
            <h2 class="modal-title">Change Avatar</h2>
            <p class="modal-desc">Choose a new avatar and click save.</p>

            <div class="avatar-grid">
              <label v-for="img in avatars" :key="img" class="avatar-option">
                <img
                  :src="`/avatars/${img}`"
                  :class="['avatar-img', avatarDraft === img ? 'avatar-selected' : '']"
                />
                <input v-model="avatarDraft" type="radio" class="sr-only" :value="img" />
              </label>
            </div>

            <p v-if="avatarError" class="modal-error">{{ avatarError }}</p>

            <div class="modal-actions">
              <button class="btn-cancel" @click="closeAvatarModal">Cancel</button>
              <button class="btn-save-blue" :disabled="savingAvatar" @click="saveAvatar">
                {{ savingAvatar ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Username modal -->
      <!-- Teleported to body: .site-container carries a `transform`, which makes it the
           containing block for `position: fixed` descendants and then clips them with
           `overflow: hidden`. Without this the overlay is pinned to the chrome's box
           rather than the viewport, so on a page scrolled down it renders offset and
           partly unreachable. Same approach as AuctionModal / CtoonInfoCard / Trade. -->
      <Teleport to="body">
        <div v-if="showUsernameModal" class="modal-overlay" @click.self="closeUsernameModal">
          <div class="modal-box">
            <h2 class="modal-title">Change Username</h2>
            <p class="modal-desc">Pick from the Cartoon Orbit username builder.</p>

            <div class="username-selects">
              <select v-model="part1" class="username-select">
                <option v-for="w in wordLists[0]" :key="`s-1-${w}`" :value="w">{{ w }}</option>
              </select>
              <select v-model="part2" class="username-select">
                <option v-for="w in wordLists[1]" :key="`s-2-${w}`" :value="w">{{ w }}</option>
              </select>
              <select v-model="part3" class="username-select">
                <option v-for="w in wordLists[2]" :key="`s-3-${w}`" :value="w">{{ w }}</option>
              </select>
            </div>

            <button @click="randomize" class="btn-randomize">🔄 Randomize</button>

            <p v-if="usernameError" class="modal-error">{{ usernameError }}</p>

            <div class="modal-actions">
              <button class="btn-cancel" @click="closeUsernameModal">Cancel</button>
              <button class="btn-save-purple" :disabled="savingUsername" @click="saveUsername">
                {{ savingUsername ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Request Team Change modal -->
      <!-- Teleported to body: same containing-block/overflow issue as the avatar/username
           modals above. `team-modal` adds max-height + internal scroll to `.modal-box`, which
           the shared modal-box class otherwise lacks — without it a tall cMoon list plus the
           explanatory copy can overflow a short viewport with no way to reach the Submit button. -->
      <Teleport to="body">
        <div v-if="showTeamModal" class="modal-overlay" @click.self="closeTeamChangeModal">
          <div class="modal-box team-modal">
            <template v-if="pendingRequest">
              <h2 class="modal-title">Team Change Pending</h2>
              <p class="modal-desc">
                Your request to join <strong>{{ pendingRequest.requestedCMoon?.name }}</strong>
                is waiting for admin approval.
              </p>
              <p v-if="teamChangeError" class="modal-error">{{ teamChangeError }}</p>
              <div class="modal-actions">
                <button class="btn-cancel" @click="closeTeamChangeModal">Close</button>
                <button class="btn-save-blue" :disabled="cancelingRequest" @click="cancelTeamChangeRequest">
                  {{ cancelingRequest ? 'Cancelling...' : 'Cancel Request' }}
                </button>
              </div>
            </template>
            <template v-else>
              <h2 class="modal-title">Request Team Change</h2>
              <p class="modal-desc">
                Pick a cMoon to request joining. An admin has to approve this before you move.
                Any affinity progress and rewards you've already earned stay yours either way.
              </p>

              <div v-if="loadingCMoons" class="team-status-text">Loading teams…</div>
              <div v-else-if="!eligibleCMoons.length" class="team-status-text">No other teams are available right now.</div>
              <div v-else class="team-list">
                <label v-for="c in eligibleCMoons" :key="c.id" class="team-option">
                  <input type="radio" class="sr-only" v-model="selectedTargetCMoonId" :value="c.id" />
                  <span class="team-swatch" :style="{ background: c.color }"></span>
                  <span class="team-name">{{ c.name }}</span>
                </label>
              </div>

              <p v-if="teamChangeError" class="modal-error">{{ teamChangeError }}</p>

              <div class="modal-actions">
                <button class="btn-cancel" @click="closeTeamChangeModal">Cancel</button>
                <button class="btn-save-blue" :disabled="teamChangeSaving || !selectedTargetCMoonId" @click="submitTeamChangeRequest">
                  {{ teamChangeSaving ? 'Submitting...' : 'Submit Request' }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </Teleport>
</template>

<script setup>
definePageMeta({
  layout: 'newsite-template',
  middleware: 'newsite',
  showAdbar: true,
  showNav: true,
  title: 'Settings',
  description: 'Manage your Cartoon ReOrbit account settings, avatar, and notification preferences.',
  robots: 'noindex, nofollow'
})

const { clearSidebarMiddle } = useNewsiteLayout()
clearSidebarMiddle()

import { ref, computed, onMounted } from 'vue'
import { useHapticSoundsPref } from '@/composables/useHapticSoundsPref'

const { user, fetchSelf } = useAuth()

const { enabled: hapticSoundsEnabled, hydrate: hydrateHapticSoundsPref, setEnabled: setHapticSoundsEnabled } = useHapticSoundsPref()
onMounted(hydrateHapticSoundsPref)
function onToggleHapticSounds(event) {
  setHapticSoundsEnabled(event.target.checked)
}

const allow   = ref(true)
const saving  = ref(false)
const loading = ref(true)
const error   = ref('')
const avatars = ref([])

const showAvatarModal   = ref(false)
const showUsernameModal = ref(false)
const avatarDraft       = ref('')
const savingAvatar      = ref(false)
const avatarError       = ref('')

const savingUsername = ref(false)
const usernameError  = ref('')

const part1 = ref('')
const part2 = ref('')
const part3 = ref('')

const wordLists = [
  [
    'Awesome','Blazing','Brave','Bubbly','Cheery','Chill','Cosmic','Crazy','Cuddly','Cyber',
    'Daring','Dizzy','Electric','Epic','Funky','Fuzzy','Galactic','Glitchy','Groovy','Happy',
    'Hyper','Jolly','Jumpy','Kooky','Legendary','Loopy','Lucky','Mega','Mellow','Mighty',
    'Mystic','Neon','Nifty','Pixel','Plucky','Quirky','Radical','Raging','Retro','Rockin',
    'Sassy','Savvy','Silly','Slick','Snazzy','Sneaky','Solar','Spiffy','Spunky','Stellar',
    'Stormy','Sunny','Super','Swift','Techno','Thundering','Turbo','Ultra','Velvet','Vibrant',
    'Wild','Witty','Wobbly','Zany','Zen','Atomic','Blitz','Bold','Chroma','Crimson','Crystal',
    'Doodle','Dragon','Echo','Fluffy','Frosty','Fusion','Galaxy','Harmony','Inferno','Jade',
    'Karma','Lunar','Magnetic','Nova','Obsidian','Prismatic','Quantum','Rainbow','Shadow',
    'Titanic','Umbra','Vortex','Whimsical','Xeno','Yonder','Zephyr','Aurora','Orbit','Primo'
  ],
  [
    'Alien','Angel','Bandit','Beast','Bot','Brawler','Captain','Cheetah','Charger','Comet',
    'Crafter','Cyclone','Dancer','Dino','DJ','Dragon','Drifter','Dynamo','Eagle','Explorer',
    'Falcon','Flame','Gamer','Gargoyle','Ghost','Glider','Goblin','Golem','Guitar','Hacker',
    'Hero','Hobbit','Hunter','Jester','Jumper','Knight','Koala','Laser','Lion','Lizard',
    'Magician','Mammoth','Mantis','Martian','Mermaid','Mime','Monkey','Monster','Ninja',
    'Nomad','Otter','Owlet','Panther','Penguin','Phantom','Phoenix','Pirate','Pixel','Puma',
    'Punk','Puzzler','Raccoon','Ranger','Rhino','Robot','Rocket','Samurai','Sasquatch','Scout',
    'Seeker','Shark','Skater','Sloth','Snake','Spark','Specter','Spider','Sprite','Squirrel',
    'Stingray','Storm','Surfer','Tiger','Tinker','Titan','Toon','Torch','Tornado','Turtle',
    'Viking','Viper','Voyager','Warrior','Wizard','Wombat','Yeti','Zebra','Zeppelin','Zombie'
  ],
  [
    'Ace','Adventurer','Agent','Alchemist','Avenger','Baron','Beast','Champion','Chief','Crafter',
    'Crusader','Daredevil','Defender','Druid','Duke','Enchanter','Engineer','Fighter','Guru','Hunter',
    'Juggernaut','King','Legend','Lord','Maestro','Master','Maverick','Mercenary','Mystic','Nerd',
    'Nomad','Overlord','Paladin','Pirate','Prodigy','Protector','Pioneer','Queen','Raider','Ranger',
    'Rockstar','Rogue','Sage','Samurai','Scholar','Scout','Seer','Sentinel','Shaman','Slayer',
    'Smith','Sorcerer','Specialist','Speedster','Stargazer','Strategist','Summoner','Superstar',
    'Survivor','Tactician','Tempest','Tinker','Trailblazer','Traveler','Trickster','Vagabond','Vanguard',
    'Virtuoso','Visionary','Voyager','Warlock','Warrior','Whiz','Wizard','Wrestler','Warden','Warlord',
    'Architect','Artisan','Athlete','Commander','Conqueror','Creator','Dreamer','Explorer','Guardian',
    'Inventor','Leader','Pilot','Rebel','Sculptor','Seeker','Technician','Trendsetter','Tycoon','Wanderer'
  ]
]

function sample(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randomize() {
  part1.value = sample(wordLists[0])
  part2.value = sample(wordLists[1])
  part3.value = sample(wordLists[2])
}

randomize()

async function loadSetting() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/user/notifications', { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    allow.value = !!data.allowAuctionNotifications
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load preference.'
  } finally {
    loading.value = false
  }
}

async function onToggle() {
  if (loading.value) return
  error.value = ''
  const next = allow.value
  const prev = !allow.value
  saving.value = true
  try {
    const res = await fetch('/api/user/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ allowAuctionNotifications: next })
    })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    allow.value = !!data.allowAuctionNotifications
  } catch (err) {
    console.error(err)
    allow.value = prev
    error.value = 'Could not save. Please try again.'
  } finally {
    saving.value = false
  }
}

onMounted(loadSetting)

async function openAvatarModal() {
  avatarError.value = ''
  // Always fetch fresh rather than only when empty — a newly-earned restricted avatar (e.g. a
  // cMoon affinity reward) should show up the next time this modal opens within the same page
  // visit, not just after a full page reload.
  avatars.value = await $fetch('/api/avatars', { credentials: 'include' })
  avatarDraft.value = user.value?.avatar || ''
  showAvatarModal.value = true
}

function closeAvatarModal() { showAvatarModal.value = false }

async function saveAvatar() {
  avatarError.value = ''
  if (!avatarDraft.value) { avatarError.value = 'Please select an avatar.'; return }
  savingAvatar.value = true
  try {
    await $fetch('/api/auth/set-avatar', { method: 'POST', body: { avatar: avatarDraft.value }, credentials: 'include' })
    await fetchSelf({ force: true })
    closeAvatarModal()
  } catch (e) {
    avatarError.value = e?.data?.statusMessage || 'Could not save avatar.'
  } finally {
    savingAvatar.value = false
  }
}

function openUsernameModal() { usernameError.value = ''; randomize(); showUsernameModal.value = true }
function closeUsernameModal() { showUsernameModal.value = false }

async function saveUsername() {
  usernameError.value = ''
  const username = `${part1.value}${part2.value}${part3.value}`
  savingUsername.value = true
  try {
    await $fetch('/api/auth/set-username', { method: 'POST', body: { username }, credentials: 'include' })
    await fetchSelf({ force: true })
    closeUsernameModal()
  } catch (e) {
    usernameError.value = e?.data?.statusMessage || 'Username already taken, please pick a different one.'
  } finally {
    savingUsername.value = false
  }
}

// ── Request Team Change ──────────────────────────────────────────────────
// Hidden for admins (they manage cMoon placement from the admin console directly) and for
// anyone not currently on a cMoon (they use the normal join flow, not a change request).
const cMoonEnabled = ref(false)
const currentCMoonId = ref(null)
const pendingRequest = ref(null)
const eligibleCMoons = ref([])
const loadingCMoons = ref(false)
const showTeamModal = ref(false)
const selectedTargetCMoonId = ref('')
const teamChangeError = ref('')
const teamChangeSaving = ref(false)
const cancelingRequest = ref(false)

const showTeamChangeButton = computed(() =>
  cMoonEnabled.value && !user.value?.isAdmin && !!currentCMoonId.value
)

async function loadCMoonState() {
  try {
    const [status, changeRequest] = await Promise.all([
      $fetch('/api/cmoon/status', { credentials: 'include' }),
      $fetch('/api/cmoon/change-request', { credentials: 'include' }),
    ])
    cMoonEnabled.value = !!status?.cMoonEnabled
    currentCMoonId.value = status?.cMoon?.id || null
    pendingRequest.value = changeRequest?.request || null
  } catch {
    // Non-critical: the button just stays hidden if this fails to load.
  }
}

async function openTeamChangeModal() {
  teamChangeError.value = ''
  showTeamModal.value = true
  if (!pendingRequest.value && !eligibleCMoons.value.length) {
    loadingCMoons.value = true
    try {
      const data = await $fetch('/api/cmoons', { credentials: 'include' })
      eligibleCMoons.value = (data?.cmoons || []).filter((c) => c.id !== currentCMoonId.value)
    } catch {
      teamChangeError.value = 'Failed to load teams.'
    } finally {
      loadingCMoons.value = false
    }
  }
}

function closeTeamChangeModal() {
  showTeamModal.value = false
  selectedTargetCMoonId.value = ''
  teamChangeError.value = ''
}

async function submitTeamChangeRequest() {
  if (!selectedTargetCMoonId.value) return
  teamChangeError.value = ''
  teamChangeSaving.value = true
  try {
    await $fetch('/api/cmoon/change-request', {
      method: 'POST',
      body: { requestedCMoonId: selectedTargetCMoonId.value },
      credentials: 'include',
    })
    await loadCMoonState()
    closeTeamChangeModal()
  } catch (e) {
    teamChangeError.value = e?.data?.statusMessage || 'Failed to submit request.'
  } finally {
    teamChangeSaving.value = false
  }
}

async function cancelTeamChangeRequest() {
  cancelingRequest.value = true
  teamChangeError.value = ''
  try {
    await $fetch('/api/cmoon/change-request', { method: 'DELETE', credentials: 'include' })
    await loadCMoonState()
    closeTeamChangeModal()
  } catch (e) {
    teamChangeError.value = e?.data?.statusMessage || 'Failed to cancel request.'
  } finally {
    cancelingRequest.value = false
  }
}

onMounted(loadCMoonState)
</script>

<style>
body.page-newsite-settings .main-content { overflow-y: auto !important; scrollbar-width: thin; }
</style>

<style scoped>
.settings-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #ffffff;
  font-family: var(--font-family, 'Nunito', sans-serif);
}

.settings-id-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(51, 153, 204, 0.4);
  flex-shrink: 0;
}

.settings-id-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.65);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings-id-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #66CC00;
  font-family: monospace;
}

.settings-section {
  flex: 1;
  overflow-y: auto;
}

.settings-section-header {
  padding: 14px 14px 12px;
  border-bottom: 1px solid rgba(51, 153, 204, 0.3);
  background: rgba(0, 0, 0, 0.15);
}

.settings-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 2px;
}

.settings-subtitle {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 10px;
}

.settings-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-avatar {
  padding: 6px 14px;
  border-radius: 6px;
  background: var(--OrbitDarkBlue, #336699);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-avatar:hover { opacity: 0.85; }

.btn-username {
  padding: 6px 14px;
  border-radius: 6px;
  background: #66CC00;
  color: #003466;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: inherit;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-username:hover { opacity: 0.85; }

.btn-team {
  padding: 6px 14px;
  min-height: 44px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 700;
  font-family: inherit;
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-team:hover { opacity: 0.85; }

.settings-body {
  padding: 14px;
}

.settings-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.settings-row-title {
  font-size: 0.9rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 2px;
}

.settings-row-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.toggle-wrap { display: flex; align-items: center; flex-shrink: 0; }

.toggle-skeleton {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

.toggle-label { display: inline-flex; align-items: center; cursor: pointer; }

.toggle-track {
  width: 44px;
  height: 26px;
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
}

.toggle-on  { background: var(--OrbitLightBlue, #3399CC); }
.toggle-off { background: rgba(255, 255, 255, 0.2); }

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-knob-on { transform: translateX(18px); }

.settings-status {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 8px;
}

.settings-status-dim { opacity: 0.5; }

.settings-error {
  font-size: 0.72rem;
  color: #ff6b6b;
  margin-top: 6px;
}

.settings-row-haptic {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(51, 153, 204, 0.25);
}

/* Modals */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-box {
  background: #ffffff;
  border-radius: 10px;
  max-width: 520px;
  width: 100%;
  padding: 20px;
  color: #1a1a2e;
}

.modal-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--OrbitDarkBlue, #336699);
  margin: 0 0 4px;
}

.modal-desc {
  font-size: 0.78rem;
  color: #555;
  margin: 0 0 14px;
}

.avatar-grid {
  display: grid;
  /* Fills as many 52px-min columns as fit rather than forcing a fixed 6 — a fixed count
     with a fixed image width overflows the grid tracks on narrow phones (~375px and under),
     producing a hidden horizontal scrollbar nested inside the vertical one. */
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  margin-bottom: 14px;
}

.avatar-option { cursor: pointer; }

.avatar-img {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 3px solid transparent;
}

.avatar-selected { border-color: var(--OrbitDarkBlue, #336699); }

.username-selects {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.username-select {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 0.78rem;
  font-family: inherit;
}

.btn-randomize {
  font-size: 0.78rem;
  color: var(--OrbitDarkBlue, #336699);
  background: none;
  border: none;
  cursor: pointer;
  margin-bottom: 14px;
  padding: 0;
  font-family: inherit;
}

.btn-randomize:hover { text-decoration: underline; }

.modal-error {
  font-size: 0.78rem;
  color: #c0392b;
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 7px 16px;
  border-radius: 6px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  font-family: inherit;
}

.btn-save-blue {
  padding: 7px 16px;
  border-radius: 6px;
  background: var(--OrbitDarkBlue, #336699);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: inherit;
}

.btn-save-blue:disabled { opacity: 0.5; cursor: default; }

.btn-save-purple {
  padding: 7px 16px;
  border-radius: 6px;
  background: #66CC00;
  color: #003466;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
  font-family: inherit;
}

.btn-save-purple:disabled { opacity: 0.5; cursor: default; }

/* .modal-box has no max-height/overflow-y-auto of its own (only the avatar grid inside it
   scrolls internally) — fine for that short form, but a cMoon list plus explanatory copy can
   run taller than a short phone viewport with no way to reach Submit. This modifier fixes that
   for the team-change modal specifically, without touching the avatar/username modals' layout. */
.modal-box.team-modal {
  max-height: 90dvh;
  overflow-y: auto;
}

.team-status-text {
  font-size: 0.78rem;
  color: #555;
  margin-bottom: 14px;
}

.team-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  margin-bottom: 14px;
}

.team-option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.team-option:has(input:checked) { border-color: var(--OrbitDarkBlue, #336699); border-width: 2px; }

.team-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.team-name {
  font-size: 0.82rem;
  color: #1a1a2e;
}
</style>
