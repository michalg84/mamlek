import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KitImport from "@/components/kit/KitImport";
import { ID, registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { reply, stubRoutedFetch, type RoutedFetchOptions } from "../../../tests/helpers/fetch";
import type { RegistryVariantPackage } from "@/types";

// The texts below are pinned on purpose, like in RegistrySearch.test.tsx. Expected values are written by hand from
// tests/fixtures/registry-search-list.ts and the rules in context/changes/csv-kit-import/plan.md.
const HEADER = "nazwa;moc;postac;waznosc;ilosc";
const READY = "Gotowy do zapisu";
const SAVE_FAILED =
  "Nie udało się zapisać strony. Jeśli połączenie zerwało się w trakcie, sprawdź apteczkę, zanim spróbujesz ponownie.";

// The only "No-Spa" with "tabletki" in strength or form: the first query hits once, so it is assigned on its own.
const NO_SPA = "No-Spa;40 mg;tabletki;03.2027;20";
// The only "Rutinoscorbin" (no strength, no form): one query, one hit.
const RUTINOSCORBIN = "Rutinoscorbin;;;;";
// The only "Altacet", a gel ("żel" matches the form).
const ALTACET = "Altacet;;żel;;";
// Nothing in the list starts with "xyzabc".
const UNKNOWN = "Xyzabc;;;;";
// Variant key of the No-Spa tablets: lower(name) | lower(strength) | lower(form).
const NO_SPA_KEY = "no-spa|40 mg|tabletki";

// One pack per medicine, 30 tablets: the screen picks a single pack itself.
function pack(packageId: number, productId: number): RegistryVariantPackage {
  return {
    packageId,
    productId,
    gtin: null,
    availabilityCategory: null,
    units: [{ count: "30", kind: "tabletki", capacity: null, capacity_unit: null, info: null }],
    holder: null,
  };
}

const PACKAGES = {
  [ID.noSpaTablet]: [pack(801, ID.noSpaTablet)],
  [ID.rutinoscorbin]: [pack(6001, ID.rutinoscorbin)],
  [ID.altacetGel]: [pack(5001, ID.altacetGel)],
};

function csv(...lines: string[]) {
  return [HEADER, ...lines].join("\n");
}

/** Renders the screen, pastes `text` and presses "Dalej". */
function paste(
  text: string,
  { kitVariantKeys = [] as string[], importKit }: RoutedFetchOptions & { kitVariantKeys?: string[] } = {},
) {
  const routed = stubRoutedFetch(registrySearchList, PACKAGES, { importKit });
  stubSearchWorker({ autoDeliver: true });
  render(<KitImport version={registrySearchList.version} kitVariantKeys={kitVariantKeys} />);
  fireEvent.change(screen.getByLabelText("Wklej CSV"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  return routed;
}

/** Pastes `text` and waits until the rows are matched and the first page is shown. */
async function review(text: string, options: RoutedFetchOptions & { kitVariantKeys?: string[] } = {}) {
  const routed = paste(text, options);
  await screen.findByRole("heading", { name: /^Strona 1 z \d+$/ });
  return routed;
}

/** The row of CSV line `line` (the header is line 1). */
function row(line: number) {
  return screen.getByRole("listitem", { name: `Wiersz ${line}` });
}

function text(line: number) {
  return row(line).textContent;
}

/** Waits until the row's pack is loaded (and, being the only one, chosen). */
async function packChosen(line: number) {
  await within(row(line)).findByText("Opakowanie: 30 tabletki");
}

function saveButton() {
  return screen.getByRole("button", { name: /^Zapisz stronę \d+ z \d+$/ });
}

function saveBlocked() {
  return saveButton().getAttribute("aria-disabled") === "true";
}

function removeRow(line: number) {
  fireEvent.click(within(row(line)).getAllByRole("button", { name: "Usuń z importu" })[0]);
}

function finishLink() {
  return screen.getByRole("link", { name: "Zakończ import" });
}

describe("KitImport", () => {
  it("stops at the first step on an unknown column and starts once the text is fixed", async () => {
    paste("nazwa;dawka\nIbuprom;400 mg");

    expect(screen.getByRole("alert").textContent).toBe(
      "Nieznana kolumna „dawka”. Dozwolone kolumny: nazwa, moc, postac, waznosc, ilosc",
    );
    expect(screen.queryByRole("heading", { name: /^Strona/ })).toBeNull();
    expect(screen.getByLabelText("Wklej CSV")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Wklej CSV"), { target: { value: csv(UNKNOWN) } });
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(await screen.findByRole("heading", { name: "Strona 1 z 1" })).not.toBeNull();
  });

  it("blocks saving the page while a row has no match, and says why", async () => {
    const routed = await review(csv(UNKNOWN), { importKit: () => reply({ ids: [1] }, 201) });

    expect(text(2)).toContain("Brak dopasowania w rejestrze");
    expect(saveBlocked()).toBe(true);
    const reasonId = saveButton().getAttribute("aria-describedby");
    expect(reasonId).not.toBeNull();
    expect(document.getElementById(reasonId ?? "")?.textContent).toBe("1 wiersz wymaga decyzji");

    fireEvent.click(saveButton());
    expect(routed.importRequests()).toEqual([]);
  });

  it("assigns a row with one hit of the first query on its own and says so", async () => {
    await review(csv(NO_SPA));

    expect(text(2)).toContain("Lek: No-Spa · 40 mg · tabletki");
    expect(text(2)).toContain("Przypisano automatycznie");
    await packChosen(2);
    expect(text(2)).toContain(READY);
    expect(saveBlocked()).toBe(false);
  });

  it("blocks a medicine already in the kit until the user decides", async () => {
    await review(csv(NO_SPA), { kitVariantKeys: [NO_SPA_KEY] });
    await packChosen(2);

    expect(text(2)).toContain("Już masz ten lek w apteczce");
    expect(saveBlocked()).toBe(true);
    expect(screen.getByText("1 wiersz wymaga decyzji")).not.toBeNull();

    fireEvent.click(within(row(2)).getByRole("button", { name: "Dodaj jako osobne opakowanie" }));
    expect(text(2)).toContain(READY);
    expect(saveBlocked()).toBe(false);
  });

  it("blocks the second row of the same medicine, and lifts that when the first row is removed", async () => {
    await review(csv(NO_SPA, NO_SPA));
    await packChosen(2);
    await packChosen(3);

    expect(text(2)).not.toContain("Powtórzony w imporcie");
    expect(text(3)).toContain("Powtórzony w imporcie");
    expect(screen.getByText("1 wiersz wymaga decyzji")).not.toBeNull();

    removeRow(2);
    expect(text(2)).toContain("Usunięty z importu");
    expect(text(3)).not.toContain("Powtórzony w imporcie");
    expect(text(3)).toContain(READY);
    expect(saveBlocked()).toBe(false);
  });

  it("blocks an unreadable expiry until a month and year are chosen", async () => {
    await review(csv("No-Spa;40 mg;tabletki;13.2027;"));
    await packChosen(2);

    expect(text(2)).toContain("Nie da się odczytać daty „13.2027”");
    expect(saveBlocked()).toBe(true);

    fireEvent.change(within(row(2)).getByLabelText("Miesiąc"), { target: { value: "6" } });
    expect(saveBlocked()).toBe(true);
    fireEvent.change(within(row(2)).getByLabelText("Rok"), { target: { value: String(new Date().getFullYear() + 1) } });
    expect(text(2)).toContain(READY);
    expect(saveBlocked()).toBe(false);
  });

  it("saves a cleared expiry as unknown", async () => {
    const routed = await review(csv("No-Spa;40 mg;tabletki;13.2027;5"), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    fireEvent.click(within(row(2)).getByRole("button", { name: "Wyczyść datę (nieznana)" }));
    expect(text(2)).toContain(READY);
    fireEvent.click(saveButton());

    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([{ items: [{ packageId: 801, quantity: 5, expiry: null }] }]);
  });

  it("lets the user change a valid quantity and expiry before saving", async () => {
    const routed = await review(csv(NO_SPA), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    // The CSV says 20 and 03.2027, both valid: the fields are there anyway, prefilled.
    const quantity = within(row(2)).getByLabelText<HTMLInputElement>("Ilość");
    expect(quantity.value).toBe("20");
    expect(within(row(2)).getByLabelText<HTMLSelectElement>("Miesiąc").value).toBe("3");
    expect(within(row(2)).getByLabelText<HTMLSelectElement>("Rok").value).toBe("2027");
    fireEvent.change(quantity, { target: { value: "5" } });
    fireEvent.change(within(row(2)).getByLabelText("Miesiąc"), { target: { value: "11" } });
    expect(saveBlocked()).toBe(false);
    fireEvent.click(saveButton());

    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([
      { items: [{ packageId: 801, quantity: 5, expiry: { month: 11, year: 2027 } }] },
    ]);
  });

  it("lets the user fill in a quantity the CSV left empty", async () => {
    const routed = await review(csv("No-Spa;40 mg;tabletki;;"), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    fireEvent.change(within(row(2)).getByLabelText("Ilość"), { target: { value: "12" } });
    fireEvent.click(saveButton());

    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([{ items: [{ packageId: 801, quantity: 12, expiry: null }] }]);
  });

  it("saves only the kept rows of the page, moves to the next page and counts what was saved", async () => {
    // Page 1: lines 2–31 (No-Spa, Rutinoscorbin, 28 unknown rows); page 2: line 32 (Altacet).
    const unknownRows = Array.from({ length: 28 }, () => UNKNOWN);
    const routed = await review(csv(NO_SPA, RUTINOSCORBIN, ...unknownRows, ALTACET), {
      importKit: () => reply({ ids: [11, 12] }, 201),
    });
    expect(screen.getByRole("heading", { name: "Strona 1 z 2" })).not.toBeNull();
    await packChosen(2);
    await packChosen(3);
    for (let line = 4; line <= 31; line++) {
      removeRow(line);
    }
    expect(saveBlocked()).toBe(false);
    expect(screen.queryByRole("listitem", { name: "Wiersz 32" })).toBeNull();
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);

    fireEvent.click(saveButton());

    const heading = await screen.findByRole("heading", { name: "Strona 2 z 2" });
    // The next page opens at the top of the view with the focus on its heading, not on the button below.
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(document.activeElement).toBe(heading);
    expect(routed.importRequests()).toEqual([
      {
        items: [
          { packageId: 801, quantity: 20, expiry: { month: 3, year: 2027 } },
          { packageId: 6001, quantity: null, expiry: null },
        ],
      },
    ]);
    expect(screen.getByText("Zapisano 1 z 2 stron, 2 leki")).not.toBeNull();
    expect(screen.queryByRole("listitem", { name: "Wiersz 2" })).toBeNull();
    await packChosen(32);
    expect(screen.getByText("Strona 2 nie zostanie zapisana")).not.toBeNull();
    expect(finishLink().getAttribute("href")).toBe("/apteczka?zaimportowano=2");
  });

  it("marks the row the server rejected by its index among the sent rows", async () => {
    await review(csv(NO_SPA, UNKNOWN, RUTINOSCORBIN), {
      importKit: () => reply({ error: "Package not found or withdrawn from the registry", index: 1 }, 400),
    });
    await packChosen(2);
    await packChosen(4);
    removeRow(3);

    fireEvent.click(saveButton());

    await screen.findByText("Strona nie została zapisana: serwer odrzucił wiersz 4.");
    expect(text(4)).toContain("Serwer odrzucił ten wiersz");
    expect(text(2)).not.toContain("Serwer odrzucił ten wiersz");
    expect(screen.getByRole("heading", { name: "Strona 1 z 1" })).not.toBeNull();
    expect(screen.getByText("Zapisano 0 z 1 strony, 0 leków")).not.toBeNull();
  });

  it("keeps the page with a message and a retry when the network fails", async () => {
    await review(csv(NO_SPA), { importKit: () => Promise.reject(new TypeError("Failed to fetch")) });
    await packChosen(2);

    fireEvent.click(saveButton());

    expect(await screen.findByText(SAVE_FAILED)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Strona 1 z 1" })).not.toBeNull();
    expect(screen.getByText("Zapisano 0 z 1 strony, 0 leków")).not.toBeNull();
    expect(finishLink().getAttribute("href")).toBe("/apteczka");
  });

  it("names the unsaved pages and finishes on the kit without a count before anything is saved", async () => {
    await review(csv(UNKNOWN));

    expect(screen.getByText("Strona 1 nie zostanie zapisana")).not.toBeNull();
    expect(screen.getByText("Zapisane wiersze: 0 · usunięte: 0 · niezapisane: 1")).not.toBeNull();
    expect(finishLink().getAttribute("href")).toBe("/apteczka");

    removeRow(2);
    await waitFor(() => {
      expect(screen.getByText("Zapisane wiersze: 0 · usunięte: 1 · niezapisane: 0")).not.toBeNull();
    });
    expect(screen.getByRole("button", { name: "Pomiń stronę" })).not.toBeNull();
  });
});
