<!-- Purpose: the password page (REQ-015, REQ-026) — a person changes their own password by giving the current one,
     the new one typed twice (D-014); after an admin-set password it is the one page open, where the person chooses
     their own before reaching anything else. -->
<script setup lang="ts">
// REQ-015 arm 2: a change carries the current password; REQ-026: the forced choice happens here.
const me = useMe()
const current = ref('')
const next = ref('')
const again = ref('')
const problem = ref('')
const done = ref('')
const busy = ref(false)
const forced = computed(() => me.value?.mustChangePassword === true)

async function submit() {
  problem.value = ''
  done.value = ''
  if (next.value !== again.value) {
    problem.value = 'The two new passwords are not the same.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/me/password', { method: 'POST', body: { current: current.value, next: next.value } })
    const wasForced = forced.value
    current.value = ''
    next.value = ''
    again.value = ''
    if (wasForced) {
      await navigateTo('/', { replace: true })
      return
    }
    done.value = 'Your password is changed. Your other sessions have been signed out.'
  } catch (e) {
    problem.value = refusalMessage(e, 'The password was not changed. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section>
    <h1>{{ forced ? 'Choose your own password' : 'Change your password' }}</h1>
    <p v-if="forced">The admin set your password. Choose your own before you go on; it must differ from the one the admin gave you.</p>
    <form @submit.prevent="submit">
      <p>
        <label for="pw-current">{{ forced ? 'Password the admin gave you' : 'Current password' }}</label>
        <input id="pw-current" v-model="current" type="password" autocomplete="current-password" required>
      </p>
      <p>
        <label for="pw-next">New password</label>
        <input id="pw-next" v-model="next" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p>
        <label for="pw-again">New password again</label>
        <input id="pw-again" v-model="again" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p class="muted">At least 8 characters; spaces count and are kept as typed.</p>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <p v-if="done" role="status">{{ done }}</p>
      <p><button type="submit" :disabled="busy">{{ forced ? 'Choose password' : 'Change password' }}</button></p>
    </form>
  </section>
</template>

<style scoped>
form { max-width: 24rem; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.problem { color: var(--danger); }
.muted { color: var(--muted); }
</style>
