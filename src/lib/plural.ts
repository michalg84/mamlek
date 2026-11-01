/**
 * Polish plural form of a count: `one` for 1, `few` for 2–4, 22–24, 32–34… (but not 12–14), `many` otherwise
 * (0, 5–21, 25–31…). Example: `plural(n, "lek", "leki", "leków")`.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) {
    return one;
  }
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return few;
  }
  return many;
}
