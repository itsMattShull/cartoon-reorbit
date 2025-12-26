<template>
  <ClientOnly>
    <div class="scanner">
      <div class="controls">
        <button
          type="button"
          @click="toggleScan"
          :disabled="isProcessingFile"
          :class="[
            'px-8 py-4 text-xl font-semibold rounded-xl shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2',
            isRunning
              ? 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-300'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-300'
          ]"
        >
          {{ isRunning ? 'Stop Scan' : 'Start Scan' }}
        </button>

        <button
          type="button"
          @click="triggerFile"
          :disabled="isProcessingFile"
          class="px-8 py-4 text-xl font-semibold rounded-xl shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-sky-600 hover:bg-sky-700 text-white focus:ring-sky-300"
        >
          Upload Image
        </button>

        <button
          v-if="showViewMonsters"
          type="button"
          @click="goToMonsters"
          class="px-8 py-4 text-xl font-semibold rounded-xl shadow-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-slate-700 hover:bg-slate-800 text-white focus:ring-slate-300"
        >
          View Monsters
        </button>
      </div>

      <div :id="readerId" ref="readerEl" class="reader">
        <div v-if="pendingMatch" class="reader-status">
          Code found — scan again to confirm.
        </div>
      </div>

      <!-- hidden file input for image uploads -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        @change="onFileSelected"
        style="display: none"
      />

      <p v-if="error" class="error">{{ error }}</p>

      <div v-if="scanResult" class="result-card">
        <div class="result-meta">
          <span class="result-code">Raw: {{ scanRawValue }}</span>
          <span class="result-dot">•</span>
          <span class="result-code">Normalized: {{ scanNormalizedValue }}</span>
          <span class="result-dot">•</span>
          <span class="result-type">{{ scanTypeLabel }}</span>
        </div>
        <div v-if="scanResult.outcome === 'NOTHING'" class="result-inner">
          <h3 class="result-title">No luck this time</h3>
          <p class="result-subtitle">You didn’t get an item or a monster.</p>
        </div>

        <div v-else-if="scanResult.outcome === 'MONSTER'" class="result-inner">
          <img
            v-if="scanResult.result?.standingStillImagePath"
            :src="scanResult.result.standingStillImagePath"
            alt="Monster standing still"
            class="result-image"
          />
          <div>
            <h3 class="result-title">{{ scanResult.result?.name || 'New Monster' }}</h3>
            <p class="result-subtitle">Rolled stats</p>
            <div class="result-stats">
              <div>HP: {{ monsterStats.hp }}</div>
              <div>ATK: {{ monsterStats.atk }}</div>
              <div>DEF: {{ monsterStats.def }}</div>
            </div>
          </div>
        </div>

        <div v-else-if="scanResult.outcome === 'ITEM'" class="result-inner">
          <img
            v-if="scanResult.result?.image"
            :src="scanResult.result.image"
            alt="Item"
            class="result-image"
          />
          <div>
            <h3 class="result-title">{{ scanResult.result?.name || 'New Item' }}</h3>
            <p class="result-subtitle">{{ itemEffectDescription }}</p>
            <div class="result-stats">
              <div>Power: {{ scanResult.result?.stat?.power ?? 0 }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import { useRouter } from "vue-router";

const endpointUrl = "/api/monsters/scan";

const props = defineProps({
  stopAfterSuccess: { type: Boolean, default: true },
  showViewMonsters: { type: Boolean, default: false },
});

const readerId = `html5qr-${Math.random().toString(36).slice(2)}`;
const isRunning = ref(false);
const error = ref(null);
const lastPayload = ref(null);
const scanResult = ref(null);
const isProcessingFile = ref(false);
const fileInput = ref(null);
const readerEl = ref(null);
const router = useRouter();
const pendingMatch = ref(false);
let lastNormalized = "";
let matchCount = 0;

let Html5Qrcode;
let Html5QrcodeSupportedFormats;
let scanner;

let postingLock = false;

onMounted(async () => {
  // Client-only import (SSR-safe)
  const mod = await import("html5-qrcode");
  Html5Qrcode = mod.Html5Qrcode;
  Html5QrcodeSupportedFormats = mod.Html5QrcodeSupportedFormats;

  scanner = new Html5Qrcode(readerId, {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.AZTEC,
      Html5QrcodeSupportedFormats.PDF_417,
      Html5QrcodeSupportedFormats.MAXICODE,
      Html5QrcodeSupportedFormats.RSS_14,
      Html5QrcodeSupportedFormats.RSS_EXPANDED,
      Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
    ],
  });
});

async function postScan(payload) {
  error.value = null;

  try {
    const res = await $fetch(endpointUrl, {
      method: "POST",
      body: payload,
      // Same-origin requests generally include cookies; this makes it explicit.
      credentials: "include",
    });

    // Store both request + response for debugging/UI
    lastPayload.value = { ...payload, response: res };
    scanResult.value = res;
    return res;
  } catch (e) {
    error.value =
      e?.data?.statusMessage ||
      e?.statusMessage ||
      e?.message ||
      String(e);
    throw e;
  }
}

async function start() {
  error.value = null;
  if (!scanner || isRunning.value) return;

  postingLock = false;

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {} // ignore per-frame decode errors
    );
    isRunning.value = true;
  } catch (e) {
    error.value = e?.message || String(e);
  }
}

async function stop() {
  if (!scanner || !isRunning.value) return;

  try {
    await scanner.stop();
    await scanner.clear();
  } catch (e) {
    error.value = e?.message || String(e);
  } finally {
    isRunning.value = false;
  }
}

