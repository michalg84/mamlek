import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KitList from "@/components/kit/KitList";
import { registrySearchList } from "../../../tests/fixtures/registry-search-list";
import { reply, stubRoutedFetch, type KitItemRequest } from "../../../tests/helpers/fetch";
import type { KitItem } from "@/types";

// The texts below are pinned on purpose, like in the other component tests.
const EMPTY = "Apteczka jest pusta";
const EXPIRED = "przeterminowany";
const EXPIRING = "kończy się ważność";
const SAVE = "Zapisz";
const DELETE = "Usuń";
const EDIT = "Edytuj";
const CANCEL = "Anuluj";
const EMPTY_PACK = "Opakowanie puste";
const CONFIRM_TITLE = "Usunąć z apteczki?";
const IRREVERSIBLE = "Tej operacji nie można cofnąć.";
const SESSION_EXPIRED = "Sesja wygasła — zaloguj się ponownie";
const GONE = "Tej pozycji nie ma już w apteczce — odśwież stronę";
const NETWORK = "Nie udało się połączyć z serwerem, spróbuj ponownie";

let nextId = 1;

function kitItem(overrides: Partial<KitItem> = {}): KitItem {
  const id = nextId++;
  return {
    id,
    packageId: 1000 + id,
    productId: 500 + id,
    name: `Lek ${id}`,
    strength: "20 mg",
    form: "tabletki powlekane",
    holder: null,
    units: [{ count: null, kind: null, capacity: "30", capacity_unit: "tabl.", info: null }],
    quantity: 10,
    expiresOn: "2027-12-31",
    expiryPrecision: "month",
    withdrawn: false,
    createdAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

/** Only `Date` is faked: Testing Library and React need the real timers. */
function setToday(year: number, monthIndex: number, day: number) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0));
}

/** Answers `PATCH` / `DELETE /api/kit/<id>` with `respond`; returns the recorded requests. */
function stubKitItem(respond: (request: KitItemRequest) => Promise<Response>) {
  return stubRoutedFetch(registrySearchList, {}, { kitItem: respond });
}

function deleted() {
  return Promise.resolve(new Response(null, { status: 204 }));
}

function quantityField(name: string) {
  return screen.getByLabelText<HTMLInputElement>(`Ilość: ${name}`);
}

/** The `<li>` of the item called `name`. */
function row(name: string) {
  const element = screen.getByText(name).closest("li");
  if (!element) {
    throw new Error(`No row of "${name}"`);
  }
  return element;
}

/** The row's own "Usuń" (the last one: a row with an empty pack has a second one in its notice). */
function rowDeleteButton(name: string) {
  const buttons = within(row(name)).getAllByRole("button", { name: DELETE });
  return buttons[buttons.length - 1];
}

