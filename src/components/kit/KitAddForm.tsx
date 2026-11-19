import { useEffect, useId, useRef, useState, type SubmitEvent, type ReactNode } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useRegistryListWorker } from "@/components/hooks/useRegistryListWorker";
import { useVariantPackages } from "@/components/hooks/useVariantPackages";
import {
  ExpirySelect,
  FIELD_LABEL_CLASS,
  InlineError,
  QuantityInput,
  WithdrawnPackMark,
} from "@/components/kit/kit-fields";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import { WithdrawnVariantNote } from "@/components/registry/WithdrawnVariantNote";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { packLabel, packQuantity, parseExpiryInput, parseQuantityInput } from "@/lib/kit-format";
import { cn } from "@/lib/utils";
import type { AddKitItemRequest, AddKitItemResponse, RegistryVariant, RegistryVariantPackage } from "@/types";

interface KitAddFormProps {
  /** Version of the search list as rendered by the server; addresses the HTTP cache entry of the list. */
  version: number;
}

interface FieldErrors {
  quantity?: string | undefined;
  expiry?: string | undefined;
}

function PackForm({ variant }: { variant: RegistryVariant }) {
  const { status, packages, retry } = useVariantPackages(variant.id);

  const [chosenId, setChosenId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  // The browser reports text it cannot read as a number ("-", "1e") as an empty value with `validity.badInput` set. It
  // is read from the field when the value is used: typing "-" into an empty field changes no value, so React fires no
  // change event that could carry it.
  const quantityRef = useRef<HTMLInputElement>(null);
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

  // A single pack is chosen for the user. The list holds the withdrawn packs too, so "one pack" may be a withdrawn
  // one (it is chosen and marked); an active pack next to a withdrawn one is never chosen for the user.
  const selected: RegistryVariantPackage | null =
    packages.find((pack) => pack.packageId === chosenId) ?? (packages.length === 1 ? packages[0] : null);
  const showHolder = new Set(packages.map((pack) => pack.productId)).size > 1;
  const { unit, max } = selected ? packQuantity(selected.units) : { unit: null, max: null };

  function validate(): { quantity: number | null; expiry: AddKitItemRequest["expiry"] } | null {
    const errors: FieldErrors = {};

    let parsedQuantity: number | null = null;
    const quantityResult = parseQuantityInput(quantity, quantityRef.current?.validity.badInput, 1);
    if ("error" in quantityResult) {
      errors.quantity = quantityResult.error;
    } else {
      parsedQuantity = quantityResult.value;
    }

    let parsedExpiry: AddKitItemRequest["expiry"] = null;
    const expiryResult = parseExpiryInput(month, year);
    if ("error" in expiryResult) {
      errors.expiry = expiryResult.error;
    } else {
      parsedExpiry = expiryResult.value;
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
        // The server's error text is for the log, not for the user: the form shows a Polish message by status.
        const payload: unknown = await response.json().catch((cause: unknown) => {
          // eslint-disable-next-line no-console -- the cause of an unreadable error body; the form shows a generic message
          console.error(cause);
          return null;
        });
        // eslint-disable-next-line no-console -- the only trace of the failed add; the form shows a generic message
        console.error("Adding a kit item failed", response.status, payload);
        setFormError(
          response.status === 400
            ? "Nie udało się dodać leku — sprawdź dane albo wybierz lek ponownie"
            : "Nie udało się dodać leku do apteczki, spróbuj ponownie",
        );
      }
    } catch (cause) {
      // eslint-disable-next-line no-console -- network failure; the form shows a generic message
      console.error(cause);
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
    packStep = <p className="text-muted-foreground text-sm">Brak opakowań tego leku w rejestrze</p>;
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
                  {pack.withdrawn && <WithdrawnPackMark />}
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
        {variant.withdrawn && <WithdrawnVariantNote />}
      </p>

      {packStep}

      {selected && (
        <>
          <div className="min-w-0">
            <Label htmlFor={quantityId} className={FIELD_LABEL_CLASS}>
              Ilość w opakowaniu (opcjonalnie)
            </Label>
            <QuantityInput
              ref={quantityRef}
              id={quantityId}
              min={1}
              max={max}
              unit={unit}
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setFieldErrors((errors) => ({ ...errors, quantity: undefined }));
              }}
              aria-invalid={fieldErrors.quantity ? true : undefined}
              aria-describedby={fieldErrors.quantity ? quantityErrorId : undefined}
            />
            {fieldErrors.quantity && <InlineError id={quantityErrorId}>{fieldErrors.quantity}</InlineError>}
          </div>

          <ExpirySelect
            label="Ważny do (opcjonalnie)"
            month={month}
            year={year}
            onMonthChange={(value) => {
              setMonth(value);
              setFieldErrors((errors) => ({ ...errors, expiry: undefined }));
            }}
            onYearChange={(value) => {
              setYear(value);
              setFieldErrors((errors) => ({ ...errors, expiry: undefined }));
            }}
            error={fieldErrors.expiry}
          />
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
  const list = useRegistryListWorker(version);

  return (
    <div className="min-w-0 space-y-4">
      {/* Editing the text drops the pick: the name does not identify a variant, so the form must not outlive it. */}
      <MedicineSuggest
        list={list}
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
