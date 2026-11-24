<!-- Purpose: the confirmation step of the admin's four acts (REQ-025, D-029): a dialog that says what will change —
     the person, the days, and which days are cancelled and which stay — and changes nothing until Confirm is pressed;
     Go back (or Escape) closes it with nothing changed. For a rejection it carries the optional note (REQ-008 arm 5). -->
<script setup lang="ts">
const props = defineProps<{
  title: string
  summary: string
  /** A refusal or a changed effect to show above the buttons. */
  problem?: string
  /** True while what would change is still being read: Confirm waits for it. */
  loading?: boolean
  /** True while the act is being sent: Confirm cannot be pressed twice (ROW-208). */
  busy?: boolean
  withNote?: boolean
}>()
const emit = defineEmits<{ confirm: [note: string]; close: [] }>()

const note = ref('')
const confirmButton = ref<HTMLButtonElement | null>(null)
const id = useId()

onMounted(() => confirmButton.value?.focus())

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div class="backdrop" @keydown="onKey">
    <div role="dialog" aria-modal="true" :aria-labelledby="`${id}-title`" :aria-describedby="`${id}-summary`" class="dialog">
      <h2 :id="`${id}-title`">{{ props.title }}</h2>
      <p :id="`${id}-summary`">{{ props.summary }}</p>
      <p v-if="props.loading" class="muted">Checking what would change…</p>
      <p v-if="props.problem" class="problem" role="alert">{{ props.problem }}</p>
      <p v-if="props.withNote">
        <label :for="`${id}-note`">Note to the person (optional, at most 200 characters)</label>
        <textarea :id="`${id}-note`" v-model="note" rows="3" />
      </p>
      <p class="actions">
        <button ref="confirmButton" type="button" :disabled="props.loading || props.busy" @click="emit('confirm', note)">Confirm</button>
        <button type="button" :disabled="props.busy" @click="emit('close')">Go back</button>
      </p>
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
textarea { width: 100%; box-sizing: border-box; padding: 0.4rem; border: 1px solid var(--line); font: inherit; }
.actions { display: flex; gap: 0.75rem; }
.problem { color: var(--danger); }
.muted { color: var(--muted); }
</style>
