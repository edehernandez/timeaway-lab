// Purpose: how the pages show a day and a count (D-007): a YYYY-MM-DD day as "Mon 8 March 2027", read from its text
// only and never turned into an instant, so every browser's zone shows the same day; a negative figure keeps its sign.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "Mon 8 March 2027" for 2027-03-08. */
export function shownDay(day: string): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  const d = Number(day.slice(8, 10))
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

/** "Mon 8 March 2027 to Fri 12 March 2027", or the one day. */
export function shownRange(first: string, last: string): string {
  return first === last ? shownDay(first) : `${shownDay(first)} to ${shownDay(last)}`
}

/** "1 day", "3 days". */
export function shownCount(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}

/** REQ-007 arm 5: a figure as shown, a negative one with its minus sign. */
export function shownFigure(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : String(n)
}

/** An instant as its day and time in the team's time zone (D-007), never the browser's. */
export function shownInstant(iso: string, timeZone: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** "Vacation", "Sick". */
export function shownWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
