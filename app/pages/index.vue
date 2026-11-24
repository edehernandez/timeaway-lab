<!-- Purpose: the person's own page, / (D-029, REQ-006) — their own requests with kind, days, counted weekdays and
     state, and the cancel of a pending one (REQ-005). Days are shown from their YYYY-MM-DD text as they are, never
     turned into an instant, so every browser zone shows the same day (D-007, ROW-131). -->
<script setup lang="ts">
interface OwnRequest {
  id: number
  kind: string
  firstDay: string
  lastDay: string
  countedDays: number
  state: string
}

const me = useMe()
const { data, refresh } = await useFetch<{ requests: OwnRequest[] }>('/api/requests', { key: 'own-requests' })
const problem = ref('')
const busy = ref<number | null>(null)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** A YYYY-MM-DD day as "29 February 2028", read from its text only. */
function shown(day: string): string {
  const [y, m, d] = day.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

function label(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// REQ-005: a person cancels their own pending request; the server decides whether it still may.
async function cancel(id: number) {
  problem.value = ''
  busy.value = id
  try {
    await $fetch(`/api/requests/${id}/cancel`, { method: 'POST' })
    await refresh()
  } catch (e) {
    problem.value = refusalMessage(e, 'The request was not cancelled. Try again.')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section>
    <h1>My requests</h1>
    <p>Welcome, {{ me?.name }}. <NuxtLink to="/requests/new">Ask for time off</NuxtLink></p>
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
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data.requests" :key="r.id">
          <td>{{ label(r.kind) }}</td>
          <td>{{ shown(r.firstDay) }}</td>
          <td>{{ shown(r.lastDay) }}</td>
          <td>{{ r.countedDays }}</td>
          <td>{{ label(r.state) }}</td>
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
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
