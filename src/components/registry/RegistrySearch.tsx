import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useMatchLevel } from "@/components/hooks/useMatchLevel";
import { useRegistryListWorker } from "@/components/hooks/useRegistryListWorker";
import { useRegistryLookup } from "@/components/hooks/useRegistryLookup";
import { useSubstanceVariants } from "@/components/hooks/useSubstanceVariants";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MedicineCheckResult } from "@/components/registry/MedicineCheckResult";
import { MedicineSuggest } from "@/components/registry/MedicineSuggest";
import { SubstanceLink } from "@/components/registry/SubstanceLink";
import { SubstanceVariants } from "@/components/registry/SubstanceVariants";
import { WithdrawnVariantNote } from "@/components/registry/WithdrawnVariantNote";
import { isMatchLevel, MATCH_LEVEL_TEXTS, MATCH_LEVELS } from "@/lib/match-level";
import { addToKitHref, parseSearchState, substanceHref, variantHref } from "@/lib/search-url";
import { cn } from "@/lib/utils";
import type { MatchLevel, MedicineCheckResponse, RegistryVariant } from "@/types";

interface Props {
  version: number;
  /** The medicine of `?lek=` as read by the page (`parseSearchState`); shown once the list is loaded. */
  initialVariantId?: number | null;
  /** The substance of `?substancja=` as read by the page; ignored when `initialVariantId` is set. */
  initialSubstance?: string | null;
}

type SearchedMedicine = MedicineCheckResponse["searched"];

/** The substance list grows by this many variants per "Pokaż więcej". */
const PAGE_SIZE = 20;
/** Upper bound for a count read back from `history.state`. */
const MAX_SHOWN = 5000;

/** What the screen shows; mirrors the address (`?lek=` or `?substancja=`) and `history.state.shown`. */
interface Nav {
  variantId: number | null;
  substance: string | null;
  /** How many variants of the substance list are shown. */
  shown: number;
}

type FocusTarget = "substance-heading" | "variant-card";

