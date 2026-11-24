<!-- Purpose: the admin's people page, /admin/people (D-029, REQ-013, REQ-020): every account with its email, state and
     allowance, and the form that creates an account (name, email, first password typed twice, allowance). Password
     fields here are for other people: marked new-password and empty, never filled with the admin's own sign-in
     (ROW-234). -->
<script setup lang="ts">
// REQ-013: only the admin creates accounts; the server refuses anyone else (RULE-003).
interface Person {
  id: number
  name: string
  email: string
  isAdmin: boolean
  switchedOn: boolean
  allowance: number | null
}

const { data: people, refresh } = await useFetch<Person[]>('/api/admin/people', { default: () => [] })

const name = ref('')
const email = ref('')
const password = ref('')
const again = ref('')
const allowance = ref<number | null>(25)
const problem = ref('')
const done = ref('')
const busy = ref(false)

async function create() {
  problem.value = ''
  done.value = ''
  if (password.value !== again.value) {
    problem.value = 'The two passwords are not the same.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/admin/accounts', {
      method: 'POST',
      body: { name: name.value, email: email.value, password: password.value, allowance: allowance.value },
    })
    done.value = `${name.value.trim()} can now sign in with the password you set; they will choose their own at first sign-in.`
    name.value = ''
    email.value = ''
    password.value = ''
    again.value = ''
    allowance.value = 25
    await refresh()
  } catch (e) {
    problem.value = refusalMessage(e, 'The account was not created. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section>
    <h1>People</h1>
    <table>
      <thead>
        <tr><th>Name</th><th>Email</th><th>Allowance this year</th><th>State</th></tr>
      </thead>
      <tbody>
        <tr v-for="p in people" :key="p.id">
          <td><NuxtLink :to="`/admin/people/${p.id}`">{{ p.name }}</NuxtLink><span v-if="p.isAdmin"> (admin)</span></td>
          <td>{{ p.email }}</td>
          <td>{{ p.allowance ?? '–' }}</td>
          <td>{{ p.switchedOn ? 'Switched on' : 'Switched off' }}</td>
        </tr>
      </tbody>
    </table>

    <h2>Create an account</h2>
    <form autocomplete="off" @submit.prevent="create">
      <p>
        <label for="new-name">Name</label>
        <input id="new-name" v-model="name" type="text" autocomplete="off" maxlength="60" required>
      </p>
      <p>
        <label for="new-email">Email</label>
        <input id="new-email" v-model="email" type="email" autocomplete="off" required>
      </p>
      <p>
        <label for="new-password">First password</label>
        <input id="new-password" v-model="password" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p>
        <label for="new-password-again">First password again</label>
        <input id="new-password-again" v-model="again" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p>
        <label for="createAllowance">Allowance (days a year)</label>
        <input id="createAllowance" v-model.number="allowance" type="number" min="0" max="260" step="1" required>
      </p>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <p v-if="done" role="status">{{ done }}</p>
      <p><button type="submit" :disabled="busy">Create account</button></p>
    </form>
  </section>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
form { max-width: 24rem; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.problem { color: var(--danger); }
</style>
