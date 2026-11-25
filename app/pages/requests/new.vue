<!-- Purpose: the send-a-request page, /requests/new (D-029, REQ-001, ROW-281) — a signed-in person asks for days off
     for themselves: the kind (vacation or sick, nothing preselected), the first day and the last day, and Send.
     The server decides everything that counts (the person, the weekdays, whether days are free); the page only sends. -->
<script setup lang="ts">
// REQ-001: the request is always the sender's own; the body carries no person (D-029 POST /api/requests).
const kind = ref<'' | 'vacation' | 'sick'>('')
const firstDay = ref('')
const lastDay = ref('')
const problem = ref('')
const busy = ref(false)
// ROW-209, ROW-207: the own page says the request was sent, once, and only after the server recorded it.
const sentNotice = useState<string>('sent-notice', () => '')
const sent = ref('')

async function submit() {
  // ROW-208: a second press while the first is on its way sends nothing.
  if (busy.value) return
  problem.value = ''
  sent.value = ''
  if (kind.value === '') {
    problem.value = 'Choose vacation or sick.'
    return
  }
  busy.value = true
  try {
    await $fetch('/api/requests', {
      method: 'POST',
      body: { kind: kind.value, firstDay: firstDay.value, lastDay: lastDay.value },
    })
    // Said here at once, and again on the own page it leads to, only once the server answered that it recorded it.
    sent.value = `Your ${kind.value} request for ${shownRange(firstDay.value, lastDay.value)} was sent; it is pending until the admin decides it.`
    sentNotice.value = sent.value
    await navigateTo('/')
  } catch (e) {
    problem.value = refusalMessage(e, 'The request was not sent. Try again.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section>
    <h1>Send a request</h1>
    <form @submit.prevent="submit">
      <fieldset>
        <legend>Kind</legend>
        <label class="choice"><input v-model="kind" type="radio" name="kind" value="vacation"> Vacation</label>
        <label class="choice"><input v-model="kind" type="radio" name="kind" value="sick"> Sick</label>
      </fieldset>
      <p>
        <label for="req-first">First day</label>
        <input id="req-first" v-model="firstDay" type="date" required>
      </p>
      <p>
        <label for="req-last">Last day</label>
        <input id="req-last" v-model="lastDay" type="date" required>
      </p>
      <p class="muted">Only Monday to Friday days count.</p>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <p v-if="sent" role="status">{{ sent }}</p>
      <p><button type="submit" :disabled="busy">Send</button></p>
    </form>
  </section>
</template>

<style scoped>
form { max-width: 24rem; }
fieldset { border: 1px solid var(--line); padding: 0.5rem 0.75rem; margin: 0 0 1rem; }
legend { font-weight: 600; }
.choice { display: inline-block; margin-right: 1rem; }
label[for] { display: block; font-weight: 600; margin-bottom: 0.25rem; }
input[type="date"] { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.problem { color: var(--danger); }
.muted { color: var(--muted); }
</style>
