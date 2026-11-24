// Purpose: POST /api/__test/reset {timeZone, now, admin} (D-029, DIF-002) — the test control door: wipes every record,
// sets the team clock and creates the one admin as the setup does. Answers 404 outside the test profile.
import { resetForTest, testControlEnabled } from '~~/server/domain/accounts'
import { clearRequestsForTest } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  const body = await readBody(event).catch(() => ({}))
  // The requests refer to the accounts (foreign keys are on), so they are wiped first.
  clearRequestsForTest()
  await resetForTest(body)
  return { ok: true }
})
