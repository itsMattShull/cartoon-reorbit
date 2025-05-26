<template>
  <div class="max-w-md mx-auto mt-10 p-6 bg-white rounded-2xl shadow">
    <h2 class="text-2xl font-semibold mb-4">Email Login</h2>

    <!-- Step 1: Enter email -->
    <form v-if="!codeSent" @submit.prevent="sendCode" class="space-y-4">
      <div>
        <label for="email" class="block text-sm font-medium">Email Address</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          placeholder="you@example.com"
          class="mt-1 block w-full p-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
        />
      </div>
      <button
        type="submit"
        :disabled="loading"
        class="w-full py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <span v-if="!loading">Send Code</span>
        <span v-else>Sending...</span>
      </button>
    </form>

    <!-- Step 2: Enter verification code -->
    <form v-else @submit.prevent="verifyCode" class="space-y-4">
      <div>
        <label for="code" class="block text-sm font-medium">6-Digit Code</label>
        <input
          id="code"
          v-model="code"
          type="text"
          maxlength="6"
          required
          placeholder="123456"
          class="mt-1 block w-full p-2 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
        />
      </div>
      <button
        type="submit"
        :disabled="verifyLoading"
        class="w-full py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        <span v-if="!verifyLoading">Verify Code</span>
        <span v-else>Verifying...</span>
      </button>
    </form>

    <!-- Messages -->
    <p v-if="message" class="mt-4 text-green-600">{{ message }}</p>
    <p v-if="error" class="mt-4 text-red-600">{{ error }}</p>
    <p v-if="verifyError" class="mt-4 text-red-600">{{ verifyError }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'

definePageMeta({ 
  layout: 'default'
})

const email = ref('')
const code = ref('')
const message = ref('')
const error = ref('')
const verifyError = ref('')
const loading = ref(false)
const verifyLoading = ref(false)
const codeSent = ref(false)

async function sendCode() {
  message.value = ''
  error.value = ''
  loading.value = true

  try {
    const res = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value })
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.')
    }

    message.value = '✅ Code sent! Please enter it below.'
    codeSent.value = true
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function verifyCode() {
  verifyError.value = ''
  verifyLoading.value = true

  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, code: code.value })
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Verification failed. Please try again.')
    }

    // On success, redirect to setup username
    window.location.href = '/setup-username'
  } catch (e) {
    verifyError.value = e.message
  } finally {
    verifyLoading.value = false
  }
}
</script>
