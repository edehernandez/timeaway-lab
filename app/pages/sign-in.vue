<!-- Purpose: the sign-in page (REQ-014, ROW-279, ROW-112, ROW-221) — the one page shown signed out: a form with
     Email, Password and Sign in, no navigation, no sign-up or reset link, and a line that the admin sets new
     passwords. It says so when a session has just ended (ROW-217). The form is a real post to the sign-in route,
     so it works before the page's scripts have loaded too; it never puts what is typed in the address. -->
<script setup lang="ts">
// REQ-014: every page and action requires signing in; this page is the one door.
definePageMeta({ layout: false })

const route = useRoute()
const email = ref('')
const password = ref('')
const problem = ref('')
const busy = ref(false)

const ended = computed(() => route.query.ended === '1')
const notice = computed(() => {
  if (route.query.failed === '1') return 'Those details do not sign you in. If you have forgotten your password, ask the admin to set a new one.'
  if (route.query.wait === '1') return 'Too many wrong passwords for this email. Wait 15 minutes, then try again.'
  return ''
})

async function submit() {
  problem.value = ''
  busy.value = true
  try {
    const r = await $fetch<{ ok: boolean; mustChangePassword: boolean }>('/api/auth/sign-in', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    // The next page is always the product's own: no return address is read from the address bar (ROW-241).
    await navigateTo(r.mustChangePassword ? '/password' : '/', { replace: true })
  } catch (e) {
    problem.value = refusalMessage(e, 'Signing in did not work. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="sign-in">
    <h1>Sign in to TimeAway</h1>
    <p v-if="ended" class="ended" role="status">Your session has ended. Please sign in again.</p>
    <form method="post" action="/api/auth/sign-in" @submit.prevent="submit">
      <p>
        <label for="sign-in-email">Email</label>
        <input id="sign-in-email" v-model="email" name="email" type="email" autocomplete="username" required>
      </p>
      <p>
        <label for="sign-in-password">Password</label>
        <input id="sign-in-password" v-model="password" name="password" type="password" autocomplete="current-password" required>
      </p>
      <p v-if="problem || notice" class="problem" role="alert">{{ problem || notice }}</p>
      <p><button type="submit" :disabled="busy">Sign in</button></p>
    </form>
    <p class="muted">Forgot your password? The admin sets new passwords: ask the admin for one.</p>
  </main>
</template>

<style scoped>
.sign-in { max-width: 24rem; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.problem { color: var(--danger); }
.ended { border-left: 3px solid var(--accent); padding-left: 0.5rem; }
.muted { color: var(--muted); }
</style>
