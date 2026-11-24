// Purpose: POST /api/me/password {current,next} (D-029) — a person changes their own password by giving the current
// one (REQ-015 arms 2, 3, 5; REQ-026: also the forced choice after an admin-set password).
import { changeOwnPassword, requireSession } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const me = requireSession(event, { allowForced: true })
  const body = await readBody(event).catch(() => ({}))
  await changeOwnPassword(me, body)
  return { ok: true }
})
