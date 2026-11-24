// Purpose: GET /api/requests (D-029, REQ-006 data) — the signed-in person's own requests, with their kinds (RULE-002:
// only the person's own).
import { requireSession } from '~~/server/domain/accounts'
import { ownRequestsForViewer } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const me = requireSession(event)
  return ownRequestsForViewer(me)
})
