import { useId } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { RegistryListStatus } from "@/components/hooks/useRegistryListWorker";
import { WithdrawnVariantNote } from "@/components/registry/WithdrawnVariantNote";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RegistryVariant } from "@/types";

interface SubstanceVariantsProps {
  substance: string;
  /** The variants shown so far, single-substance ones first (the worker's order). */
  results: RegistryVariant[];
  /** All variants with the substance. */
  total: number;
  /** The list status; "loading" also covers the wait for the first answer for this substance. */
  status: RegistryListStatus;
  onPick: (variant: RegistryVariant) => void;
  /** Shows the next page of variants. */
  onMore: () => void;
  onRetry: () => void;
}

/** The medicines of the registry that have one substance, as a list to pick from. */
export function SubstanceVariants({
  substance,
  results,
  total,
  status,
  onPick,
  onMore,
  onRetry,
}: SubstanceVariantsProps) {
  const headingId = useId();

  let body;
  if (status === "loading") {
    body = (
      <p className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0">Wczytywanie listy leków…</span>
      </p>
    );
  } else if (status === "unauthorized" || status === "error") {
    body = (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="text-destructive flex items-start gap-1.5 text-sm font-medium break-words">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            {status === "unauthorized" ? "Sesja wygasła — zaloguj się ponownie" : "Nie udało się wczytać listy leków."}
          </span>
        </p>
        {status === "unauthorized" ? (
          <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
            Zaloguj się
          </a>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Spróbuj ponownie
          </Button>
        )}
      </div>
    );
  } else if (total === 0) {
    body = (
      <p className="text-muted-foreground text-sm break-words">Brak leków z substancją „{substance}” w rejestrze</p>
    );
  } else {
    body = (
      <>
        <p className="text-muted-foreground text-sm">
          Pokazano {results.length} z {total}
        </p>
        <ul className="divide-border min-w-0 divide-y rounded-lg border">
          {results.map((variant) => (
            <li key={variant.id} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  onPick(variant);
                }}
                className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring min-h-11 w-full min-w-0 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
              >
                <span className="text-foreground block font-bold break-words">{variant.name}</span>
                {variant.strength && (
                  <span className="text-muted-foreground block text-sm break-words">{variant.strength}</span>
                )}
                {variant.form && (
                  <span className="text-muted-foreground block text-sm break-words">{variant.form}</span>
                )}
                {variant.withdrawn && <WithdrawnVariantNote className="text-xs" />}
              </button>
            </li>
          ))}
        </ul>
        {results.length < total && (
          <Button type="button" variant="outline" className="min-h-11" onClick={onMore}>
            Pokaż więcej
          </Button>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3">
      <h2
        id={headingId}
        tabIndex={-1}
        data-focus-target="substance-heading"
        className="text-foreground text-lg font-semibold break-words outline-none"
      >
        Leki z substancją: {substance}
      </h2>
      {body}
    </section>
  );
}
