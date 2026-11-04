import { describe, expect, it } from "vitest";
import { IMPORT_MAX_ROWS, parseKitCsv } from "@/lib/kit-import-csv";
import type { ParsedRow } from "@/lib/kit-import-csv";

// Expected values are written by hand from the rules of the S-04 plan (phase 1, "Parser CSV"):
//   - ignored: a leading BOM, empty lines, Markdown code-fence lines (a line starting with three backticks)
//   - separator ";", fields in "..." with "" as a quote inside
//   - header: columns nazwa;moc;postac;waznosc;ilosc, case and Polish diacritics ignored, any order; "nazwa" is
//     required; an unknown or repeated column is an error; the other columns may be absent
//   - more than 200 data rows or none: an error; a row with a wrong number of fields stays as `malformed`
//   - expiry: MM.RRRR, M.RRRR, MM/RRRR, DD.MM.RRRR, RRRR-MM, RRRR-MM-DD; the day is checked, then dropped;
//     year 2000-2100, month 1-12 (the bounds of POST /api/kit)
//   - quantity: digits only, 0 to MAX_QUANTITY (100000)

const HEADER = "nazwa;moc;postac;waznosc;ilosc";
const BOM = String.fromCharCode(0xfeff);

function rowsOf(text: string): ParsedRow[] {
  const result = parseKitCsv(text);
  if (!result.ok) {
    throw new Error(`expected rows, got error ${JSON.stringify(result.error)}`);
  }
  return result.rows;
}

function errorOf(text: string) {
  const result = parseKitCsv(text);
  if (result.ok) {
    throw new Error("expected an error, got rows");
  }
  return result.error;
}

/** Parses one data row under a header with the name and expiry columns only. */
function expiryOf(text: string) {
  return rowsOf(`nazwa;waznosc\nLek;${text}`)[0].expiry;
}

/** Parses one data row under a header with the name and quantity columns only. */
function quantityOf(text: string) {
  return rowsOf(`nazwa;ilosc\nLek;${text}`)[0].quantity;
}

describe("parseKitCsv: rows", () => {
  it("reads a full row and trims the fields", () => {
    const rows = rowsOf(`${HEADER}\n  Ibuprom ; 400 mg ; tabletki powlekane ; 03.2027 ; 20 `);

    expect(rows).toEqual([
      {
        line: 2,
        raw: "  Ibuprom ; 400 mg ; tabletki powlekane ; 03.2027 ; 20 ",
        name: "Ibuprom",
        strength: "400 mg",
        form: "tabletki powlekane",
        expiry: { kind: "ok", month: 3, year: 2027 },
        quantity: { kind: "ok", value: 20 },
        malformed: false,
      },
    ]);
  });

  it("turns empty strength and form into null and empty expiry and quantity into empty", () => {
    const [row] = rowsOf(`${HEADER}\nPolopiryna S;;;;`);

    expect(row.name).toBe("Polopiryna S");
    expect(row.strength).toBeNull();
    expect(row.form).toBeNull();
    expect(row.expiry).toEqual({ kind: "empty" });
    expect(row.quantity).toEqual({ kind: "empty" });
    expect(row.malformed).toBe(false);
  });

  it("keeps the rows in file order", () => {
    const rows = rowsOf(`${HEADER}\nApap;;;;\nIbuprom;;;;\nNo-Spa;;;;`);

    expect(rows.map((row) => row.name)).toEqual(["Apap", "Ibuprom", "No-Spa"]);
  });

  it("reads a field in quotes that contains a semicolon", () => {
    const [row] = rowsOf(`${HEADER}\n"Aspirin; C";"500 mg";tabletki;;`);

    expect(row.name).toBe("Aspirin; C");
    expect(row.strength).toBe("500 mg");
    expect(row.malformed).toBe(false);
  });

  it('reads "" inside a quoted field as one quote', () => {
    const [row] = rowsOf(`${HEADER}\n"Syrop ""Mały""";100 mg/5 ml;syrop;;`);

    expect(row.name).toBe('Syrop "Mały"');
    expect(row.strength).toBe("100 mg/5 ml");
  });
});

describe("parseKitCsv: input hygiene", () => {
  it("ignores a BOM before the header", () => {
    const rows = rowsOf(`${BOM}${HEADER}\nIbuprom;400 mg;;;`);

    expect(rows.map((row) => row.name)).toEqual(["Ibuprom"]);
  });

  it("ignores Markdown code fences and keeps the line numbers of the text", () => {
    const text = ["```csv", HEADER, "Ibuprom;400 mg;;;", "```"].join("\n");

    expect(rowsOf(text)).toMatchObject([{ line: 3, raw: "Ibuprom;400 mg;;;", name: "Ibuprom" }]);
  });

  it("ignores a fence without a language and empty lines, and reads CRLF line breaks", () => {
    const text = ["```", "", HEADER, "", "Apap;500 mg;;;", "   ", "Ibuprom;;;;", "```", ""].join("\r\n");

    const rows = rowsOf(text);

    expect(rows.map((row) => [row.line, row.name])).toEqual([
      [5, "Apap"],
      [7, "Ibuprom"],
    ]);
    expect(rows[0].raw).toBe("Apap;500 mg;;;");
  });
});

