// Purpose: every /api address no route declares (REQ-014, ROW-221, ROW-067): refused to a caller who is not signed in
// (401, deny by default) and not found for one who is (404) — never handed on to the page renderer, so no sign-up,
// reset or other made-up address ever answers.
import { requireSession } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  requireSession(event, { allowForced: true })
  throw createError({ statusCode: 404, message: 'There is no such address.' })
})
