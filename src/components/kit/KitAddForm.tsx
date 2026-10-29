import { useEffect, useId, useState, type SubmitEvent, type ReactNode } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useVariantPackages } from "@/components/hooks/useVariantPackages";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MAX_QUANTITY, packLabel, packQuantity } from "@/lib/kit-format";
import { cn } from "@/lib/utils";
import type { AddKitItemRequest, AddKitItemResponse, RegistryVariant, RegistryVariantPackage } from "@/types";

interface KitAddFormProps {
  /** Version of the search list as rendered by the server; addresses the HTTP cache entry of the list. */
  version: number;
}

/** Expiry years offered: from this many years back (expired boxes exist) to this many ahead. */
const YEARS_BACK = 5;
const YEARS_AHEAD = 10;

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

// Same look as `Input`, for the native selects (a native select is the best control on a phone).
const SELECT_CLASS =
  "border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

const FIELD_LABEL_CLASS = "text-muted-foreground mb-1 block text-sm leading-normal";

interface FieldErrors {
  quantity?: string | undefined;
  expiry?: string | undefined;
}

function InlineError({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} className="text-destructive mt-1 flex items-start gap-1.5 text-sm font-medium break-words">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function PackForm({ variant }: { variant: RegistryVariant }) {
  const { status, packages, retry } = useVariantPackages(variant.id);

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Coming back with the Back button can restore this page from the bfcache with the button still disabled.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setSaving(false);
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const packGroupId = useId();
  const quantityId = useId();
  const quantityErrorId = useId();
  const monthId = useId();
  const yearId = useId();
  const expiryGroupId = useId();
  const expiryErrorId = useId();

  // A single pack is chosen for the user.
  const selected: RegistryVariantPackage | null =
    packages.find((pack) => pack.packageId === chosenId) ?? (packages.length === 1 ? packages[0] : null);
  const showHolder = new Set(packages.map((pack) => pack.productId)).size > 1;
  const { unit, max } = selected ? packQuantity(selected.units) : { unit: null, max: null };

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, index) => thisYear - YEARS_BACK + index);

  function validate(): { quantity: number | null; expiry: AddKitItemRequest["expiry"] } | null {
    const errors: FieldErrors = {};

    let parsedQuantity: number | null = null;
    const trimmed = quantity.trim();
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!Number.isInteger(value) || value < 0) {
        errors.quantity = "Podaj liczbę całkowitą, 0 lub większą";
      } else if (value > (max ?? MAX_QUANTITY)) {
        errors.quantity = `Ilość nie może być większa niż ${max ?? MAX_QUANTITY}`;
      } else {
        parsedQuantity = value;
      }
    }

    let parsedExpiry: AddKitItemRequest["expiry"] = null;
    if (month !== "" && year !== "") {
      parsedExpiry = { month: Number(month), year: Number(year) };
    } else if (month !== "" || year !== "") {
      errors.expiry = "Wybierz miesiąc i rok albo zostaw oba pola puste";
    }

    setFieldErrors(errors);
    return errors.quantity || errors.expiry ? null : { quantity: parsedQuantity, expiry: parsedExpiry };
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) {
      return;
    }
    const valid = validate();
    if (!valid) {
      return;
    }

    setSaving(true);
    setFormError(null);
    const body: AddKitItemRequest = { packageId: selected.packageId, quantity: valid.quantity, expiry: valid.expiry };
    try {
      const response = await fetch("/api/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        // The item exists now: always leave the form, even when the body is unreadable, so a retry cannot add it twice.
        const created = (await response.json().catch(() => null)) as AddKitItemResponse | null;
        // Stays in the saving state while the browser navigates, so the item cannot be added twice.
        window.location.assign(created ? `/apteczka?dodano=${created.id}` : "/apteczka");
        return;
      }
      if (response.status === 401) {
        setFormError("Sesja wygasła — zaloguj się ponownie");
      } else {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setFormError(payload?.error ?? "Nie udało się dodać leku do apteczki");
      }
    } catch {
      setFormError("Nie udało się połączyć z serwerem, spróbuj ponownie");
    }
    setSaving(false);
  }

  const details = [variant.strength, variant.form].filter(Boolean).join(" · ");

  let packStep: ReactNode;
  if (status === "loading") {
    packStep = (
      <p role="status" className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0">Wczytywanie opakowań…</span>
      </p>
    );
  } else if (status === "unauthorized") {
    packStep = (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm font-medium">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">Sesja wygasła — zaloguj się ponownie</span>
        </p>
        <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
          Zaloguj się
        </a>
      </div>
    );
  } else if (status === "error") {
    packStep = (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm font-medium">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">Nie udało się wczytać opakowań tego leku.</span>
        </p>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  } else if (packages.length === 0) {
    packStep = <p className="text-muted-foreground text-sm">Brak aktywnych opakowań tego leku w rejestrze</p>;
  } else {
    packStep = (
      <>
        <p id={packGroupId} className={FIELD_LABEL_CLASS}>
          Opakowanie
        </p>
        <RadioGroup
          aria-labelledby={packGroupId}
          value={selected ? String(selected.packageId) : ""}
          onValueChange={(value) => {
            setChosenId(Number(value));
            setQuantity("");
            setFieldErrors((errors) => ({ ...errors, quantity: undefined }));
          }}
          className="gap-2"
        >
          {packages.map((pack) => {
            const itemId = `${packGroupId}-${pack.packageId}`;
            return (
              <div
                key={pack.packageId}
                className={cn(
                  "flex min-h-11 min-w-0 items-start gap-3 rounded-md border px-3 py-2.5",
                  selected?.packageId === pack.packageId && "border-ring bg-accent text-accent-foreground",
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
      </>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="min-w-0 space-y-4"
    >
      <p className="text-foreground min-w-0 text-sm break-words">
        Wybrano: <span className="font-bold">{variant.name}</span>
        {details && <span className="text-muted-foreground"> · {details}</span>}
      </p>

      {packStep}

      {selected && (
        <>
          <div className="min-w-0">
            <Label htmlFor={quantityId} className={FIELD_LABEL_CLASS}>
              Ilość w opakowaniu (opcjonalnie)
            </Label>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                id={quantityId}
                type="number"
                inputMode="numeric"
                min={0}
                max={max ?? MAX_QUANTITY}
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setFieldErrors((errors) => ({ ...errors, quantity: undefined }));
                }}
                aria-invalid={fieldErrors.quantity ? true : undefined}
                aria-describedby={fieldErrors.quantity ? quantityErrorId : undefined}
                className="min-h-11 w-32 flex-none text-base md:text-base"
              />
              {max !== null && (
                <span className="text-muted-foreground min-w-0 text-sm break-words">
                  z {[max, unit].filter((part) => part !== null).join(" ")}
                </span>
              )}
            </div>
            {fieldErrors.quantity && <InlineError id={quantityErrorId}>{fieldErrors.quantity}</InlineError>}
          </div>

          <div role="group" aria-labelledby={expiryGroupId} className="min-w-0">
            <p id={expiryGroupId} className={FIELD_LABEL_CLASS}>
              Ważny do (opcjonalnie)
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
                    setMonth(event.target.value);
                    setFieldErrors((errors) => ({ ...errors, expiry: undefined }));
                  }}
                  aria-invalid={fieldErrors.expiry ? true : undefined}
                  aria-describedby={fieldErrors.expiry ? expiryErrorId : undefined}
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
                    setYear(event.target.value);
                    setFieldErrors((errors) => ({ ...errors, expiry: undefined }));
                  }}
                  aria-invalid={fieldErrors.expiry ? true : undefined}
                  aria-describedby={fieldErrors.expiry ? expiryErrorId : undefined}
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
            {fieldErrors.expiry && <InlineError id={expiryErrorId}>{fieldErrors.expiry}</InlineError>}
          </div>
        </>
      )}

      {formError && (
        <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm font-medium break-words">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{formError}</span>
        </p>
      )}

      <Button type="submit" disabled={!selected || saving} className="min-h-11 w-full">
        {saving && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
        Dodaj do apteczki
      </Button>
    </form>
  );
}

export default function KitAddForm({ version }: KitAddFormProps) {
  const [variant, setVariant] = useState<RegistryVariant | null>(null);

  return (
    <div className="min-w-0 space-y-4">
      {/* Editing the text drops the pick: the name does not identify a variant, so the form must not outlive it. */}
      <MedicineSuggest
        version={version}
        onSelect={setVariant}
        onEdit={() => {
          setVariant(null);
        }}
        label="Lek"
      />
      {/* A new medicine remounts the pack form, which resets pack, quantity and expiry. */}
      {variant && <PackForm key={variant.id} variant={variant} />}
    </div>
  );
}
