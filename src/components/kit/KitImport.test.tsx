import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import KitImport from "@/components/kit/KitImport";
import { ID, registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { FakeSearchWorker, stubSearchWorker } from "../../../tests/helpers/fake-search-worker";
import { reply, stubFetch, stubRoutedFetch, type RoutedFetchOptions } from "../../../tests/helpers/fetch";
import type { RegistrySearchListPayload, RegistryVariantPackage } from "@/types";

// The texts below are pinned on purpose, like in RegistrySearch.test.tsx. Expected values are written by hand from
// tests/fixtures/registry-search-list.ts and the rules in context/changes/csv-kit-import/plan.md.
const HEADER = "nazwa;moc;postac;waznosc;ilosc";
const READY = "Gotowy do zapisu";
const SAVE_FAILED =
  "Nie udało się zapisać strony. Jeśli połączenie zerwało się w trakcie, sprawdź apteczkę, zanim spróbujesz ponownie.";

// The only "No-Spa" with "tabletki" in strength or form, and the row has name, strength and form: assigned on its own.
const NO_SPA = "No-Spa;40 mg;tabletki;03.2027;20";
// The only "Rutinoscorbin" (no strength, no form): one hit, but an incomplete row only gets a suggestion.
const RUTINOSCORBIN = "Rutinoscorbin;;;;";
// The only "Altacet", a gel ("żel" matches the form); no strength, so only a suggestion.
const ALTACET = "Altacet;;żel;;";
// Nothing in the list starts with "xyzabc".
const UNKNOWN = "Xyzabc;;;;";
// Variant key of the No-Spa tablets: lower(name) | lower(strength) | lower(form).
const NO_SPA_KEY = "no-spa|40 mg|tabletki";

// One pack per medicine, 30 tablets: the screen picks a single pack itself.
function pack(
  packageId: number,
  productId: number,
  { capacity = "30", withdrawn = false }: { capacity?: string; withdrawn?: boolean } = {},
): RegistryVariantPackage {
  return {
    packageId,
    productId,
    gtin: null,
    availabilityCategory: null,
    units: [{ count: null, kind: null, capacity, capacity_unit: "tabl.", info: null }],
    holder: null,
    withdrawn,
  };
}

const PACKAGES = {
  [ID.noSpaTablet]: [pack(801, ID.noSpaTablet)],
  [ID.rutinoscorbin]: [pack(6001, ID.rutinoscorbin)],
  [ID.altacetGel]: [pack(5001, ID.altacetGel)],
};

// "Zodac 10 mg": the tablets are withdrawn from the registry, the film-coated tablets are active. The query
// "Zodac 10 mg tabletki" hits both ("tabletki" is a prefix of both forms).
const ZODAC = "Zodac;10 mg;tabletki;;";
const ZODAC_WITHDRAWN_ID = 70;
const ZODAC_ACTIVE_ID = 71;
const ZODAC_LIST: RegistrySearchListPayload = {
  ...registrySearchList,
  variants: [
    ...registrySearchList.variants,
    [ZODAC_WITHDRAWN_ID, "Zodac", "10 mg", "tabletki", null, [], true],
    [ZODAC_ACTIVE_ID, "Zodac", "10 mg", "tabletki powlekane", null, []],
  ],
};
const WITHDRAWN_NOTE = "wycofany z rejestru";

function csv(...lines: string[]) {
  return [HEADER, ...lines].join("\n");
}

interface ReviewOptions extends RoutedFetchOptions {
  kitVariantKeys?: string[];
  /** The search list the screen loads (default: the shared fixture). */
  list?: RegistrySearchListPayload;
  /** The packs answered per product id (default: one active pack of the shared fixture's medicines). */
  packages?: Partial<Record<number, RegistryVariantPackage[]>>;
}

/** Renders the screen, pastes `text` and presses "Dalej". */
function paste(
  text: string,
  { kitVariantKeys = [] as string[], importKit, list = registrySearchList, packages = PACKAGES }: ReviewOptions = {},
) {
  const routed = stubRoutedFetch(list, packages, { importKit });
  stubSearchWorker({ autoDeliver: true });
  render(<KitImport version={registrySearchList.version} kitVariantKeys={kitVariantKeys} />);
  fireEvent.change(screen.getByLabelText("Wklej CSV"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
  return routed;
}

/** Pastes `text` and waits until the rows are matched and the first page is shown. */
async function review(text: string, options: ReviewOptions = {}) {
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

/** Clicks the suggestion of a row that has a single hit but is not complete enough to be assigned on its own. */
function pickSuggestion(line: number, name: RegExp) {
  fireEvent.click(within(row(line)).getByRole("button", { name }));
}

/** Waits until the row's pack is loaded (and, being the only one, chosen). */
async function packChosen(line: number) {
  await within(row(line)).findByText("Opakowanie: 30 tabl.");
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

  it("assigns a complete row with one hit of the same name on its own and says so", async () => {
    await review(csv(NO_SPA));

    expect(text(2)).toContain("Lek: No-Spa · 40 mg · tabletki");
    expect(text(2)).toContain("Przypisano automatycznie — jedyny lek w rejestrze o tej nazwie, mocy i postaci");
    await packChosen(2);
    expect(text(2)).toContain(READY);
    expect(saveBlocked()).toBe(false);
  });

  it("blocks saving while a row with a medicine has the search open, and Anuluj restores it (audit F3)", async () => {
    const routed = await review(csv(NO_SPA), { importKit: () => reply({ ids: [1] }, 201) });
    await packChosen(2);

    fireEvent.click(within(row(2)).getByRole("button", { name: "Zmień" }));

    expect(text(2)).toContain("Obecnie: No-Spa · 40 mg · tabletki");
    expect(text(2)).toContain("dokończ wybór leku albo anuluj");
    expect(saveBlocked()).toBe(true);
    expect(document.getElementById(saveButton().getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "1 wiersz wymaga decyzji",
    );
    fireEvent.click(saveButton());
    expect(routed.importRequests()).toEqual([]);

    fireEvent.click(within(row(2)).getByRole("button", { name: "Anuluj" }));
    await packChosen(2);
    expect(saveBlocked()).toBe(false);
    fireEvent.click(saveButton());
    await waitFor(() => {
      expect(routed.importRequests()).toEqual([
        { items: [{ packageId: 801, quantity: 20, expiry: { month: 3, year: 2027 } }] },
      ]);
    });
  });

  it("offers a row without strength or form as a suggestion instead of assigning it (audit F1)", async () => {
    await review(csv(RUTINOSCORBIN, ALTACET));

    for (const line of [2, 3]) {
      expect(text(line)).toContain("Wybierz lek z rejestru:");
      expect(text(line)).not.toContain("Przypisano automatycznie");
    }
    expect(within(row(2)).getByRole("button", { name: /^Rutinoscorbin/ })).not.toBeNull();
    expect(within(row(3)).getByRole("button", { name: /^Altacet/ })).not.toBeNull();
    expect(saveBlocked()).toBe(true);
  });

  it("waits for a choice when the first query hits an active and a withdrawn variant, and marks the withdrawn one", async () => {
    await review(csv(ZODAC), { list: ZODAC_LIST });

    expect(text(2)).toContain("Wybierz lek z rejestru:");
    expect(text(2)).not.toContain("Przypisano automatycznie");
    expect(saveBlocked()).toBe(true);
    // Active first; only the withdrawn variant carries the note.
    const choices = within(row(2))
      .getAllByRole("button")
      .filter((button) => button.textContent.startsWith("Zodac"));
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Zodac10 mg · tabletki powlekane",
      `Zodac10 mg · tabletki${WITHDRAWN_NOTE}`,
    ]);
  });

  it("marks a withdrawn pack of the row, leaves the pack unchosen and saves the one picked", async () => {
    const importKit = () => reply({ ids: [9] }, 201);
    const routed = await review(csv(ZODAC), {
      list: ZODAC_LIST,
      importKit,
      packages: {
        [ZODAC_WITHDRAWN_ID]: [
          pack(7001, ZODAC_WITHDRAWN_ID),
          pack(7002, ZODAC_WITHDRAWN_ID, { capacity: "20", withdrawn: true }),
        ],
      },
    });

    fireEvent.click(within(row(2)).getByRole("button", { name: new RegExp(WITHDRAWN_NOTE) }));

    const radios = await within(row(2)).findAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(within(row(2)).getByRole("radio", { name: "30 tabl." })).toBe(radios[0]);
    expect(within(row(2)).getByRole("radio", { name: /^20 tabl\.\s*· wycofane$/ })).toBe(radios[1]);
    expect(text(2)).toContain(`Lek: Zodac · 10 mg · tabletki${WITHDRAWN_NOTE}`);
    expect(text(2)).toContain("wybierz opakowanie");
    expect(saveBlocked()).toBe(true);

    fireEvent.click(radios[1]);
    expect(text(2)).toContain(READY);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.importRequests()).toEqual([{ items: [{ packageId: 7002, quantity: null, expiry: null }] }]);
    });
  });

  it("chooses a single withdrawn pack of the row itself and marks it", async () => {
    await review(csv(ZODAC), {
      list: ZODAC_LIST,
      packages: { [ZODAC_WITHDRAWN_ID]: [pack(7002, ZODAC_WITHDRAWN_ID, { withdrawn: true })] },
    });

    fireEvent.click(within(row(2)).getByRole("button", { name: new RegExp(WITHDRAWN_NOTE) }));

    await packChosen(2);
    expect(text(2)).toContain("Opakowanie: 30 tabl. · wycofane");
    expect(text(2)).toContain(READY);
  });

  it("marks the withdrawn medicine that stays assigned while the search is open", async () => {
    await review(csv(ZODAC), {
      list: ZODAC_LIST,
      packages: { [ZODAC_WITHDRAWN_ID]: [pack(7002, ZODAC_WITHDRAWN_ID)] },
    });
    fireEvent.click(within(row(2)).getByRole("button", { name: new RegExp(WITHDRAWN_NOTE) }));
    await packChosen(2);

    fireEvent.click(within(row(2)).getByRole("button", { name: "Zmień" }));

    expect(text(2)).toContain(`Obecnie: Zodac · 10 mg · tabletki${WITHDRAWN_NOTE}`);

    // Leaves the search the way the neighbouring test does, so its list loading settles inside the test.
    fireEvent.click(within(row(2)).getByRole("button", { name: "Anuluj" }));
    await packChosen(2);
  });

  it("says there are no packs of the medicine in the registry when the list is empty", async () => {
    await review(csv(NO_SPA), { packages: { [ID.noSpaTablet]: [] } });

    await within(row(2)).findByText(/^Brak opakowań tego leku w rejestrze/);
    expect(text(2)).toContain("Brak opakowań tego leku w rejestrze — wybierz inny lek albo usuń wiersz");
    expect(saveBlocked()).toBe(true);
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

  it("saves a quantity above the pack size, with a warning instead of a blocking reason", async () => {
    const routed = await review(csv("No-Spa;40 mg;tabletki;;31"), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    const quantity = within(row(2)).getByLabelText<HTMLInputElement>("Ilość");
    const warning = within(row(2)).getByText("Więcej niż w opakowaniu (30 tabl.)");
    expect(quantity.getAttribute("aria-describedby")).toBe(warning.closest("p")?.id);
    expect(within(row(2)).getByText("Gotowy do zapisu")).toBeTruthy();
    expect(saveBlocked()).toBe(false);

    // At the pack size the warning goes and the size is shown as a hint.
    fireEvent.change(quantity, { target: { value: "30" } });
    expect(within(row(2)).queryByText(/Więcej niż w opakowaniu/)).toBeNull();
    expect(within(row(2)).getByText("W opakowaniu: 30 tabl.")).toBeTruthy();
    fireEvent.change(quantity, { target: { value: "31" } });
    fireEvent.click(saveButton());

    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([{ items: [{ packageId: 801, quantity: 31, expiry: null }] }]);
  });

  it("blocks an empty pack (quantity 0) until the quantity is corrected, and never sends it", async () => {
    const routed = await review(csv("No-Spa;40 mg;tabletki;;0"), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    const quantity = within(row(2)).getByLabelText<HTMLInputElement>("Ilość");
    expect(text(2)).toContain("Wymaga decyzji: puste opakowanie — pomiń wiersz");
    const error = within(row(2)).getByText(
      "Puste opakowanie nie trafia do apteczki. Usuń wiersz z importu albo popraw ilość.",
    );
    expect(quantity.getAttribute("aria-invalid")).toBe("true");
    expect(quantity.getAttribute("aria-describedby")).toBe(error.closest("[id]")?.id);
    expect(saveBlocked()).toBe(true);
    expect(routed.importRequests()).toEqual([]);

    fireEvent.change(quantity, { target: { value: "1" } });
    expect(text(2)).toContain(READY);
    fireEvent.click(saveButton());

    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([{ items: [{ packageId: 801, quantity: 1, expiry: null }] }]);
  });

  it("keeps the edited quantity when a removed row is restored", async () => {
    const routed = await review(csv("No-Spa;40 mg;tabletki;;20"), { importKit: () => reply({ ids: [7] }, 201) });
    await packChosen(2);

    // The CSV says 20: change it to 5, remove the row and restore it. The field must show 5, not 20.
    fireEvent.change(within(row(2)).getByLabelText("Ilość"), { target: { value: "5" } });
    removeRow(2);
    fireEvent.click(within(row(2)).getByRole("button", { name: "Przywróć" }));
    await packChosen(2);

    expect(within(row(2)).getByLabelText<HTMLInputElement>("Ilość").value).toBe("5");
    fireEvent.click(saveButton());
    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(routed.importRequests()).toEqual([{ items: [{ packageId: 801, quantity: 5, expiry: null }] }]);
  });

  it("offers signing in, not a retry, when the session expired while the list loads", async () => {
    stubFetch(() => reply({ error: "unauthorized" }, 401));
    stubSearchWorker({ autoDeliver: true });
    render(<KitImport version={registrySearchList.version} kitVariantKeys={[]} />);
    fireEvent.change(screen.getByLabelText("Wklej CSV"), { target: { value: csv(NO_SPA) } });
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));

    expect(await screen.findByText("Sesja wygasła — zaloguj się ponownie.")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/auth/signin");
    expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
    expect(screen.queryByText("Nie udało się wczytać listy leków.")).toBeNull();
  });

  it("locks the rows and the finish link while a page is being saved", async () => {
    let answer: (response: Response) => void = () => undefined;
    await review(csv(NO_SPA, NO_SPA), {
      importKit: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    await packChosen(2);
    await packChosen(3);
    fireEvent.click(within(row(3)).getByRole("button", { name: "Dodaj jako osobne opakowanie" }));
    fireEvent.click(saveButton());

    // The request is out: the row controls are disabled (by the fieldset), and the link does not leave the page.
    await waitFor(() => {
      expect(within(row(2)).getAllByRole("button", { name: "Usuń z importu" })[0].matches(":disabled")).toBe(true);
    });
    expect(within(row(2)).getByLabelText("Ilość").matches(":disabled")).toBe(true);
    expect(finishLink().getAttribute("aria-disabled")).toBe("true");
    expect(fireEvent.click(finishLink())).toBe(false);

    await act(async () => {
      answer(new Response(JSON.stringify({ ids: [1, 2] }), { status: 201 }));
      await Promise.resolve();
    });
    await screen.findByText("Wszystkie strony importu są już obsłużone.");
    expect(screen.getByText("Zapisano 1 z 1 strony, 2 leki")).not.toBeNull();
    expect(finishLink().getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps the review and its decisions when the list worker fails after the rows were matched", async () => {
    await review(csv(NO_SPA, NO_SPA));
    await packChosen(2);
    await packChosen(3);
    removeRow(2);

    act(() => {
      FakeSearchWorker.last?.onerror?.(new ErrorEvent("error"));
    });

    expect(screen.queryByText("Nie udało się wczytać listy leków.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Strona 1 z 1" })).not.toBeNull();
    expect(text(2)).toContain("Usunięty z importu");
    expect(text(3)).toContain(READY);
  });

  it("saves only the kept rows of the page, moves to the next page and counts what was saved", async () => {
    // Page 1: lines 2–31 (No-Spa, Rutinoscorbin, 28 unknown rows); page 2: line 32 (Altacet).
    const unknownRows = Array.from({ length: 28 }, () => UNKNOWN);
    const routed = await review(csv(NO_SPA, RUTINOSCORBIN, ...unknownRows, ALTACET), {
      importKit: () => reply({ ids: [11, 12] }, 201),
    });
    expect(screen.getByRole("heading", { name: "Strona 1 z 2" })).not.toBeNull();
    pickSuggestion(3, /^Rutinoscorbin/);
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
    pickSuggestion(32, /^Altacet/);
    await packChosen(32);
    expect(screen.getByText("Strona 2 nie zostanie zapisana")).not.toBeNull();
    expect(finishLink().getAttribute("href")).toBe("/apteczka?zaimportowano=2");
    // 32 rows render twice (two pages): ~3 s alone, over the default 5 s when lint and astro check run alongside.
  }, 15_000);

  it("marks the row the server rejected by its index among the sent rows", async () => {
    await review(csv(NO_SPA, UNKNOWN, RUTINOSCORBIN), {
      importKit: () => reply({ error: "Package not found", index: 1 }, 400),
    });
    pickSuggestion(4, /^Rutinoscorbin/);
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
