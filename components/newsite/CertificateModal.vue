<template>
  <Teleport to="body">
    <div class="cert-modal-overlay" @click.self="$emit('close')">
      <div class="cert-modal-box">
        <button class="cert-modal-close" aria-label="Close" @click="$emit('close')">✕</button>

        <div v-if="loading" class="cert-status">Loading your certificate…</div>
        <div v-else-if="loadError" class="cert-status cert-status-error">{{ loadError }}</div>

        <template v-else>
          <div class="cert-preview-wrap" :style="{ height: previewHeight + 'px' }">
            <div class="cert-preview-scaler" :style="{ transform: `scale(${scale})` }">
              <CertificateArt
                :username="data.username"
                :member-since-label="memberSinceLabel"
                :border-images="data.borderImages"
              />
            </div>
          </div>

          <!-- Full-resolution, always off-screen: used as the source for both the PDF
               capture and browser printing, so neither depends on toggling the visible
               preview's scale transform (which would otherwise flash/resize on click). -->
          <div class="cert-capture-target">
            <div ref="captureRef">
              <CertificateArt
                :username="data.username"
                :member-since-label="memberSinceLabel"
                :border-images="data.borderImages"
              />
            </div>
          </div>

          <p v-if="downloadError" class="cert-status cert-status-error">{{ downloadError }}</p>

          <div class="cert-actions">
            <button v-if="canPrint" class="cert-btn cert-btn-secondary" @click="handlePrint">Print</button>
            <button class="cert-btn cert-btn-primary" :disabled="generating" @click="handleDownload">
              {{ generating ? 'Generating…' : 'Download PDF' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import CertificateArt from '@/components/newsite/CertificateArt.vue'

defineEmits(['close'])

// Must match the fixed design canvas inside CertificateArt.vue.
const CERT_WIDTH = 1100
const CERT_HEIGHT = 850
const MODAL_HORIZONTAL_PADDING = 64

const loading = ref(true)
const loadError = ref('')
const data = ref(null)

const generating = ref(false)
const downloadError = ref('')

const scale = ref(1)
const previewHeight = computed(() => CERT_HEIGHT * scale.value)

function computeScale() {
  const available = window.innerWidth - MODAL_HORIZONTAL_PADDING
  scale.value = Math.min(1, available / CERT_WIDTH)
}

// Hide the Print button inside known in-app browsers (Discord/Instagram/Facebook/
// LINE/WeChat webviews) where window.print() commonly no-ops or is unsupported —
// Download PDF works everywhere and stays the primary path there.
const canPrint = computed(() => {
  if (typeof navigator === 'undefined') return true
  return !/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Discord/i.test(navigator.userAgent)
})

const memberSinceLabel = computed(() => {
  if (!data.value?.memberSince) return ''
  const d = new Date(data.value.memberSince)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
})

async function loadCertificate() {
  loading.value = true
  loadError.value = ''
  try {
    data.value = await $fetch('/api/user/certificate', { credentials: 'include' })
  } catch (e) {
    loadError.value = e?.data?.statusMessage || 'Could not load your certificate. Please try again.'
  } finally {
    loading.value = false
  }
}

// Fired-and-forgotten as soon as the modal opens so the (sizeable) PDF libraries
// are already warm by the time the user clicks Download, instead of stalling on
// that click.
let libsPromise = null
function preloadLibs() {
  if (!libsPromise) {
    libsPromise = Promise.all([import('html2canvas'), import('jspdf')])
  }
  return libsPromise
}

const captureRef = ref(null)

function sanitizeFilename(name) {
  return (name || 'player').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'player'
}

async function handleDownload() {
  if (generating.value) return
  generating.value = true
  downloadError.value = ''
  try {
    const [{ default: html2canvas }, { jsPDF }] = await preloadLibs()
    await document.fonts?.ready

    const canvas = await html2canvas(captureRef.value, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })

    // Convert the design canvas's CSS pixel dimensions to PDF points (72pt/in
    // at the standard 96px/in) so the page matches the certificate's aspect ratio.
    const pageWidth = CERT_WIDTH * 0.75
    const pageHeight = CERT_HEIGHT * 0.75
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pageWidth, pageHeight] })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight)
    pdf.save(`cartoon-reorbit-certificate-${sanitizeFilename(data.value?.username)}.pdf`)
  } catch (e) {
    console.error(e)
    downloadError.value = 'Could not generate the PDF. Please try again.'
  } finally {
    generating.value = false
  }
}

function handlePrint() {
  window.print()
}

function onResize() { computeScale() }

onMounted(() => {
  computeScale()
  window.addEventListener('resize', onResize)
  loadCertificate()
  preloadLibs()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.cert-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cert-modal-box {
  position: relative;
  background: #ffffff;
  border-radius: 10px;
  max-width: calc(1100px + 64px);
  width: 100%;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 24px;
  color: #1a1a2e;
}

.cert-modal-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: none;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: #555;
  padding: 6px;
}

.cert-status {
  padding: 40px 16px;
  text-align: center;
  font-size: 0.9rem;
  color: #555;
}

.cert-status-error { color: #c0392b; }

.cert-preview-wrap {
  width: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.cert-preview-scaler {
  transform-origin: top left;
  width: 1100px;
}

/* Kept in the DOM (not display:none) so html2canvas and the browser's print
   engine can both render it at full resolution, but positioned far off-screen
   so it's never visible to the user. */
.cert-capture-target {
  position: absolute;
  left: -99999px;
  top: 0;
}

.cert-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.cert-btn {
  padding: 8px 18px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  font-family: inherit;
}

.cert-btn:disabled { opacity: 0.5; cursor: default; }

.cert-btn-primary {
  background: var(--OrbitDarkBlue, #336699);
  color: #ffffff;
}

.cert-btn-secondary {
  background: #eeeeee;
  color: #1a1a2e;
}
</style>

<style>
/* Global (unscoped) print rules: hide everything except the full-resolution
   capture target, which is normally parked off-screen, and bring it on-page
   for the duration of printing. */
@media print {
  body * {
    visibility: hidden !important;
  }
  .cert-capture-target,
  .cert-capture-target * {
    visibility: visible !important;
  }
  .cert-capture-target {
    position: static !important;
    left: auto !important;
  }
}
</style>
