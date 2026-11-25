// Purpose: POST /api/__test/production-start {env} (D-048, D-049, DIF-001) — the production-start door: starts the
// built server in its production profile with env and answers {exit, output}, exit null when it was still running
// at the door's bound. Answers 404 outside the test profile.
import { productionStartDoor, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  return productionStartDoor(await readBody(event).catch(() => ({})))
})
