import React, { useState } from "react";
import { KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { NewPasswordHint } from "@/components/auth/NewPasswordHint";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { authErrorMessage } from "@/lib/auth-errors";
import { MIN_PASSWORD_LENGTH, passwordLengthProblem } from "@/lib/password-policy";

interface Props {
  /** The token of the link, given only when it was in the URL; without it the recovery cookie holds the state. */
  tokenHash?: string;
  /** The account of the recovery session, shown so that it is clear whose password changes. */
  email?: string;
  serverError?: string | null;
}

type Field = "password" | "confirm";

/**
 * A forgotten password: the new one, twice. It gets the length rule of the sign-up form; the list of common passwords
 * and the e-mail check stay on the server (`/api/auth/reset-password`), which is the last gate.
 */
export default function ResetPasswordForm({ tokenHash, email, serverError }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useSubmitting();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function validate() {
    const next: typeof errors = {};

    if (!password) {
      next.password = "Podaj nowe hasło";
    } else {
      const problem = passwordLengthProblem(password);
      if (problem) {
        next.password = authErrorMessage(problem) ?? undefined;
      }
    }

    if (!confirm) {
      next.confirm = "Powtórz nowe hasło";
    } else if (password !== confirm) {
      next.confirm = authErrorMessage("password_mismatch") ?? undefined;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: Field) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/auth/reset-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {tokenHash && <input type="hidden" name="token_hash" value={tokenHash} />}

      {email && (
        <p className="text-muted-foreground text-sm break-words">
          Nowe hasło dla konta <span className="text-foreground font-medium">{email}</span>
        </p>
      )}

      <FormField
        id="password"
        label="Nowe hasło"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={`Co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
        error={errors.password}
        hint={<NewPasswordHint password={password} />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirm"
        label="Powtórz nowe hasło"
        type={showConfirm ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(v) => {
          setConfirm(v);
          clearError("confirm");
        }}
        placeholder="Wpisz nowe hasło jeszcze raz"
        error={errors.confirm}
        endContent={
          <PasswordToggle
            visible={showConfirm}
            onToggle={() => {
              setShowConfirm(!showConfirm);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Zapisywanie hasła…">
        <KeyRound />
        Zapisz hasło
      </SubmitButton>
    </form>
  );
}
