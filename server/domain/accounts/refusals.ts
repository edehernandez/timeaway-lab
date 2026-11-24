// Purpose: the accounts module's refusals — an HTTP error carrying a plain message, thrown by the module's operations
// and answered by the routes as they are (4xx: a rule's refusal; the message is the words a page shows).

/** Throws a refusal with `statusCode` and a plain `message` (also in data.message, where pages read it). */
export function refuse(statusCode: number, message: string): never {
  throw createError({ statusCode, message, data: { message } })
}

/** True when `e` is an SQLite constraint failure (the store refusing what a check above it let through). */
export function isConstraintError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' && (e as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
}
