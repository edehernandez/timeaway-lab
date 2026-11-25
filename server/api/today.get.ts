// Purpose: GET /api/today (REQ-012, D-007) — the team zone's today as YYYY-MM-DD, so the calendar page opens on the
// team's current month and marks today from the server's clock, never the browser's. It carries no request data.
import { requireSession, todayInTeamZone } from '~~/server/domain/accounts'

export default defineEventHandler((event) => {
  requireSession(event)
  return { today: todayInTeamZone() }
})
