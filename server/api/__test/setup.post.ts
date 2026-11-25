// Purpose: POST /api/__test/setup {args, database} (D-048, D-049, DIF-001) — the setup door: runs the one-time setup
// command with args against the product's database ("existing") or a new one ("fresh") and answers
// {exit, stdout, stderr}. Answers 404 outside the test profile.
import { setupDoor, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  return setupDoor(await readBody(event).catch(() => ({})))
})
