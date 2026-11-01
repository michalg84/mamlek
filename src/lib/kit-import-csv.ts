import { MAX_QUANTITY } from "@/lib/kit-format";
import { normalizeText } from "@/lib/registry-search";

// Parser of the kit-import CSV (pasted text or file content). Pure: text in, rows or one whole-text error out.
// Every data line becomes a row, even a broken one (`malformed`), so no line vanishes silently.

/** Most data rows one import accepts. */
export const IMPORT_MAX_ROWS = 200;

/** Expiry bounds, the same as `POST /api/kit`. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export type ParsedExpiry =
  { kind: "empty" } | { kind: "ok"; month: number; year: number } | { kind: "invalid"; text: string };

export type ParsedQuantity = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "invalid"; text: string };

export interface ParsedRow {
  /** 1-based line number in the parsed text. */
  line: number;
  /** The line as written (without the line break). */
  raw: string;
  /** Trimmed; "" when empty, missing or the row is malformed. */
  name: string;
  strength: string | null;
  form: string | null;
  expiry: ParsedExpiry;
  quantity: ParsedQuantity;
  /** The number of fields differs from the header (or the quoting is broken); the fields were not read. */
  malformed: boolean;
}

/** Why the whole text cannot be imported. `column` is the name as written (unknown) or the canonical one. */
export type CsvError =
  | { code: "no-header" }
  | { code: "missing-column" | "unknown-column" | "duplicate-column"; column: string }
  | { code: "no-rows" }
  | { code: "too-many-rows"; rows: number; max: number };

export type CsvParseResult = { ok: true; rows: ParsedRow[] } | { ok: false; error: CsvError };

type Column = "name" | "strength" | "form" | "expiry" | "quantity";

/** Header names after `normalizeText` (lowercase, no diacritics). */
const COLUMNS: Record<string, Column> = {
  nazwa: "name",
  moc: "strength",
  postac: "form",
  waznosc: "expiry",
  ilosc: "quantity",
};

/** Canonical (ASCII) header name of each column, for error messages. */
const COLUMN_NAMES: Record<Column, string> = {
  name: "nazwa",
  strength: "moc",
  form: "postac",
  expiry: "waznosc",
  quantity: "ilosc",
};

/**
 * Splits one line on `;`. A field may be quoted with `"`, with `""` as a quote inside. Returns null when the quoting
 * is broken (unterminated, or text between the closing quote and the next `;`). Quoted fields cannot span lines.
 */
function splitFields(line: string): string[] | null {
  const fields: string[] = [];
  let i = 0;
  for (;;) {
    let field = "";
    if (line[i] === '"') {
      i++;
      let closed = false;
      while (i < line.length) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        field += line[i];
        i++;
      }
      if (!closed || (i < line.length && line[i] !== ";")) {
        return null;
      }
    } else {
      const next = line.indexOf(";", i);
      const end = next === -1 ? line.length : next;
      field = line.slice(i, end);
      i = end;
    }
    fields.push(field);
    if (i >= line.length) {
      return fields;
    }
    i++; // the `;`
  }
}

function daysInMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthYear(month: number, year: number, text: string): ParsedExpiry {
  if (month < 1 || month > 12 || year < MIN_YEAR || year > MAX_YEAR) {
    return { kind: "invalid", text };
  }
  return { kind: "ok", month, year };
}

/** MM.RRRR, M.RRRR, MM/RRRR, DD.MM.RRRR, RRRR-MM, RRRR-MM-DD. The day is checked and then dropped. */
function parseExpiry(text: string): ParsedExpiry {
  if (text === "") {
    return { kind: "empty" };
  }
  let match = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (match) {
    return monthYear(Number(match[1]), Number(match[2]), text);
  }
  match = /^(\d{4})-(\d{2})$/.exec(text);
  if (match) {
    return monthYear(Number(match[2]), Number(match[1]), text);
  }
  // [day, month, year]
  let dayParts: [number, number, number] | null = null;
  match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (match) {
    dayParts = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (match) {
      dayParts = [Number(match[3]), Number(match[2]), Number(match[1])];
    }
  }
  if (dayParts) {
    const [day, month, year] = dayParts;
    const expiry = monthYear(month, year, text);
    if (expiry.kind === "ok" && (day < 1 || day > daysInMonth(month, year))) {
      return { kind: "invalid", text };
    }
    return expiry;
  }
  return { kind: "invalid", text };
}

