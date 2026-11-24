<!-- Purpose: the admin's person page, /admin/people/:id (D-029, REQ-015, REQ-020, REQ-024, REQ-027, REQ-011): an
     account's name, email, state and allowance, the forms that rename it, change its email, set a new password and
     set its allowance, and who changed what and when. The password fields are for the other person: new-password and
     empty (ROW-234); the admin's own password is changed on /password with the current one (ROW-077). -->
<script setup lang="ts">
interface Person {
  id: number
  name: string
  email: string
  isAdmin: boolean
  switchedOn: boolean
  allowance: number | null
}
interface Change {
  at: string
  by: string | null
  what: string
  from: string | null
  to: string | null
}

const route = useRoute()
const me = useMe()
const id = computed(() => String(route.params.id))
const { data: people, refresh: refreshPeople } = await useFetch<Person[]>('/api/admin/people', { default: () => [] })
const { data: history, refresh: refreshHistory } = await useFetch<{ history: Change[] }>(() => `/api/admin/people/${id.value}/history`, {
  default: () => ({ history: [] }),
})
const person = computed(() => people.value.find((p) => String(p.id) === id.value) ?? null)
const own = computed(() => person.value !== null && me.value !== null && person.value.id === me.value.id)

if (!person.value) throw createError({ statusCode: 404, statusMessage: 'Page not found' })

const newName = ref(person.value.name)
const newEmail = ref(person.value.email)
const password = ref('')
const again = ref('')
const allowance = ref<number | null>(person.value.allowance)
const startsNextYear = ref(false)
const problem = ref('')
const done = ref('')

async function act(path: string, body: Record<string, unknown>, success: string) {
  problem.value = ''
  done.value = ''
  try {
    await $fetch(`/api/admin/accounts/${id.value}/${path}`, { method: 'POST', body })
    done.value = success
    await Promise.all([refreshPeople(), refreshHistory()])
  } catch (e) {
    problem.value = refusalMessage(e, 'That did not work. Try again.')
  }
}

function rename() {
  return act('name', { name: newName.value }, 'The name is changed.')
}
function changeEmail() {
  return act('email', { email: newEmail.value }, 'The email is changed; the account now signs in with it.')
}
async function setPassword() {
  if (password.value !== again.value) {
    problem.value = 'The two passwords are not the same.'
    return
  }
  await act('password', { password: password.value }, 'The new password is set; they will choose their own at their next sign-in.')
  password.value = ''
  again.value = ''
}
function saveAllowance() {
  return act('allowance', { allowance: allowance.value, startsNextYear: startsNextYear.value }, 'The allowance is saved.')
}
</script>

<template>
  <section v-if="person">
    <h1>{{ person.name }}</h1>
    <p>{{ person.email }} · {{ person.switchedOn ? 'Switched on' : 'Switched off' }}<span v-if="person.isAdmin"> · the admin</span></p>
    <p>Allowance this year: {{ person.allowance ?? '–' }} days</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-if="done" role="status">{{ done }}</p>

    <h2>Name</h2>
    <form @submit.prevent="rename">
      <p>
        <label for="person-name">Name</label>
        <input id="person-name" v-model="newName" type="text" autocomplete="off" maxlength="60" required>
      </p>
      <p><button type="submit">Rename</button></p>
    </form>

    <h2>Email</h2>
    <form @submit.prevent="changeEmail">
      <p>
        <label for="person-email">Email</label>
        <input id="person-email" v-model="newEmail" type="email" autocomplete="off" required>
      </p>
      <p><button type="submit">Change email</button></p>
    </form>

    <h2>Password</h2>
    <p v-if="own">You change your own password on the <NuxtLink to="/password">password page</NuxtLink>, giving your current one.</p>
    <form v-else autocomplete="off" @submit.prevent="setPassword">
      <p>
        <label for="person-password">New password for {{ person.name }}</label>
        <input id="person-password" v-model="password" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p>
        <label for="person-password-again">New password again</label>
        <input id="person-password-again" v-model="again" type="password" autocomplete="new-password" minlength="8" required>
      </p>
      <p><button type="submit">Set password</button></p>
    </form>

    <h2>Allowance</h2>
    <form @submit.prevent="saveAllowance">
      <p>
        <label for="personAllowance">Allowance (days a year)</label>
        <input id="personAllowance" v-model.number="allowance" type="number" min="0" max="260" step="1" required>
      </p>
      <p>
        <label class="inline"><input v-model="startsNextYear" type="checkbox"> Starts next year</label>
      </p>
      <p><button type="submit">Save allowance</button></p>
    </form>

    <h2>Changes</h2>
    <ul v-if="history.history.length">
      <li v-for="(c, i) in history.history" :key="i">
        {{ c.at.slice(0, 16).replace('T', ' ') }} UTC — {{ c.what }}<template v-if="c.to"> ({{ c.from ? `${c.from} → ` : '' }}{{ c.to }})</template><template v-if="c.by"> by {{ c.by }}</template>
      </li>
    </ul>
    <p v-else>No changes yet.</p>
  </section>
</template>

<style scoped>
form { max-width: 24rem; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
label.inline { display: inline; font-weight: normal; }
input:not([type='checkbox']) { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.problem { color: var(--danger); }
</style>
