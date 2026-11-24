import type { ReactNode } from "react";
import { FieldError } from "@/components/auth/FieldError";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  /** The `autocomplete` token, so a password manager can tell the current password from a new one. */
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  /** Sits on the right edge of the input (the password toggle); the input leaves room for it. */
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  value,
  onChange,
  placeholder,
  error,
  hint,
  endContent,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const showHint = !error && Boolean(hint);

  return (
    <div>
      <Label htmlFor={id} className="text-muted-foreground mb-1 block text-sm leading-normal font-normal">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={name ?? id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : showHint ? hintId : undefined}
          className={cn("min-h-11 text-base md:text-base", endContent && "pr-10")}
        />
        {endContent}
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : showHint && <div id={hintId}>{hint}</div>}
    </div>
  );
}
