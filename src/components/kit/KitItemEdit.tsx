import { useId, useState, type ReactNode, type SubmitEvent } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useKitItemActions } from "@/components/hooks/useKitItemActions";
import { useVariantPackages } from "@/components/hooks/useVariantPackages";
import {
  ActionError,
  ExpirySelect,
  FIELD_LABEL_CLASS,
  InlineError,
  QuantityInput,
  WithdrawnPackMark,
} from "@/components/kit/kit-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { expiryInput, packLabel, packQuantity, parseExpiryInput, parseQuantityInput } from "@/lib/kit-format";
import { cn } from "@/lib/utils";
import type { KitItem, RegistryPackageUnit, RegistryVariantPackage, UpdateKitItemRequest } from "@/types";

interface KitItemEditProps {
  item: KitItem;
  /** Called with the item as stored once the server has saved the changes. */
  onSaved: (item: KitItem) => void;
  /** Closes the panel without saving. */
  onCancel: () => void;
}

interface PackOption {
  packageId: number;
  productId: number;
  units: RegistryPackageUnit[];
  holder: string | null;
  /** The pack is withdrawn from the registry. */
  withdrawn: boolean;
  /** The item's own pack when it is withdrawn: shown as "obecne" instead of "wycofane" (it is the pack in the kit). */
  current: boolean;
}

interface FieldErrors {
  quantity?: string | undefined;
  expiry?: string | undefined;
}

function quantityText(quantity: number | null): string {
  return quantity === null ? "" : String(quantity);
}

/**
 * The packs the item can move to, with the item's own pack always among them. `uniquePacks` may have hidden the item's
 * GTIN under an option of the same product with the same label: that option takes over the item's `packageId`, so
 * picking it means "no change" (one label, not two). A withdrawn pack is never merged that way: an active pack that
 * only looks the same is a real change.
 *
 * The registry lists the withdrawn packs of the variant too, so the item's own pack, withdrawn or not, normally comes
 * with the list: it appears once, marked "obecne" when it is withdrawn. The pinning below is the fallback for an own
 * pack that is not on the list at all (e.g. `uniquePacks` hid it behind another pack of the same label, or the
 * registry no longer returns it): it is pinned first as "obecne".
 */
function packOptions(item: KitItem, packages: RegistryVariantPackage[]): PackOption[] {
  const options: PackOption[] = packages.map((pack) => ({
    packageId: pack.packageId,
    productId: pack.productId,
    units: pack.units,
    holder: pack.holder,
    withdrawn: pack.withdrawn,
    current: pack.withdrawn && pack.packageId === item.packageId,
  }));
  if (options.some((option) => option.packageId === item.packageId)) {
    return options;
  }
  const label = packLabel(item.units);
  const twin = item.withdrawn
    ? -1
    : options.findIndex((option) => option.productId === item.productId && packLabel(option.units) === label);
  if (twin !== -1) {
    return options.map((option, index) => (index === twin ? { ...option, packageId: item.packageId } : option));
  }
  return [
    {
      packageId: item.packageId,
      productId: item.productId,
      units: item.units,
      holder: item.holder,
      withdrawn: item.withdrawn,
      current: true,
    },
    ...options,
  ];
}

