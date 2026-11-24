import blocklist from "./password-blocklist.json";
import { passwordLengthProblem, type PasswordLengthProblem } from "@/lib/password-policy";

/**
 * The full password rule, for the API routes only: the length (`src/lib/password-policy.ts`), the list of common
 * passwords and the e-mail address. This file pulls in the list (~200 kB), so a React island must never import it; the
 * forms check the length alone and the server is the last gate.
 */

export type PasswordProblem = PasswordLengthProblem | "password_common";

let commonPasswords: Set<string> | null = null;

// Built on the first call, once per isolate.
function isCommon(password: string): boolean {
  commonPasswords ??= new Set(blocklist.entries);
  return commonPasswords.has(password.toLowerCase());
}

/** True for the whole address or for the part before the "@", ignoring case. */
function isEmail(password: string, email: string): boolean {
  const lower = password.toLowerCase();
  const address = email.toLowerCase();
  const at = address.indexOf("@");
  return lower === address || (at > 0 && lower === address.slice(0, at));
}

/**
 * Why a password is not acceptable, or `null`. The order is length, then the list, then the e-mail, so the message names
 * the first thing the user has to fix.
 */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const lengthProblem = passwordLengthProblem(password);
  if (lengthProblem) {
    return lengthProblem;
  }
  if (isCommon(password) || isEmail(password, email)) {
    return "password_common";
  }
  return null;
}
