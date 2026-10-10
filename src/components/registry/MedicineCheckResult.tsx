import { useEffect, useId, type ReactNode } from "react";
import { CircleAlert, CircleCheck, CircleMinus, Info, LoaderCircle, type LucideIcon } from "lucide-react";
import { useMedicineCheck } from "@/components/hooks/useMedicineCheck";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatExpiry, formatQuantity, isExpired, packLabel, todayIso } from "@/lib/kit-format";
import type { MedicineCheckItem, MedicineCheckResponse } from "@/types";

interface MedicineCheckResultProps {
  productId: number;
  /** Called with the full data of the searched medicine once the check has answered. */
  onSearched?: (searched: MedicineCheckResponse["searched"]) => void;
}

const CAUTION = "Ten sam skład czynny nie oznacza, że leki można zamieniać. Zapytaj farmaceutę lub lekarza.";
const UNCOMPARABLE =
  "Rejestr nie podaje substancji czynnych tego leku, więc nie dało się sprawdzić leków z tą samą substancją.";

interface Verdict {
  icon: LucideIcon;
  title: string;
  detail: string | null;
  className: string;
}

/** "1 opakowanie", "2 opakowania", "5 opakowań", "22 opakowania", "12 opakowań". */
function packCount(count: number) {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (count === 1) {
    return "1 opakowanie";
  }
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} opakowania`;
  }
  return `${count} opakowań`;
}

function verdictOf(result: MedicineCheckResponse, variants: MedicineCheckItem[], same: MedicineCheckItem[]): Verdict {
  if (variants.length > 0) {
    return {
      icon: CircleCheck,
      title: `Masz ten lek · ${packCount(variants.length)}`,
      detail: null,
      className: "bg-success text-success-foreground",
    };
  }
  if (same.length > 0) {
    return {
      icon: Info,
      title: "Masz lek z tą samą substancją czynną",
      detail: [...new Set(same.map((item) => item.name))].join(", "),
      className: "bg-warning text-warning-foreground",
    };
  }
  return {
    icon: CircleMinus,
    title: "Nie masz tego leku",
    detail: result.comparable ? "Ani leku z tą samą substancją czynną" : null,
    className: "bg-muted text-foreground",
  };
}

function Note({ children }: { children: ReactNode }) {
  return <p className="bg-warning text-warning-foreground rounded-md px-3 py-2 text-sm break-words">{children}</p>;
}

function ItemList({ items, today }: { items: MedicineCheckItem[]; today: string }) {
  return (
    <ul className="divide-border min-w-0 divide-y rounded-lg border">
      {items.map((item) => {
        const details = [item.strength, item.form].filter(Boolean).join(" · ");
        const expired = isExpired(item.expiresOn, today);
        return (
          <li key={item.id} className="min-w-0 px-3 py-3">
            <p className="text-foreground font-bold break-words">{item.name}</p>
            {details && <p className="text-muted-foreground text-sm break-words">{details}</p>}
            {item.substances.length > 0 && (
              <p className="text-muted-foreground text-sm break-words">{item.substances.join(", ")}</p>
            )}
            <p className="text-foreground mt-1 text-sm break-words">{packLabel(item.units)}</p>
            <p className="text-foreground text-sm break-words">Ilość: {formatQuantity(item.quantity, item.units)}</p>
            <p className="text-foreground text-sm break-words">
              Ważny do: {formatExpiry(item.expiresOn, item.expiryPrecision)}
              {expired && <span className="text-destructive font-medium"> · przeterminowany</span>}
            </p>
            {item.withdrawn && <p className="text-muted-foreground text-sm">wycofany z rejestru</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** Result of checking the picked medicine against the kit: verdict, matching kit items, caution and notes. */
export function MedicineCheckResult({ productId, onSearched }: MedicineCheckResultProps) {
  const { status, result, retry } = useMedicineCheck(productId);
  const mainId = useId();
  const extraId = useId();

  useEffect(() => {
    if (result) {
      onSearched?.(result.searched);
    }
  }, [result, onSearched]);

  // Announced by the live region below, which stays mounted from the pick on, so the change is read.
  let announcement = "";
  let content: ReactNode;

  if (status === "loading") {
    content = (
      <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0">Sprawdzam apteczkę…</span>
      </p>
    );
  } else if (status === "unauthorized" || status === "error" || !result) {
    const unauthorized = status === "unauthorized";
    announcement = unauthorized ? "Sesja wygasła — zaloguj się ponownie" : "Nie udało się sprawdzić apteczki.";
    content = (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="text-destructive flex items-start gap-1.5 text-sm font-medium break-words">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{announcement}</span>
        </p>
        {unauthorized ? (
          <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
            Zaloguj się
          </a>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Spróbuj ponownie
          </Button>
        )}
      </div>
    );
  } else {
    // The RPC already orders the items (variant first, nearest expiry, unknown last, newest first): only split them.
    const variants = result.items.filter((item) => item.match === "variant");
    const same = result.items.filter((item) => item.match === "substance");
    const verdict = verdictOf(result, variants, same);
    const Icon = verdict.icon;
    const today = todayIso();
    const main = variants.length > 0 ? variants : same;
    // The notes carry the safety caveats, so they are announced together with the verdict.
    announcement = [verdict.title, verdict.detail, same.length > 0 && CAUTION, !result.comparable && UNCOMPARABLE]
      .filter(Boolean)
      .join(". ");

    content = (
      <div className="min-w-0 space-y-3">
        <div data-verdict className={cn("flex min-w-0 items-start gap-2 rounded-md px-3 py-2", verdict.className)}>
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold break-words">{verdict.title}</p>
            {verdict.detail && <p className="text-sm break-words">{verdict.detail}</p>}
          </div>
        </div>
        {variants.length === 0 && same.length > 0 && <Note>{CAUTION}</Note>}
        {!result.comparable && <Note>{UNCOMPARABLE}</Note>}
        {main.length > 0 && (
          <section className="min-w-0 space-y-2" aria-labelledby={mainId}>
            <h3 id={mainId} className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              W apteczce
            </h3>
            <ItemList items={main} today={today} />
          </section>
        )}
        {variants.length > 0 && same.length > 0 && (
          <section className="min-w-0 space-y-2" aria-labelledby={extraId}>
            <h3 id={extraId} className="text-foreground text-sm font-semibold">
              Także z tą samą substancją czynną
            </h3>
            <Note>{CAUTION}</Note>
            <ItemList items={same} today={today} />
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {content}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
