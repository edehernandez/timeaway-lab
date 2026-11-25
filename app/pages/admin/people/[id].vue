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
  years?: { year: number; allowance: number | null; daysLeft: number; pending: number }[]
}
// REQ-028, D-043: a rename, or an allowance change with the year it starts, newest first.
interface Change {
  at: string
  by: string | null
  what: string
  from: string | number | null
  to: string | number | null
  startsYear?: number | null
}

interface PersonRequest {
  id: number
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  inEffectDays: number
  cancelledDays: number
  state: string
  sentAt: string
  decidedAt: string | null
  decidedBy: string | null
  rejectionNote: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelFrom: string | null
  canCancel: boolean
}
interface CancelStep {
  request: PersonRequest
  summary: string
  token: string | null
  problem: string
}

const route = useRoute()
const me = useMe()
const id = computed(() => String(route.params.id))
const { data: people, refresh: refreshPeople } = await useFetch<Person[]>('/api/admin/people', { default: () => [] })
// ROW-138 / REQ-006: each change's instant is shown on the team's day and in the one date format (app/utils/days.ts).
const { data: history, refresh: refreshHistory } = await useFetch<{ timeZone: string; history: Change[] }>(
  () => `/api/admin/people/${id.value}/history`,
  { default: () => ({ timeZone: 'UTC', history: [] }) },
)
// REQ-021: the person's requests as their own page lists them, each saying whether the admin's cancel applies now.
const { data: theirs, refresh: refreshTheirs } = await useFetch<{ timeZone: string; requests: PersonRequest[] }>(
  () => `/api/admin/people/${id.value}/requests`,
  { default: () => ({ timeZone: 'UTC', requests: [] }) },
)
const cancelling = ref<CancelStep | null>(null)
const cancelBusy = ref(false)

function statusOf(e: unknown): number | undefined {
  const x = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return x.statusCode ?? x.status ?? x.response?.status
}

async function cancelEffect(r: PersonRequest): Promise<{ summary: string; token: string }> {
  return $fetch<{ summary: string; token: string }>(`/api/admin/requests/${r.id}/effect`, { query: { action: 'cancel' } })
}

// REQ-010, REQ-025: Cancel opens the confirmation naming the days cancelled and the days that stay; nothing changes yet.
async function startCancel(r: PersonRequest) {
  problem.value = ''
  done.value = ''
  try {
    const effect = await cancelEffect(r)
    cancelling.value = { request: r, summary: effect.summary, token: effect.token, problem: '' }
  } catch (e) {
    problem.value = refusalMessage(e, 'This request cannot be cancelled now.')
    await refreshTheirs()
  }
}

