import { useEffect, useId, useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRegistrySearchList } from "@/components/hooks/useRegistrySearchList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isQueryLongEnough, MAX_RESULTS, MIN_QUERY_LENGTH, searchVariants } from "@/lib/registry-search";
import type { RegistryVariant } from "@/types";

interface MedicineSuggestProps {
  /** Version of the search list as rendered by the server; addresses the HTTP cache entry of the list. */
  version: number;
  onSelect: (variant: RegistryVariant) => void;
  label?: string;
}

const NO_RESULTS: RegistryVariant[] = [];
/** Pause after the last change before the status text is announced to screen readers. */
const ANNOUNCE_DELAY_MS = 700;

function countText(count: number) {
  return `${count} ${count === 1 ? "podpowiedź" : "podpowiedzi"}`;
}

export function MedicineSuggest({ version, onSelect, label = "Nazwa leku" }: MedicineSuggestProps) {
  const { status, index, retry } = useRegistrySearchList(version);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);

  const inputId = useId();
  const listboxId = useId();
  const messageId = useId();

  const longEnough = isQueryLongEnough(query);
  const search = useMemo(
    () => (status === "ready" && index && longEnough ? searchVariants(index, query, MAX_RESULTS) : null),
    [status, index, longEnough, query],
  );
  const results = search?.results ?? NO_RESULTS;
  const total = search?.total ?? 0;

  const expanded = open && results.length > 0;
  const active = expanded && activeIndex < results.length ? activeIndex : -1;
  const activeOptionId = active >= 0 ? `${listboxId}-${active}` : undefined;

  useEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeOptionId]);

  function select(variant: RegistryVariant) {
    setQuery(variant.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(variant);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        if (results.length === 0) return;
        event.preventDefault();
        if (expanded) {
          setActiveIndex((active + 1) % results.length);
        } else {
          setOpen(true);
          setActiveIndex(0);
        }
        break;
      case "ArrowUp":
        if (results.length === 0) return;
        event.preventDefault();
        if (expanded) {
          setActiveIndex(active <= 0 ? results.length - 1 : active - 1);
        } else {
          setOpen(true);
          setActiveIndex(results.length - 1);
        }
        break;
      case "Enter":
        // Without an active option Enter does nothing: no silent selection.
        if (active >= 0) {
          event.preventDefault();
          select(results[active]);
        }
        break;
      case "Escape":
        if (expanded) {
          event.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
        }
        break;
    }
  }

  // Status text under the field; screen readers get it from a separate live region (below).
  let message = "";
  let messageVisible = true;
  let action: ReactNode = null;
  let problem = false;
  if (status === "loading") {
    message = "Wczytywanie listy leków…";
  } else if (status === "unauthorized") {
    problem = true;
    message = "Sesja wygasła — zaloguj się ponownie";
    action = (
      <a href="/auth/signin" className="font-medium text-purple-300 underline underline-offset-4 hover:text-purple-100">
        Zaloguj się
      </a>
    );
  } else if (status === "error") {
    problem = true;
    message = "Nie udało się wczytać listy leków.";
    action = (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={retry}
        className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
      >
        Spróbuj ponownie
      </Button>
    );
  } else if (!longEnough) {
    message = `Wpisz co najmniej ${MIN_QUERY_LENGTH} litery`;
  } else if (total === 0) {
    message = "Brak leku o takiej nazwie w rejestrze";
  } else if (open) {
    if (total > results.length) {
      message = `Pokazano ${results.length} z ${total} — dopisz kolejne słowo, np. część nazwy`;
    } else {
      message = countText(results.length);
      messageVisible = false;
    }
  }

  // Announced after typing pauses, so a changing count is not read on every key. Hints are announced only while the
  // field has focus (not when the list finishes loading in the background); problems are announced at once.
  const announcement = problem || focused ? message : "";
  const [announced, setAnnounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setAnnounced(announcement);
      },
      problem ? 0 : ANNOUNCE_DELAY_MS,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [announcement, problem]);

  const describedBy = message && messageVisible ? messageId : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="mb-1 block text-sm text-blue-100/80">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
          setActiveIndex(-1);
        }}
        className="block min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-base text-white placeholder-white/40 transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
      />
      {expanded && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          // Keeps focus in the input, so a tap, a click or a scrollbar drag does not blur it and close the list.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          className="mt-1 max-h-[min(24rem,50vh)] divide-y divide-white/10 overflow-x-hidden overflow-y-auto rounded-lg border border-white/20 bg-slate-900"
        >
          {results.map((variant, position) => {
            const details = [variant.strength, variant.form].filter(Boolean).join(" · ");
            return (
              <li
                key={variant.id}
                id={`${listboxId}-${position}`}
                role="option"
                aria-selected={position === active}
                onClick={() => {
                  select(variant);
                }}
                className={cn(
                  "min-h-11 min-w-0 cursor-pointer overflow-hidden px-3 py-2 text-white hover:bg-white/10",
                  position === active && "bg-purple-500/30",
                )}
              >
                <span className="line-clamp-2 block font-bold break-words">{variant.name}</span>
                {details && <span className="block truncate text-sm text-blue-100/70">{details}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        {message && messageVisible && (
          <p id={messageId} className={cn("text-sm break-words", problem ? "text-red-300" : "text-blue-100/70")}>
            {message}
          </p>
        )}
        {action}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announced}
      </div>
    </div>
  );
}
