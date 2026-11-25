<!-- Purpose: the person's own page, / (D-029, REQ-006, REQ-007) — their vacation days left for this year and next
     with each year's pending vacation days beside it, their own requests newest first with kind, days, counted
     weekdays, state, when it was sent and who cancelled one and when, and what the person can do with each (REQ-029): the cancel of a pending one (REQ-005), the admin's
     cancel of their own approved days (A-061), or who acts on it. Days are shown from their YYYY-MM-DD text as they are, never
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
  sentAt: string
  decidedAt: string | null
  decidedBy: string | null
  rejectionNote: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelFrom: string | null
  /** REQ-029: what the signed-in person can do with it now, decided by the server's own cancel rules. */
  action: 'cancel' | 'cancel-days' | 'admin-cancels' | 'admin-decides' | 'decide' | null
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

// ROW-138: a YYYY-MM-DD day is drawn by the shared shownDay ("Tue 29 December 2026", read from its text only), so
// this page draws every date in the one shape the other pages and the confirmations draw (app/utils/days.ts).
const shown = shownDay

/** REQ-006 arm 7, ROW-138: an instant shown as its day and time in the team's time zone (D-007), never the browser's. */
function shownAt(iso: string): string {
  return shownInstant(iso, data.value?.timeZone)
}

/** REQ-007 arm 5: a negative figure keeps its minus sign. */
const figure = shownFigure

const label = shownWord

// REQ-029, A-061: the admin cancels the days to come of their own approved request through the same two-step cancel,
// with the same confirmation, as on the person page (REQ-010, REQ-025).
const { cancelling, cancelBusy, startCancel, confirmCancel, closeCancel } = useAdminCancel<OwnRequest>({
  problem,
  done: notice,
  doneMessage: () => 'The cancelled days of your request are given back and off the calendar.',
  refresh: () => Promise.all([refresh(), refreshBalance()]),
})

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
    <!-- ROW-210: the link is one box, never split over two lines, so it is tapped where it is drawn. -->
    <p>Welcome, {{ me?.name }}. <NuxtLink to="/requests/new" class="ask">Send a request</NuxtLink></p>
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
    <!-- REQ-012, ROW-210: at phone width the rows stack, each cell led by its column's name (main.css "stack"). -->
    <table v-else class="stack">
      <thead>
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">First day</th>
          <th scope="col">Last day</th>
          <th scope="col">Weekdays</th>
          <th scope="col">State</th>
          <th scope="col">Sent</th>
          <th scope="col">Decided</th>
          <th scope="col">Cancelled</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data.requests" :key="r.id">
          <td data-label="Kind">{{ label(r.kind) }}</td>
          <td data-label="First day">{{ shown(r.firstDay) }}</td>
          <td data-label="Last day">{{ shown(r.lastDay) }}</td>
          <td data-label="Weekdays">
            {{ r.countedDays }}<template v-if="r.cancelFrom"> ({{ r.inEffectDays }} in effect, {{ r.cancelledDays }} cancelled)</template>
          </td>
          <td data-label="State">{{ label(r.state) }}</td>
          <!-- REQ-017, ROW-139: when it was sent, as its team-zone date and time. -->
          <td data-label="Sent">{{ shownAt(r.sentAt) }}</td>
          <td data-label="Decided">
            <template v-if="r.decidedAt">by {{ r.decidedBy ?? 'unknown' }}, {{ shownAt(r.decidedAt) }}</template>
            <template v-if="r.rejectionNote"><br>Note: {{ r.rejectionNote }}</template>
          </td>
          <td data-label="Cancelled">
            <!-- REQ-019 arm 4, REQ-006 arm 7: a partial cancel shows the day its cancelled days start from. -->
            <template v-if="r.cancelledAt">
              <template v-if="r.cancelFrom">Days from {{ shown(r.cancelFrom) }} cancelled, </template>by {{ r.cancelledBy ?? 'unknown' }}, {{ shownAt(r.cancelledAt) }}
            </template>
          </td>
          <!-- REQ-029: a cancel control only where the server's rules let this person cancel; otherwise who acts on it. -->
          <td>
            <button v-if="r.action === 'cancel'" type="button" :disabled="busy === r.id" @click="cancel(r.id)">Cancel</button>
            <button v-else-if="r.action === 'cancel-days'" type="button" @click="startCancel(r)">Cancel days to come</button>
            <template v-else-if="r.action === 'admin-cancels'">Only the admin can cancel it.</template>
            <template v-else-if="r.action === 'admin-decides'">It has a weekday before today, so the admin decides it.</template>
            <template v-else-if="r.action === 'decide'"><NuxtLink to="/admin/pending">Approve or reject it</NuxtLink> on the pending page.</template>
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
      @close="closeCancel"
    />
  </section>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
.problem { color: var(--danger); }
.balance { width: auto; margin-bottom: 1rem; }
.ask { display: inline-block; }
.negative { color: var(--danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
