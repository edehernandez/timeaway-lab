<!-- Purpose: the people page's account actions started from an account's row (REQ-020 arm 3, D-029): a dialog holding
     the one form for renaming the account, changing its email, setting it a new password or changing its allowance;
     it posts to that account's own route by its id (ROW-192) and changes nothing until its button is pressed; Go back
     (or Escape) closes it with nothing changed. The password form names the person it is for as its username and its
     fields are new-password and empty (ROW-234). -->
<script setup lang="ts">
type AccountAction = 'name' | 'email' | 'password' | 'allowance'

const props = defineProps<{
  person: { id: number; name: string; email: string; allowance: number | null }
  action: AccountAction
}>()
const emit = defineEmits<{ done: [message: string]; close: [] }>()

const id = useId()
const name = ref(props.person.name)
const email = ref(props.person.email)
const password = ref('')
const again = ref('')
const allowance = ref<number | null>(props.person.allowance)
const startsNextYear = ref(false)
const problem = ref('')
const busy = ref(false)
const first = ref<HTMLInputElement | null>(null)

const titles: Record<AccountAction, string> = {
  name: 'Rename',
  email: 'Change email',
  password: 'Set a new password',
  allowance: 'Change allowance',
}

onMounted(() => first.value?.focus())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && !busy.value) emit('close')
}

function bodyOf(): Record<string, unknown> | null {
  switch (props.action) {
    case 'name':
      return { name: name.value }
    case 'email':
      return { email: email.value }
    case 'password':
      if (password.value !== again.value) {
        problem.value = 'The two passwords are not the same.'
        return null
      }
      return { password: password.value }
    case 'allowance':
      return { allowance: allowance.value, startsNextYear: startsNextYear.value }
  }
}

const successes: Record<AccountAction, () => string> = {
  name: () => `The name is changed to ${name.value.trim()}.`,
  email: () => `${props.person.name}'s email is changed; the account now signs in with it.`,
  password: () => `The new password for ${props.person.name} is set; they will choose their own at their next sign-in.`,
  allowance: () => `${props.person.name}'s allowance is saved${startsNextYear.value ? ', starting next year' : ''}.`,
}

async function save() {
  if (busy.value) return
  problem.value = ''
  const body = bodyOf()
  if (body === null) return
  busy.value = true
  try {
    // ROW-192: the account the row showed, by its id, whatever the list holds now.
    await $fetch(`/api/admin/accounts/${props.person.id}/${props.action}`, { method: 'POST', body })
    emit('done', successes[props.action]())
  } catch (e) {
    problem.value = refusalMessage(e, 'That did not work. Nothing was changed.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="backdrop" @keydown="onKey">
    <div role="dialog" aria-modal="true" :aria-labelledby="`${id}-title`" class="dialog">
      <h2 :id="`${id}-title`">{{ titles[props.action] }}: {{ props.person.name }}</h2>
      <form autocomplete="off" method="post" @submit.prevent="save">
        <p v-if="props.action === 'name'">
          <label :for="`${id}-name`">Name</label>
          <input :id="`${id}-name`" ref="first" v-model="name" type="text" autocomplete="off" maxlength="60" required>
        </p>
        <p v-if="props.action === 'email'">
          <label :for="`${id}-email`">Email</label>
          <input :id="`${id}-email`" ref="first" v-model="email" type="email" autocomplete="off" required>
        </p>
        <template v-if="props.action === 'password'">
          <p>
            <label :for="`${id}-account`">Account</label>
            <input :id="`${id}-account`" :value="props.person.email" type="email" name="username" autocomplete="username" readonly>
          </p>
          <p>
            <label :for="`${id}-password`">New password for {{ props.person.name }}</label>
            <input :id="`${id}-password`" ref="first" v-model="password" type="password" autocomplete="new-password" minlength="8" required>
          </p>
          <p>
            <label :for="`${id}-again`">New password again</label>
            <input :id="`${id}-again`" v-model="again" type="password" autocomplete="new-password" minlength="8" required>
          </p>
        </template>
        <template v-if="props.action === 'allowance'">
          <p>
            <label :for="`${id}-yearly-days`">Allowance (days a year)</label>
            <input :id="`${id}-yearly-days`" ref="first" v-model.number="allowance" type="number" min="0" max="260" step="1" required>
          </p>
          <p>
            <label class="inline"><input v-model="startsNextYear" type="checkbox"> Starts next year</label>
          </p>
        </template>
        <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
        <p class="actions">
          <button type="submit" :disabled="busy">Save</button>
          <button type="button" :disabled="busy" @click="emit('close')">Go back</button>
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: var(--shade);
}
.dialog {
  max-width: 32rem;
  width: 100%;
  padding: 1rem 1.25rem;
  background: var(--paper);
  border: 1px solid var(--line);
}
.dialog h2 { margin-top: 0; }
label { display: block; font-weight: 600; margin-bottom: 0.25rem; }
label.inline { display: inline; font-weight: normal; }
input:not([type='checkbox']) { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); }
.actions { display: flex; gap: 0.75rem; }
.problem { color: var(--danger); }
</style>
