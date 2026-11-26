import { isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";
import { EXAMPLE_PASSPHRASE, MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

/**
 * Error codes the auth routes may put in `?error=`. The page turns a code into a Polish message and never shows the
 * parameter itself, so a hand-written link cannot put its own text on the sign-in page. The Supabase codes are the
 * `AuthError.code` values of `@supabase/auth-js` that sign-in, sign-up and the password reset can return.
 */
const MESSAGES = {
  invalid_credentials: "Nieprawidłowy e-mail lub hasło.",
  email_not_confirmed: "Najpierw potwierdź adres e-mail linkiem z wiadomości, którą wysłaliśmy.",
  user_already_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  email_exists: "Konto z tym adresem e-mail już istnieje. Zaloguj się.",
  weak_password: `Hasło jest za słabe. Użyj co najmniej ${MIN_PASSWORD_LENGTH} znaków, najlepiej kilku słów.`,
  password_too_short: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków. Może to być kilka słów ze spacjami.`,
  password_too_long: `Hasło jest za długie (limit ${MAX_PASSWORD_BYTES} bajtów; polskie litery zajmują po 2). Skróć je.`,
  password_common: `To hasło jest zbyt popularne albo przypomina Twój adres e-mail. Spróbuj kilku własnych słów, w stylu „${EXAMPLE_PASSPHRASE}” (ale nie tych samych).`,
  password_mismatch: "Hasła nie są takie same.",
  current_password_invalid: "Obecne hasło jest nieprawidłowe.",
  same_password: "Nowe hasło musi się różnić od obecnego.",
  password_check_failed: "Nie udało się sprawdzić hasła, zaloguj się ponownie.",
  session_expired: "Sesja wygasła, zaloguj się ponownie.",
  email_address_invalid: "Ten adres e-mail jest nieprawidłowy.",
  validation_failed: "Sprawdź adres e-mail i hasło.",
  signup_disabled: "Zakładanie kont jest teraz wyłączone.",
  over_request_rate_limit: "Za dużo prób. Spróbuj ponownie za kilka minut.",
  over_email_send_rate_limit: "Za dużo wysłanych wiadomości. Spróbuj ponownie za kilka minut.",
  not_configured: "Logowanie nie jest skonfigurowane na tym serwerze.",
  session_check_failed:
    "Nie udało się sprawdzić sesji — serwis jest chwilowo niedostępny. Zaloguj się ponownie za chwilę.",
  otp_expired: "Link do ustawienia hasła wygasł lub został już użyty. Poproś o nowy.",
  password_changed_signin_failed: "Hasło zostało zmienione, ale nie udało się zalogować. Zaloguj się nowym hasłem.",
  unknown: "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
} as const;

export type AuthErrorCode = keyof typeof MESSAGES;

function isKnownCode(code: string): code is AuthErrorCode {
  return Object.hasOwn(MESSAGES, code);
}

/** The code to put in `?error=` for a Supabase auth error: its own code when known, `unknown` otherwise. */
export function authErrorCode(error: { code?: string } | null | undefined): AuthErrorCode {
  const code = error?.code;
  return code && isKnownCode(code) ? code : "unknown";
}

/** The message for the `?error=` value: `null` without one, the generic message for anything that is not a known code. */
export function authErrorMessage(code: string | null): string | null {
  if (code === null) {
    return null;
  }
  return isKnownCode(code) ? MESSAGES[code] : MESSAGES.unknown;
}

/**
 * How the middleware reads the error of `getUser()`:
 * - `none`: no session (no cookie), the usual anonymous request;
 * - `outage`: the auth server could not be reached or failed (network error or 5xx), so the session is unknown;
 * - `rejected`: the server answered that the session is not valid (expired, signed out elsewhere, bad key).
 */
export function sessionCheckFailure(error: unknown): "none" | "outage" | "rejected" {
  if (error === null || error === undefined || isAuthSessionMissingError(error)) {
    return "none";
  }
  if (isAuthRetryableFetchError(error)) {
    return "outage";
  }
  const status = (error as { status?: number }).status;
  return status === undefined || status === 0 || status >= 500 ? "outage" : "rejected";
}