describe("parseKitCsv: header", () => {
  it("accepts Polish names and any column order", () => {
    const [row] = rowsOf("Ilość;Postać;Ważność;Moc;Nazwa\n20;tabletki powlekane;03.2027;400 mg;Ibuprom");

    expect(row).toMatchObject({
      name: "Ibuprom",
      strength: "400 mg",
      form: "tabletki powlekane",
      expiry: { kind: "ok", month: 3, year: 2027 },
      quantity: { kind: "ok", value: 20 },
    });
  });

  it("ignores letter case in the header", () => {
    const [row] = rowsOf("NAZWA;Moc\nIbuprom;400 mg");

    expect(row).toMatchObject({ name: "Ibuprom", strength: "400 mg" });
  });

  it("lets the columns other than the name be absent", () => {
    const [row] = rowsOf("nazwa\nIbuprom");

    expect(row).toMatchObject({
      name: "Ibuprom",
      strength: null,
      form: null,
      expiry: { kind: "empty" },
      quantity: { kind: "empty" },
    });
  });

  it("reports a text without a header (the first line is data)", () => {
    expect(errorOf("Ibuprom;400 mg;tabletki powlekane;03.2027;20\nApap;500 mg;tabletki;;")).toEqual({
      code: "no-header",
    });
  });

  it("reports an empty text and a text of fences and blank lines as having no header", () => {
    expect(errorOf("")).toEqual({ code: "no-header" });
    expect(errorOf("```\n\n```")).toEqual({ code: "no-header" });
  });

  it("names an unknown column", () => {
    expect(errorOf("nazwa;producent;ilosc\nIbuprom;Polfa;20")).toEqual({
      code: "unknown-column",
      column: "producent",
    });
  });

  it("names a repeated column, also when written with and without diacritics", () => {
    expect(errorOf("nazwa;moc;nazwa\nIbuprom;400 mg;Apap")).toEqual({ code: "duplicate-column", column: "nazwa" });
    expect(errorOf("nazwa;ilość;ilosc\nIbuprom;1;2")).toEqual({ code: "duplicate-column", column: "ilosc" });
  });

  it("requires the name column", () => {
    expect(errorOf("moc;postac\n400 mg;tabletki")).toEqual({ code: "missing-column", column: "nazwa" });
  });

  it("ignores one trailing semicolon on the header and on the rows (chats add it)", () => {
    const rows = rowsOf(`${HEADER};\nNo-Spa;40 mg;tabletki;03.2027;20;\nApap;;;;;`);

    expect(rows.map((row) => row.malformed)).toEqual([false, false]);
    expect(rows[0]).toMatchObject({
      name: "No-Spa",
      strength: "40 mg",
      form: "tabletki",
      expiry: { kind: "ok", month: 3, year: 2027 },
      quantity: { kind: "ok", value: 20 },
    });
    expect(rows[1]).toMatchObject({ name: "Apap", strength: null, quantity: { kind: "empty" } });
  });

  it("reads rows without the trailing semicolon under a header that has it", () => {
    const [row] = rowsOf(`${HEADER};\nNo-Spa;40 mg;tabletki;03.2027;20`);

    expect(row.malformed).toBe(false);
    expect(row.quantity).toEqual({ kind: "ok", value: 20 });
  });

  it("still names an unknown column behind the trailing semicolon, and keeps a second empty field as an error", () => {
    expect(errorOf("nazwa;producent;\nIbuprom;Polfa;")).toEqual({ code: "unknown-column", column: "producent" });
    expect(errorOf(`${HEADER};;\nNo-Spa;40 mg;tabletki;03.2027;20`)).toEqual({ code: "unknown-column", column: "" });
    expect(rowsOf(`${HEADER}\nNo-Spa;40 mg;tabletki;03.2027;20;;`)[0].malformed).toBe(true);
  });

  it("reports a header without data rows", () => {
    expect(errorOf(HEADER)).toEqual({ code: "no-rows" });
    expect(errorOf(`\`\`\`csv\n${HEADER}\n\n\`\`\``)).toEqual({ code: "no-rows" });
  });
});

describe("parseKitCsv: malformed rows", () => {
  it("keeps a row with too few fields, in place and unread", () => {
    const rows = rowsOf(`${HEADER}\nApap;500 mg;tabletki;;\nIbuprom;400 mg\nNo-Spa;40 mg;tabletki;;`);

    expect(rows.map((row) => row.name)).toEqual(["Apap", "", "No-Spa"]);
    expect(rows[1]).toEqual({
      line: 3,
      raw: "Ibuprom;400 mg",
      name: "",
      strength: null,
      form: null,
      expiry: { kind: "empty" },
      quantity: { kind: "empty" },
      malformed: true,
    });
    expect(rows[0].malformed).toBe(false);
    expect(rows[2].malformed).toBe(false);
  });

  it("keeps a row with too many fields", () => {
    const [row] = rowsOf(`${HEADER}\nIbuprom;400 mg;tabletki;03.2027;20;nadmiar`);

    expect(row.malformed).toBe(true);
    expect(row.raw).toBe("Ibuprom;400 mg;tabletki;03.2027;20;nadmiar");
  });

  it("keeps a row with an unterminated quote", () => {
    const [row] = rowsOf(`${HEADER}\n"Ibuprom;400 mg;tabletki;03.2027;20`);

    expect(row.malformed).toBe(true);
  });

  it("keeps a row with text after a closing quote", () => {
    const [row] = rowsOf(`${HEADER}\n"Ibuprom"x;400 mg;tabletki;03.2027;20`);

    expect(row.malformed).toBe(true);
  });
});

