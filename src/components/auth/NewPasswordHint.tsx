import { EXAMPLE_PASSPHRASE, MIN_PASSWORD_LENGTH, effectivePasswordLength } from "@/lib/password-policy";

/** Polish noun form after a count: 1 znak, 2-4 znaki, 5 and more znaków. */
function charactersWord(count: number) {
  if (count === 1) return "znak";
  if (count >= 2 && count <= 4) return "znaki";
  return "znaków";
}

interface Props {
  password: string;
}

/**
 * The hint under a field for a new password: how many characters are still missing and an example phrase. The length
 * is the one the rule checks (code points, trimmed, as the server and Supabase count it); the example is a phrase to imitate, not to copy.
 */
export function NewPasswordHint({ password }: Props) {
  const remaining = MIN_PASSWORD_LENGTH - effectivePasswordLength(password);
  return (
    <>
      {password.length > 0 && remaining > 0 && (
        <p className="text-muted-foreground mt-1 text-sm">
          Jeszcze {remaining} {charactersWord(remaining)}
        </p>
      )}
      <p className="text-muted-foreground mt-1 text-sm">
        Najłatwiej zapamiętać kilka słów, np. „{EXAMPLE_PASSPHRASE}”. Wymyśl własne, nie to samo.
      </p>
    </>
  );
}
