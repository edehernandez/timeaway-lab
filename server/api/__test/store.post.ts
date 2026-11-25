// Purpose: POST /api/__test/store {sql, params} (D-048, D-049, DIF-001) — the store door: one statement run on the
// store past the product's routes, answered 200 {rows, changes, error} even when the store refuses it. Answers 404
// outside the test profile, before any signed-in check.
import { storeDoor, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  return storeDoor(await readBody(event).catch(() => ({})))
})
