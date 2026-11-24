// Purpose: GET /api/me (D-029) — who is signed in: {id, name, isAdmin, mustChangePassword}. It answers in the forced
// password state too (REQ-026), so a page can send the person to /password; with no live session it answers 401.
import { requireSession } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  const me = requireSession(event, { allowForced: true })
  return { id: me.id, name: me.name, isAdmin: me.isAdmin, mustChangePassword: me.mustChangePassword }
})
