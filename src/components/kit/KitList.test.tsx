import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KitList from "@/components/kit/KitList";
import type { KitItem } from "@/types";

// The texts below are pinned on purpose, like in the other component tests.
const EMPTY = "Apteczka jest pusta";
const EXPIRED = "przeterminowany";

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
    units: [{ count: "30", kind: "tabletki", capacity: null, capacity_unit: null, info: null }],
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
    expect(rows.map((row) => within(row).getAllByText(/./)[0].textContent)).toEqual(["Sortis", "Atoris", "Smecta"]);
    expect(within(rows[0]).getByText("20 mg · tabletki powlekane")).toBeTruthy();
    expect(within(rows[0]).getByText("30 tabletki")).toBeTruthy();
    expect(within(rows[0]).getByText("Ilość: 12 z 30 tabletki")).toBeTruthy();
    expect(within(rows[0]).getByText("Ważny do: 12/2027")).toBeTruthy();
    expect(within(rows[2]).getByText("Ilość: nieznane")).toBeTruthy();
    expect(within(rows[2]).getByText("Ważny do: nieznane")).toBeTruthy();
  });

  it("marks an expired pack and leaves a valid one unmarked", () => {
    render(
      <KitList
        items={[kitItem({ expiresOn: "2026-10-31" }), kitItem({ expiresOn: "2026-11-30" })]}
        today="2026-11-04"
      />,
    );

    const [expired, valid] = screen.getAllByRole("listitem");
    expect(within(expired).getByText(`· ${EXPIRED}`)).toBeTruthy();
    expect(within(valid).queryByText(`· ${EXPIRED}`)).toBeNull();
  });

  it("marks a pack with quantity 0 as „puste” and leaves a pack with some left unmarked", () => {
    render(<KitList items={[kitItem({ quantity: 0 }), kitItem({ quantity: 1 })]} today="2026-11-04" />);

    const [empty, left] = screen.getAllByRole("listitem");
    expect(within(empty).getByText("· puste")).toBeTruthy();
    expect(within(left).queryByText("· puste")).toBeNull();
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
});
