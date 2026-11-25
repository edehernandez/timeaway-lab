// Purpose: ROW-222, INV-003, REQ-014, A-057 (D-056) — the one guard every state-changing request passes before any
// route: a request whose Origin (or, without one, Referer) names a host other than the request's own Host is refused
// 403 and reaches no route, so no other site, no sibling host of the same site and no opaque ("null") origin changes
// anything with the signed-in person's cookie. The port is ignored: a page on another port of the same host is outside
// the row (A-057). A request carrying neither header (a client that is not a browser) is let through to the routes'
// own signed-in checks, unless the browser marks it cross-site.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** The lower-cased host name of an origin or an address (its port and path left out), or null when it has none. */
function hostNameOf(address: string): string | null {
  try {
    const name = new URL(address).hostname
    return name === '' ? null : name.toLowerCase()
  } catch {
    return null
  }
}

export default defineEventHandler((event) => {
  if (SAFE_METHODS.has(event.method)) return
  const origin = getRequestHeader(event, 'origin')
  const referer = getRequestHeader(event, 'referer')
  const from = origin !== undefined && origin !== '' ? origin : referer !== undefined && referer !== '' ? referer : undefined
  if (from === undefined) {
    if ((getRequestHeader(event, 'sec-fetch-site') ?? '').toLowerCase() === 'cross-site') {
      throw createError({ statusCode: 403, message: 'This change can only be made from TimeAway itself.' })
    }
    return
  }
  const host = getRequestHost(event, { xForwardedHost: false })
  const own = host ? hostNameOf(`http://${host}`) : null
  const theirs = hostNameOf(from)
  if (own === null || theirs === null || theirs !== own) {
    throw createError({ statusCode: 403, message: 'This change can only be made from TimeAway itself.' })
  }
})
