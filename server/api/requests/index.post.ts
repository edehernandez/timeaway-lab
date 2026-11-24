// Purpose: POST /api/requests {kind, firstDay, lastDay} (D-029, REQ-001 to REQ-004) — the signed-in person sends a
// request for themselves; 201 {id}, or a refusal with a plain message naming the rule. The person is the session's.
import { requireSession } from '~~/server/domain/accounts'
import { sendForViewer } from '~~/server/domain/requests'

export default defineEventHandler(async (event) => {
  const me = requireSession(event)
  const body = await readBody(event).catch(() => ({}))
  const sent = sendForViewer(me, body)
  setResponseStatus(event, 201)
  return sent
})
