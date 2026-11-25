<!-- Purpose: the signed-in header (the page's banner landmark, REQ-014, ROW-119, ROW-218): the signed-in person's
     display name, the pages they may open, and the Sign out control. While a password the admin set must be replaced
     (REQ-026) it shows only the name and Sign out. Sign out is a real form post, so it works before the page's
     scripts have loaded too. -->
<script setup lang="ts">
const me = useMe()

async function signOut() {
  try {
    await $fetch('/api/auth/sign-out', { method: 'POST' })
  } finally {
    me.value = null
    await navigateTo('/sign-in', { replace: true })
  }
}
</script>

<template>
  <header v-if="me" class="app-header">
    <span class="brand">TimeAway</span>
    <!-- D-046, ROW-117: plain links, so a page's address and its drawn content change together (a full load). -->
    <nav v-if="!me.mustChangePassword" aria-label="Pages">
      <a href="/">My requests</a>
      <a href="/requests/new">Send a request</a>
      <a href="/calendar">Calendar</a>
      <a href="/password">Password</a>
      <template v-if="me.isAdmin">
        <a href="/admin/pending">Pending requests</a>
        <a href="/admin/people">People</a>
      </template>
    </nav>
    <span class="who">Signed in as <strong>{{ me.name }}</strong></span>
    <form method="post" action="/api/auth/sign-out" @submit.prevent="signOut">
      <button type="submit">Sign out</button>
    </form>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}
.brand { font-weight: 600; }
nav { display: flex; flex-wrap: wrap; gap: 0.75rem; }
nav a { color: var(--accent); }
.who { margin-left: auto; color: var(--muted); }
form { margin: 0; }
</style>
