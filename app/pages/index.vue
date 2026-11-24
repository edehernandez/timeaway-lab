<!-- Purpose: the person's own page, / (D-029, REQ-006, REQ-007) — their vacation days left for this year and next
     with each year's pending vacation days beside it, their own requests newest first with kind, days, counted
     weekdays, state and who cancelled one and when, and the cancel of a pending one (REQ-005). Days are shown from their YYYY-MM-DD text as they are, never
     turned into an instant, so every browser zone shows the same day (D-007, ROW-131). -->
<script setup lang="ts">
interface OwnRequest {
  id: number
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  inEffectDays: number
  cancelledDays: number
  state: string
  decidedAt: string | null
  decidedBy: string | null
  rejectionNote: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelFrom: string | null
}

interface YearFigures {
  year: number
  daysLeft: number
  pending: number
}

const me = useMe()
const { data, refresh } = await useFetch<{ timeZone: string; requests: OwnRequest[] }>('/api/requests', { key: 'own-requests' })
// REQ-007: the figures come from the server's one balance function (RULE-001); the page only shows them.
const { data: balance, refresh: refreshBalance } = await useFetch<{ years: YearFigures[] }>('/api/balance', { key: 'own-balance' })
const problem = ref('')
const busy = ref<number | null>(null)
// ROW-209: the send form's notice, shown once on arrival and gone on the next load.
const sentNotice = useState<string>('sent-notice', () => '')
const notice = ref(sentNotice.value)
sentNotice.value = ''

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A YYYY-MM-DD day as "29 February 2028", read from its text only. */
function shown(day: string): string {
  const [y, m, d] = day.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

/** REQ-006 arm 7: an instant shown as its day and time in the team's time zone (D-007), never the browser's. */
function shownAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: data.value?.timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** REQ-007 arm 5: a negative figure keeps its minus sign. */
function figure(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : String(n)
}

function label(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// REQ-005: a person cancels their own pending request; the server decides whether it still may.
async function cancel(id: number) {
  if (busy.value !== null) return
  problem.value = ''
  notice.value = ''
  busy.value = id
  try {
    await $fetch(`/api/requests/${id}/cancel`, { method: 'POST' })
    await Promise.all([refresh(), refreshBalance()])
  } catch (e) {
    problem.value = refusalMessage(e, 'The request was not cancelled. Try again.')
    // ROW-219: a cancel refused because the request changed shows the request as it now is.
    await Promise.all([refresh(), refreshBalance()])
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section>
    <h1>My requests</h1>
    <p>Welcome, {{ me?.name }}. <NuxtLink to="/requests/new">Ask for time off</NuxtLink></p>
    <h2>Vacation days</h2>
    <table v-if="balance?.years?.length" class="balance">
      <thead>
        <tr>
          <th scope="col">Year</th>
          <th scope="col">Days left</th>
          <th scope="col">Pending vacation days</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="y in balance.years" :key="y.year">
          <th scope="row">{{ y.year }}</th>
          <td :class="{ negative: y.daysLeft < 0 }">{{ figure(y.daysLeft) }}</td>
          <td>{{ figure(y.pending) }}</td>
        </tr>
      </tbody>
    </table>
    <h2>Requests</h2>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-if="!data?.requests?.length">You have no requests yet.</p>
    <table v-else>
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">First day</th>
          <th scope="col">Last day</th>
          <th scope="col">Weekdays</th>
          <th scope="col">State</th>
          <th scope="col">Decided</th>
          <th scope="col">Cancelled</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data.requests" :key="r.id">
          <td>{{ label(r.kind) }}</td>
          <td>{{ shown(r.firstDay) }}</td>
          <td>{{ shown(r.lastDay) }}</td>
          <td>
            {{ r.countedDays }}<template v-if="r.cancelFrom"> ({{ r.inEffectDays }} in effect, {{ r.cancelledDays }} cancelled)</template>
          </td>
          <td>{{ label(r.state) }}</td>
          <td>
            <template v-if="r.decidedAt">by {{ r.decidedBy ?? 'unknown' }}, {{ shownAt(r.decidedAt) }}</template>
            <template v-if="r.rejectionNote"><br>Note: {{ r.rejectionNote }}</template>
          </td>
          <td>
            <!-- REQ-019 arm 4, REQ-006 arm 7: a partial cancel shows the day its cancelled days start from. -->
            <template v-if="r.cancelledAt">
              <template v-if="r.cancelFrom">Days from {{ shown(r.cancelFrom) }} cancelled, </template>by {{ r.cancelledBy ?? 'unknown' }}, {{ shownAt(r.cancelledAt) }}
            </template>
          </td>
          <td>
            <button v-if="r.state === 'pending'" type="button" :disabled="busy === r.id" @click="cancel(r.id)">Cancel</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
.problem { color: var(--danger); }
.balance { width: auto; margin-bottom: 1rem; }
.negative { color: var(--danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
