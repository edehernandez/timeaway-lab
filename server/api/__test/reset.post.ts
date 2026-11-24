// Purpose: POST /api/__test/reset {timeZone, now, admin} (D-029, DIF-002) — the test control door: wipes every record,
// sets the team clock and creates the one admin as the setup does. Answers 404 outside the test profile.
import { resetForTest, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  await resetForTest(await readBody(event).catch(() => ({})))
  return { ok: true }
})
