// Purpose: who is signed in, as GET /api/me answers it (D-029), shared by the header, the pages and the sign-in guard
// (REQ-014). The app reads it over HTTP only; on the server it forwards the visitor's own cookie.

export interface Me {
  id: number
  name: string
  isAdmin: boolean
  mustChangePassword: boolean
}

/** The signed-in person, or null (filled by the global sign-in guard on every navigation). */
export function useMe() {
  return useState<Me | null>('me', () => null)
}

type Fetcher = <T>(url: string) => Promise<T>

/** Asks GET /api/me: the person, or null with `ended` true when a session cookie came but its session has ended (ROW-217). */
export async function loadMe(fetcher: Fetcher): Promise<{ me: Me | null; ended: boolean }> {
  try {
    return { me: await fetcher<Me>('/api/me'), ended: false }
  } catch (e) {
    const data = (e as { data?: { data?: { ended?: unknown } } }).data
    return { me: null, ended: data?.data?.ended === true }
  }
}

/** The plain message a refused call carries (data.message), or `fallback`. */
export function refusalMessage(e: unknown, fallback: string): string {
  const data = (e as { data?: { message?: unknown; data?: { message?: unknown } } }).data
  const m = data?.data?.message ?? data?.message
  return typeof m === 'string' && m !== '' ? m : fallback
}
