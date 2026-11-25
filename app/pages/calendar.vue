<!-- Purpose: the team's month calendar, /calendar (D-029, REQ-012, INV-002): a Monday-first grid of one month, every
     day under its weekday heading, each Monday to Friday day listing by name who is away (approved days in effect
     only, as GET /api/calendar answers), today marked from the team zone's clock, and Previous / Next links between
     months. The address may name a month (?year=2027&month=3); one it cannot read shows this month and says so.
     Who is away is fetched by the browser after the page loads, so no name rides in the page's own payload, and an
     entry is the same markup whoever it is and whatever kind of absence it is (ROW-173): the name, nothing else. -->
<script setup lang="ts">
interface Entry {
  name: string
  accountId: number
}
interface CalendarAnswer {
  year: number
  month: number
  days: { date: string; people: Entry[] }[]
}
interface Cell {
  date: string
  day: number
  inMonth: boolean
  weekend: boolean
  today: boolean
  people: Entry[]
}
interface View {
  year: number
  month: number
  weeks: Cell[][]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const HEADINGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MIN_YEAR = 1000
const MAX_YEAR = 9999

const route = useRoute()

function one(v: unknown): string | null {
  if (Array.isArray(v)) return v.length === 1 && typeof v[0] === 'string' ? v[0] : null
  return typeof v === 'string' ? v : null
}

// ROW-213: the address is read strictly — four digits for the year, 1 to 12 for the month — and never echoed.
const asked = computed<{ year: number; month: number } | null>(() => {
  const y = one(route.query.year)
  const m = one(route.query.month)
  if (y === null || m === null || !/^[0-9]{4}$/.test(y) || !/^(0?[1-9]|1[0-2])$/.test(m)) return null
  const year = Number(y)
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  return { year, month: Number(m) }
})
const unreadable = computed(() => asked.value === null && (route.query.year !== undefined || route.query.month !== undefined))

function ymd(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}
function key(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}
function shift(year: number, month: number, by: number): { year: number; month: number } {
  const i = year * 12 + (month - 1) + by
  return { year: Math.floor(i / 12), month: (i % 12) + 1 }
}
function inRange(m: { year: number }): boolean {
  return m.year >= MIN_YEAR && m.year <= MAX_YEAR
}

/** The weeks of a month, Monday first: from the Monday on or before the 1st to the Sunday on or after the last day. */
function gridDates(year: number, month: number): string[][] {
  const first = Date.UTC(year, month - 1, 1)
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const weeks = Math.ceil((lead + days) / 7)
  const out: string[][] = []
  for (let w = 0; w < weeks; w++) {
    const row: string[] = []
    for (let d = 0; d < 7; d++) row.push(ymd(first + (w * 7 + d - lead) * 86_400_000))
    out.push(row)
  }
  return out
}

const today = ref<string | null>(null)
const view = ref<View | null>(null)
const problem = ref('')
let loads = 0

async function load() {
  const ticket = ++loads
  problem.value = ''
  try {
    if (today.value === null) today.value = (await $fetch<{ today: string }>('/api/today')).today
    const t = today.value
    const target = asked.value ?? { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) }
    const dates = gridDates(target.year, target.month)
    // REQ-012 / ROW-212: the days of the neighbouring months the grid shows list who is away too.
    const wanted = [shift(target.year, target.month, -1), target, shift(target.year, target.month, 1)].filter(inRange)
    const answers = await Promise.all(
      wanted.map((m) => $fetch<CalendarAnswer>('/api/calendar', { query: { year: String(m.year), month: String(m.month) } })),
    )
    if (ticket !== loads) return
    const away = new Map<string, Entry[]>()
    for (const a of answers) for (const d of a.days) away.set(d.date, d.people)
    const mm = key(target.year, target.month)
    view.value = {
      year: target.year,
      month: target.month,
      weeks: dates.map((row) =>
        row.map((date, i) => ({
          date,
          day: Number(date.slice(8, 10)),
          inMonth: date.startsWith(mm),
          weekend: i >= 5,
          today: date === t,
          // REQ-001 arm 2 / REQ-012 arm 4: nobody is shown away on a Saturday or Sunday.
          people: i >= 5 ? [] : (away.get(date) ?? []),
        })),
      ),
    }
  } catch {
    if (ticket === loads) problem.value = 'The calendar could not be loaded. Try again in a moment.'
  }
}

onMounted(load)
watch(() => [route.query.year, route.query.month], load)

const title = computed(() => (view.value ? `${MONTHS[view.value.month - 1]} ${view.value.year}` : ''))
const previous = computed(() => (view.value ? shift(view.value.year, view.value.month, -1) : null))
const next = computed(() => (view.value ? shift(view.value.year, view.value.month, 1) : null))
function linkTo(m: { year: number; month: number }) {
  return { path: '/calendar', query: { year: String(m.year), month: String(m.month) } }
}
// ROW-138: a day's label is drawn in the one date shape every page draws (app/utils/days.ts).
function dayLabel(c: Cell): string {
  return shownDay(c.date)
}
</script>

<template>
  <section class="calendar">
    <h1>Team calendar</h1>
    <p v-if="unreadable" class="notice" role="status">That address does not name a month the calendar can show, so this month is shown.</p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-if="!view && !problem" class="muted">Loading the calendar…</p>
    <template v-if="view">
      <nav class="months" aria-label="Months">
        <NuxtLink v-if="previous && inRange(previous)" :to="linkTo(previous)">‹ Previous month</NuxtLink>
        <h2>{{ title }}</h2>
        <NuxtLink v-if="next && inRange(next)" :to="linkTo(next)">Next month ›</NuxtLink>
      </nav>
      <p><NuxtLink to="/calendar">This month</NuxtLink></p>
      <table class="grid">
        <caption class="visually-hidden">Who is away in {{ title }}</caption>
        <thead>
          <tr>
            <th v-for="h in HEADINGS" :key="h" scope="col">{{ h }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, w) in view.weeks" :key="w">
            <td
              v-for="c in week"
              :key="c.date"
              :data-date="c.date"
              :aria-current="c.today ? 'date' : undefined"
              :class="{ other: !c.inMonth, weekend: c.weekend, today: c.today }"
            >
              <span class="day" :title="dayLabel(c)">{{ c.day }}</span>
              <span v-if="c.today" class="today-mark">Today</span>
              <ul v-if="c.people.length" class="away">
                <li v-for="p in c.people" :key="p.accountId">{{ p.name }}</li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>

<style scoped>
/* The month calendar (REQ-012): a plain table, names wrapping inside their day cell so none is hidden (ROW-122). */
.months {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
}
.months h2 { margin: 0; font-size: 1.25rem; }
.months a, .calendar p a { color: var(--accent); }
.grid {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-top: 0.75rem;
}
.grid th {
  padding: 0.25rem;
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid var(--line);
}
.grid td {
  vertical-align: top;
  padding: 0.25rem;
  border: 1px solid var(--line);
  min-height: 4rem;
  height: 4rem;
  overflow-wrap: anywhere;
  font-size: 0.875rem;
}
.grid td.other .day { color: var(--muted); }
.grid td.weekend { color: var(--muted); }
.grid td.today { outline: 2px solid var(--accent); outline-offset: -2px; }
.today-mark { margin-left: 0.25rem; font-size: 0.75rem; color: var(--accent); }
.away {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
}
.away li { margin: 0 0 0.125rem; }
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.muted { color: var(--muted); }
.notice { color: var(--muted); }
.problem { color: var(--danger); }
</style>
