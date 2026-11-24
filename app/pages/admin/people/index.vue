<!-- Purpose: the admin's people page, /admin/people (D-029, REQ-013, REQ-020): every account with its email, state and
     allowance, Switch off (through its confirmation, REQ-016, REQ-025) and Switch on on each ordinary account, and the
     form that creates an account (name, email, first password typed twice, allowance). Password
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
const listProblem = ref('')
const listDone = ref('')
const busy = ref(false)

interface SwitchOffStep {
  person: Person
  summary: string
  token: string
  problem: string
}
const switching = ref<SwitchOffStep | null>(null)
const switchBusy = ref(false)

function statusOf(e: unknown): number | undefined {
  const x = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return x.statusCode ?? x.status ?? x.response?.status
}

async function switchOffEffect(p: Person): Promise<{ summary: string; token: string }> {
  return $fetch<{ summary: string; token: string }>(`/api/admin/accounts/${p.id}/effect`, { query: { action: 'switch-off' } })
}

// REQ-016, REQ-025: Switch off opens the confirmation naming the requests cancelled and the days that stay.
async function startSwitchOff(p: Person) {
  listProblem.value = ''
  listDone.value = ''
  try {
    const effect = await switchOffEffect(p)
    switching.value = { person: p, summary: effect.summary, token: effect.token, problem: '' }
  } catch (e) {
    listProblem.value = refusalMessage(e, 'This account cannot be switched off now.')
    await refresh()
  }
}

async function confirmSwitchOff() {
  const s = switching.value
  if (!s || switchBusy.value) return
  switchBusy.value = true
  try {
    await $fetch(`/api/admin/accounts/${s.person.id}/switch`, { method: 'POST', body: { on: false, token: s.token } })
    listDone.value = `${s.person.name}'s account is switched off.`
    switching.value = null
    await refresh()
  } catch (e) {
    const message = refusalMessage(e, 'The account was not switched off. Nothing was changed.')
    if (statusOf(e) === 409) {
      // REQ-025 arm 5: what was shown no longer holds; show the confirmation again as it now is.
      try {
        const effect = await switchOffEffect(s.person)
        switching.value = { person: s.person, summary: effect.summary, token: effect.token, problem: message }
      } catch (again) {
        switching.value = null
        listProblem.value = refusalMessage(again, message)
        await refresh()
      }
    } else {
      s.problem = message
    }
  } finally {
    switchBusy.value = false
  }
}

// REQ-016 arm 6: switching back on restores sign-in and no cancelled request; it needs no confirmation (D-029).
async function switchOn(p: Person) {
  listProblem.value = ''
  listDone.value = ''
  try {
    await $fetch(`/api/admin/accounts/${p.id}/switch`, { method: 'POST', body: { on: true } })
    listDone.value = `${p.name}'s account is switched on; they sign in with their old password.`
    await refresh()
  } catch (e) {
    listProblem.value = refusalMessage(e, 'The account was not switched on.')
  }
}

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
    <p v-if="listProblem" class="problem" role="alert">{{ listProblem }}</p>
    <p v-if="listDone" role="status">{{ listDone }}</p>
    <table>
      <thead>
        <tr><th>Name</th><th>Email</th><th>Allowance this year</th><th>State</th><th><span class="visually-hidden">Actions</span></th></tr>
      </thead>
      <tbody>
        <tr v-for="p in people" :key="p.id">
          <td><NuxtLink :to="`/admin/people/${p.id}`">{{ p.name }}</NuxtLink><span v-if="p.isAdmin"> (admin)</span></td>
          <td>{{ p.email }}</td>
          <td>{{ p.allowance ?? '–' }}</td>
          <td>{{ p.switchedOn ? 'Switched on' : 'Switched off' }}</td>
          <td>
            <template v-if="!p.isAdmin">
              <button v-if="p.switchedOn" type="button" @click="startSwitchOff(p)">Switch off</button>
              <button v-else type="button" @click="switchOn(p)">Switch on</button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
    <ConfirmDialog
      v-if="switching"
      :key="`off-${switching.person.id}-${switching.token}`"
      title="Switch this account off?"
      :summary="switching.summary"
      :problem="switching.problem"
      :busy="switchBusy"
      @confirm="confirmSwitchOff"
      @close="switching = null"
    />

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
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
