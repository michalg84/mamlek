import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useRegistryMatch } from "@/components/hooks/useRegistryMatch";
import { KitImportRow } from "@/components/kit/KitImportRow";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { packQuantity } from "@/lib/kit-format";
import { parseKitCsv, type CsvError, type ParsedRow } from "@/lib/kit-import-csv";
import {
  assignVariant,
  createImportRow,
  earlierVariantKeys,
  IMPORT_MAX_ROWS,
  IMPORT_PAGE_SIZE,
  pageCount,
  pageOf,
  rowIssues,
  rowQueries,
  toImportItem,
  type ImportRow,
} from "@/lib/kit-import";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { ImportKitItemsItemError, RegistryVariantPackage } from "@/types";

interface KitImportProps {
  /** Version of the search list as rendered by the server; addresses the HTTP cache entry of the list. */
  version: number;
  /** Variant keys of the account's kit (`kitItemVariantKey`), for "already have". */
  kitVariantKeys: string[];
}

/** The prompt for an external AI chat, copied by the user together with a photo of the medicines. */
export const IMPORT_PROMPT =
  "Na zdjęciu są opakowania leków. Wypisz każde opakowanie w osobnym wierszu jako CSV ze średnikiem jako separatorem i z nagłówkiem: nazwa;moc;postac;waznosc;ilosc. nazwa — nazwa handlowa z opakowania, bez mocy; moc — np. 400 mg albo 100 mg/5 ml; postac — np. tabletki powlekane, syrop; waznosc — data ważności jako MM.RRRR; ilosc — ile sztuk zostało, same cyfry. Jeśli czegoś nie da się odczytać, zostaw pole puste — nie zgaduj. Zwróć tylko CSV, bez komentarzy.";

const EXAMPLE = "nazwa;moc;postac;waznosc;ilosc\nIbuprom;400 mg;tabletki powlekane;03.2027;20";

/** Larger files are not read: a kit list of 200 rows is a few kilobytes. */
const MAX_FILE_BYTES = 256 * 1024;

const SAVE_FAILED =
  "Nie udało się zapisać strony. Jeśli połączenie zerwało się w trakcie, sprawdź apteczkę, zanim spróbujesz ponownie.";

// Same look as `Input`, for the multi-line paste field.
const TEXTAREA_CLASS =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-40 w-full min-w-0 rounded-md border px-3 py-2 font-mono text-base shadow-xs outline-none focus-visible:ring-3";

const HEADING_CLASS = "text-foreground mb-2 text-lg font-semibold";

function csvErrorText(error: CsvError): string {
  switch (error.code) {
    case "no-header":
      return "Brak nagłówka. Pierwszy wiersz musi zawierać nazwy kolumn, np. nazwa;moc;postac;waznosc;ilosc";
    case "missing-column":
      return `Brak kolumny „${error.column}” w nagłówku`;
    case "unknown-column":
      return `Nieznana kolumna „${error.column}”. Dozwolone kolumny: nazwa, moc, postac, waznosc, ilosc`;
    case "duplicate-column":
      return `Kolumna „${error.column}” występuje w nagłówku więcej niż raz`;
    case "no-rows":
      return "Pod nagłówkiem nie ma żadnego wiersza z lekiem";
    case "too-many-rows":
      return `Za dużo wierszy: ${error.rows}. Jeden import przyjmuje najwyżej ${error.max} — podziel listę na części`;
  }
}

