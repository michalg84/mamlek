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
  serverError?: string | null;
}

type Field = "current" | "password" | "confirm";

/**
 * Current password, new password, new password again. The new password gets the length rule of the sign-up form; the
 * list of common passwords and the e-mail check stay on the server (`/api/auth/password`), which is the last gate.
 */
export default function ChangePasswordForm({ serverError }: Props) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useSubmitting();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  function validate() {
    const next: typeof errors = {};

    if (!current) {
      next.current = "Podaj obecne hasło";
    }

    if (!password) {
      next.password = "Podaj nowe hasło";
    } else {
      const problem = passwordLengthProblem(password);
      if (problem) {
        next.password = authErrorMessage(problem) ?? undefined;
      } else if (current && password === current) {
        next.password = authErrorMessage("same_password") ?? undefined;
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
    <form method="POST" action="/api/auth/password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="current"
        label="Obecne hasło"
        type={showCurrent ? "text" : "password"}
        autoComplete="current-password"
        value={current}
        onChange={(v) => {
          setCurrent(v);
          clearError("current");
        }}
        error={errors.current}
        endContent={
          <PasswordToggle
            visible={showCurrent}
            onToggle={() => {
              setShowCurrent(!showCurrent);
            }}
          />
        }
      />

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

      <SubmitButton pending={submitting} pendingText="Zmienianie hasła…">
        <KeyRound />
        Zmień hasło
      </SubmitButton>
    </form>
  );
}
