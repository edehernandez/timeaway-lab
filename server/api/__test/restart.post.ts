// Purpose: POST /api/__test/restart {timeZone?, withoutTzData?} (D-048, D-049, DIF-001) — the restart door: answers,
// then ends this server, which the image's supervisor starts again on the same database (under timeZone, or once
// without time-zone data). Answers 404 outside the test profile.
import { restartDoor, testControlEnabled } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  if (!testControlEnabled()) throw createError({ statusCode: 404, message: 'Not found' })
  const endServer = restartDoor(await readBody(event).catch(() => ({})))
  event.node.res.once('finish', endServer)
  return { ok: true }
})