function ErrorText({ children }: { children: string }) {
  return (
    <p role="alert" className="text-destructive flex items-start gap-1.5 text-sm font-medium break-words">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Step 1: the format, the prompt and the input (paste or file). Nothing starts until the whole text parses. */
function ImportInput({ onParsed }: { onParsed: (rows: ParsedRow[]) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const textId = useId();
  const fileId = useId();
  const errorId = useId();

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopyStatus("Skopiowano");
    } catch (cause) {
      // eslint-disable-next-line no-console -- the cause of a failed copy (no clipboard access); the page says what to do
      console.error(cause);
      setCopyStatus("Nie udało się skopiować — zaznacz tekst polecenia i skopiuj go ręcznie");
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    setFileError(null);
    setError(null);
    if (!file) {
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      input.value = "";
      setFileError("Plik jest większy niż 256 kB, więc nie został wczytany. Wklej listę leków w pole powyżej.");
      return;
    }
    try {
      setText(await file.text());
    } catch (cause) {
      // eslint-disable-next-line no-console -- the cause of an unreadable file; the page says what to do
      console.error(cause);
      setFileError("Nie udało się odczytać pliku. Otwórz go i wklej zawartość w pole powyżej.");
    }
  }

  function next() {
    const result = parseKitCsv(text);
    if (!result.ok) {
      setError(csvErrorText(result.error));
      return;
    }
    onParsed(result.rows);
  }

  return (
    <div className="min-w-0 space-y-6">
      <section className="min-w-0" aria-labelledby={`${textId}-format`}>
        <h2 id={`${textId}-format`} className={HEADING_CLASS}>
          Format listy
        </h2>
        <p className="text-foreground mb-2 text-sm">
          Każdy lek w osobnym wierszu, pola oddzielone średnikiem. Pierwszy wiersz to nagłówek z nazwami kolumn:
        </p>
        <ul className="text-foreground mb-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            <span className="font-mono">nazwa</span> — nazwa handlowa z opakowania (wymagana)
          </li>
          <li>
            <span className="font-mono">moc</span> — np. 400 mg albo 100 mg/5 ml
          </li>
          <li>
            <span className="font-mono">postac</span> — np. tabletki powlekane, syrop
          </li>
          <li>
            <span className="font-mono">waznosc</span> — data ważności jako MM.RRRR
          </li>
          <li>
            <span className="font-mono">ilosc</span> — ile sztuk zostało, same cyfry
          </li>
        </ul>
        <pre className="bg-muted text-foreground overflow-x-auto rounded-md p-3 text-sm">
          <code>{EXAMPLE}</code>
        </pre>
        <p className="text-muted-foreground mt-2 text-sm">
          Puste pole oznacza „nieznane”. Najwyżej {IMPORT_MAX_ROWS} wierszy.
        </p>
      </section>

      <section className="min-w-0" aria-labelledby={`${textId}-prompt`}>
        <h2 id={`${textId}-prompt`} className={HEADING_CLASS}>
          Polecenie dla czatu AI
        </h2>
        <p className="text-foreground mb-2 text-sm">
          Zrób zdjęcie opakowań, wyślij je do czatu AI razem z tym poleceniem i wklej odpowiedź poniżej:
        </p>
        <blockquote className="bg-muted text-foreground rounded-md p-3 text-sm break-words">{IMPORT_PROMPT}</blockquote>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void copyPrompt();
            }}
          >
            Kopiuj
          </Button>
          <p role="status" className="text-muted-foreground min-w-0 text-sm break-words">
            {copyStatus}
          </p>
        </div>
      </section>

      <section className="min-w-0 space-y-3" aria-labelledby={`${textId}-input`}>
        <h2 id={`${textId}-input`} className={HEADING_CLASS}>
          Lista leków
        </h2>
        <div className="min-w-0">
          <Label htmlFor={textId} className="text-muted-foreground mb-1 block text-sm leading-normal">
            Wklej CSV
          </Label>
          <textarea
            id={textId}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            spellCheck={false}
            className={TEXTAREA_CLASS}
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={fileId} className="text-muted-foreground mb-1 block text-sm leading-normal">
            Albo wybierz plik CSV
          </Label>
          <Input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              void readFile(event);
            }}
            className="min-h-11 text-base md:text-base"
          />
          {fileError && <ErrorText>{fileError}</ErrorText>}
        </div>
        {error && (
          <div id={errorId}>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <Button type="button" onClick={next} className="min-h-11 w-full">
          Dalej
        </Button>
      </section>
    </div>
  );
}

type SaveError = { kind: "failed" } | { kind: "session" } | { kind: "rejected"; line: number };

