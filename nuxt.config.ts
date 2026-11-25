// Purpose: the Nuxt 4 configuration for TimeAway (D-001): Vue pages under app/, Nitro server routes under server/.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: true,
  css: ['~/assets/main.css'],
  typescript: { strict: true },
  routeRules: {
    // ROW-227 (REQ-014, INV-002), D-044: no page and no data answer is kept by the browser, so Back after signing
    // out on a shared computer shows nothing; ROW-228: no other site may frame a page.
    '/**': {
      headers: {
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy': "frame-ancestors 'none'",
      },
    },
    // The built scripts and styles carry no team data and are named by their content: they may be kept.
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
  },
})
