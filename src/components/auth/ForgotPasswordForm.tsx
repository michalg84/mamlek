import React, { useState } from "react";
import { Mail } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { useSubmitting } from "@/components/hooks/useSubmitting";

interface Props {
  serverError?: string | null;
}

/** The request for a password reset link: the e-mail address only, checked as in the sign-in form. */
export default function ForgotPasswordForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useSubmitting();
  const [error, setError] = useState<string | undefined>(undefined);

  function validate() {
    let next: string | undefined;
    if (!email.trim()) {
      next = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next = "Podaj poprawny adres e-mail";
    }
    setError(next);
    return next === undefined;
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/auth/forgot-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setError(undefined);
        }}
        placeholder="ty@przyklad.pl"
        error={error}
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText="Wysyłanie…">
        <Mail />
        Wyślij link
      </SubmitButton>
    </form>
  );
}
