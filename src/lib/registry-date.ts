const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Pure string split on purpose: a Date object would shift the day with the runtime's timezone.
export function formatRegistryDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, year, month, day] = match;
  return `${Number(day)}.${month}.${year}`;
}

// The registry is expected to be refreshed daily; older than this many days means the daily import is not running.
export const REGISTRY_MAX_AGE_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(isoDate: string): number | null {
  const match = ISO_DATE.exec(isoDate);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

// Both dates are plain `YYYY-MM-DD` strings (calendar days), so the difference is exact and independent of the
// runtime's timezone. An unparsable or future snapshot date is not reported as stale.
export function isRegistryStale(snapshotDate: string, today: string, maxAgeDays = REGISTRY_MAX_AGE_DAYS): boolean {
  const snapshot = utcDay(snapshotDate);
  const now = utcDay(today);
  if (snapshot === null || now === null) {
    return false;
  }
  return Math.round((now - snapshot) / MS_PER_DAY) > maxAgeDays;
}