describe("parseKitCsv: expiry", () => {
  it.each([
    ["03.2027", 3, 2027],
    ["3.2027", 3, 2027],
    ["03/2027", 3, 2027],
    ["15.03.2027", 3, 2027],
    ["2027-03", 3, 2027],
    ["2027-03-15", 3, 2027],
  ])("accepts „%s” as %i/%i", (text, month, year) => {
    expect(expiryOf(text)).toEqual({ kind: "ok", month, year });
  });

  it("treats an empty value as empty", () => {
    expect(expiryOf("")).toEqual({ kind: "empty" });
  });

  it.each([
    // Month 1-12.
    ["01.2027", { kind: "ok", month: 1, year: 2027 }],
    ["12.2027", { kind: "ok", month: 12, year: 2027 }],
    ["00.2027", { kind: "invalid", text: "00.2027" }],
    ["13.2027", { kind: "invalid", text: "13.2027" }],
    ["2027-00", { kind: "invalid", text: "2027-00" }],
    ["2027-13", { kind: "invalid", text: "2027-13" }],
    // Year 2000-2100.
    ["06.2000", { kind: "ok", month: 6, year: 2000 }],
    ["06.1999", { kind: "invalid", text: "06.1999" }],
    ["06.2100", { kind: "ok", month: 6, year: 2100 }],
    ["06.2101", { kind: "invalid", text: "06.2101" }],
    ["2000-06", { kind: "ok", month: 6, year: 2000 }],
    ["1999-06", { kind: "invalid", text: "1999-06" }],
    ["2100-06-30", { kind: "ok", month: 6, year: 2100 }],
    ["2101-06-30", { kind: "invalid", text: "2101-06-30" }],
  ])("checks the bounds of „%s”", (text, expected) => {
    expect(expiryOf(text)).toEqual(expected);
  });

  it.each([
    // The day must exist in that month and year: 30 days in April, 28 or 29 in February.
    ["30.04.2027", true],
    ["31.04.2027", false],
    ["28.02.2027", true],
    ["29.02.2027", false],
    ["29.02.2028", true],
    ["30.02.2028", false],
    ["01.03.2027", true],
    ["00.03.2027", false],
    ["2027-04-30", true],
    ["2027-04-31", false],
    ["2027-03-00", false],
    ["2027-03-32", false],
  ])("checks the day of „%s” (valid: %s)", (text, valid) => {
    expect(expiryOf(text).kind).toBe(valid ? "ok" : "invalid");
  });

  it("drops a valid day", () => {
    expect(expiryOf("31.03.2027")).toEqual({ kind: "ok", month: 3, year: 2027 });
  });

  it.each(["marzec 2027", "03-2027", "2027", "03.27", "3/27/2027", "03.2027 r."])(
    "keeps the text of the unreadable value „%s”",
    (text) => {
      expect(expiryOf(text)).toEqual({ kind: "invalid", text });
    },
  );
});

describe("parseKitCsv: quantity", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["20", 20],
    ["007", 7],
    ["100000", 100000],
  ])("accepts „%s”", (text, value) => {
    expect(quantityOf(text)).toEqual({ kind: "ok", value });
  });

  it("treats an empty value as empty", () => {
    expect(quantityOf("")).toEqual({ kind: "empty" });
  });

  it.each(["100001", "99999999999999999999", "-1", "1.5", "1,5", "20 szt.", "dużo", "+3"])(
    "keeps the text of the invalid value „%s”",
    (text) => {
      expect(quantityOf(text)).toEqual({ kind: "invalid", text });
    },
  );
});

describe("parseKitCsv: size", () => {
  function table(count: number): string {
    const lines = [HEADER];
    for (let i = 1; i <= count; i++) {
      lines.push(`Lek ${i};;;;`);
    }
    return lines.join("\n");
  }

  it("has a limit of 200 rows", () => {
    expect(IMPORT_MAX_ROWS).toBe(200);
  });

  it("accepts 200 rows", () => {
    const rows = rowsOf(table(200));

    expect(rows).toHaveLength(200);
    expect(rows[199]).toMatchObject({ name: "Lek 200", line: 201 });
  });

  it("rejects 201 rows and says how many there are", () => {
    expect(errorOf(table(201))).toEqual({ code: "too-many-rows", rows: 201, max: 200 });
  });

  it("counts a malformed row toward the limit", () => {
    expect(errorOf(`${table(200)}\nzepsuty wiersz`)).toEqual({ code: "too-many-rows", rows: 201, max: 200 });
  });
});
