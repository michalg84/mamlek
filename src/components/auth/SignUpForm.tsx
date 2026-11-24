import React, { useState } from "react";
import { UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { ServerError } from "@/components/auth/ServerError";
import { authErrorMessage } from "@/lib/auth-errors";
import { EXAMPLE_PASSPHRASE, MIN_PASSWORD_LENGTH, passwordLength, passwordLengthProblem } from "@/lib/password-policy";

/** Polish noun form after a count: 1 znak, 2-4 znaki, 5 and more znaków. */
function charactersWord(count: number) {
  if (count === 1) return "znak";
  if (count >= 2 && count <= 4) return "znaki";
  return "znaków";
}

interface Props {
  serverError?: string | null;
}

export default function SignUpForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useSubmitting();
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail";
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else {
      const problem = passwordLengthProblem(password);
      if (problem) {
        next.password = authErrorMessage(problem) ?? undefined;
      }
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła się różnią";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  // The length counts code points, as the server and Supabase do; the example is a phrase to imitate, not to copy.
  const remaining = MIN_PASSWORD_LENGTH - passwordLength(password);
  const passwordHint = (
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

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="ty@przyklad.pl"
        error={errors.email}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={`Co najmniej ${MIN_PASSWORD_LENGTH} znaków`}
        error={errors.password}
        hint={passwordHint}
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
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło jeszcze raz"
        error={errors.confirmPassword}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Zakładanie konta…">
        <UserPlus />
        Załóż konto
      </SubmitButton>
    </form>
  );
}
