import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRegistrySearch } from "@/components/hooks/useRegistrySearch";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isQueryLongEnough, MIN_QUERY_LENGTH } from "@/lib/registry-search";
import type { RegistryVariant } from "@/types";

interface MedicineSuggestProps {
  /** Version of the search list as rendered by the server; addresses the HTTP cache entry of the list. */
  version: number;
  onSelect: (variant: RegistryVariant) => void;
  label?: string;
}

/** Pause after the last change before the status text is announced to screen readers. */
const ANNOUNCE_DELAY_MS = 700;

function countText(count: number) {
  return `${count} ${count === 1 ? "podpowiedź" : "podpowiedzi"}`;
}

export function MedicineSuggest({ version, onSelect, label = "Nazwa leku" }: MedicineSuggestProps) {
  const [query, setQuery] = useState("");
  const { status, results, total, resultsQuery, retry } = useRegistrySearch(version, query);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [focused, setFocused] = useState(false);

  const inputId = useId();
  const listboxId = useId();
  const messageId = useId();

  const longEnough = isQueryLongEnough(query);
  // The worker answers asynchronously: until the answer for the current query arrives, the list keeps the previous
  // results and the messages below that depend on the answer stay empty.
  const answered = resultsQuery === query;

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
      <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
        Zaloguj się
      </a>
    );
  } else if (status === "error") {
    problem = true;
    message = "Nie udało się wczytać listy leków.";
    action = (
      <Button type="button" variant="outline" size="sm" onClick={retry}>
        Spróbuj ponownie
      </Button>
    );
  } else if (!longEnough) {
    message = `Wpisz co najmniej ${MIN_QUERY_LENGTH} litery`;
  } else if (!answered) {
    message = "";
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
      <label htmlFor={inputId} className="text-muted-foreground mb-1 block text-sm font-medium">
        {label}
      </label>
      <Input
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
        className="min-h-11 w-full min-w-0 text-base md:text-base"
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
          className="bg-popover text-popover-foreground divide-border mt-1 max-h-[min(24rem,50vh)] divide-y overflow-x-hidden overflow-y-auto rounded-lg border shadow-md"
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
                  "hover:bg-accent hover:text-accent-foreground min-h-11 min-w-0 cursor-pointer overflow-hidden px-3 py-2",
                  position === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="line-clamp-2 block font-bold break-words">{variant.name}</span>
                {details && <span className="text-muted-foreground block truncate text-sm">{details}</span>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
        {message && messageVisible && (
          <p
            id={messageId}
            className={cn("text-sm break-words", problem ? "text-destructive" : "text-muted-foreground")}
          >
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
