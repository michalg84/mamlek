import { useEffect, useId, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { useVariantPackages } from "@/components/hooks/useVariantPackages";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MAX_QUANTITY, packLabel } from "@/lib/kit-format";
import { parseQuantity, type ParsedExpiry, type ParsedQuantity } from "@/lib/kit-import-csv";
import type { ImportRow, RowIssue } from "@/lib/kit-import";
import { cn } from "@/lib/utils";
import type { RegistryVariant, RegistryVariantPackage } from "@/types";

/** Expiry years offered for a correction, like the manual add form. */
const YEARS_BACK = 5;
const YEARS_AHEAD = 10;
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

// Same look as `Input`, for the native selects (a native select is the best control on a phone), as in KitAddForm.
const SELECT_CLASS =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

const FIELD_LABEL_CLASS = "text-muted-foreground mb-1 block text-sm leading-normal";

/** What the user has to do about each blocking reason. */
const ISSUE_TEXT: Record<RowIssue, string> = {
  "no-variant": "wybierz lek",
  "no-package": "wybierz opakowanie",
  "invalid-expiry": "popraw datę ważności",
  "invalid-quantity": "popraw ilość",
  "quantity-over-pack": "ilość większa niż w opakowaniu",
  "already-have": "już masz ten lek",
  "repeated-in-import": "powtórzony w imporcie",
};

export interface KitImportRowProps {
  version: number;
  row: ImportRow;
  issues: RowIssue[];
  /** The chosen pack's quantity cap, when known. */
  packMax: number | null;
  /** This row has the medicine search open (only one row at a time). */
  editing: boolean;
  /** The server rejected this row in the last save of the page. */
  rejected: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onAssign: (variant: RegistryVariant) => void;
  onPickPack: (pack: RegistryVariantPackage) => void;
  onExpiry: (expiry: ParsedExpiry) => void;
  onQuantity: (quantity: ParsedQuantity) => void;
  onAddAnyway: () => void;
  onRemove: () => void;
  onRestore: () => void;
}

function InlineError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-destructive mt-1 flex items-start gap-1.5 text-sm font-medium break-words">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function variantDetails(variant: RegistryVariant): string {
  return [variant.strength, variant.form].filter(Boolean).join(" · ");
}

function ignoreEdit() {
  // The search field only reports a pick through onSelect; editing its text changes nothing in the row.
}

/** The pack of the row's variant: chosen for the user when there is just one, as in the manual add form. */
function RowPack({
  variant,
  packageId,
  onPick,
}: {
  variant: RegistryVariant;
  packageId: number | null;
  onPick: (pack: RegistryVariantPackage) => void;
}) {
  const { status, packages, retry } = useVariantPackages(variant.id);
  const groupId = useId();
  const single = status === "ready" && packages.length === 1 ? packages[0] : null;

  useEffect(() => {
    if (single && packageId === null) {
      onPick(single);
    }
  }, [single, packageId, onPick]);

  // A single pack is picked by the effect above; until the pick lands, the row still waits for it.
  if (status === "loading" || (single && packageId !== single.packageId)) {
    return (
      <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0">Wczytywanie opakowań…</span>
      </p>
    );
  }
  if (status === "unauthorized") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <InlineError>Sesja wygasła — zaloguj się ponownie</InlineError>
        <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
          Zaloguj się
        </a>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <InlineError>Nie udało się wczytać opakowań tego leku.</InlineError>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }
  if (packages.length === 0) {
    return (
      <p className="text-muted-foreground text-sm break-words">
        Brak aktywnych opakowań tego leku w rejestrze — wybierz inny lek albo usuń wiersz
      </p>
    );
  }
  if (single) {
    return <p className="text-foreground text-sm break-words">Opakowanie: {packLabel(single.units)}</p>;
  }

  const showHolder = new Set(packages.map((pack) => pack.productId)).size > 1;
  return (
    <div className="min-w-0">
      <p id={groupId} className={FIELD_LABEL_CLASS}>
        Opakowanie
      </p>
      <RadioGroup
        aria-labelledby={groupId}
        value={packageId === null ? "" : String(packageId)}
        onValueChange={(value) => {
          const pack = packages.find((candidate) => String(candidate.packageId) === value);
          if (pack) {
            onPick(pack);
          }
        }}
        className="gap-2"
      >
        {packages.map((pack) => {
          const itemId = `${groupId}-${pack.packageId}`;
          return (
            <div
              key={pack.packageId}
              className={cn(
                "flex min-h-11 min-w-0 items-start gap-3 rounded-md border px-3 py-2.5",
                packageId === pack.packageId && "border-ring bg-accent text-accent-foreground",
              )}
            >
              <RadioGroupItem id={itemId} value={String(pack.packageId)} className="mt-0.5" />
              <Label htmlFor={itemId} className="block min-w-0 flex-1 cursor-pointer leading-snug break-words">
                {packLabel(pack.units)}
                {showHolder && pack.holder && (
                  <span className="text-muted-foreground block font-normal">{pack.holder}</span>
                )}
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}

/** Expiry of the row: always month and year fields (prefilled from the CSV) and a clear button. */
function RowExpiry({ row, onChange }: { row: ImportRow; onChange: (expiry: ParsedExpiry) => void }) {
  const [month, setMonth] = useState(row.expiry.kind === "ok" ? String(row.expiry.month) : "");
  const [year, setYear] = useState(row.expiry.kind === "ok" ? String(row.expiry.year) : "");
  const monthId = useId();
  const yearId = useId();
  const groupId = useId();
  const errorId = useId();

  const original = row.parsed.expiry.kind === "invalid" ? row.parsed.expiry.text : null;
  const invalid = row.expiry.kind === "invalid";

  function change(nextMonth: string, nextYear: string) {
    setMonth(nextMonth);
    setYear(nextYear);
    onChange(
      nextMonth !== "" && nextYear !== ""
        ? { kind: "ok", month: Number(nextMonth), year: Number(nextYear) }
        : { kind: "invalid", text: original ?? "" },
    );
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, index) => thisYear - YEARS_BACK + index);
  // A year from the CSV can lie outside the usual range (2000–2100 is accepted): keep it selectable.
  if (year !== "" && !years.includes(Number(year))) {
    years.push(Number(year));
    years.sort((a, b) => a - b);
  }

  return (
    <div role="group" aria-labelledby={groupId} className="min-w-0">
      <p id={groupId} className={FIELD_LABEL_CLASS}>
        Ważny do
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
              change(event.target.value, year);
            }}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
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
              change(month, event.target.value);
            }}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
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
      {invalid && (
        <InlineError id={errorId}>
          {original !== null ? `Nie da się odczytać daty „${original}”. ` : ""}Wybierz miesiąc i rok albo wyczyść datę.
        </InlineError>
      )}
      {row.expiry.kind === "empty" && <p className="text-muted-foreground mt-1 text-sm">Data ważności: nieznana</p>}
      <Button
        type="button"
        variant="link"
        className="h-auto px-0 py-1"
        onClick={() => {
          setMonth("");
          setYear("");
          onChange({ kind: "empty" });
        }}
      >
        Wyczyść datę (nieznana)
      </Button>
    </div>
  );
}

