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
