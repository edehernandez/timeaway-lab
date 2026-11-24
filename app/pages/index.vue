<!-- Purpose: the person's own page, / (D-029, REQ-006) — their own requests. Its lists and figures are
     built by the step that builds the requests module; until then the page holds the signed-in shell only. -->
<script setup lang="ts">
const me = useMe()
</script>

<template>
  <section>
    <h1>My requests</h1>
    <p>Welcome, {{ me?.name }}. Your requests will be listed here.</p>
  </section>
</template>