/** Edit panel of one kit item: another pack of the same medicine, the quantity and the expiry, saved at once. */
export function KitItemEdit({ item, onSaved, onCancel }: KitItemEditProps) {
  const { status, packages, retry } = useVariantPackages(item.productId);
  const { save } = useKitItemActions();
  const stored = expiryInput(item.expiresOn);

  const [chosenId, setChosenId] = useState(item.packageId);
  const [quantity, setQuantity] = useState(() => quantityText(item.quantity));
  const [month, setMonth] = useState(stored.month);
  const [year, setYear] = useState(stored.year);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ text: string; signIn: boolean } | null>(null);
  // The browser reports text it cannot read as a number ("-", "1e") as an empty value with `badInput` set.
  const [quantityBadInput, setQuantityBadInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const packGroupId = useId();
  const quantityId = useId();
  const quantityErrorId = useId();

  // Until the packs are loaded (or when they cannot be), the item's own pack is the only choice.
  const options = status === "ready" ? packOptions(item, packages) : [];
  const selectedUnits = options.find((option) => option.packageId === chosenId)?.units ?? item.units;
  const { unit, max } = packQuantity(selectedUnits);
  const showHolder = new Set(options.map((option) => option.productId)).size > 1;

  const changed =
    chosenId !== item.packageId ||
    quantity.trim() !== quantityText(item.quantity) ||
    month !== stored.month ||
    year !== stored.year;

  /** The changed fields only (an absent key stays as stored); null when a field is invalid. */
  function changes(): UpdateKitItemRequest | null {
    const errors: FieldErrors = {};
    const request: UpdateKitItemRequest = {};

    if (chosenId !== item.packageId) {
      request.packageId = chosenId;
    }

    const quantityResult = parseQuantityInput(quantity, max, quantityBadInput);
    if ("error" in quantityResult) {
      errors.quantity = quantityResult.error;
    } else if (quantityResult.value !== item.quantity) {
      request.quantity = quantityResult.value;
    }

    const expiryResult = parseExpiryInput(month, year);
    if ("error" in expiryResult) {
      errors.expiry = expiryResult.error;
    } else if (month !== stored.month || year !== stored.year) {
      // An unchanged month and year are not sent, so a date stored with day precision keeps it.
      request.expiry = expiryResult.value;
    }

    setFieldErrors(errors);
    return errors.quantity || errors.expiry ? null : request;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || saving) {
      return;
    }
    const request = changes();
    if (!request) {
      return;
    }
    if (Object.keys(request).length === 0) {
      // Only the spelling changed (e.g. "07" for 7): nothing to store.
      onCancel();
      return;
    }

    setSaving(true);
    setFormError(null);
    const result = await save(item.id, request);
    setSaving(false);
    if ("error" in result) {
      setFormError({ text: result.error, signIn: result.kind === "session" });
      return;
    }
    onSaved(result.item);
  }

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
          <span className="min-w-0">Nie udało się wczytać opakowań tego leku. Opakowanie zostaje bez zmiany.</span>
        </p>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  } else {
    packStep = (
      <div className="min-w-0">
        <p id={packGroupId} className={FIELD_LABEL_CLASS}>
          Opakowanie
        </p>
        <RadioGroup
          aria-labelledby={packGroupId}
          value={String(chosenId)}
          onValueChange={(value) => {
            setChosenId(Number(value));
            // The typed quantity stays; it is checked against the new pack size on save.
            setFieldErrors((errors) => ({ ...errors, quantity: undefined }));
          }}
          className="gap-2"
        >
          {options.map((option) => {
            const optionId = `${packGroupId}-${option.packageId}`;
            return (
              <div
                key={option.packageId}
                className={cn(
                  "flex min-h-11 min-w-0 items-start gap-3 rounded-md border px-3 py-2.5",
                  chosenId === option.packageId && "border-ring bg-accent text-accent-foreground",
                )}
              >
                <RadioGroupItem id={optionId} value={String(option.packageId)} className="mt-0.5" />
                <Label htmlFor={optionId} className="block min-w-0 flex-1 cursor-pointer leading-snug break-words">
                  {packLabel(option.units)}
                  {option.current ? (
                    <span className="text-muted-foreground font-normal"> · obecne</span>
                  ) : (
                    option.withdrawn && <WithdrawnPackMark />
                  )}
                  {showHolder && option.holder && (
                    <span className="text-muted-foreground block font-normal">{option.holder}</span>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-label={`Edycja: ${item.name}`}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="bg-card mt-2 min-w-0 space-y-4 rounded-md border px-3 py-3"
    >
      {packStep}

      <div className="min-w-0">
        <Label htmlFor={quantityId} className={FIELD_LABEL_CLASS}>
          Ilość w opakowaniu (opcjonalnie)
        </Label>
        <QuantityInput
          id={quantityId}
          max={max}
          unit={unit}
          value={quantity}
          placeholder="nieznane"
          onChange={(event) => {
            setQuantity(event.target.value);
            setQuantityBadInput(event.target.validity.badInput);
            setFieldErrors((errors) => ({ ...errors, quantity: undefined }));
          }}
          aria-invalid={fieldErrors.quantity ? true : undefined}
          aria-describedby={fieldErrors.quantity ? quantityErrorId : undefined}
        />
        {fieldErrors.quantity && <InlineError id={quantityErrorId}>{fieldErrors.quantity}</InlineError>}
      </div>

      <div className="min-w-0 space-y-2">
        <ExpirySelect
          label="Ważny do (opcjonalnie)"
          month={month}
          year={year}
          storedYear={stored.year}
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={month === "" && year === ""}
          onClick={() => {
            setMonth("");
            setYear("");
            setFieldErrors((errors) => ({ ...errors, expiry: undefined }));
          }}
        >
          Wyczyść
        </Button>
      </div>

      {formError && <ActionError message={formError.text} signIn={formError.signIn} />}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Not disabled while saving: a disabled button would drop the focus; a second click is ignored instead. */}
        <Button type="submit" size="sm" className="min-h-11" disabled={!changed} aria-busy={saving || undefined}>
          {saving && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
          Zapisz
        </Button>
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={saving} onClick={onCancel}>
          Anuluj
        </Button>
      </div>
    </form>
  );
}
