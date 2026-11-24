// Purpose: POST /api/requests/:id/cancel (D-029, REQ-005) — the signed-in person cancels their own pending request
// that has no weekday before today; another person's request answers as one that does not exist (INV-003).
import { requireSession } from '~~/server/domain/accounts'
import { cancelOwnForViewer } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const me = requireSession(event)
  return cancelOwnForViewer(me, getRouterParam(event, 'id'))
})