function parseQuantity(text: string): ParsedQuantity {
  if (text === "") {
    return { kind: "empty" };
  }
  if (!/^\d+$/.test(text)) {
    return { kind: "invalid", text };
  }
  const value = Number(text);
  if (value > MAX_QUANTITY) {
    return { kind: "invalid", text };
  }
  return { kind: "ok", value };
}

function emptyToNull(value: string): string | null {
  return value === "" ? null : value;
}

function parseHeader(fields: string[] | null): { ok: true; columns: Column[] } | { ok: false; error: CsvError } {
  if (!fields) {
    return { ok: false, error: { code: "no-header" } };
  }
  const columns: (Column | null)[] = fields.map((field) => COLUMNS[normalizeText(field.trim())] ?? null);
  if (columns.every((column) => column === null)) {
    return { ok: false, error: { code: "no-header" } };
  }
  const unknown = columns.indexOf(null);
  if (unknown !== -1) {
    return { ok: false, error: { code: "unknown-column", column: fields[unknown].trim() } };
  }
  const known = columns as Column[];
  const seen = new Set<Column>();
  for (const column of known) {
    if (seen.has(column)) {
      return { ok: false, error: { code: "duplicate-column", column: COLUMN_NAMES[column] } };
    }
    seen.add(column);
  }
  if (!seen.has("name")) {
    return { ok: false, error: { code: "missing-column", column: COLUMN_NAMES.name } };
  }
  return { ok: true, columns: known };
}

function malformedRow(line: number, raw: string): ParsedRow {
  return {
    line,
    raw,
    name: "",
    strength: null,
    form: null,
    expiry: { kind: "empty" },
    quantity: { kind: "empty" },
    malformed: true,
  };
}

function parseDataRow(line: number, raw: string, columns: Column[]): ParsedRow {
  const fields = splitFields(raw);
  if (fields?.length !== columns.length) {
    return malformedRow(line, raw);
  }
  const values: Partial<Record<Column, string>> = {};
  columns.forEach((column, i) => {
    values[column] = fields[i].trim();
  });
  return {
    line,
    raw,
    name: values.name ?? "",
    strength: emptyToNull(values.strength ?? ""),
    form: emptyToNull(values.form ?? ""),
    expiry: parseExpiry(values.expiry ?? ""),
    quantity: parseQuantity(values.quantity ?? ""),
    malformed: false,
  };
}

const BOM = 0xfeff;

function withoutBom(text: string): string {
  return text.charCodeAt(0) === BOM ? text.slice(1) : text;
}

/**
 * Parses the pasted or uploaded text. Ignored: a leading BOM, empty lines and Markdown code fences (chats wrap the
 * answer in them). The first remaining line is the header; each later line is one data row.
 */
export function parseKitCsv(text: string): CsvParseResult {
  const lines = withoutBom(text).split(/\r\n|\n|\r/);
  const kept: { line: number; raw: string }[] = [];
  lines.forEach((raw, i) => {
    if (raw.trim() === "" || raw.trimStart().startsWith("```")) {
      return;
    }
    kept.push({ line: i + 1, raw });
  });

  if (kept.length === 0) {
    return { ok: false, error: { code: "no-header" } };
  }
  const header = parseHeader(splitFields(kept[0].raw));
  if (!header.ok) {
    return { ok: false, error: header.error };
  }

  const dataLines = kept.slice(1);
  if (dataLines.length === 0) {
    return { ok: false, error: { code: "no-rows" } };
  }
  if (dataLines.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: { code: "too-many-rows", rows: dataLines.length, max: IMPORT_MAX_ROWS } };
  }
  return { ok: true, rows: dataLines.map(({ line, raw }) => parseDataRow(line, raw, header.columns)) };
}
