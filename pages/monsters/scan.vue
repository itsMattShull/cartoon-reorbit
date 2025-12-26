<template>
  <Nav />
  <div class="mt-6 md:mt-12">&nbsp;</div>
  <div class="mx-auto max-w-3xl px-4 text-center text-sm text-slate-600 mt-6">
    Scan barcodes or QR codes to discover monsters and items. QR codes are more reliable than barcodes.
  </div>
  <BarcodeQrScanner class="mt-12" :show-view-monsters="true" />
</template>

<script setup>
  // const userId = "USER_ID_HERE";
</script>
