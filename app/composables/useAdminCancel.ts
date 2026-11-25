// Purpose: the admin's cancel of an approved request's days from today on, in its two steps (REQ-010, REQ-025, D-029) —
// the one flow the person page (REQ-021) and the admin's own requests page (REQ-029, A-061) both open: read what the
// cancel would change, show it in the confirmation, and act only on Confirm with the token of what was shown.
import type { Ref } from 'vue'

export interface AdminCancelStep<R extends { id: number }> {
  request: R
  summary: string
  token: string | null
  problem: string
}

function statusOf(e: unknown): number | undefined {
  const x = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return x.statusCode ?? x.status ?? x.response?.status
}

async function cancelEffect(id: number): Promise<{ summary: string; token: string }> {
  return $fetch<{ summary: string; token: string }>(`/api/admin/requests/${id}/effect`, { query: { action: 'cancel' } })
}

/**
 * The two-step cancel. `problem` and `done` are the page's own messages; `doneMessage` is what a confirmed cancel says;
 * `refresh` re-reads what the page shows after a cancel or a refusal.
 */
export function useAdminCancel<R extends { id: number }>(opts: {
  problem: Ref<string>
  done: Ref<string>
  doneMessage: () => string
  refresh: () => Promise<unknown>
}) {
  const cancelling = ref<AdminCancelStep<R> | null>(null) as Ref<AdminCancelStep<R> | null>
  const cancelBusy = ref(false)

  // REQ-010, REQ-025: Cancel opens the confirmation naming the days cancelled and the days that stay; nothing changes yet.
  async function startCancel(r: R) {
    opts.problem.value = ''
    opts.done.value = ''
    try {
      const effect = await cancelEffect(r.id)
      cancelling.value = { request: r, summary: effect.summary, token: effect.token, problem: '' }
    } catch (e) {
      opts.problem.value = refusalMessage(e, 'This request cannot be cancelled now.')
      await opts.refresh()
    }
  }

  async function confirmCancel() {
    const c = cancelling.value
    if (!c || c.token === null || cancelBusy.value) return
    cancelBusy.value = true
    try {
      await $fetch(`/api/admin/requests/${c.request.id}/cancel`, { method: 'POST', body: { token: c.token } })
      opts.done.value = opts.doneMessage()
      cancelling.value = null
      await opts.refresh()
    } catch (e) {
      const message = refusalMessage(e, 'The request was not cancelled. Nothing was changed.')
      if (statusOf(e) === 409) {
        // REQ-025 arm 5: what was shown no longer holds; show the confirmation again as it now is.
        try {
          const effect = await cancelEffect(c.request.id)
          cancelling.value = { request: c.request, summary: effect.summary, token: effect.token, problem: message }
        } catch (again) {
          cancelling.value = null
          opts.problem.value = refusalMessage(again, message)
          await opts.refresh()
        }
      } else {
        c.problem = message
      }
    } finally {
      cancelBusy.value = false
    }
  }

  function closeCancel() {
    cancelling.value = null
  }

  return { cancelling, cancelBusy, startCancel, confirmCancel, closeCancel }
}
