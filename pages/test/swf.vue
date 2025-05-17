<template>
  <div>
    <div id="swf-container" style="width: 640px; height: 480px;"></div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

// Load swf2js globally (ensure swf2js is installed or available in public/libs)
onMounted(() => {
  const script = document.createElement('script')
  script.src = '/libs/swf2js.js' // You must place swf2js.js in /public/libs/
  script.onload = () => {
    swf2js.load('/swfs/winball15.swf', '#swf-container')
  }
  document.head.appendChild(script)
})
</script>