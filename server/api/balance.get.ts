// Purpose: GET /api/balance (D-029, REQ-007 data) — the signed-in person's days left and pending vacation days for
// this year and next, each taken from the requests module's one balance function (RULE-001).
import { requireSession, teamYear } from '~~/server/domain/accounts'
import { balanceFor, balanceForViewer } from '~~/server/domain/requests'

export default defineEventHandler((event) => {
  const me = requireSession(event)
  const year = teamYear()
  return balanceForViewer(me, [balanceFor(me.id, year), balanceFor(me.id, year + 1)])
})
