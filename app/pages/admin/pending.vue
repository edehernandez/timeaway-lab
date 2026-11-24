<!-- Purpose: the admin's pending requests page, /admin/pending (D-029, REQ-008, REQ-022, REQ-025): every pending request
     of every person, oldest sent first, with the person's name, kind, days and counted weekdays, and for a vacation
     the person's days left in its year and, labelled, the days left approving it would leave; Approve and Reject on each
     row, each through its confirmation step (Reject with an optional note). With nothing pending it says so. -->
<script setup lang="ts">
interface Entry {
  id: number
  accountId: number
  name: string
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  year: number
  daysLeft: number | null
  forecast: number | null
}
type Action = 'approve' | 'reject'
interface Open {
  action: Action
  entry: Entry
  summary: string
  token: string | null
  loading: boolean
  problem: string
}

// REQ-008, RULE-001: the list and every figure come from GET /api/admin/pending; the page only shows them.
const { data, refresh } = await useFetch<{ requests: Entry[] }>('/api/admin/pending', { key: 'admin-pending', default: () => ({ requests: [] }) })
const open = ref<Open | null>(null)
const busy = ref(false)
const problem = ref('')
const done = ref('')

function statusOf(e: unknown): number | undefined {
  const x = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return x.statusCode ?? x.status ?? x.response?.status
}

/** The confirmation's first words, from the row itself, until the server's own summary arrives (REQ-025 arm 2). */
function firstWords(action: Action, e: Entry): string {
  const verb = action === 'approve' ? 'Approve' : 'Reject'
  return `${verb} ${e.name}'s ${e.kind} request: ${shownRange(e.firstDay, e.lastDay)} (${shownCount(e.countedDays)}).`
}

/** Reads what the act would change now (GET …/effect): the summary and the token the act must carry. */
async function readEffect(o: Open): Promise<void> {
  o.loading = true
  try {
    const effect = await $fetch<{ token: string; summary: string }>(`/api/admin/requests/${o.entry.id}/effect`, { query: { action: o.action } })
    o.summary = effect.summary
    o.token = effect.token
  } catch (e) {
    o.token = null
    o.problem = refusalMessage(e, 'This request cannot be decided now.')
  } finally {
    o.loading = false
  }
}

// REQ-025 arm 1: Approve and Reject only open the confirmation; nothing changes until it is confirmed.
async function start(action: Action, entry: Entry) {
  problem.value = ''
  done.value = ''
  open.value = { action, entry, summary: firstWords(action, entry), token: null, loading: true, problem: '' }
  await readEffect(open.value)
}

// REQ-025 arm 4: going back changes nothing.
function close() {
  open.value = null
}

async function confirm(note: string) {
  const o = open.value
  if (!o || busy.value) return
  if (o.token === null) {
    // The request can no longer be decided (it changed meanwhile): say why and show the list as it now is.
    problem.value = o.problem || 'This request cannot be decided now. Nothing was changed.'
    open.value = null
    await refresh()
    return
  }
  busy.value = true
  try {
    const body = o.action === 'reject' ? { token: o.token, note } : { token: o.token }
    await $fetch(`/api/admin/requests/${o.entry.id}/${o.action}`, { method: 'POST', body })
    done.value = `${o.entry.name}'s ${o.entry.kind} request of ${shownRange(o.entry.firstDay, o.entry.lastDay)} is now ${o.action === 'approve' ? 'approved' : 'rejected'}.`
    open.value = null
    await refresh()
  } catch (e) {
    const message = refusalMessage(e, 'That did not work. Nothing was changed.')
    if (statusOf(e) === 409) {
      // REQ-025 arm 5: what was shown no longer holds; show the confirmation again as it now is.
      o.problem = message
      await readEffect(o)
      if (o.token === null) {
        problem.value = o.problem
        open.value = null
        await refresh()
      }
    } else {
      o.problem = message
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section>
    <h1>Pending requests</h1>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-if="done" role="status">{{ done }}</p>
    <p v-if="!data.requests.length">No requests are waiting for a decision.</p>
    <table v-else>
      <thead>
        <tr>
          <th scope="col">Person</th>
          <th scope="col">Kind</th>
          <th scope="col">Days</th>
          <th scope="col">Weekdays</th>
          <th scope="col">Days left in its year</th>
          <th scope="col">Days left if approved</th>
          <th scope="col"><span class="visually-hidden">Decide</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in data.requests" :key="e.id">
          <td>{{ e.name }}</td>
          <td>{{ shownWord(e.kind) }}</td>
          <td>{{ shownRange(e.firstDay, e.lastDay) }}</td>
          <td>{{ shownCount(e.countedDays) }}</td>
          <td>
            <template v-if="e.daysLeft !== null">{{ shownFigure(e.daysLeft) }} days left in {{ e.year }}</template>
            <template v-else>–</template>
          </td>
          <td :class="{ negative: e.forecast !== null && e.forecast < 0 }">
            <template v-if="e.forecast !== null">would leave {{ shownFigure(e.forecast) }}</template>
            <template v-else>–</template>
          </td>
          <td class="decide">
            <button type="button" @click="start('approve', e)">Approve</button>
            <button type="button" @click="start('reject', e)">Reject</button>
          </td>
        </tr>
      </tbody>
    </table>
    <ConfirmDialog
      v-if="open"
      :key="`${open.action}-${open.entry.id}`"
      :title="open.action === 'approve' ? 'Approve this request?' : 'Reject this request?'"
      :summary="open.summary"
      :problem="open.problem"
      :loading="open.loading"
      :busy="busy"
      :with-note="open.action === 'reject'"
      @confirm="confirm"
      @close="close"
    />
  </section>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); }
.decide { white-space: nowrap; }
.decide button + button { margin-left: 0.5rem; }
.problem { color: var(--danger); }
.negative { color: var(--danger); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
