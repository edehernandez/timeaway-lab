// Purpose: POST /api/auth/sign-in {email,password} (D-029) — signs a person in and sets the session cookie (REQ-014).
// Every refusal answers alike (ROW-235); a 15-minute wait follows 5 wrong attempts for one email (D-026). The sign-in
// page's own form post (before its scripts load) is answered with the next page of the product, never another site.
import { fromOwnOrigin, isFormPost, signIn } from '~~/server/domain/accounts'

export default defineEventHandler(async (event) => {
  const form = isFormPost(event)
  if (form && !fromOwnOrigin(event)) throw createError({ statusCode: 403, message: 'Sign in from the sign-in page.' })
  const body = await readBody(event).catch(() => ({}))
  const { status, answer } = await signIn(event, body)
  if (form) {
    const next = status === 200 ? (answer.mustChangePassword ? '/password' : '/') : status === 429 ? '/sign-in?wait=1' : '/sign-in?failed=1'
    return sendRedirect(event, next, 303)
  }
  setResponseStatus(event, status)
  return answer
})
