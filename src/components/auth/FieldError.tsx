import { CircleAlert } from "lucide-react";

interface FieldErrorProps {
  /** Id the field points at with `aria-describedby` (`${fieldId}-error`). */
  id: string;
  children: string;
}

/** A validation message under a field, with the error icon. */
export function FieldError({ id, children }: FieldErrorProps) {
  return (
    <p id={id} className="text-destructive mt-1 flex items-start gap-1.5 text-sm font-medium break-words">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
