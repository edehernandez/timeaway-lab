<!-- Purpose: the error page — an unknown address says it was not found, inside the signed-in header, with a link
     back to the person's own requests; it never draws a server error's details. -->
<script setup lang="ts">
const props = defineProps<{ error: { statusCode?: number } }>()
const me = useMe()
const notFound = computed(() => props.error?.statusCode === 404)
</script>

<template>
  <div>
    <AppHeader v-if="me" />
    <main>
      <h1>{{ notFound ? 'Page not found' : 'Something went wrong' }}</h1>
      <p v-if="notFound">There is no page at this address.</p>
      <p v-else>The page could not be shown. Try again in a moment.</p>
      <p><NuxtLink :to="me ? '/' : '/sign-in'">{{ me ? 'Back to my requests' : 'Go to the sign-in page' }}</NuxtLink></p>
    </main>
  </div>
</template>