/** Quantity of the row: always a field (prefilled from the CSV) and a clear button. */
function RowQuantity({
  row,
  packMax,
  overPack,
  onChange,
}: {
  row: ImportRow;
  packMax: number | null;
  overPack: boolean;
  onChange: (quantity: ParsedQuantity) => void;
}) {
  const parsed = row.parsed.quantity;
  const [text, setText] = useState(
    parsed.kind === "invalid" ? parsed.text : parsed.kind === "ok" ? String(parsed.value) : "",
  );
  const inputId = useId();
  const errorId = useId();

  function change(value: string) {
    setText(value);
    onChange(parseQuantity(value.trim()));
  }

  let error: string | null = null;
  if (row.quantity.kind === "invalid") {
    error = `Nie da się odczytać ilości „${row.quantity.text}”. Wpisz liczbę od 0 do ${MAX_QUANTITY} albo wyczyść pole.`;
  } else if (overPack && packMax !== null) {
    error = `Ilość większa niż w opakowaniu (najwyżej ${packMax}). Popraw ją albo wyczyść pole.`;
  }

  return (
    <div className="min-w-0">
      <Label htmlFor={inputId} className={FIELD_LABEL_CLASS}>
        Ilość
      </Label>
      <Input
        id={inputId}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(event) => {
          change(event.target.value);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="min-h-11 w-32 text-base md:text-base"
      />
      {error && <InlineError id={errorId}>{error}</InlineError>}
      {!error && packMax !== null && (
        <p className="text-muted-foreground mt-1 text-sm">Najwyżej {packMax} w opakowaniu</p>
      )}
      {row.quantity.kind === "empty" && <p className="text-muted-foreground mt-1 text-sm">Ilość: nieznana</p>}
      <Button
        type="button"
        variant="link"
        className="h-auto px-0 py-1"
        onClick={() => {
          change("");
        }}
      >
        Wyczyść ilość (nieznana)
      </Button>
    </div>
  );
}

/** Which medicine the row is: the assignment, the suggestions to pick from, or the search field. */
function RowVariant({
  version,
  row,
  editing,
  onStartEdit,
  onCancelEdit,
  onAssign,
}: Pick<KitImportRowProps, "version" | "row" | "editing" | "onStartEdit" | "onCancelEdit" | "onAssign">) {
  if (editing) {
    return (
      <div className="min-w-0 space-y-1">
        <MedicineSuggest version={version} onSelect={onAssign} onEdit={ignoreEdit} label="Szukaj leku w rejestrze" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
          Anuluj
        </Button>
      </div>
    );
  }

  const { variant, match, parsed } = row;
  if (variant) {
    const details = variantDetails(variant);
    const automatic = match.kind === "auto" && match.variant.id === variant.id;
    return (
      <div className="min-w-0">
        <p className="text-foreground min-w-0 text-sm break-words">
          Lek: <span className="font-bold">{variant.name}</span>
          {details && <span className="text-muted-foreground"> · {details}</span>}
        </p>
        {automatic && (
          <p className="text-muted-foreground text-sm">Przypisano automatycznie — jedyny pasujący lek w rejestrze</p>
        )}
        <Button type="button" variant="link" className="h-auto px-0 py-1" onClick={onStartEdit}>
          Zmień
        </Button>
      </div>
    );
  }

  let problem: string;
  if (parsed.malformed) {
    problem = "Wiersz ma inną liczbę pól niż nagłówek — wyszukaj lek albo usuń wiersz";
  } else if (parsed.name === "") {
    problem = "Wiersz nie ma nazwy leku — wyszukaj lek albo usuń wiersz";
  } else if (match.kind === "choices") {
    problem = "Wybierz lek z rejestru:";
  } else {
    problem = "Brak dopasowania w rejestrze — wyszukaj lek albo usuń wiersz";
  }

  return (
    <div className="min-w-0 space-y-2">
      <p className="text-foreground text-sm font-medium break-words">{problem}</p>
      {match.kind === "choices" && !parsed.malformed && (
        <>
          <ul className="min-w-0 space-y-2">
            {match.variants.map((choice) => {
              const details = variantDetails(choice);
              return (
                <li key={choice.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      onAssign(choice);
                    }}
                    className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/50 block min-h-11 w-full min-w-0 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-3"
                  >
                    <span className="block font-bold break-words">{choice.name}</span>
                    {details && <span className="text-muted-foreground block text-sm break-words">{details}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {match.total > match.variants.length && (
            <p className="text-muted-foreground text-sm">
              Pokazano {match.variants.length} z {match.total} — jeśli nie ma tu twojego leku, wyszukaj go
            </p>
          )}
        </>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
        Szukaj
      </Button>
    </div>
  );
}

/** One CSV row on the approval screen: the text from the file, its state and what can be done about it. */
export function KitImportRow(props: KitImportRowProps) {
  const { row, issues, packMax, editing, rejected } = props;
  const label = `Wiersz ${row.parsed.line}`;
  const alreadyHave = issues.includes("already-have");
  const repeated = issues.includes("repeated-in-import");

  return (
    <li
      aria-label={label}
      className={cn(
        "bg-card min-w-0 space-y-3 rounded-lg border border-l-4 px-3 py-3 shadow-sm",
        row.removed
          ? "border-l-border opacity-70"
          : issues.length === 0
            ? "border-l-success-foreground"
            : "border-l-warning-foreground",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">{label}</p>
          <p className="bg-muted text-muted-foreground mt-1 rounded-md px-2 py-1 font-mono text-xs break-all">
            {row.parsed.raw}
          </p>
        </div>
        {row.removed ? (
          <Button type="button" variant="outline" size="sm" onClick={props.onRestore}>
            Przywróć
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>
            Usuń z importu
          </Button>
        )}
      </div>

      {row.removed ? (
        <p className="text-muted-foreground text-sm">Usunięty z importu</p>
      ) : (
        <>
          {issues.length === 0 ? (
            <p className="bg-success text-success-foreground flex items-start gap-1.5 rounded-md px-2 py-1 text-sm">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">Gotowy do zapisu</span>
            </p>
          ) : (
            <p className="bg-warning text-warning-foreground rounded-md px-2 py-1 text-sm break-words">
              Wymaga decyzji: {issues.map((issue) => ISSUE_TEXT[issue]).join(", ")}
            </p>
          )}

          <RowVariant {...props} />
          {row.variant && !editing && (
            <RowPack key={row.variant.id} variant={row.variant} packageId={row.packageId} onPick={props.onPickPack} />
          )}
          <RowExpiry row={row} onChange={props.onExpiry} />
          <RowQuantity
            row={row}
            packMax={packMax}
            overPack={issues.includes("quantity-over-pack")}
            onChange={props.onQuantity}
          />

          {(alreadyHave || repeated) && (
            <div className="min-w-0 space-y-2">
              {alreadyHave && <p className="text-foreground text-sm font-medium">Już masz ten lek w apteczce</p>}
              {repeated && (
                <p className="text-foreground text-sm font-medium">
                  Powtórzony w imporcie — ten sam lek jest we wcześniejszym wierszu
                </p>
              )}
              <div className="flex min-w-0 flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={props.onAddAnyway}>
                  Dodaj jako osobne opakowanie
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={props.onRemove}>
                  Usuń z importu
                </Button>
              </div>
            </div>
          )}

          {rejected && (
            <InlineError>
              Serwer odrzucił ten wiersz: opakowanie zniknęło z rejestru albo ilość jest większa niż w opakowaniu. Zmień
              opakowanie, popraw ilość albo usuń wiersz.
            </InlineError>
          )}
        </>
      )}
    </li>
  );
}
