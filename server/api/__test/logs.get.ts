// Purpose: GET /api/__test/logs?since=<n> (D-048, D-049, DIF-001) — the log door: the server's own output lines
// captured since line n, across restarts, as {lines, next}. Answers 404 outside the test profile.
import { logsDoor, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  return logsDoor(getQuery(event).since)
})
