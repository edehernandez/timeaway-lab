// Purpose: the Nuxt 4 configuration for TimeAway (D-001): Vue pages under app/, Nitro server routes under server/.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: true,
  css: ['~/assets/main.css'],
  typescript: { strict: true },
})
