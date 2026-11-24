// Purpose: sign-in, sessions and the guards every route runs (REQ-014, REQ-026, D-003, D-026, D-032): a session is a
// server-side row found by the SHA-256 of a random cookie identifier; sign-in answers alike for every refusal; the
// signed-in check, the forced-password hold and the admin check that routes call before any operation.
import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db, inWriteTransaction, schema } from '~~/server/db'
import { accountByEmail, fieldsOf, normaliseEmail, type Actor } from './accounts'
import { inWait, recordWrongAttempt } from './attempts'
import { nowIso } from './clock'
import { verifyPassword } from './passwords'
import { refuse } from './refusals'

const { accounts, sessions } = schema

/** The session cookie's name. Its value is 32 random bytes, base64url (43 characters). */
export const SESSION_COOKIE = 'timeaway_session'
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/
const THIRTY_DAYS_S = 30 * 24 * 60 * 60

/** The signed-in person a route acts for. */
export interface SessionUser extends Actor {
  id: number
  name: string
  email: string
  isAdmin: boolean
  mustChangePassword: boolean
  tokenHash: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function cookieOptions(event: H3Event) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: getRequestProtocol(event, { xForwardedProto: false }) === 'https',
    maxAge: THIRTY_DAYS_S,
  }
}

/** The session the request's cookie refers to (a live session of a switched-on account), and whether a cookie came at all. */
export function readSession(event: H3Event): { user: SessionUser | null; presented: boolean } {
  const cached = event.context.timeawaySession as { user: SessionUser | null; presented: boolean } | undefined
  if (cached) return cached
  const token = getCookie(event, SESSION_COOKIE)
  const presented = token !== undefined
  let user: SessionUser | null = null
  if (token !== undefined && TOKEN_SHAPE.test(token)) {
    const tokenHash = hashToken(token)
    const row = db()
      .select({ s: sessions, a: accounts })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.accountId, accounts.id))
      .where(and(eq(sessions.tokenHash, tokenHash), eq(accounts.switchedOn, 1)))
      .get()
    if (row) {
      user = {
        id: row.a.id,
        name: row.a.name,
        email: row.a.email,
        isAdmin: row.a.isAdmin === 1,
        mustChangePassword: row.a.mustChangePassword === 1,
        tokenHash: row.s.tokenHash,
      }
    }
  }
  const found = { user, presented }
  event.context.timeawaySession = found
  return found
}

/**
 * REQ-014: the signed-in check every route runs first. No live session: 401, saying whether a session cookie came
 * (it ended: ROW-217), and the stale cookie is cleared. REQ-026: while the password is one the admin set, only the
 * routes that pass `allowForced` (me, choosing a password, signing out) are open (ROW-260).
 */
export function requireSession(event: H3Event, opts: { allowForced?: boolean } = {}): SessionUser {
  const { user, presented } = readSession(event)
  if (!user) {
    if (presented) deleteCookie(event, SESSION_COOKIE, cookieOptions(event))
    throw createError({ statusCode: 401, message: 'Sign in first.', data: { message: 'Sign in first.', ended: presented } })
  }
  if (user.mustChangePassword && !opts.allowForced) {
    throw createError({
      statusCode: 403,
      message: 'Choose your own password first.',
      data: { message: 'Choose your own password first.', mustChangePassword: true },
    })
  }
  return user
}

/** RULE-003, INV-003, D-018: the admin check every admin route runs before any admin operation. */
export function requireAdmin(event: H3Event): SessionUser {
  const user = requireSession(event)
  if (!user.isAdmin) refuse(403, 'Only the admin can do this.')
  return user
}

const NO_SIGN_IN = 'Those details do not sign you in. If you have forgotten your password, ask the admin to set a new one.'
const WAIT = 'Too many wrong passwords for this email. Wait 15 minutes, then try again.'

/**
 * REQ-014 arms 2 and 3, ROW-235 to ROW-238, ROW-169, ROW-239: signs a person in with an email (trimmed, any letter
 * case) and the exact password. Every refusal answers alike — an unknown email, a wrong password, a switched-off
 * account — and counts toward the email's attempt bound (D-026). The session row is written only when the account is
 * still switched on with the password that was checked, so a sign-in in flight across a switch-off or a password set
 * opens nothing. A new identifier is issued every time; a session the cookie carried before is ended.
 */
export async function signIn(event: H3Event, body: unknown): Promise<{ status: number; answer: Record<string, unknown> }> {
  const f = fieldsOf(body)
  const email = typeof f.email === 'string' ? normaliseEmail(f.email) : ''
  const password = typeof f.password === 'string' ? f.password : ''
  if (inWait(email)) return { status: 429, answer: { message: WAIT } }
  const account = email === '' ? undefined : accountByEmail(email)
  const matches = await verifyPassword(password, account ? account.passwordHash : null)
  const refused = { status: 401, answer: { message: NO_SIGN_IN } }
  if (!account || account.switchedOn !== 1 || !matches || password.trim() === '') {
    recordWrongAttempt(email)
    return refused
  }
  const previous = readSession(event).user
  const token = randomBytes(32).toString('base64url')
  const opened = inWriteTransaction((tx) => {
    const now = tx.select().from(accounts).where(eq(accounts.id, account.id)).get()
    if (!now || now.switchedOn !== 1 || now.passwordVersion !== account.passwordVersion) return false
    if (previous) tx.delete(sessions).where(eq(sessions.tokenHash, previous.tokenHash)).run()
    tx.insert(sessions).values({ tokenHash: hashToken(token), accountId: account.id, createdAt: nowIso() }).run()
    return true
  })
  if (!opened) return refused
  event.context.timeawaySession = undefined
  setCookie(event, SESSION_COOKIE, token, cookieOptions(event))
  return { status: 200, answer: { ok: true, mustChangePassword: account.mustChangePassword === 1 } }
}

/** True when the request is a browser's own form post (the sign-in and sign-out forms before their scripts load). */
export function isFormPost(event: H3Event): boolean {
  return (getRequestHeader(event, 'content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')
}

/** True when the request carries no Origin, or the product's own (a form posted from another site is refused). */
export function fromOwnOrigin(event: H3Event): boolean {
  const origin = getRequestHeader(event, 'origin')
  if (origin === undefined || origin === '') return true
  try {
    return new URL(origin).host === getRequestHost(event, { xForwardedHost: false })
  } catch {
    return false
  }
}

/** REQ-014 arm 5: signing out ends the session at once (its row is deleted) and clears the cookie. */
export function signOut(event: H3Event): void {
  const { user, presented } = readSession(event)
  if (user) db().delete(sessions).where(eq(sessions.tokenHash, user.tokenHash)).run()
  if (presented) deleteCookie(event, SESSION_COOKIE, cookieOptions(event))
  event.context.timeawaySession = undefined
}
