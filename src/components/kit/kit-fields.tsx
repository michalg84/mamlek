import { useId, type ComponentProps } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_QUANTITY, overPackSize } from "@/lib/kit-format";
import { cn } from "@/lib/utils";

// Form pieces shared by the add form and the kit list, so both validate and look the same.

/** Same look as `Input`, for the native selects (a native select is the best control on a phone). */
export const SELECT_CLASS =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

export const FIELD_LABEL_CLASS = "text-muted-foreground mb-1 block text-sm leading-normal";

/** Marks a pack withdrawn from the registry, inside the pack's label (so it is part of the accessible name). */
export function WithdrawnPackMark() {
  return <span className="text-muted-foreground font-normal"> · wycofane</span>;
}

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

interface ActionErrorProps {
  id?: string;
  message: string;
  /** The session expired: the message comes with a link to sign in again. */
  signIn?: boolean;
}

/** The answer of the server to a save or a delete, announced as it appears; offers signing in when asked to. */
export function ActionError({ id, message, signIn = false }: ActionErrorProps) {
  if (!signIn) {
    return (
      <InlineError id={id} alert>
        {message}
      </InlineError>
    );
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
      <InlineError id={id} alert>
        {message}
      </InlineError>
      <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "mt-1 h-auto p-0")}>
        Zaloguj się
      </a>
    </div>
  );
}

type QuantityInputProps = Omit<ComponentProps<"input">, "type" | "min" | "max" | "value"> & {
  /** Pack size, or null when the pack gives none. A quantity above it is allowed, with a warning. */
  max: number | null;
  /** Unit word of the pack size ("tabl."), shown after it. */
  unit: string | null;
  /** The typed text (a controlled field). */
  value: string;
};

/** Warning under a quantity above the pack size (`size`: "12 tabl."). The quantity is still saved. */
export function OverPackWarning({ id, size }: { id: string; size: string }) {
  return (
    <p
      id={id}
      className="bg-warning text-warning-foreground mt-1 flex items-start gap-1.5 rounded-md px-2 py-1 text-sm break-words"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">Więcej niż w opakowaniu ({size})</span>
    </p>
  );
}

/**
 * Number field for a quantity, with the pack size after it ("z 30 tabl.") when the pack has one, and a warning under it
 * when the typed quantity is above the pack size. The warning is joined to the field by `aria-describedby`, after the
 * caller's own description (an error message).
 */
export function QuantityInput({
  max,
  unit,
  value,
  className,
  "aria-describedby": describedBy,
  ...props
}: QuantityInputProps) {
  const warningId = useId();
  const size = [max, unit].filter((part) => part !== null).join(" ");
  const over = overPackSize(value, max);
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          // The pack size is not the bound: a quantity above it is saved with a warning.
          max={MAX_QUANTITY}
          value={value}
          className={cn("min-h-11 w-32 flex-none text-base md:text-base", className)}
          aria-describedby={[describedBy, over ? warningId : undefined].filter(Boolean).join(" ") || undefined}
          {...props}
        />
        {max !== null && <span className="text-muted-foreground min-w-0 text-sm break-words">z {size}</span>}
      </div>
      {over && <OverPackWarning id={warningId} size={size} />}
    </div>
  );
}

/** Expiry years offered: from this many years back (expired boxes exist) to this many ahead. */
const YEARS_BACK = 5;
const YEARS_AHEAD = 10;

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** The years offered around this year, plus the given ones outside that range (a stored old date), in order. */
function expiryYears(extra: string[]): number[] {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, index) => thisYear - YEARS_BACK + index);
  for (const text of extra) {
    const value = Number(text);
    if (text !== "" && Number.isInteger(value) && !years.includes(value)) {
      years.push(value);
    }
  }
  return years.sort((a, b) => a - b);
}

interface ExpirySelectProps {
  /** Text of the group label ("Ważny do (opcjonalnie)"). */
  label: string;
  /** Picked month "1"-"12" and year as text; "" when not picked. */
  month: string;
  year: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  /** Year of the stored date: stays among the options even outside the range, also after another year is picked. */
  storedYear?: string;
  /** Field hint under the selects (e.g. only one of them picked). */
  error?: string | undefined;
}

/** Month and year of an expiry date: two native selects in one labelled group. */
export function ExpirySelect({
  label,
  month,
  year,
  onMonthChange,
  onYearChange,
  storedYear = "",
  error,
}: ExpirySelectProps) {
  const groupId = useId();
  const monthId = useId();
  const yearId = useId();
  const errorId = useId();
  const years = expiryYears([storedYear, year]);

  return (
    <div role="group" aria-labelledby={groupId} className="min-w-0">
      <p id={groupId} className={FIELD_LABEL_CLASS}>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Label htmlFor={monthId} className="sr-only">
            Miesiąc
          </Label>
          <select
            id={monthId}
            value={month}
            onChange={(event) => {
              onMonthChange(event.target.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={SELECT_CLASS}
          >
            <option value="">Miesiąc</option>
            {MONTHS.map((value) => (
              <option key={value} value={value}>
                {String(value).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <Label htmlFor={yearId} className="sr-only">
            Rok
          </Label>
          <select
            id={yearId}
            value={year}
            onChange={(event) => {
              onYearChange(event.target.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={SELECT_CLASS}
          >
            <option value="">Rok</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <InlineError id={errorId}>{error}</InlineError>}
    </div>
  );
}