/** Step 2: rows in file order, pages of IMPORT_PAGE_SIZE, each page saved by one all-or-nothing request. */
function ImportReview({
  version,
  kitVariantKeys,
  initialRows,
}: {
  version: number;
  kitVariantKeys: string[];
  initialRows: ImportRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(0);
  const [savedPages, setSavedPages] = useState(0);
  const [savedItems, setSavedItems] = useState(0);
  const [editing, setEditing] = useState<number | null>(null);
  /** The pack chosen for each row (by row index), for its quantity cap. */
  const [packs, setPacks] = useState<Partial<Record<number, RegistryVariantPackage>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  /** Row index the server rejected in the last save. */
  const [rejected, setRejected] = useState<number | null>(null);
  const reasonId = useId();
  /** The page heading (or the "all done" line): where the view and the focus go when the page changes. */
  const topRef = useRef<HTMLElement | null>(null);
  const setTop = (element: HTMLElement | null) => {
    topRef.current = element;
  };
  const firstRender = useRef(true);

  // A new page starts at the top, with the focus on its heading, not on the button that was just pressed at the bottom.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    topRef.current?.focus({ preventScroll: true });
  }, [page]);

  const kitKeys = useMemo(() => new Set(kitVariantKeys), [kitVariantKeys]);
  const pages = pageCount(rows);
  const finished = page >= pages;
  const earlier = earlierVariantKeys(rows);
  const packMaxOf = (index: number): number | null => {
    const pack = packs[index];
    // A pack kept from an earlier variant of the row does not count.
    return pack?.packageId === rows[index].packageId ? packQuantity(pack.units).max : null;
  };
  const issues = rows.map((row, index) =>
    rowIssues(row, { kitKeys, earlierKeys: earlier[index], packMax: packMaxOf(index) }),
  );
  const pageIndices = pageOf(
    rows.map((_, index) => index),
    page,
  );
  const kept = pageIndices.filter((index) => !rows[index].removed);
  const blocking = kept.filter((index) => issues[index].length > 0).length;
  const blocked = blocking > 0;

  function update(index: number, change: (row: ImportRow) => ImportRow) {
    setRows((current) => current.map((row, position) => (position === index ? change(row) : row)));
    if (rejected === index) {
      setRejected(null);
    }
  }

  function nextPage() {
    setPage((current) => current + 1);
    setEditing(null);
    setSaveError(null);
    setRejected(null);
  }

  async function savePage() {
    if (blocked || saving || kept.length === 0) {
      return;
    }
    const items = kept.map((index) => toImportItem(rows[index]));
    setSaving(true);
    setSaveError(null);
    setRejected(null);
    try {
      const response = await fetch("/api/kit/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (response.status === 201) {
        // The rows are stored now, even if the body is unreadable: never offer to save this page again.
        setSavedPages((count) => count + 1);
        setSavedItems((count) => count + items.length);
        nextPage();
      } else if (response.status === 401) {
        setSaveError({ kind: "session" });
      } else {
        const payload = (await response.json().catch((cause: unknown) => {
          // eslint-disable-next-line no-console -- the cause of an unreadable error body; the page shows a generic message
          console.error(cause);
          return null;
        })) as Partial<ImportKitItemsItemError> | null;
        const index = response.status === 400 && typeof payload?.index === "number" ? kept[payload.index] : undefined;
        if (index === undefined) {
          // eslint-disable-next-line no-console -- the only trace of the failed save; the page shows a generic message
          console.error("Saving an import page failed", response.status, payload);
          setSaveError({ kind: "failed" });
        } else {
          setRejected(index);
          setSaveError({ kind: "rejected", line: rows[index].parsed.line });
        }
      }
    } catch (cause) {
      // eslint-disable-next-line no-console -- network failure; the page shows a generic message with a retry
      console.error(cause);
      setSaveError({ kind: "failed" });
    }
    setSaving(false);
  }

  const removed = rows.filter((row) => row.removed).length;
  // Rows of the pages not saved or skipped yet (this one included).
  const unsaved = rows.filter((row, index) => !row.removed && index >= page * IMPORT_PAGE_SIZE).length;
  const finishHref = savedItems > 0 ? `/apteczka?zaimportowano=${savedItems}` : "/apteczka";

  let unsavedPages = "";
  if (!finished) {
    const first = page + 1;
    unsavedPages =
      first === pages ? `Strona ${first} nie zostanie zapisana` : `Strony ${first}–${pages} nie zostaną zapisane`;
  }

  return (
    <div className="min-w-0 space-y-4">
      <p role="status" className="text-muted-foreground text-sm">
        Zapisano {savedPages} z {pages} {plural(pages, "strony", "stron", "stron")}, {savedItems}{" "}
        {plural(savedItems, "lek", "leki", "leków")}
      </p>

      {finished ? (
        <p ref={setTop} tabIndex={-1} className="text-foreground text-sm outline-none">
          Wszystkie strony importu są już obsłużone.
        </p>
      ) : (
        <section className="min-w-0 space-y-4" aria-labelledby={`${reasonId}-page`}>
          <h2 ref={setTop} tabIndex={-1} id={`${reasonId}-page`} className={cn(HEADING_CLASS, "outline-none")}>
            Strona {page + 1} z {pages}
          </h2>
          <ol className="divide-border min-w-0 divide-y rounded-lg border">
            {pageIndices.map((index) => (
              <KitImportRow
                key={index}
                version={version}
                row={rows[index]}
                issues={issues[index]}
                packMax={packMaxOf(index)}
                editing={editing === index}
                rejected={rejected === index}
                onStartEdit={() => {
                  setEditing(index);
                }}
                onCancelEdit={() => {
                  setEditing(null);
                }}
                onAssign={(variant) => {
                  update(index, (row) => assignVariant(row, variant));
                  setEditing(null);
                }}
                onPickPack={(pack) => {
                  setPacks((current) => ({ ...current, [index]: pack }));
                  update(index, (row) => ({ ...row, packageId: pack.packageId }));
                }}
                onExpiry={(expiry) => {
                  update(index, (row) => ({ ...row, expiry }));
                }}
                onQuantity={(quantity) => {
                  update(index, (row) => ({ ...row, quantity }));
                }}
                onAddAnyway={() => {
                  update(index, (row) => ({ ...row, duplicateDecision: "add" }));
                }}
                onRemove={() => {
                  update(index, (row) => ({ ...row, removed: true }));
                  if (editing === index) {
                    setEditing(null);
                  }
                }}
                onRestore={() => {
                  update(index, (row) => ({ ...row, removed: false }));
                }}
              />
            ))}
          </ol>

          {kept.length === 0 ? (
            <Button type="button" variant="outline" onClick={nextPage} className="min-h-11 w-full">
              Pomiń stronę
            </Button>
          ) : (
            <div className="min-w-0 space-y-2">
              {/* aria-disabled instead of disabled: the button stays focusable, so the reason is read with it. */}
              <Button
                type="button"
                aria-disabled={blocked ? true : undefined}
                aria-describedby={blocked ? reasonId : undefined}
                disabled={saving}
                onClick={() => {
                  void savePage();
                }}
                className={cn("min-h-11 w-full", blocked && "cursor-not-allowed opacity-50")}
              >
                {saving && <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
                Zapisz stronę {page + 1} z {pages}
              </Button>
              {blocked && (
                <p id={reasonId} className="text-muted-foreground text-sm">
                  {blocking} {plural(blocking, "wiersz wymaga", "wiersze wymagają", "wierszy wymaga")} decyzji
                </p>
              )}
            </div>
          )}

          {saveError?.kind === "failed" && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ErrorText>{SAVE_FAILED}</ErrorText>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void savePage();
                }}
              >
                Spróbuj ponownie
              </Button>
            </div>
          )}
          {saveError?.kind === "session" && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <ErrorText>Sesja wygasła — zaloguj się ponownie. Ta strona nie została zapisana.</ErrorText>
              <a href="/auth/signin" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
                Zaloguj się
              </a>
            </div>
          )}
          {saveError?.kind === "rejected" && (
            <ErrorText>{`Strona nie została zapisana: serwer odrzucił wiersz ${saveError.line}.`}</ErrorText>
          )}
        </section>
      )}

      <div className="min-w-0 space-y-2 border-t pt-4">
        <p className="text-foreground text-sm">
          Zapisane wiersze: {savedItems} · usunięte: {removed} · niezapisane: {unsaved}
        </p>
        {unsavedPages && <p className="text-muted-foreground text-sm">{unsavedPages}</p>}
        <a
          href={finishHref}
          className={cn(buttonVariants({ variant: finished ? "default" : "outline" }), "min-h-11 w-full")}
        >
          Zakończ import
        </a>
      </div>
    </div>
  );
}

/**
 * The kit import (`/apteczka/import`): step 1 takes the CSV, step 2 approves it page by page. The registry list loads
 * from the first step on, so matching can start as soon as the text parses.
 */
export default function KitImport({ version, kitVariantKeys }: KitImportProps) {
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const queries = useMemo(() => (parsed ? parsed.map(rowQueries) : null), [parsed]);
  const { status, matches, retry } = useRegistryMatch(version, queries);
  const initialRows = useMemo(
    () => (parsed && matches ? parsed.map((row, index) => createImportRow(row, matches[index])) : null),
    [parsed, matches],
  );

  if (!parsed) {
    return <ImportInput onParsed={setParsed} />;
  }
  if (status === "error") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ErrorText>Nie udało się wczytać listy leków.</ErrorText>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }
  if (!initialRows) {
    return (
      <p role="status" className="text-muted-foreground flex items-start gap-1.5 text-sm">
        <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
        <span className="min-w-0">Dopasowuję leki…</span>
      </p>
    );
  }
  return <ImportReview version={version} kitVariantKeys={kitVariantKeys} initialRows={initialRows} />;
}
