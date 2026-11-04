import type { ComponentProps } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MAX_QUANTITY } from "@/lib/kit-format";
import { cn } from "@/lib/utils";

// Form pieces shared by the add form and the kit list, so both validate and look the same.

/** Same look as `Input`, for the native selects (a native select is the best control on a phone). */
export const SELECT_CLASS =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export const FIELD_LABEL_CLASS = "text-muted-foreground mb-1 block text-sm leading-normal";

interface InlineErrorProps {
  id?: string;
  /** Announces the message as it appears (for an answer of the server, not for a field hint). */
  alert?: boolean;
  children: string;
}

/** A message under a field or a row, with the error icon. */
export function InlineError({ id, alert = false, children }: InlineErrorProps) {
  return (
    <p
      id={id}
      role={alert ? "alert" : undefined}
      className="text-destructive mt-1 flex items-start gap-1.5 text-sm font-medium break-words"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

type QuantityInputProps = Omit<ComponentProps<"input">, "type" | "min" | "max"> & {
  /** Pack size (the upper bound), or null when the pack gives none. */
  max: number | null;
  /** Unit word of the pack size ("tabletki"), shown after it. */
  unit: string | null;
};

/** Number field for a quantity, with the pack size after it ("z 30 tabletki") when the pack has one. */
export function QuantityInput({ max, unit, className, ...props }: QuantityInputProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max ?? MAX_QUANTITY}
        className={cn("min-h-11 w-32 flex-none text-base md:text-base", className)}
        {...props}
      />
      {max !== null && (
        <span className="text-muted-foreground min-w-0 text-sm break-words">
          z {[max, unit].filter((part) => part !== null).join(" ")}
        </span>
      )}
    </div>
  );
}
