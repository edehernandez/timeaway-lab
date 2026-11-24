// Purpose: the readiness route the harness healthcheck and the preview wait for (harness rule 2).
// It answers once the server and its database are up.
import { ready } from '~~/server/domain/accounts'

export default defineEventHandler(() => {
  ready()
  return { ok: true }
})
