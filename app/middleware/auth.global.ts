// Purpose: the page-side sign-in guard (REQ-014, REQ-026): every page but /sign-in needs a live session; signed out,
// every address goes to the sign-in page (saying so when a session has just ended, ROW-217); with a password the
// admin set, every page but /password goes to /password; admin pages are not found for anyone but the admin. The
// server's routes refuse on their own — this guard only decides which page to show.
export default defineNuxtRouteMiddleware(async (to) => {
  const fetcher = useRequestFetch()
  const state = useMe()
  const { me, ended } = await loadMe(fetcher as <T>(url: string) => Promise<T>)
  state.value = me
  if (to.path === '/sign-in') {
    if (me) return navigateTo(me.mustChangePassword ? '/password' : '/', { replace: true })
    return
  }
  if (!me) return navigateTo(ended ? '/sign-in?ended=1' : '/sign-in', { replace: true })
  if (me.mustChangePassword && to.path !== '/password') return navigateTo('/password', { replace: true })
  if ((to.path === '/admin' || to.path.startsWith('/admin/')) && !me.isAdmin) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
  }
})
