import { useEffect, useId, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { useKitItemActions } from "@/components/hooks/useKitItemActions";
import { InlineError, QuantityInput } from "@/components/kit/kit-fields";
import { KitItemDetails } from "@/components/kit/KitItemDetails";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { packLabel, packQuantity, parseQuantityInput, todayIso } from "@/lib/kit-format";
import { cn } from "@/lib/utils";
import type { KitItem } from "@/types";

interface KitListProps {
  items: KitItem[];
  /** Today in Poland as computed by the server; the island replaces it with the browser's date once mounted. */
  today: string;
}

// The date is read on demand; nothing pushes updates.
function subscribeNever() {
  return () => undefined;
}

// Rows and the empty-state message take focus from code only (after a delete), never from Tab.
const FOCUS_TARGET_CLASS = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function quantityText(quantity: number | null): string {
  return quantity === null ? "" : String(quantity);
}

interface QuantityFieldProps {
  item: KitItem;
  onSaved: (item: KitItem) => void;
}

/** The editable quantity of a row: "Zapisz" (or Enter) stores a changed value, the error stays under the field. */
function QuantityField({ item, onSaved }: QuantityFieldProps) {
  const { save } = useKitItemActions();
  const [draft, setDraft] = useState(() => quantityText(item.quantity));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const { unit, max } = packQuantity(item.units);
  const changed = draft.trim() !== quantityText(item.quantity);

  async function submit() {
    if (!changed || saving) {
      return;
    }
    const parsed = parseQuantityInput(draft, max);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await save(item.id, { quantity: parsed.value });
    setSaving(false);
    if ("error" in result) {
      // The typed value stays, so the user can try again.
      setError(result.error);
      return;
    }
    setDraft(quantityText(result.item.quantity));
    onSaved(result.item);
    // "Zapisz" disappears with the change, so the field takes the focus back.
    inputRef.current?.focus();
  }

  return (
    <div className="mt-1 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span aria-hidden="true" className="text-foreground text-sm">
          Ilość:
        </span>
        <QuantityInput
          ref={inputRef}
          max={max}
          unit={unit}
          value={draft}
          placeholder="nieznane"
          aria-label={`Ilość: ${item.name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // Read-only rather than disabled while saving: a disabled field would drop the focus of a user who pressed Enter.
          readOnly={saving}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {changed && (
          <Button
            type="button"
            size="sm"
            disabled={saving}
            className="min-h-11"
            onClick={() => {
              void submit();
            }}
          >
            {saving && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
            Zapisz
          </Button>
        )}
      </div>
      {error && (
        <InlineError id={errorId} alert>
          {error}
        </InlineError>
      )}
    </div>
  );
}

interface KitRowProps {
  item: KitItem;
  today: string;
  rowRef: (element: HTMLLIElement | null) => void;
  onSaved: (item: KitItem) => void;
  /** Called once the server has deleted the item; the list drops the row and moves the focus. */
  onRemoved: (id: number) => void;
}

/** One pack of the kit: its details, the quantity field and the delete action with its confirmation. */
function KitRow({ item, today, rowRef, onSaved, onRemoved }: KitRowProps) {
  const { remove } = useKitItemActions();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // Set once the delete succeeded: the dialog must not hand the focus back to a button that is gone (the list has
  // already moved it to a neighbour).
  const removedRef = useRef(false);

  const description = [item.name, item.strength].filter(Boolean).join(" ");

  function openConfirm() {
    setRemoveError(null);
    setConfirmOpen(true);
  }

  async function confirmRemove(event: MouseEvent<HTMLButtonElement>) {
    // The dialog stays open (and busy) until the server answers.
    event.preventDefault();
    if (removing) {
      return;
    }
    setRemoving(true);
    const result = await remove(item.id);
    if ("error" in result) {
      setRemoving(false);
      setRemoveError(result.error);
      setConfirmOpen(false);
      return;
    }
    removedRef.current = true;
    onRemoved(item.id);
  }

  return (
    <li ref={rowRef} tabIndex={-1} className={cn("min-w-0 px-3 py-3", FOCUS_TARGET_CLASS)}>
      <KitItemDetails item={item} today={today} quantitySlot={<QuantityField item={item} onSaved={onSaved} />} />

      {item.quantity === 0 && (
        <div className="bg-muted mt-2 flex min-w-0 flex-wrap items-center gap-2 rounded-md px-3 py-2">
          <p className="text-foreground min-w-0 flex-1 text-sm font-medium break-words">Opakowanie puste</p>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={openConfirm}>
            Usuń
          </Button>
        </div>
      )}

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={openConfirm}>
          Usuń
        </Button>
      </div>
      {removeError && <InlineError alert>{removeError}</InlineError>}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!removing) {
            setConfirmOpen(open);
          }
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (removedRef.current) {
              event.preventDefault();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć z apteczki?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              <span className="text-foreground block font-medium">{description}</span>
              <span className="block">{packLabel(item.units)}</span>
              <span className="mt-2 block">Tej operacji nie można cofnąć.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing} className="min-h-11">
              Anuluj
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              className="min-h-11"
              onClick={(event) => {
                void confirmRemove(event);
              }}
            >
              {removing && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

type FocusTarget = { id: number } | "empty";

/** The kit list, rendered on the server and hydrated as an island. */
export default function KitList({ items: initialItems, today: serverToday }: KitListProps) {
  const [items, setItems] = useState(initialItems);
  // Hydration renders the server's `today`, so the markup matches the HTML; right after it (and on every later
  // render) the browser's own date takes over. `todayIso()` returns a string, so the snapshot is stable.
  const today = useSyncExternalStore(
    subscribeNever,
    () => todayIso(),
    () => serverToday,
  );

  const rowElements = useRef(new Map<number, HTMLLIElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  // Where the focus goes after the next render; set by a delete only, so the first render focuses nothing.
  const pendingFocus = useRef<FocusTarget | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) {
      return;
    }
    pendingFocus.current = null;
    if (target === "empty") {
      emptyRef.current?.focus();
    } else {
      rowElements.current.get(target.id)?.focus();
    }
  });

  function handleSaved(saved: KitItem) {
    setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
  }

  function handleRemoved(id: number) {
    // The deleted row's buttons are gone: the next row takes the focus, else the previous one, else the empty state.
    const index = items.findIndex((item) => item.id === id);
    const neighbour = items.at(index + 1) ?? (index > 0 ? items.at(index - 1) : undefined);
    pendingFocus.current = neighbour ? { id: neighbour.id } : "empty";
    setItems((current) => current.filter((item) => item.id !== id));
  }

  if (items.length === 0) {
    return (
      <p ref={emptyRef} tabIndex={-1} className={cn("text-muted-foreground text-sm", FOCUS_TARGET_CLASS)}>
        Apteczka jest pusta
      </p>
    );
  }

  return (
    <ul className="divide-border min-w-0 divide-y rounded-lg border">
      {items.map((item) => (
        <KitRow
          key={item.id}
          item={item}
          today={today}
          rowRef={(element) => {
            if (element) {
              rowElements.current.set(item.id, element);
            } else {
              rowElements.current.delete(item.id);
            }
          }}
          onSaved={handleSaved}
          onRemoved={handleRemoved}
        />
      ))}
    </ul>
  );
}
