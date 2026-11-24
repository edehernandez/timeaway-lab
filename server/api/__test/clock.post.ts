// Purpose: POST /api/__test/clock {now|null} (D-029, DIF-001) — the test control door sets the instant the team clock
// reports, or returns it to the real clock. Answers 404 outside the test profile.
import { setInjectedNow, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  const body = (await readBody(event).catch(() => ({}))) as { now?: unknown } | null
  const now = body?.now ?? null
  if (now !== null && (typeof now !== 'string' || Number.isNaN(Date.parse(now)))) {
    throw createError({ statusCode: 400, message: 'now must be an ISO 8601 instant or null.' })
  }
  setInjectedNow(now)
  return { ok: true }
})