async function onScanSuccess(decodedText, decodedResult) {
  // prevent spamming endpoint due to repeated detections
  if (postingLock) return;
  postingLock = true;

  const formatName = decodedResult?.result?.format?.formatName || "unknown";
  const normalized = normalizeValue(formatName, decodedText);
  if (normalized && normalized === lastNormalized) {
    matchCount += 1;
  } else {
    matchCount = 1;
    lastNormalized = normalized;
  }
  if (matchCount < 2) {
    pendingMatch.value = true;
    postingLock = false;
    return;
  }
  pendingMatch.value = false;
  matchCount = 0;
  lastNormalized = "";

  const payload = {
    format: String(formatName).toLowerCase(),
    rawValue: decodedText,
  };

  try {
    await postScan(payload);

    if (props.stopAfterSuccess) {
      await stop();
      postingLock = false;
      return;
    }

    setTimeout(() => (postingLock = false), 500);
  } catch {
    // allow retry if the request failed
    postingLock = false;
  }
}

function toggleScan() {
  if (isRunning.value) stop();
  else {
    clearResult();
    start();
  }
}

function triggerFile() {
  error.value = null;
  clearResult();
  fileInput.value?.click();
}

async function onFileSelected(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;

  // clear the input so selecting the same file again re-triggers change
  e.target.value = "";

  await scanImageFile(file);
}

async function scanImageFile(file) {
  if (!scanner) {
    error.value = "Scanner not ready yet";
    return;
  }

  // ensure live camera scan is not active
  if (isRunning.value) {
    await stop();
  }

  error.value = null;
  isProcessingFile.value = true;
  if (readerEl.value) readerEl.value.innerHTML = "";

  try {
    if (typeof scanner.scanFileV2 === "function") {
      const r = await scanner.scanFileV2(file, true);
      const formatName = r?.result?.format?.formatName || "unknown";

      const payload = {
        format: String(formatName).toLowerCase(),
        rawValue: r?.decodedText ?? "",
      };

      pendingMatch.value = false;
      matchCount = 0;
      lastNormalized = "";
      await postScan(payload);
    } else if (typeof scanner.scanFile === "function") {
      const text = await scanner.scanFile(file, true);

      const payload = {
        format: "unknown",
        rawValue: text ?? "",
      };

      pendingMatch.value = false;
      matchCount = 0;
      lastNormalized = "";
      await postScan(payload);
    } else {
      error.value = "This browser build does not support image scanning.";
    }
  } catch (e) {
    error.value = e?.errorMessage || e?.message || String(e);
  } finally {
    if (readerEl.value) readerEl.value.innerHTML = "";
    isProcessingFile.value = false;
  }
}

const monsterStats = computed(() => {
  const stats = scanResult.value?.ownedStats || scanResult.value?.result?.baseStats || {};
  return {
    hp: stats.hp ?? 0,
    atk: stats.atk ?? 0,
    def: stats.def ?? 0,
  };
});

const scanRawValue = computed(() => lastPayload.value?.rawValue || "");
const scanNormalizedValue = computed(() => {
  const key = scanResult.value?.barcodeKey || "";
  const idx = key.indexOf(":");
  return idx === -1 ? key : key.slice(idx + 1);
});
const scanTypeLabel = computed(() => {
  const type = scanResult.value?.outcome;
  if (type === "NOTHING") return "Nothing";
  if (type === "ITEM") return "Item";
  if (type === "MONSTER") return "Monster";
  return "Unknown";
});

const itemEffectDescription = computed(() => {
  const effect = scanResult.value?.result?.effect;
  if (!effect) return "Effect: Unknown";
  if (effect === "HEAL") return "Effect: Heals your monster.";
  return `Effect: ${effect}`;
});

function clearResult() {
  scanResult.value = null;
  lastPayload.value = null;
  pendingMatch.value = false;
  matchCount = 0;
  lastNormalized = "";
}

function goToMonsters() {
  router.push("/monsters");
}

function normalizeValue(formatName, decodedText) {
  const raw = String(decodedText || "").trim();
  const looksNumeric = /^[0-9\s-]+$/.test(raw);
  return looksNumeric ? raw.replace(/[^0-9]/g, "") : raw;
}

onBeforeUnmount(async () => {
  await stop();
});
</script>

<style scoped>
.scanner { width: 100%; }
.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin: 16px 0 8px;
}
.reader {
  position: relative;
  width: 100%;
  max-width: 520px;
  margin: 16px auto 0;
}
.reader-status {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.8);
  color: #fff;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.error {
  color: #c00;
  margin-top: 8px;
  text-align: center;
}
.payload {
  margin: 12px auto 0;
  padding: 10px;
  background: #111;
  color: #ddd;
  overflow: auto;
  max-width: 520px;
}
.result-card {
  max-width: 520px;
  margin: 16px auto 0;
  padding: 16px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
}
.result-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
  font-weight: 700;
  color: #0f172a;
  text-align: center;
  word-break: break-all;
}
.result-code {
  max-width: 100%;
  white-space: normal;
}
.result-dot {
  opacity: 0.6;
}

@media (max-width: 520px) {
  .result-meta {
    flex-direction: column;
    gap: 4px;
  }
  .result-dot {
    display: none;
  }
}
.result-inner {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 16px;
  align-items: center;
}
.result-image {
  width: 120px;
  height: 120px;
  object-fit: contain;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}
.result-title {
  font-weight: 700;
  font-size: 1.25rem;
  color: #0f172a;
}
.result-subtitle {
  color: #475569;
  margin-top: 4px;
}
.result-stats {
  margin-top: 10px;
  display: grid;
  gap: 4px;
  font-weight: 600;
  color: #0f172a;
}
@media (max-width: 520px) {
  .result-inner {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .result-image {
    margin: 0 auto;
  }
  .controls button {
    padding: 0.6rem 0.9rem;
    font-size: 0.95rem;
  }
}
</style>
