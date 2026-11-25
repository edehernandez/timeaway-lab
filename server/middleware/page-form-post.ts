// Purpose: ROW-181, INV-002, REQ-015 (D-053) — a page's own form post (a press before the page's scripts have run) is
// answered 303 with the same page, its body never read, so a kind, a note, a password or anything typed never
// reaches a URL, a log line or a record. Every form in the product posts (method="post"), so no native submit is a GET.
export default defineEventHandler((event) => {
  if (event.method !== 'POST') return
  const path = getRequestURL(event).pathname
  // The data routes (and the sign-in and sign-out form posts they handle) and the built files answer for themselves.
  if (path.startsWith('/api/') || path.startsWith('/_nuxt/') || path.startsWith('/__nuxt')) return
  // Only a path of this site: never a protocol-relative address ("//other.site", "/\other.site") another site could ride.
  const own = /^\/(?![/\\])[^\\]*$/.test(path) ? path : '/'
  return sendRedirect(event, own, 303)
})
