// Purpose: POST /api/__test/fault {at} (D-048, D-049, DIF-001) — the fault door: the next multi-record action named
// by at ("<action>:after-first-write") fails inside its write transaction after its first write. Answers 404
// outside the test profile, 400 for a step it does not know.
import { armFault, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  const body = (await readBody(event).catch(() => ({}))) as { at?: unknown } | null
  if (!armFault(body?.at)) throw createError({ statusCode: 400, message: 'at must be "<action>:after-first-write" for a known action.' })
  return { ok: true, at: body?.at }
})
