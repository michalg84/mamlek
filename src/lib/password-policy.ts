/**
 * The password rule that the forms and the server share: at least 12 characters, no composition rules (NIST SP 800-63B-4,
 * OWASP ASVS 5.0 V6.2). This module holds only the numbers and the length counting, so it is safe in a React island; the
 * list of common passwords lives in `src/lib/services/password-check.ts`, which only the API routes import.
 */

/** Counted in code points, as Supabase counts it (Go `utf8.RuneCountInString`). */
export const MIN_PASSWORD_LENGTH = 12;

/** Counted in UTF-8 bytes: bcrypt, which Supabase uses, reads no more than 72 bytes. */
export const MAX_PASSWORD_BYTES = 72;

/**
 * A passphrase shown as a hint. People copy examples from the screen, so it is on the list of common passwords
 * (`scripts/build-password-blocklist.mjs`); a test keeps the two in step.
 */
export const EXAMPLE_PASSPHRASE = "zielony rower pod oknem";

export type PasswordLengthProblem = "password_too_short" | "password_too_long";

/** The length in code points; JS `.length` counts UTF-16 units, so an emoji would count as two. */
export function passwordLength(password: string): number {
  let count = 0;
  for (const _codePoint of password) {
    count++;
  }
  return count;
}

/** The length in UTF-8 bytes (a Polish letter with a diacritic takes two). */
export function passwordBytes(password: string): number {
  return new TextEncoder().encode(password).length;
}

/**
 * The length problem of a password, `null` when its length is fine. Spaces are characters of the password: nothing is
 * trimmed.
 */
export function passwordLengthProblem(password: string): PasswordLengthProblem | null {
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) {
    return "password_too_short";
  }
  if (passwordBytes(password) > MAX_PASSWORD_BYTES) {
    return "password_too_long";
  }
  return null;
}
