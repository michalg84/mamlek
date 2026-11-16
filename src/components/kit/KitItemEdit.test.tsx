import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitItemEdit } from "@/components/kit/KitItemEdit";
import { registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { reply, stubRoutedFetch, type KitItemRequest } from "../../../tests/helpers/fetch";
import type { KitItem, RegistryPackageUnit, RegistryVariantPackage } from "@/types";

// The texts below are pinned on purpose, like in the other component tests.
const SAVE = "Zapisz";
const CANCEL = "Anuluj";
const CLEAR = "Wyczyść";
const QUANTITY_LABEL = "Ilość w opakowaniu (opcjonalnie)";
const PACKS_FAILED = "Nie udało się wczytać opakowań tego leku. Opakowanie zostaje bez zmiany.";
const SESSION_EXPIRED = "Sesja wygasła — zaloguj się ponownie";
const BAD_VALUE = "Nie udało się zapisać tej wartości";

const PRODUCT = 501;

function sachets(count: string): RegistryPackageUnit[] {
  return [{ count, kind: "saszetki", capacity: null, capacity_unit: null, info: null }];
}

function pack(packageId: number, count: string, productId = PRODUCT, withdrawn = false): RegistryVariantPackage {
  return {
    packageId,
    productId,
    gtin: null,
    availabilityCategory: null,
    units: sachets(count),
    holder: null,
    withdrawn,
  };
}

function kitItem(overrides: Partial<KitItem> = {}): KitItem {
  return {
    id: 7,
    packageId: 1001,
    productId: PRODUCT,
    name: "Smecta",
    strength: "3 g",
    form: "proszek do sporządzania zawiesiny doustnej",
    holder: null,
    units: sachets("10"),
    quantity: 4,
    expiresOn: "2027-12-31",
    expiryPrecision: "month",
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

/** Smecta in two sizes; the item is on the 10-sachet pack. */
const SMECTA_PACKS = [pack(1001, "10"), pack(1002, "30")];

function renderEdit(
  item: KitItem,
  packages: RegistryVariantPackage[] | null,
  respond: (request: KitItemRequest) => Promise<Response> = () => reply({ item }),
) {
  const routed = stubRoutedFetch(registrySearchList, packages ? { [item.productId]: packages } : {}, {
    kitItem: respond,
  });
  const onSaved = vi.fn<(item: KitItem) => void>();
  const onCancel = vi.fn<() => void>();
  render(<KitItemEdit item={item} onSaved={onSaved} onCancel={onCancel} />);
  return { routed, onSaved, onCancel };
}

function quantityField() {
  return screen.getByLabelText<HTMLInputElement>(QUANTITY_LABEL);
}

function saveButton() {
  return screen.getByRole<HTMLButtonElement>("button", { name: SAVE });
}

describe("KitItemEdit", () => {
  // The years offered depend on today; only `Date` is faked (Testing Library and React need the real timers).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves the item to another pack of the medicine, and the quantity cap follows the chosen pack", async () => {
    const item = kitItem();
    const stored: KitItem = { ...item, packageId: 1002, units: sachets("30"), quantity: 25 };
    const { routed, onSaved } = renderEdit(item, SMECTA_PACKS, () => reply({ item: stored }));

    const current = await screen.findByRole("radio", { name: "10 saszetki" });
    expect(current.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("z 10 saszetki")).toBeTruthy();

    fireEvent.change(quantityField(), { target: { value: "25" } });
    fireEvent.click(saveButton());
    expect(screen.getByText("Ilość nie może być większa niż 10")).toBeTruthy();
    expect(routed.kitItemRequests()).toEqual([]);

    fireEvent.click(screen.getByRole("radio", { name: "30 saszetki" }));
    expect(screen.getByText("z 30 saszetki")).toBeTruthy();
    expect(screen.queryByText("Ilość nie może być większa niż 10")).toBeNull();
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(stored);
    });
    expect(routed.kitItemRequests()).toEqual([
      { method: "PATCH", id: item.id, body: { packageId: 1002, quantity: 25 } },
    ]);
  });

  it("pins a withdrawn pack first as „obecne”, checked, and its quantity can still be saved", async () => {
    // The item's pack (20 sachets) is no longer among the active packs of the variant.
    const item = kitItem({ packageId: 1009, units: sachets("20"), withdrawn: true });
    const { routed } = renderEdit(item, SMECTA_PACKS);

    const radios = await screen.findAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(screen.getAllByText("· obecne")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^20 saszetki\s*· obecne$/ })).toBe(radios[0]);
    expect(screen.getByText("z 20 saszetki")).toBeTruthy();

    fireEvent.change(quantityField(), { target: { value: "20" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 20 } }]);
    });
  });

  it("pins a withdrawn pack as „obecne” even when an active pack has the same label", async () => {
    // 1009 is withdrawn; the active 1001 only looks the same (10 sachets). Picking 1001 must be a real change.
    const item = kitItem({ packageId: 1009, units: sachets("10"), withdrawn: true });
    const { routed } = renderEdit(item, [pack(1001, "10"), pack(1002, "30")]);

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(screen.getAllByText("· obecne")).toHaveLength(1);

    fireEvent.click(radios[1]);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { packageId: 1001 } }]);
    });
  });

  it("pins the item's withdrawn pack as „obecne” when the registry lists it but `uniquePacks` hides it behind its active twin", async () => {
    // 1009 (withdrawn) and 1001 (active) share product and label; the list keeps only 1001, so 1009 is pinned.
    const item = kitItem({ packageId: 1009, units: sachets("10"), withdrawn: true });
    const { routed } = renderEdit(item, [pack(1001, "10"), pack(1002, "30"), pack(1009, "10", PRODUCT, true)]);

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(screen.getByRole("radio", { name: /^10 saszetki\s*· obecne$/ })).toBe(radios[0]);
    expect(screen.queryByText("· wycofane")).toBeNull();

    fireEvent.click(radios[1]);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { packageId: 1001 } }]);
    });
  });

  it("shows the item's own withdrawn pack, listed by the registry, once as „obecne”, and saving without a change sends no packageId", async () => {
    // The registry now lists withdrawn packs too, so the item's pack (20 sachets) arrives on the list by itself.
    const item = kitItem({ packageId: 1009, units: sachets("20"), withdrawn: true });
    const { routed } = renderEdit(item, [pack(1001, "10"), pack(1002, "30"), pack(1009, "20", PRODUCT, true)]);

    const radios = await screen.findAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false", "true"]);
    expect(screen.getAllByText(/^20 saszetki/)).toHaveLength(1);
    expect(screen.getAllByText("· obecne")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^20 saszetki\s*· obecne$/ })).toBe(radios[2]);
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(quantityField(), { target: { value: "20" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 20 } }]);
    });
  });

  it("marks another withdrawn pack of the medicine „wycofane”, and moving to it sends its packageId", async () => {
    const item = kitItem();
    const { routed } = renderEdit(item, [pack(1001, "10"), pack(1002, "30"), pack(1008, "50", PRODUCT, true)]);

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(3);
    // Only the withdrawn pack carries the mark; the active ones and the item's own pack do not.
    expect(screen.getAllByText("· wycofane")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /^50 saszetki\s*· wycofane$/ })).toBe(radios[2]);
    expect(screen.queryByText("· obecne")).toBeNull();

    fireEvent.click(radios[2]);
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { packageId: 1008 } }]);
    });
  });

  it("does not read an unreadable number field as an unknown quantity", async () => {
    const { routed } = renderEdit(kitItem(), SMECTA_PACKS);
    await screen.findAllByRole("radio");

    // What the browser reports for "-" or "1e": an empty value with `validity.badInput`.
    Object.defineProperty(quantityField(), "validity", { value: { badInput: true } });
    fireEvent.change(quantityField(), { target: { value: "" } });
    fireEvent.click(saveButton());

    expect(screen.getByText("Podaj liczbę całkowitą, 0 lub większą")).toBeTruthy();
    expect(routed.kitItemRequests()).toEqual([]);
  });

  it("reads an unreadable quantity from the field even when typing it fired no change event", async () => {
    const { routed } = renderEdit(kitItem({ quantity: null }), SMECTA_PACKS);
    await screen.findAllByRole("radio");

    // The stored quantity is unknown, so the field is empty. Typing "-" leaves the value empty, so React fires no change
    // event; only `validity.badInput` on the field tells the form. Another field changes, so there is something to save.
    Object.defineProperty(quantityField(), "validity", { value: { badInput: true } });
    fireEvent.change(screen.getByLabelText("Miesiąc"), { target: { value: "3" } });
    fireEvent.click(saveButton());

    expect(screen.getByText("Podaj liczbę całkowitą, 0 lub większą")).toBeTruthy();
    expect(routed.kitItemRequests()).toEqual([]);
  });

  it("shows a GTIN hidden by uniquePacks as one checked option, and saving it sends no packageId", async () => {
    // 1001 and 1003 are the same product and the same label: uniquePacks keeps 1001 only, the item is on 1003.
    const item = kitItem({ packageId: 1003 });
    const { routed } = renderEdit(item, [pack(1001, "10"), pack(1003, "10"), pack(1002, "30")]);

    const radios = await screen.findAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getAllByText("10 saszetki")).toHaveLength(1);
    expect(screen.queryByText("· obecne")).toBeNull();
    const current = screen.getByRole("radio", { name: "10 saszetki" });
    expect(current.getAttribute("aria-checked")).toBe("true");

    // Going to the other pack and back is no change either.
    fireEvent.click(screen.getByRole("radio", { name: "30 saszetki" }));
    fireEvent.click(current);
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(quantityField(), { target: { value: "2" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 2 } }]);
    });
  });

  it("sends expiry: null once the date is cleared", async () => {
    const item = kitItem();
    const { routed } = renderEdit(item, SMECTA_PACKS);
    await screen.findAllByRole("radio");
    expect(screen.getByLabelText<HTMLSelectElement>("Miesiąc").value).toBe("12");
    expect(screen.getByLabelText<HTMLSelectElement>("Rok").value).toBe("2027");

    fireEvent.click(screen.getByRole("button", { name: CLEAR }));
    expect(screen.getByLabelText<HTMLSelectElement>("Miesiąc").value).toBe("");
    expect(screen.getByLabelText<HTMLSelectElement>("Rok").value).toBe("");
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { expiry: null } }]);
    });
  });

  it("sends a changed month with its year, and refuses only one of the two", async () => {
    const item = kitItem({ expiresOn: null, expiryPrecision: null });
    const { routed } = renderEdit(item, SMECTA_PACKS);
    await screen.findAllByRole("radio");

    fireEvent.change(screen.getByLabelText("Miesiąc"), { target: { value: "3" } });
    fireEvent.click(saveButton());
    expect(screen.getByText("Wybierz miesiąc i rok albo zostaw oba pola puste")).toBeTruthy();
    expect(routed.kitItemRequests()).toEqual([]);

    fireEvent.change(screen.getByLabelText("Rok"), { target: { value: "2028" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([
        { method: "PATCH", id: item.id, body: { expiry: { month: 3, year: 2028 } } },
      ]);
    });
  });

  it("offers a stored year outside the range of years, so the date shows as stored", async () => {
    renderEdit(kitItem({ expiresOn: "2015-03-31" }), SMECTA_PACKS);
    await screen.findAllByRole("radio");

    const yearSelect = screen.getByLabelText<HTMLSelectElement>("Rok");
    expect(yearSelect.value).toBe("2015");
    expect(screen.getByLabelText<HTMLSelectElement>("Miesiąc").value).toBe("3");

    // Picking another year, or clearing, does not take the stored one away.
    fireEvent.change(yearSelect, { target: { value: "2027" } });
    expect(yearSelect.value).toBe("2027");
    fireEvent.click(screen.getByRole("button", { name: CLEAR }));
    expect([...yearSelect.options].map((option) => option.value)).toContain("2015");
  });

  it("keeps „Zapisz” disabled without a change, and „Anuluj” closes without a request", async () => {
    // A day-precision date left as it is must not be sent either (it would lose the day).
    const { routed, onCancel } = renderEdit(kitItem({ expiresOn: "2027-12-15", expiryPrecision: "day" }), SMECTA_PACKS);
    await screen.findAllByRole("radio");

    expect(saveButton().disabled).toBe(true);
    fireEvent.change(quantityField(), { target: { value: "5" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.change(quantityField(), { target: { value: "4" } });
    expect(saveButton().disabled).toBe(true);
    // Enter in a field submits the form: still nothing to send.
    fireEvent.submit(screen.getByRole("form", { name: "Edycja: Smecta" }));

    fireEvent.click(screen.getByRole("button", { name: CANCEL }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(routed.kitItemRequests()).toEqual([]);
  });

  it("says when the packs cannot be loaded, and the quantity can still be saved on the stored pack", async () => {
    const item = kitItem();
    const { routed } = renderEdit(item, null);

    expect((await screen.findByRole("alert")).textContent).toBe(PACKS_FAILED);
    expect(screen.queryAllByRole("radio")).toEqual([]);
    expect(screen.getByRole("button", { name: "Spróbuj ponownie" })).toBeTruthy();
    expect(screen.getByText("z 10 saszetki")).toBeTruthy();

    fireEvent.change(quantityField(), { target: { value: "3" } });
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 3 } }]);
    });
  });

  it.each([
    ["401", () => reply({ error: "Unauthorized" }, 401), SESSION_EXPIRED],
    ["400", () => reply({ error: "Quantity exceeds the pack size (10)" }, 400), BAD_VALUE],
  ])("on %s says so in Polish and stays open with the typed values", async (_case, respond, message) => {
    const { onSaved } = renderEdit(kitItem(), SMECTA_PACKS, respond);
    await screen.findAllByRole("radio");

    fireEvent.change(quantityField(), { target: { value: "6" } });
    fireEvent.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByRole("link", { name: "Zaloguj się" })?.getAttribute("href") ?? null).toBe(
      message === SESSION_EXPIRED ? "/auth/signin" : null,
    );
    expect(quantityField().value).toBe("6");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
