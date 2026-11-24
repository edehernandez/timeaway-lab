// Purpose: POST /api/auth/sign-out (D-029) — ends the caller's session at once (REQ-014 arm 5). The header's own form
// post (before its scripts load) is answered with the sign-in page.
import { isFormPost, signOut } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  signOut(event)
  if (isFormPost(event)) return sendRedirect(event, '/sign-in', 303)
  return { ok: true }
})