/** The list size kept in a history entry; 20 when there is none or it is not a sane count. */
function shownOf(state: unknown): number {
  if (typeof state === "object" && state !== null && "shown" in state) {
    const { shown } = state;
    if (typeof shown === "number" && Number.isInteger(shown) && shown >= PAGE_SIZE && shown <= MAX_SHOWN) {
      return shown;
    }
  }
  return PAGE_SIZE;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function VariantCard({ variant, withdrawn }: { variant: SearchedMedicine; withdrawn: boolean }) {
  return (
    <Card
      role="region"
      aria-label="Wybrany lek"
      tabIndex={-1}
      data-focus-target="variant-card"
      className="min-w-0 gap-0 p-4 outline-none"
    >
      <h2 className="text-foreground text-lg font-semibold break-words">{variant.name}</h2>
      {withdrawn && <WithdrawnVariantNote as="p" />}
      <dl className="mt-3 space-y-3">
        {variant.strength && <Field label="Moc">{variant.strength}</Field>}
        {variant.form && <Field label="Postać">{variant.form}</Field>}
        {variant.commonName && <Field label="Nazwa powszechnie stosowana">{variant.commonName}</Field>}
        {variant.substances.length > 0 && (
          <Field label="Substancje czynne">
            <ul className="list-disc space-y-0.5 pl-5">
              {variant.substances.map((substance, position) => (
                <li key={`${position}-${substance}`}>
                  <SubstanceLink substance={substance} />
                </li>
              ))}
            </ul>
          </Field>
        )}
      </dl>
    </Card>
  );
}

/** The match level of the check: one group of three radios, stacked (the card is too narrow for a tidy row). */
function MatchLevelSwitch({ level, onChange }: { level: MatchLevel; onChange: (level: MatchLevel) => void }) {
  const legendId = useId();
  const idPrefix = useId();
  return (
    <div className="min-w-0 space-y-2">
      <p id={legendId} className="text-foreground text-sm font-medium">
        Dopasowanie składu
      </p>
      <RadioGroup
        aria-labelledby={legendId}
        value={level}
        onValueChange={(value) => {
          if (isMatchLevel(value)) {
            onChange(value);
          }
        }}
        className="gap-2"
      >
        {MATCH_LEVELS.map((value) => (
          <div key={value} className="flex min-w-0 items-center gap-2">
            <RadioGroupItem id={`${idPrefix}-${value}`} value={value} />
            <Label htmlFor={`${idPrefix}-${value}`} className="font-normal break-words">
              {MATCH_LEVEL_TEXTS[value].label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}

export default function RegistrySearch({ version, initialVariantId = null, initialSubstance = null }: Props) {
  const [nav, setNav] = useState<Nav>({
    variantId: initialVariantId,
    // The variant wins when the address has both (the page's parser already drops the substance then).
    substance: initialVariantId === null ? initialSubstance : null,
    shown: PAGE_SIZE,
  });
  // Variants known from a click (suggestion or substance list), so "back" shows the card without a lookup.
  const [known, setKnown] = useState<Record<number, RegistryVariant>>({});
  // Full data of the checked medicine (e.g. the full strength); until the check answers the card shows the suggestion.
  const [searched, setSearched] = useState<SearchedMedicine | null>(null);
  const [level, setLevel] = useMatchLevel();
  const list = useRegistryListWorker(version);
  const rootRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<FocusTarget | null>(null);

  const knownVariant = nav.variantId === null ? null : (known[nav.variantId] ?? null);
  // An id from the address (or "forward") is not in `known`: the worker finds it. `missing` leaves the plain search.
  const lookup = useRegistryLookup(list, nav.variantId !== null && knownVariant === null ? nav.variantId : null);
  // The picked variant; its `withdrawn` flag stays the card's source, because the check does not return it.
  const selected = knownVariant ?? lookup.variant;
  const shown = selected && searched?.id === selected.id ? searched : selected;
  const substanceMode = selected === null && nav.variantId === null && nav.substance !== null;
  const substanceList = useSubstanceVariants(list, substanceMode ? nav.substance : null, nav.shown);

  // After a reload `history.state` still holds the list size of the entry. Read here, not in the first render, so the
  // server and the client render the same markup.
  useEffect(() => {
    const restored = shownOf(window.history.state);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs with `history.state`, which only exists in the browser
    setNav((current) => (current.shown === restored ? current : { ...current, shown: restored }));
  }, []);

  useEffect(() => {
    function handlePopState() {
      const { variantId, substance } = parseSearchState(new URLSearchParams(window.location.search));
      setNav({ variantId, substance, shown: shownOf(window.history.state) });
    }
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Moves focus once the view it points at is on the screen (the heading of the list, the card of a picked medicine).
  useEffect(() => {
    const target = focusRef.current;
    if (!target) {
      return;
    }
    const element = rootRef.current?.querySelector<HTMLElement>(`[data-focus-target="${target}"]`);
    if (element) {
      focusRef.current = null;
      element.focus();
    }
  }, [nav, selected, substanceMode]);

  function showSubstance(substance: string) {
    focusRef.current = "substance-heading";
    window.history.pushState({ shown: PAGE_SIZE }, "", substanceHref(substance));
    setNav({ variantId: null, substance, shown: PAGE_SIZE });
  }

  function pickVariant(variant: RegistryVariant, from: "field" | "list") {
    if (nav.variantId === variant.id) {
      return;
    }
    if (from === "list") {
      focusRef.current = "variant-card";
    }
    window.history.pushState({}, "", variantHref(variant.id));
    setKnown((current) => ({ ...current, [variant.id]: variant }));
    setNav({ variantId: variant.id, substance: null, shown: PAGE_SIZE });
  }

  function showMore() {
    const next = Math.min(nav.shown + PAGE_SIZE, MAX_SHOWN);
    window.history.replaceState({ shown: next }, "");
    setNav({ ...nav, shown: next });
  }

  // Editing the text drops the pick: the card and the verdict must never sit under a different name.
  function handleEdit() {
    if (nav.variantId === null && nav.substance === null) {
      return;
    }
    // A reload must not bring the abandoned medicine back; no new entry, so "back" keeps leading to the earlier ones.
    window.history.replaceState(null, "", "/szukaj");
    setNav({ variantId: null, substance: null, shown: PAGE_SIZE });
  }

  /** One delegated listener for the substance links inside the card and the check result. */
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    const link = event.target.closest<HTMLAnchorElement>("a[data-substance-link]");
    if (!link || !rootRef.current?.contains(link)) {
      return;
    }
    const { substance } = parseSearchState(new URL(link.href).searchParams);
    if (substance === null) {
      return;
    }
    event.preventDefault();
    showSubstance(substance);
  }

  let announcement = "";
  if (selected) {
    announcement = `Wybrano: ${selected.name}`;
  } else if (substanceMode && nav.substance !== null && substanceList.status === "ready") {
    announcement =
      substanceList.total === 0
        ? `Brak leków z substancją ${nav.substance} w rejestrze`
        : `Leki z substancją ${nav.substance}: ${substanceList.total}`;
  }

  return (
    // The handler only catches clicks of the substance links inside; those links are the controls.
    <div ref={rootRef} onClick={handleClick} className="min-w-0 space-y-6">
      <MedicineSuggest
        list={list}
        pickedName={selected?.name ?? null}
        onSelect={(variant) => {
          pickVariant(variant, "field");
        }}
        onEdit={handleEdit}
      />
      <MatchLevelSwitch level={level} onChange={setLevel} />
      {/* Only the name or the count is announced; the card itself is read when the user moves to it. The verdict is
          announced by MedicineCheckResult once the check answers. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {selected && shown && (
        <div className="min-w-0 space-y-4">
          <VariantCard variant={shown} withdrawn={selected.withdrawn} />
          <a
            href={addToKitHref(selected.id)}
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11 w-full whitespace-normal")}
          >
            Dodaj do apteczki
          </a>
          <MedicineCheckResult key={selected.id} productId={selected.id} level={level} onSearched={setSearched} />
        </div>
      )}
      {substanceMode && nav.substance !== null && (
        <SubstanceVariants
          substance={nav.substance}
          results={substanceList.results}
          total={substanceList.total}
          status={substanceList.status}
          onPick={(variant) => {
            pickVariant(variant, "list");
          }}
          onMore={showMore}
          onRetry={substanceList.retry}
        />
      )}
    </div>
  );
}
