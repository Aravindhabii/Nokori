// All date logic runs in IST (Asia/Kolkata), independent of the container's TZ.
// occurred_at is stored as a plain 'YYYY-MM-DD' IST date string, so month/day
// grouping in SQL needs no timezone math and can never drift into the wrong bucket.

const IST = 'Asia/Kolkata';

/** Current date in IST as 'YYYY-MM-DD'. */
export function todayIST() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Current instant as an ISO-8601 timestamp (UTC) for created_at/last_used_at. */
export function nowISO() {
  return new Date().toISOString();
}

/** True if s is a valid 'YYYY-MM-DD' calendar date. */
export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