describe("KitList", () => {
  beforeEach(() => {
    nextId = 1;
    setToday(2026, 10, 4);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the items in the order the server sent them, with their details", () => {
    const items = [
      kitItem({ name: "Sortis", quantity: 12 }),
      kitItem({ name: "Atoris", strength: null, form: null }),
      kitItem({ name: "Smecta", expiresOn: null, expiryPrecision: null, quantity: null }),
    ];
    render(<KitList items={items} today="2026-11-04" />);

    const rows = screen.getAllByRole("listitem");
    expect(rows.map((item) => within(item).getAllByText(/./)[0].textContent)).toEqual(["Sortis", "Atoris", "Smecta"]);
    expect(within(rows[0]).getByText("20 mg · tabletki powlekane")).toBeTruthy();
    expect(within(rows[0]).getByText("30 tabl.")).toBeTruthy();
    expect(quantityField("Sortis").value).toBe("12");
    expect(within(rows[0]).getByText("z 30 tabl.")).toBeTruthy();
    expect(within(rows[0]).getByText("Ważny do: 12/2027")).toBeTruthy();
    expect(quantityField("Smecta").value).toBe("");
    expect(quantityField("Smecta").placeholder).toBe("nieznane");
    expect(within(rows[2]).getByText("Ważny do: nieznane")).toBeTruthy();
  });

  it("marks an expired pack and leaves a valid one unmarked", () => {
    render(
      <KitList
        items={[kitItem({ expiresOn: "2026-10-31" }), kitItem({ expiresOn: "2027-03-31" })]}
        today="2026-11-04"
      />,
    );

    const [expired, valid] = screen.getAllByRole("listitem");
    expect(within(expired).getByText(`· ${EXPIRED}`)).toBeTruthy();
    expect(within(expired).queryByText(`· ${EXPIRING}`)).toBeNull();
    expect(within(valid).queryByText(`· ${EXPIRED}`)).toBeNull();
    expect(within(valid).queryByText(`· ${EXPIRING}`)).toBeNull();
  });

  it("marks „kończy się ważność” for the current and the next month only, next to the date", () => {
    render(
      <KitList
        items={[
          kitItem({ expiresOn: "2026-11-30" }),
          kitItem({ expiresOn: "2026-12-31" }),
          kitItem({ expiresOn: "2027-01-31" }),
          kitItem({ expiresOn: "2026-10-31" }),
          kitItem({ expiresOn: null, expiryPrecision: null }),
        ]}
        today="2026-11-04"
      />,
    );

    const [current, next, later, expired, unknown] = screen.getAllByRole("listitem");
    expect(within(current).getByText("Ważny do: 11/2026").textContent).toContain(`· ${EXPIRING}`);
    expect(within(next).getByText("Ważny do: 12/2026").textContent).toContain(`· ${EXPIRING}`);
    expect(within(later).queryByText(`· ${EXPIRING}`)).toBeNull();
    // An expired pack says so, not that it is about to expire.
    expect(within(expired).queryByText(`· ${EXPIRING}`)).toBeNull();
    expect(within(unknown).queryByText(`· ${EXPIRING}`)).toBeNull();
  });

  describe("expiry summary", () => {
    const SUMMARY = /Kończy się ważność:|Przeterminowane:/;

    function summaryText() {
      return screen.getByText(SUMMARY).textContent;
    }

    it("counts the packs that are ending and the expired ones above the list", () => {
      const items = [
        kitItem({ expiresOn: "2026-11-30" }),
        kitItem({ expiresOn: "2026-12-31" }),
        kitItem({ expiresOn: "2026-10-31" }),
        kitItem({ expiresOn: "2028-01-31" }),
        kitItem({ expiresOn: null, expiryPrecision: null }),
      ];
      render(<KitList items={items} today="2026-11-04" />);

      expect(summaryText()).toBe("Kończy się ważność: 2 opakowania · Przeterminowane: 1 opakowanie");
      // Above the list, as a plain paragraph: not announced on its own, not inside the list.
      const summary = screen.getByText(SUMMARY);
      expect(summary.tagName).toBe("P");
      expect(summary.getAttribute("role")).toBeNull();
      expect(summary.closest("ul")).toBeNull();
      expect(summary.compareDocumentPosition(screen.getByRole("list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("drops the part that is zero", () => {
      const { unmount } = render(<KitList items={[kitItem({ expiresOn: "2026-12-31" })]} today="2026-11-04" />);
      expect(summaryText()).toBe("Kończy się ważność: 1 opakowanie");
      unmount();

      render(
        <KitList
          items={[kitItem({ expiresOn: "2026-01-31" }), kitItem({ expiresOn: "2026-02-28" })]}
          today="2026-11-04"
        />,
      );
      expect(summaryText()).toBe("Przeterminowane: 2 opakowania");
    });

    it("shows no summary when nothing is ending or expired, and none for an empty kit", () => {
      const { unmount } = render(
        <KitList
          items={[kitItem({ expiresOn: "2027-06-30" }), kitItem({ expiresOn: null, expiryPrecision: null })]}
          today="2026-11-04"
        />,
      );
      expect(screen.queryByText(SUMMARY)).toBeNull();
      unmount();

      render(<KitList items={[]} today="2026-11-04" />);
      expect(screen.queryByText(SUMMARY)).toBeNull();
    });

    it("counts an empty pack by its date too", () => {
      render(<KitList items={[kitItem({ quantity: 0, expiresOn: "2026-10-31" })]} today="2026-11-04" />);

      expect(summaryText()).toBe("Przeterminowane: 1 opakowanie");
    });

    it("follows the browser's date, like the markers do", () => {
      // The server's date says the pack is ending; the browser is already past its month.
      setToday(2027, 0, 1);
      render(<KitList items={[kitItem({ expiresOn: "2026-12-31" })]} today="2026-12-30" />);

      expect(summaryText()).toBe("Przeterminowane: 1 opakowanie");
    });

    it("changes after a pack is deleted", async () => {
      const items = [kitItem({ expiresOn: "2026-10-31" }), kitItem({ expiresOn: "2026-11-30" })];
      stubKitItem(deleted);
      render(<KitList items={items} today="2026-11-04" />);
      expect(summaryText()).toBe("Kończy się ważność: 1 opakowanie · Przeterminowane: 1 opakowanie");

      fireEvent.click(rowDeleteButton("Lek 1"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 1")).toBeNull();
      });
      expect(summaryText()).toBe("Kończy się ważność: 1 opakowanie");
    });

    it("changes after a save that brings a new date", async () => {
      const item = kitItem({ expiresOn: "2026-11-30" });
      stubKitItem(() => reply({ item: { ...item, quantity: 7, expiresOn: "2028-01-31" } }));
      render(<KitList items={[item]} today="2026-11-04" />);
      expect(summaryText()).toBe("Kończy się ważność: 1 opakowanie");

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      expect(await screen.findByText("Ważny do: 01/2028")).toBeTruthy();
      expect(screen.queryByText(SUMMARY)).toBeNull();
    });
  });

  it("says „Opakowanie puste”, with its own delete button, only for a pack with quantity 0", () => {
    render(<KitList items={[kitItem({ quantity: 0 }), kitItem({ quantity: 1 })]} today="2026-11-04" />);

    const [empty, left] = screen.getAllByRole("listitem");
    expect(within(empty).getByText(EMPTY_PACK)).toBeTruthy();
    expect(within(empty).getAllByRole("button", { name: DELETE })).toHaveLength(2);
    expect(within(left).queryByText(EMPTY_PACK)).toBeNull();
    expect(within(left).getAllByRole("button", { name: DELETE })).toHaveLength(1);
  });

  it("says „wycofany z rejestru” only for a withdrawn pack", () => {
    render(<KitList items={[kitItem({ withdrawn: true }), kitItem()]} today="2026-11-04" />);

    const [withdrawn, active] = screen.getAllByRole("listitem");
    expect(within(withdrawn).getByText("wycofany z rejestru")).toBeTruthy();
    expect(within(active).queryByText("wycofany z rejestru")).toBeNull();
  });

  it("shows the empty state, without a list, when the kit has no items", () => {
    render(<KitList items={[]} today="2026-11-04" />);

    expect(screen.getByText(EMPTY)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("recomputes today in the browser after mounting, so the server's date cannot decide the marker", () => {
    // The server (UTC) still said 30 Nov, the browser is already on 1 Dec: the pack expiring on 30 Nov is expired.
    setToday(2026, 11, 1);
    render(<KitList items={[kitItem({ expiresOn: "2026-11-30" })]} today="2026-11-30" />);

    expect(screen.getByText(`· ${EXPIRED}`)).toBeTruthy();
  });

  describe("quantity", () => {
    it("offers „Zapisz” only after the value changes", () => {
      stubKitItem(() => Promise.reject(new Error("no request expected")));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
      fireEvent.change(quantityField("Lek 1"), { target: { value: "10" } });
      expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
    });

    it("sends only the quantity and shows the item from the answer", async () => {
      const item = kitItem();
      // The answer differs from the request in the expiry too: the row must show the stored item, not the input.
      const stored: KitItem = { ...item, quantity: 7, expiresOn: "2028-01-31" };
      const routed = stubKitItem(() => reply({ item: stored }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      expect(await screen.findByText("Ważny do: 01/2028")).toBeTruthy();
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 7 } }]);
      expect(quantityField("Lek 1").value).toBe("7");
      expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
    });

    it("sends null for a cleared field (quantity unknown)", async () => {
      const item = kitItem();
      const routed = stubKitItem(() => reply({ item: { ...item, quantity: null } }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: null } }]);
    });

    it("saves on Enter, and Enter on an unchanged value sends nothing", async () => {
      const item = kitItem();
      const routed = stubKitItem(() => reply({ item: { ...item, quantity: 3 } }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.keyDown(quantityField("Lek 1"), { key: "Enter" });
      expect(routed.kitItemRequests()).toEqual([]);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "3" } });
      fireEvent.keyDown(quantityField("Lek 1"), { key: "Enter" });

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 3 } }]);
    });

    it("saves a quantity above the pack size with a warning", async () => {
      const item = kitItem();
      const stored: KitItem = { ...item, quantity: 31 };
      const routed = stubKitItem(() => reply({ item: stored }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "30" } });
      expect(screen.queryByText("Więcej niż w opakowaniu (30 tabl.)")).toBeNull();
      fireEvent.change(quantityField("Lek 1"), { target: { value: "31" } });
      expect(screen.getByText("Więcej niż w opakowaniu (30 tabl.)")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 31 } }]);
      });
      // The stored quantity is still above the pack size: the warning stays.
      expect(await screen.findByText("Więcej niż w opakowaniu (30 tabl.)")).toBeTruthy();
    });

    it("checks the value before sending: a fraction and more than MAX_QUANTITY", () => {
      const routed = stubKitItem(() => Promise.reject(new Error("no request expected")));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "100001" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));
      expect(screen.getByText("Ilość nie może być większa niż 100000")).toBeTruthy();
      expect(quantityField("Lek 1").getAttribute("aria-invalid")).toBe("true");

      fireEvent.change(quantityField("Lek 1"), { target: { value: "1.5" } });
      fireEvent.keyDown(quantityField("Lek 1"), { key: "Enter" });
      expect(screen.getByText("Podaj liczbę całkowitą, 0 lub większą")).toBeTruthy();

      expect(routed.kitItemRequests()).toEqual([]);
    });

    it.each([
      ["401", () => reply({ error: "Unauthorized" }, 401), SESSION_EXPIRED],
      ["404", () => reply({ error: "Not found" }, 404), GONE],
      ["a network error", () => Promise.reject(new TypeError("Failed to fetch")), NETWORK],
    ])("on %s says so in Polish and keeps the typed value", async (_case, respond, message) => {
      stubKitItem(respond);
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      expect((await screen.findByRole("alert")).textContent).toBe(message);
      expect(quantityField("Lek 1").value).toBe("7");
      expect(screen.getByRole("button", { name: SAVE })).toBeTruthy();
    });

    it("offers signing in when the session expired", async () => {
      stubKitItem(() => reply({ error: "Unauthorized" }, 401));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      await screen.findByRole("alert");
      expect(within(row("Lek 1")).getByRole("link", { name: "Zaloguj się" }).getAttribute("href")).toBe("/auth/signin");
    });

    it("logs the cause of a failed save, and the status with the answer of the server", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const cause = new TypeError("Failed to fetch");
      stubKitItem(() => Promise.reject(cause));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);
      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));
      await screen.findByRole("alert");
      expect(log).toHaveBeenCalledWith(cause);

      log.mockClear();
      stubKitItem(() => reply({ error: "boom" }, 500));
      fireEvent.click(screen.getByRole("button", { name: SAVE }));
      await waitFor(() => {
        expect(log).toHaveBeenCalledWith("Saving a kit item failed", 500, { error: "boom" });
      });
    });

    it("does not read an unreadable number field as an unknown quantity", () => {
      const routed = stubKitItem(() => reply({ item: kitItem() }));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      // What the browser reports for "-" or "1e": an empty value with `validity.badInput`.
      const field = quantityField("Lek 1");
      Object.defineProperty(field, "validity", { value: { badInput: true } });
      fireEvent.change(field, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      expect(screen.getByText("Podaj liczbę całkowitą, 0 lub większą")).toBeTruthy();
      expect(routed.kitItemRequests()).toEqual([]);
    });

    it("blocks „Edytuj” and „Usuń” of the row while its quantity is being saved", async () => {
      let answer: (response: Response) => void = () => undefined;
      stubKitItem(
        () =>
          new Promise<Response>((resolve) => {
            answer = resolve;
          }),
      );
      const item = kitItem();
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      const buttons = () =>
        [EDIT, DELETE].map((name) => within(row("Lek 1")).getByRole<HTMLButtonElement>("button", { name }));
      await waitFor(() => {
        expect(buttons().map((button) => button.disabled)).toEqual([true, true]);
      });

      answer(new Response(JSON.stringify({ item: { ...item, quantity: 7 } }), { status: 200 }));
      await waitFor(() => {
        expect(buttons().map((button) => button.disabled)).toEqual([false, false]);
      });
    });

    it("never shows the server's own error text", async () => {
      stubKitItem(() => reply({ error: "Quantity exceeds the pack size (30)" }, 400));
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      expect((await screen.findByRole("alert")).textContent).toBe("Nie udało się zapisać tej wartości");
    });

    it("asks to delete the pack once 0 is saved; „Anuluj” keeps it as „Opakowanie puste”, with the focus on the field", async () => {
      const item = kitItem();
      const routed = stubKitItem(() => reply({ item: { ...item, quantity: 0 } }));
      render(<KitList items={[item]} today="2026-11-04" />);
      expect(screen.queryByText(EMPTY_PACK)).toBeNull();

      fireEvent.change(quantityField("Lek 1"), { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      const dialog = await screen.findByRole("alertdialog");
      expect(within(dialog).getByText(CONFIRM_TITLE)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: CANCEL }));
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(screen.getByText(EMPTY_PACK)).toBeTruthy();
      expect(quantityField("Lek 1").value).toBe("0");
      expect(document.activeElement).toBe(quantityField("Lek 1"));
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 0 } }]);
    });

    it("deletes the pack when „Usuń” is chosen in the dialog that a saved 0 opened", async () => {
      const items = [kitItem(), kitItem()];
      const routed = stubKitItem((request) =>
        request.method === "PATCH" ? reply({ item: { ...items[0], quantity: 0 } }) : deleted(),
      );
      render(<KitList items={items} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 1")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([
        { method: "PATCH", id: items[0].id, body: { quantity: 0 } },
        { method: "DELETE", id: items[0].id, body: undefined },
      ]);
    });

    it("does not ask after a save that leaves something in the pack", async () => {
      const item = kitItem();
      stubKitItem(() => reply({ item: { ...item, quantity: 1 } }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.change(quantityField("Lek 1"), { target: { value: "1" } });
      fireEvent.click(screen.getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(screen.queryByRole("button", { name: SAVE })).toBeNull();
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  describe("edit", () => {
    function editButton(name: string) {
      return within(row(name)).getByRole("button", { name: EDIT });
    }

    /** Answers the pack request of `item` with its own pack and one of 60. */
    function stubPacks(item: KitItem, respond: (request: KitItemRequest) => Promise<Response>) {
      const own = {
        packageId: item.packageId,
        productId: item.productId,
        gtin: null,
        availabilityCategory: null,
        units: item.units,
        holder: null,
        withdrawn: false,
      };
      const bigger = {
        ...own,
        packageId: item.packageId + 500,
        units: [{ count: null, kind: null, capacity: "60", capacity_unit: "tabl.", info: null }],
      };
      return stubRoutedFetch(registrySearchList, { [item.productId]: [own, bigger] }, { kitItem: respond });
    }

    it("„Edytuj” opens the panel in the row (aria-expanded), with the only quantity field, and „Anuluj” closes it", async () => {
      const item = kitItem();
      const routed = stubPacks(item, () => Promise.reject(new Error("no request expected")));
      render(<KitList items={[item, kitItem()]} today="2026-11-04" />);

      expect(editButton("Lek 1").getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(editButton("Lek 1"));

      expect(editButton("Lek 1").getAttribute("aria-expanded")).toBe("true");
      const panel = within(row("Lek 1")).getByRole("form", { name: "Edycja: Lek 1" });
      expect(await within(panel).findByRole("radio", { name: "30 tabl." })).toBeTruthy();
      expect(within(row("Lek 1")).queryByLabelText("Ilość: Lek 1")).toBeNull();
      expect(within(row("Lek 1")).getByText("Ilość: 10 z 30 tabl.")).toBeTruthy();
      // The other row keeps its own field.
      expect(quantityField("Lek 2")).toBeTruthy();

      fireEvent.click(within(panel).getByRole("button", { name: CANCEL }));

      expect(screen.queryByRole("form")).toBeNull();
      expect(editButton("Lek 1").getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(editButton("Lek 1"));
      expect(quantityField("Lek 1").value).toBe("10");
      expect(routed.kitItemRequests()).toEqual([]);
    });

    it("a saved edit replaces the row and closes the panel", async () => {
      const item = kitItem();
      const stored: KitItem = {
        ...item,
        packageId: item.packageId + 500,
        units: [{ count: null, kind: null, capacity: "60", capacity_unit: "tabl.", info: null }],
        quantity: 45,
      };
      const routed = stubPacks(item, () => reply({ item: stored }));
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.click(editButton("Lek 1"));
      const panel = screen.getByRole("form", { name: "Edycja: Lek 1" });
      fireEvent.click(await within(panel).findByRole("radio", { name: "60 tabl." }));
      fireEvent.change(within(panel).getByLabelText("Ilość w opakowaniu (opcjonalnie)"), { target: { value: "45" } });
      fireEvent.click(within(panel).getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(screen.queryByRole("form")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([
        { method: "PATCH", id: item.id, body: { packageId: stored.packageId, quantity: 45 } },
      ]);
      expect(within(row("Lek 1")).getByText("60 tabl.")).toBeTruthy();
      expect(quantityField("Lek 1").value).toBe("45");
      expect(within(row("Lek 1")).getByText("z 60 tabl.")).toBeTruthy();
      expect(document.activeElement).toBe(editButton("Lek 1"));
    });

    it("a date changed in the panel updates the marker and the expiry summary", async () => {
      const item = kitItem({ expiresOn: "2026-11-30" });
      const routed = stubPacks(item, () => reply({ item: { ...item, expiresOn: "2028-03-31" } }));
      render(<KitList items={[item]} today="2026-11-04" />);
      expect(screen.getByText("Kończy się ważność: 1 opakowanie")).toBeTruthy();
      expect(within(row("Lek 1")).getByText("Ważny do: 11/2026").textContent).toContain(`· ${EXPIRING}`);

      fireEvent.click(editButton("Lek 1"));
      const panel = screen.getByRole("form", { name: "Edycja: Lek 1" });
      await within(panel).findByRole("radio", { name: "30 tabl." });
      fireEvent.change(within(panel).getByLabelText("Miesiąc"), { target: { value: "3" } });
      fireEvent.change(within(panel).getByLabelText("Rok"), { target: { value: "2028" } });
      fireEvent.click(within(panel).getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(screen.queryByRole("form")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([
        { method: "PATCH", id: item.id, body: { expiry: { month: 3, year: 2028 } } },
      ]);
      expect(within(row("Lek 1")).getByText("Ważny do: 03/2028").textContent).not.toContain(EXPIRING);
      expect(screen.queryByText(/Kończy się ważność:|Przeterminowane:/)).toBeNull();
    });
  });

  describe("edit to an empty pack", () => {
    function packsOf(item: KitItem) {
      return {
        [item.productId]: [
          {
            packageId: item.packageId,
            productId: item.productId,
            gtin: null,
            availabilityCategory: null,
            units: item.units,
            holder: null,
            withdrawn: false,
          },
        ],
      };
    }

    it("asks to delete the pack when the panel saves 0; „Anuluj” gives the focus back to „Edytuj”", async () => {
      const item = kitItem();
      const routed = stubRoutedFetch(registrySearchList, packsOf(item), {
        kitItem: () => reply({ item: { ...item, quantity: 0 } }),
      });
      render(<KitList items={[item]} today="2026-11-04" />);
      const edit = within(row("Lek 1")).getByRole("button", { name: EDIT });

      fireEvent.click(edit);
      const panel = screen.getByRole("form", { name: "Edycja: Lek 1" });
      await within(panel).findByRole("radio", { name: "30 tabl." });
      fireEvent.change(within(panel).getByLabelText("Ilość w opakowaniu (opcjonalnie)"), { target: { value: "0" } });
      fireEvent.click(within(panel).getByRole("button", { name: SAVE }));

      const dialog = await screen.findByRole("alertdialog");
      fireEvent.click(within(dialog).getByRole("button", { name: CANCEL }));
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(screen.getByText(EMPTY_PACK)).toBeTruthy();
      expect(document.activeElement).toBe(edit);
      expect(routed.kitItemRequests()).toEqual([{ method: "PATCH", id: item.id, body: { quantity: 0 } }]);
    });

    it("does not ask again when the panel saves another change of a pack that was already empty", async () => {
      const item = kitItem({ quantity: 0 });
      stubRoutedFetch(registrySearchList, packsOf(item), {
        kitItem: () => reply({ item: { ...item, expiresOn: null, expiryPrecision: null } }),
      });
      render(<KitList items={[item]} today="2026-11-04" />);

      fireEvent.click(within(row("Lek 1")).getByRole("button", { name: EDIT }));
      const panel = screen.getByRole("form", { name: "Edycja: Lek 1" });
      await within(panel).findByRole("radio", { name: "30 tabl." });
      fireEvent.click(within(panel).getByRole("button", { name: "Wyczyść" }));
      fireEvent.click(within(panel).getByRole("button", { name: SAVE }));

      await waitFor(() => {
        expect(screen.queryByRole("form")).toBeNull();
      });
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  describe("delete", () => {
    it("asks first, naming the pack, and „Anuluj” sends nothing", async () => {
      const routed = stubKitItem(() => Promise.reject(new Error("no request expected")));
      render(<KitList items={[kitItem({ name: "Sortis" })]} today="2026-11-04" />);

      fireEvent.click(rowDeleteButton("Sortis"));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText(CONFIRM_TITLE)).toBeTruthy();
      expect(within(dialog).getByText("Sortis 20 mg")).toBeTruthy();
      expect(within(dialog).getByText("30 tabl.")).toBeTruthy();
      expect(within(dialog).getByText(IRREVERSIBLE)).toBeTruthy();

      fireEvent.click(within(dialog).getByRole("button", { name: CANCEL }));

      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([]);
      expect(screen.getByText("Sortis")).toBeTruthy();
    });

    it("gives the focus back to the button that opened the dialog after „Anuluj” and after Esc", async () => {
      stubKitItem(() => Promise.reject(new Error("no request expected")));
      render(<KitList items={[kitItem({ name: "Sortis" })]} today="2026-11-04" />);
      const opener = rowDeleteButton("Sortis");

      opener.focus();
      fireEvent.click(opener);
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: CANCEL }));
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(document.activeElement).toBe(opener);

      opener.focus();
      fireEvent.click(opener);
      fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(document.activeElement).toBe(opener);
    });

    it("deletes through the dialog and moves the focus to the next row", async () => {
      const items = [kitItem(), kitItem(), kitItem()];
      const routed = stubKitItem(deleted);
      render(<KitList items={items} today="2026-11-04" />);
      const next = row("Lek 3");

      fireEvent.click(rowDeleteButton("Lek 2"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 2")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([{ method: "DELETE", id: items[1].id, body: undefined }]);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      await waitFor(() => {
        expect(document.activeElement).toBe(next);
      });
      // Past the dialog's own focus return, which runs on a timer.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(next);
    });

    it("moves the focus to the previous row when the last row is deleted", async () => {
      stubKitItem(deleted);
      render(<KitList items={[kitItem(), kitItem()]} today="2026-11-04" />);
      const previous = row("Lek 1");

      fireEvent.click(rowDeleteButton("Lek 2"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 2")).toBeNull();
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(previous);
    });

    it("opens the same dialog from „Opakowanie puste”", async () => {
      const item = kitItem({ quantity: 0 });
      const routed = stubKitItem(deleted);
      render(<KitList items={[item, kitItem()]} today="2026-11-04" />);

      const notice = screen.getByText(EMPTY_PACK).parentElement;
      if (!notice) {
        throw new Error("No notice");
      }
      fireEvent.click(within(notice).getByRole("button", { name: DELETE }));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText(CONFIRM_TITLE)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 1")).toBeNull();
      });
      expect(routed.kitItemRequests()).toEqual([{ method: "DELETE", id: item.id, body: undefined }]);
    });

    it("deleting the last item leaves „Apteczka jest pusta”, with the focus on it", async () => {
      stubKitItem(deleted);
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.click(rowDeleteButton("Lek 1"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      const empty = await screen.findByText(EMPTY);
      expect(screen.queryByRole("list")).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(empty);
    });

    it.each([
      ["a network error", () => Promise.reject(new TypeError("Failed to fetch")), NETWORK, false],
      ["401", () => reply({ error: "Unauthorized" }, 401), SESSION_EXPIRED, true],
    ])("on %s keeps the row with the message in Polish", async (_case, respond, message, signIn) => {
      stubKitItem(respond);
      render(<KitList items={[kitItem()]} today="2026-11-04" />);

      fireEvent.click(rowDeleteButton("Lek 1"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByRole("alertdialog")).toBeNull();
      });
      expect(within(row("Lek 1")).getByRole("alert").textContent).toBe(message);
      const link = within(row("Lek 1")).queryByRole("link", { name: "Zaloguj się" });
      expect(link?.getAttribute("href") ?? null).toBe(signIn ? "/auth/signin" : null);
    });

    it("on 404 drops the row, since the item is already gone, and moves the focus to the next row", async () => {
      stubKitItem(() => reply({ error: "Not found" }, 404));
      render(<KitList items={[kitItem(), kitItem()]} today="2026-11-04" />);

      fireEvent.click(rowDeleteButton("Lek 1"));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: DELETE }));

      await waitFor(() => {
        expect(screen.queryByText("Lek 1")).toBeNull();
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(document.activeElement).toBe(row("Lek 2"));
      expect(screen.queryByText(GONE)).toBeNull();
    });
  });
});
