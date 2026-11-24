// Purpose: shared fixture reads for request records — reads a person's requests through the product's public read routes (GET /api/requests, GET /api/admin/people/:id/requests) into one normalised shape, and compares recorded accounts, times and days; used by the ledger tests of the request-history, provenance, switch-off and record-rule rows.
// Provenance: hand-authored (test-author pass, slice 0, batch test-author-12), from DECISIONS.md D-029 (the read routes), REQ-017 (the fields a request holds), D-020 (a whole cancel records no cancel day) and D-007 (calendar dates YYYY-MM-DD in the team zone).
//
// D-029 names the read routes but not the shape of a request in their answers. This module reads REQ-017's fields
// under the names a builder is most likely to give them (listed at each reader) and throws a SetupError naming the
// route when an answer carries no list or a request carries no id or no state, so a shape mismatch reads as a
// contract question for D-029, never as a row failing. It goes through harness.ts only: HTTP at VID_PRODUCT_URL.
import type { APIResponse } from '@playwright/test';
import { SetupError, type AccountId, type Actor } from './harness';

/** A reference to an account as a record names it: its id, its display name, or both (either may be absent). */
export interface AccountRef {
  id?: string;
  name?: string;
}

/** A request as read back, REQ-017's fields normalised; `raw` is the object the product sent. Absent fields are null. */
export interface RequestRecord {
  id: string;
  kind: string | null;
  firstDay: string | null;
  lastDay: string | null;
  state: string;
  sentAt: string | null;
  personId: string | null;
  decidedBy: AccountRef | null;
  decidedAt: string | null;
  cancelledBy: AccountRef | null;
  cancelledAt: string | null;
  cancelDay: string | null;
  raw: Record<string, unknown>;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** True for a value that records nothing: undefined, null or an empty string. */
export function isAbsent(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function pick(o: unknown, keys: string[]): unknown {
  if (!isObj(o)) return undefined;
  for (const k of keys) if (!isAbsent(o[k])) return o[k];
  return undefined;
}

function str(v: unknown): string | null {
  if (isAbsent(v)) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return null;
}

function refFrom(v: unknown): AccountRef | null {
  if (isAbsent(v)) return null;
  if (typeof v === 'number') return { id: String(v) };
  if (typeof v === 'string') return { id: v, name: v };
  if (isObj(v)) {
    const id = str(pick(v, ['id', 'accountId', 'account_id']));
    const name = str(pick(v, ['name', 'displayName', 'display_name']));
    if (id === null && name === null) return null;
    return { ...(id !== null ? { id } : {}), ...(name !== null ? { name } : {}) };
  }
  return null;
}

function mergeRef(base: AccountRef | null, id: unknown, name: unknown): AccountRef | null {
  const sid = str(id);
  const sname = str(name);
  if (base === null && sid === null && sname === null) return null;
  const out: AccountRef = { ...(base ?? {}) };
  if (sid !== null) out.id = sid;
  if (sname !== null) out.name = sname;
  return out;
}

/**
 * Normalises one request object. Names read, first found wins:
 *   id; kind; firstDay|first_day; lastDay|last_day; state|status (lower-cased); sentAt|sent_at|createdAt|created_at;
 *   personId|accountId|person.id;
 *   decidedBy|decider|decision.by (an id, a name or {id,name}) with decidedById|deciderId and decidedByName|deciderName;
 *   decidedAt|decision.at;
 *   cancelledBy|canceledBy|canceller|cancel.by with cancelledById|cancelledByName; cancelledAt|canceledAt|cancel.at;
 *   cancelDay|cancelFrom|cancelledFrom|cancel.day|cancel.from.
 */
export function normaliseRequest(raw: unknown, where: string): RequestRecord {
  if (!isObj(raw)) throw new SetupError(`${where} carried a request that is not an object: ${JSON.stringify(raw)?.slice(0, 200)}`);
  const id = str(raw.id);
  const state = str(pick(raw, ['state', 'status']));
  if (id === null || state === null) {
    throw new SetupError(`${where} carried a request without an id or a state: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  const decision = pick(raw, ['decision']);
  const cancel = pick(raw, ['cancel', 'cancellation']);
  return {
    id,
    kind: str(pick(raw, ['kind', 'type'])),
    firstDay: str(pick(raw, ['firstDay', 'first_day'])),
    lastDay: str(pick(raw, ['lastDay', 'last_day'])),
    state: state.toLowerCase(),
    sentAt: str(pick(raw, ['sentAt', 'sent_at', 'createdAt', 'created_at'])),
    personId: str(pick(raw, ['personId', 'person_id', 'accountId', 'account_id'])) ?? str(pick(pick(raw, ['person']), ['id'])),
    decidedBy: mergeRef(
      refFrom(pick(raw, ['decidedBy', 'decided_by', 'decider']) ?? pick(decision, ['by', 'decidedBy'])),
      pick(raw, ['decidedById', 'deciderId', 'decided_by_id']),
      pick(raw, ['decidedByName', 'deciderName', 'decided_by_name']),
    ),
    decidedAt: str(pick(raw, ['decidedAt', 'decided_at']) ?? pick(decision, ['at', 'decidedAt'])),
    cancelledBy: mergeRef(
      refFrom(pick(raw, ['cancelledBy', 'canceledBy', 'cancelled_by', 'canceller']) ?? pick(cancel, ['by', 'cancelledBy'])),
      pick(raw, ['cancelledById', 'canceledById', 'cancelled_by_id']),
      pick(raw, ['cancelledByName', 'canceledByName', 'cancelled_by_name']),
    ),
    cancelledAt: str(pick(raw, ['cancelledAt', 'canceledAt', 'cancelled_at']) ?? pick(cancel, ['at', 'cancelledAt'])),
    cancelDay: str(pick(raw, ['cancelDay', 'cancel_day', 'cancelFrom', 'cancelledFrom', 'cancelFromDay']) ?? pick(cancel, ['day', 'from'])),
    raw,
  };
}

async function listFrom(res: APIResponse, what: string): Promise<unknown[]> {
  if (!res.ok()) throw new SetupError(`${what} answered ${res.status()}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new SetupError(`${what} answered without a JSON body`);
  }
  if (Array.isArray(body)) return body;
  const inner = pick(body, ['requests', 'items', 'data']);
  if (Array.isArray(inner)) return inner;
  throw new SetupError(`${what} answered without a list of requests: ${JSON.stringify(body).slice(0, 300)}`);
}

/** The actor's own requests: GET /api/requests → a list, or {requests:[…]}; normalised. */
export async function readOwnRequests(actor: Actor): Promise<RequestRecord[]> {
  const what = 'GET /api/requests';
  return (await listFrom(await actor.api.get('/api/requests'), what)).map((r) => normaliseRequest(r, what));
}

/** A person's requests as the admin reads them: GET /api/admin/people/:id/requests → a list, or {requests:[…]}; normalised. */
export async function readPersonRequests(admin: Actor, personId: AccountId): Promise<RequestRecord[]> {
  const what = `GET /api/admin/people/${personId}/requests`;
  return (await listFrom(await admin.api.get(`/api/admin/people/${encodeURIComponent(String(personId))}/requests`), what)).map(
    (r) => normaliseRequest(r, what),
  );
}

/** The record with this id in the list, or undefined. */
export function byId(list: RequestRecord[], id: AccountId): RequestRecord | undefined {
  return list.find((r) => r.id === String(id));
}

/** True when the reference names this account: by its id when the record carries one, else by its display name. */
export function refIs(ref: AccountRef | null, account: { id: AccountId; name: string }): boolean {
  if (ref === null) return false;
  if (ref.id !== undefined && ref.id === String(account.id)) return true;
  return ref.name !== undefined && ref.name === account.name;
}

/** The instant's local date and time in the zone, as "YYYY-MM-DDTHH:mm". */
export function teamLocal(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * True when a recorded time names the given instant to the minute: an ISO value with a zone (Z or an offset) or a
 * number of milliseconds is compared as an instant; a value without a zone is read as team-zone local time.
 */
export function sameInstant(recorded: string | null, iso: string, timeZone: string): boolean {
  if (recorded === null) return false;
  const expected = new Date(iso).getTime();
  if (/^\d{12,}$/.test(recorded)) return Math.abs(Number(recorded) - expected) < 60_000;
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(recorded)) {
    const t = Date.parse(recorded);
    return !Number.isNaN(t) && Math.abs(t - expected) < 60_000;
  }
  return recorded.replace(' ', 'T').slice(0, 16) === teamLocal(iso, timeZone);
}

/** True for a YYYY-MM-DD day that is Monday to Friday. */
export function isWeekday(day: string): boolean {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
}

/** The fields of a request that are written once and never again (REQ-017, ROW-194): kind, days as sent, sent time, person. */
export function writtenOnce(r: RequestRecord): Pick<RequestRecord, 'kind' | 'firstDay' | 'lastDay' | 'sentAt'> {
  return { kind: r.kind, firstDay: r.firstDay, lastDay: r.lastDay, sentAt: r.sentAt };
}
