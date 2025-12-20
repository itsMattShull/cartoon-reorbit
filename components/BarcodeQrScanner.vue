<template>
  <ClientOnly>
    <div class="scanner">

      <div class="controls">
        <button type="button" @click="start" :disabled="isRunning">Start scan</button>
        <button type="button" @click="stop" :disabled="!isRunning">Stop</button>
      </div>

      <div :id="readerId" class="reader"></div>

      <p v-if="error" class="error">{{ error }}</p>

      <pre v-if="lastPayload" class="payload">{{ JSON.stringify(lastPayload, null, 2) }}</pre>
    </div>
  </ClientOnly>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";

const props = defineProps({
  // endpointUrl: { type: String, required: true }, // "/api/scan" or full URL
  // userId: { type: String, required: true },
  stopAfterSuccess: { type: Boolean, default: true },
});

const readerId = `html5qr-${Math.random().toString(36).slice(2)}`;
const isRunning = ref(false);
const error = ref(null);
const lastPayload = ref(null);

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
    // Optional: limit formats for speed + fewer false positives
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

async function start() {
  error.value = null;
  if (!scanner || isRunning.value) return;

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

  // html5-qrcode: decodedResult.result.format.formatName 
  const formatName =
    decodedResult?.result?.format?.formatName || "unknown";

  const payload = {
    format: String(formatName).toLowerCase(), // "ean_13", "qr_code", etc.
    rawValue: decodedText,
    userId: props.userId,
  };

  lastPayload.value = payload;

  // try {
  //   await $fetch(props.endpointUrl, { method: "POST", body: payload });

  //   if (props.stopAfterSuccess) {
  //     await stop();
  //   }
  // } catch (e) {
  //   error.value = e?.message || String(e);
  // } finally {
  //   setTimeout(() => (postingLock = false), 500);
  // }
}

onBeforeUnmount(async () => {
  await stop();
});
</script>

<style scoped>
.scanner { max-width: 520px; }
.reader { width: 100%; }
.controls { display: flex; gap: 8px; margin-top: 12px; }
.error { color: #c00; margin-top: 8px; }
.payload { margin-top: 12px; padding: 10px; background: #111; color: #ddd; overflow: auto; }
</style>