async function confirmCancel() {
  const c = cancelling.value
  if (!c || c.token === null || cancelBusy.value) return
  cancelBusy.value = true
  try {
    await $fetch(`/api/admin/requests/${c.request.id}/cancel`, { method: 'POST', body: { token: c.token } })
    done.value = `The cancelled days of ${person.value?.name ?? 'this person'}'s request are given back and off the calendar.`
    cancelling.value = null
    await Promise.all([refreshTheirs(), refreshHistory()])
  } catch (e) {
    const message = refusalMessage(e, 'The request was not cancelled. Nothing was changed.')
    if (statusOf(e) === 409) {
      // REQ-025 arm 5: what was shown no longer holds; show the confirmation again as it now is.
      try {
        const effect = await cancelEffect(c.request)
        cancelling.value = { request: c.request, summary: effect.summary, token: effect.token, problem: message }
      } catch (again) {
        cancelling.value = null
        problem.value = refusalMessage(again, message)
        await refreshTheirs()
      }
    } else {
      c.problem = message
    }
  } finally {
    cancelBusy.value = false
  }
}
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
    <p v-if="!person.years">Allowance this year: {{ person.allowance ?? '–' }} days</p>
    <p v-for="y in person.years ?? []" :key="y.year">Allowance {{ y.year }}: {{ y.allowance ?? '–' }} days · {{ y.daysLeft }} days left</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-if="done" role="status">{{ done }}</p>

    <h2>Requests</h2>
    <p v-if="!theirs.requests.length">{{ person.name }} has sent no requests.</p>
    <!-- REQ-012, ROW-210: at phone width the rows stack, each cell led by its column's name (main.css "stack"). -->
    <table v-else class="requests stack">
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Days</th>
          <th scope="col">Weekdays</th>
          <th scope="col">State</th>
          <th scope="col">Sent</th>
          <th scope="col">Decided</th>
          <th scope="col">Cancelled</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in theirs.requests" :key="r.id">
          <td data-label="Kind">{{ shownWord(r.kind) }}</td>
          <td data-label="Days">{{ shownRange(r.firstDay, r.lastDay) }}</td>
          <td data-label="Weekdays">
            {{ shownCount(r.countedDays) }}<template v-if="r.cancelFrom">: {{ r.inEffectDays }} in effect, {{ r.cancelledDays }} cancelled</template>
          </td>
          <td data-label="State">{{ shownWord(r.state) }}</td>
          <!-- REQ-017, ROW-139: when it was sent, as its team-zone date and time. -->
          <td data-label="Sent">{{ shownInstant(r.sentAt, theirs.timeZone) }}</td>
          <td data-label="Decided">
            <template v-if="r.decidedAt">by {{ r.decidedBy ?? 'unknown' }}, {{ shownInstant(r.decidedAt, theirs.timeZone) }}</template>
            <template v-if="r.rejectionNote"><br>Note: {{ r.rejectionNote }}</template>
          </td>
          <td data-label="Cancelled">
            <template v-if="r.cancelledAt">
              <template v-if="r.cancelFrom">From {{ shownDay(r.cancelFrom) }}, </template>by {{ r.cancelledBy ?? 'unknown' }}, {{ shownInstant(r.cancelledAt, theirs.timeZone) }}
            </template>
          </td>
          <td>
            <button v-if="r.canCancel" type="button" @click="startCancel(r)">Cancel days to come</button>
          </td>
        </tr>
      </tbody>
    </table>
    <ConfirmDialog
      v-if="cancelling"
      :key="`cancel-${cancelling.request.id}-${cancelling.token}`"
      title="Cancel the days to come?"
      :summary="cancelling.summary"
      :problem="cancelling.problem"
      :busy="cancelBusy"
      @confirm="confirmCancel"
      @close="cancelling = null"
    />

    <h2>Name</h2>
    <form method="post" @submit.prevent="rename">
      <p>
        <label for="person-name">Name</label>
        <input id="person-name" v-model="newName" type="text" autocomplete="off" maxlength="60" required>
      </p>
      <p><button type="submit">Rename</button></p>
    </form>

    <h2>Email</h2>
    <form method="post" @submit.prevent="changeEmail">
      <p>
        <label for="person-email">Email</label>
        <input id="person-email" v-model="newEmail" type="email" autocomplete="off" required>
      </p>
      <p><button type="submit">Change email</button></p>
    </form>

    <h2>Password</h2>
    <p v-if="own">You change your own password on the <NuxtLink to="/password">password page</NuxtLink>, giving your current one.</p>
    <!-- ROW-234 (REQ-015): the form names the person it is for as its username, so a password manager ties the
         password typed here to this person, never to the admin's own saved sign-in. -->
    <form v-else autocomplete="off" method="post" @submit.prevent="setPassword">
      <p>
        <label for="person-password-account">Account</label>
        <input id="person-password-account" :value="person.email" type="email" name="username" autocomplete="username" readonly>
      </p>
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
    <form method="post" @submit.prevent="saveAllowance">
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
        {{ shownInstant(c.at, history.timeZone) }} — {{ c.what }}<template v-if="c.to !== null"> ({{ c.from !== null ? `${c.from} → ` : '' }}{{ c.to }})</template><template v-if="c.startsYear"> from {{ c.startsYear }}</template><template v-if="c.by"> by {{ c.by }}</template>
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
table.requests { border-collapse: collapse; width: 100%; }
table.requests th, table.requests td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
